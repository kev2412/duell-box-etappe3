// app.js – zentrale Ablaufsteuerung: Lobby, Raum, Spielauswahl, Sterne-Gesamtwertung, Tab-Wechsel-Überwachung.
// Ein „Sitz“ (Seat) ist ein Spieler mit eigener Verbindung und eigener Oberfläche:
// online gibt es einen Sitz pro Gerät, im lokalen Testmodus zwei Sitze (Host + Gast) über Loopback.

import { initSound, isMuted, setMuted, login as soundLogin } from './sound.js';
import { createRoom, joinRoom, createLocalPair } from './network.js';
import {
  MIX_ORDER, newMix, hasResult, recordResult, isComplete, advance, mixWins, mixWinner, validStart, cleanResults,
} from './mix.js';

/* ------------------------------------------------------------------ */
/* Konfiguration                                                       */
/* ------------------------------------------------------------------ */

const NAME_KEY = 'duellbox.name';
const MAX_NAME = 16;

// Spiele ohne `load` (soon: true) sind in Vorbereitung. Jedes Spielmodul exportiert init(ctx) -> { onMessage, destroy }.
const GAMES = [
  { id: 'slf', icon: '🔤', title: 'Stadt-Land-Fluss', desc: '3 Buchstaben, 6 Kategorien', accent: 'yellow',
    load: () => import('./games/slf.js') },
  { id: 'wwm', icon: '💶', title: 'Wer wird Millionär?', desc: '10 Fragen, 3 Joker', accent: 'purple',
    load: () => import('./games/wwm.js') },
  { id: 'schaetzen', icon: '🎯', title: 'Schätz-Duell', desc: '5 Fragen, näher dran gewinnt', accent: 'cyan',
    load: () => import('./games/schaetzen.js') },
  { id: 'sprint', icon: '⏱️', title: '5-Sekunden-Sprint', desc: '10 Aufgaben, 7 Sekunden', accent: 'pink',
    load: () => import('./games/sprint.js') },
];

/* ------------------------------------------------------------------ */
/* Hilfsfunktionen                                                     */
/* ------------------------------------------------------------------ */

const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;   // niemals innerHTML mit Fremddaten
  return node;
}

function cleanName(value, fallback) {
  const name = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) : '';
  return name || fallback;
}

let toastTimer = 0;
function toast(message, ms = 2800) {
  const node = $('toast');
  node.hidden = true;
  void node.offsetWidth;            // Animation neu starten
  node.textContent = message;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.hidden = true; }, ms);
}

/* ------------------------------------------------------------------ */
/* Zustand                                                             */
/* ------------------------------------------------------------------ */

const state = {
  mode: null,                       // 'online' | 'local'
  names: { host: '', guest: '' },
  stars: { host: 0, guest: 0 },     // Sterne-Gesamtwertung (Host ist maßgeblich)
  seats: [],
  mix: null,                        // laufender 4er-Mix: { index, results } (siehe mix.js)
  pending: null,                    // laufender Raum-Aufbau (abbrechbar)
  activeSeat: 0,
};

const screens = { home: $('screen-home'), room: $('screen-room'), stage: $('stage') };

function showScreen(name) {
  for (const [key, node] of Object.entries(screens)) node.hidden = key !== name;
}

function homeError(message) {
  const node = $('home-error');
  node.textContent = message || '';
  node.hidden = !message;
}

function setBusy(busy) {
  for (const id of ['btn-create', 'btn-join', 'btn-local']) $(id).disabled = busy;
}

/* ------------------------------------------------------------------ */
/* Sitz: Verbindung + Oberfläche eines Spielers                        */
/* ------------------------------------------------------------------ */

class Seat {
  constructor(link, index) {
    this.link = link;
    this.role = link.role;
    this.index = index;
    this.gameId = null;
    this.instP = null;              // Promise auf die Spielinstanz
    this.roundActive = false;       // laufende Runde (für die Tab-Wechsel-Warnung)
    this.awaySent = false;
    this.joined = false;

    this.el = $('tpl-seat').content.firstElementChild.cloneNode(true);
    this.refs = {
      scoreboard: this.el.querySelector('.scoreboard'),
      hint: this.el.querySelector('.lobby-hint'),
      games: this.el.querySelector('.games'),
      leave: this.el.querySelector('.btn-leave'),
      lobby: this.el.querySelector('.view-lobby'),
      mixBtn: this.el.querySelector('.btn-mix'),
      mix: this.el.querySelector('.view-mix'),
      mixBody: this.el.querySelector('.mix-body'),
      game: this.el.querySelector('.view-game'),
      away: this.el.querySelector('.away-banner'),
      gameHost: this.el.querySelector('.game-host'),
    };
    this.refs.leave.textContent = state.mode === 'local' ? 'Test beenden' : 'Raum verlassen';
    this.refs.leave.addEventListener('click', () => leaveRoom());
    this.refs.mixBtn.addEventListener('click', () => this.startMix());
    $('seats').appendChild(this.el);

    this.unsubs = [
      link.on('start', (d) => this.onRemoteStart(d)),
      link.on('stars', (d) => this.onStars(d)),
      link.on('game', (d) => this.onGameMessage(d)),
      link.on('away', (d) => this.onAway(d)),
      link.on('room-full', () => leaveRoom('Dieser Raum ist bereits voll.')),
      link.onStatus((status) => { if (status === 'closed') onDisconnected(this); }),
    ];
  }

  get opponentRole() { return this.role === 'host' ? 'guest' : 'host'; }
  get opponentName() { return state.names[this.opponentRole] || 'Gegner'; }
  get isVisible() { return !this.el.hidden; }

  /* ----- Lobby ----- */

  renderLobby() {
    const { scoreboard, hint, games } = this.refs;
    const chip = (role, tag) => {
      const box = el('div', `player${role === this.role ? ' me' : ''}`);
      box.append(el('span', 'player-tag', tag), el('span', 'player-name', state.names[role] || '…'),
        el('span', 'stars', `★ ${state.stars[role]}`));
      box.setAttribute('aria-label', `${tag} ${state.names[role]}: ${state.stars[role]} Sterne`);
      return box;
    };
    scoreboard.replaceChildren(chip(this.role, 'Du'), chip(this.opponentRole, 'Gegner'));

    const isHost = this.role === 'host';
    hint.textContent = isHost ? 'Wähle ein Spiel' : `${state.names.host || 'Der Host'} wählt das Spiel …`;

    games.replaceChildren(...GAMES.map((game) => {
      const card = el('button', 'game-card');
      card.type = 'button';
      card.setAttribute('role', 'listitem');
      if (game.accent) card.dataset.accent = game.accent;
      card.append(el('span', 'game-icon', game.icon), el('span', 'game-title', game.title), el('span', 'game-desc', game.desc));
      if (game.soon) {
        card.classList.add('soon');
        card.disabled = true;
        card.append(el('span', 'badge', 'In Vorbereitung'));
      } else if (!isHost) {
        card.classList.add('wait');
        card.disabled = true;
      } else {
        card.addEventListener('click', () => this.hostStart(game.id));
      }
      return card;
    }));

    this.refs.mixBtn.textContent = '4er-Mix starten';
    this.refs.mixBtn.disabled = !isHost;
  }

  /** Lobby neu zeichnen und, falls gerade sichtbar, auch den Mix-Zwischenstand. */
  refresh() {
    this.renderLobby();
    if (!this.refs.mix.hidden) this.renderMix();
  }

  showView(name) {
    this.refs.lobby.hidden = name !== 'lobby';
    this.refs.game.hidden = name !== 'game';
    this.refs.mix.hidden = name !== 'mix';
  }

  /* ----- 4er-Mix ----- */

  startMix() {
    if (this.role !== 'host') return;
    state.mix = newMix();
    this.hostStart(MIX_ORDER[0], 0);
  }

  mixNext() {
    if (this.role !== 'host' || !state.mix) return;
    const index = advance(state.mix);
    if (index !== null) this.hostStart(MIX_ORDER[index], index);
  }

  leaveMix() {
    state.mix = null;
    this.showView('lobby');
    this.renderLobby();
  }

  renderMix() {
    const mix = state.mix;
    if (!mix) { this.leaveMix(); return; }
    const done = isComplete(mix);
    const wins = mixWins(mix);
    const who = (role) => (role === this.role ? 'Du' : this.opponentName);
    const body = el('div', 'mix');

    body.append(el('h2', 'title', done ? '4er-Mix · Siegerehrung' : `4er-Mix · Zwischenstand ${mix.results.filter(Boolean).length}/${MIX_ORDER.length}`));

    if (done) {
      const winner = mixWinner(mix);
      const ceremony = el('div', 'mix-ceremony');
      ceremony.append(el('div', 'trophy', winner ? '🏆' : '🤝'));
      ceremony.append(el('h3', '', winner ? `${state.names[winner]} gewinnt den 4er-Mix!` : 'Unentschieden im 4er-Mix'));
      body.append(ceremony);
    }

    const chip = (role) => {
      const box = el('div', `player${role === this.role ? ' me' : ''}`);
      box.append(el('span', 'player-tag', role === this.role ? 'Du' : 'Gegner'), el('span', 'player-name', state.names[role] || '…'),
        el('span', 'stars', `★ ${wins[role]}`));
      box.setAttribute('aria-label', `${state.names[role]}: ${wins[role]} Sterne im 4er-Mix`);
      return box;
    };
    const board = el('div', 'scoreboard');
    board.append(chip(this.role), chip(this.opponentRole));
    body.append(board);

    const list = el('div', 'mix-list');
    MIX_ORDER.forEach((id, i) => {
      const game = GAMES.find((g) => g.id === id);
      const result = mix.results[i];
      const row = el('div', 'mix-row');
      if (!result && i === (done ? -1 : mix.index + 1)) row.classList.add('next');
      let text;
      if (result === 'tie') text = 'Unentschieden';
      else if (result) text = `★ ${who(result)}`;
      else text = i === mix.index + 1 ? 'als Nächstes' : 'offen';
      row.append(el('span', 'mix-icon', game.icon), el('span', 'mix-title', game.title), el('span', 'mix-result', text));
      list.append(row);
    });
    body.append(list);

    if (done) {
      body.append(el('p', 'hint', 'Die Sterne der Einzelspiele stehen in der Lobby.'));
      const back = el('button', 'btn btn-primary', 'Zur Lobby');
      back.type = 'button';
      back.addEventListener('click', () => this.leaveMix());
      body.append(back);
    } else if (this.role === 'host') {
      const next = GAMES.find((g) => g.id === MIX_ORDER[mix.index + 1]);
      const btn = el('button', 'btn btn-primary', `Weiter: ${next.title}`);
      btn.type = 'button';
      btn.addEventListener('click', () => this.mixNext());
      body.append(btn);
    } else {
      body.append(el('p', 'waiting', `${state.names.host || 'Der Host'} startet das nächste Spiel …`));
    }
    this.refs.mixBody.replaceChildren(body);
    if (this.isVisible) window.scrollTo({ top: 0 });
  }

  /* ----- Spielstart / -ende ----- */

  hostStart(gameId, mixIndex) {
    if (this.role !== 'host') return;
    if (mixIndex === undefined) state.mix = null;                 // freie Einzelwahl beendet einen Mix
    this.link.send('start', mixIndex === undefined ? { game: gameId } : { game: gameId, mix: mixIndex });
    this.startGame(gameId);
  }

  onRemoteStart(data) {
    if (this.role !== 'guest' || !data || typeof data.game !== 'string') return;
    const index = validStart(data.game, data.mix);
    if (index === null) {
      state.mix = null;
    } else {
      if (!state.mix || index === 0) state.mix = newMix();
      state.mix.index = index;
    }
    this.startGame(data.game);
  }

  startGame(gameId) {
    const def = GAMES.find((g) => g.id === gameId);
    if (!def || !def.load) return;
    this.stopGame();
    this.gameId = gameId;
    const container = el('div', 'game-root');
    this.refs.gameHost.replaceChildren(container);
    this.showView('game');

    const ctx = {
      role: this.role,
      isHost: this.role === 'host',
      me: state.names[this.role],
      opponent: this.opponentName,
      container,
      send: (type, data) => this.link.send('game', { g: gameId, t: type, d: data }),
      audible: () => this.isVisible,                      // im Lokalmodus nur der sichtbare Sitz macht Geräusche
      setRoundActive: (active) => { this.roundActive = Boolean(active); },
      finish: (winnerRole) => onGameFinished(this, winnerRole),
      exit: () => this.exitGame(),
    };

    const p = def.load()
      .then((mod) => mod.init(ctx))
      .catch((err) => {
        console.error('[app] Spiel konnte nicht gestartet werden', err);
        toast('Spiel konnte nicht geladen werden.');
        if (this.instP === p) this.exitGame();
        return null;
      });
    this.instP = p;
  }

  stopGame() {
    const p = this.instP;
    this.instP = null;
    this.gameId = null;
    this.roundActive = false;
    this.showAway(null);
    if (p) p.then((inst) => inst && inst.destroy());
  }

  exitGame() {
    this.stopGame();
    this.refs.gameHost.replaceChildren();
    if (state.mix && hasResult(state.mix)) {                      // Spiel beendet: Mix-Zwischenstand
      this.showView('mix');
      this.renderMix();
      return;
    }
    if (state.mix) { state.mix = null; toast('4er-Mix beendet.'); }   // Abbruch vor dem Ergebnis
    this.showView('lobby');
    this.renderLobby();
  }

  onGameMessage(msg) {
    if (!msg || typeof msg.g !== 'string' || typeof msg.t !== 'string') return;
    if (msg.g !== this.gameId || !this.instP) return;
    this.instP.then((inst) => inst && inst.onMessage(msg.t, msg.d));   // Reihenfolge bleibt erhalten
  }

  /* ----- Sterne ----- */

  onStars(data) {
    if (!data || !Number.isInteger(data.host) || !Number.isInteger(data.guest)) return;
    state.stars.host = Math.max(0, Math.min(999, data.host));
    state.stars.guest = Math.max(0, Math.min(999, data.guest));
    if (state.mix && Array.isArray(data.m)) {                     // Mix-Ergebnisse des Hosts übernehmen (nur Lücken füllen)
      cleanResults(data.m).forEach((r, i) => { if (r && !hasResult(state.mix, i)) state.mix.results[i] = r; });
    }
    renderAllLobbies();
  }

  /* ----- Tab-Wechsel-Warnung ----- */

  onAway(data) {
    if (!data || typeof data.away !== 'boolean' || !this.gameId) return;
    if (data.away) {
      this.showAway(`⚠️ ${this.opponentName} hat die App verlassen!`);
    } else {
      this.showAway(null);
      toast(`${this.opponentName} ist zurück.`);
    }
  }

  showAway(message) {
    this.refs.away.hidden = !message;
    this.refs.away.textContent = message || '';
  }

  dispose() {
    for (const off of this.unsubs) off();
    this.stopGame();
    this.link.close();
    this.el.remove();
  }
}

/* ------------------------------------------------------------------ */
/* Sitzübergreifende Logik                                             */
/* ------------------------------------------------------------------ */

function renderAllLobbies() {
  for (const seat of state.seats) seat.refresh();
}

/** Nur der Host-Sitz vergibt Sterne und verteilt die Wertung; so zählt im Lokalmodus nichts doppelt. */
function onGameFinished(seat, winnerRole) {
  if (state.mix) recordResult(state.mix, winnerRole);              // beide Sitze halten das Mix-Ergebnis fest (idempotent)
  if (seat.role !== 'host') return;
  const winner = winnerRole === 'host' || winnerRole === 'guest';  // Unentschieden: kein Stern
  if (winner) state.stars[winnerRole] += 1;
  if (winner || state.mix) {
    const payload = { host: state.stars.host, guest: state.stars.guest };
    if (state.mix) payload.m = state.mix.results.slice();
    seat.link.send('stars', payload);
  }
  renderAllLobbies();
}

function setActiveSeat(index) {
  state.activeSeat = index;
  state.seats.forEach((seat, i) => { seat.el.hidden = i !== index; });
  document.querySelectorAll('#switcher .seg').forEach((btn, i) => btn.setAttribute('aria-selected', String(i === index)));
}

function enterStage() {
  const local = state.mode === 'local';
  const switcher = $('switcher');
  switcher.hidden = !local;
  switcher.replaceChildren();
  if (local) {
    state.seats.forEach((seat, i) => {
      const btn = el('button', 'seg', `${i + 1} · ${state.names[seat.role]}`);
      btn.type = 'button';
      btn.setAttribute('role', 'tab');
      btn.addEventListener('click', () => setActiveSeat(i));
      switcher.appendChild(btn);
    });
  }
  renderAllLobbies();
  showScreen('stage');
  setActiveSeat(0);
}

function onDisconnected(seat) {
  if (!state.seats.includes(seat)) return;
  leaveRoom(`Verbindung zu ${seat.opponentName} wurde getrennt.`);
}

function leaveRoom(message) {
  if (state.pending) { state.pending.cancel(); state.pending = null; }
  const seats = state.seats;
  state.seats = [];                 // zuerst leeren: Status-Handler ignorieren bereits entfernte Sitze
  for (const seat of seats) seat.dispose();
  state.mode = null;
  state.names = { host: '', guest: '' };
  state.stars = { host: 0, guest: 0 };
  state.mix = null;
  $('switcher').replaceChildren();
  $('seats').replaceChildren();
  setBusy(false);
  showScreen('home');
  homeError(message || '');
}

/* ------------------------------------------------------------------ */
/* Einstieg: Raum erstellen / beitreten / lokal testen                 */
/* ------------------------------------------------------------------ */

function readName(required) {
  const input = $('inp-name');
  const name = cleanName(input.value, '');
  input.value = name;
  if (!name && required) {
    homeError('Bitte gib zuerst deinen Namen ein.');
    input.focus();
    return '';
  }
  if (name) { try { localStorage.setItem(NAME_KEY, name); } catch { /* Speicher gesperrt: egal */ } }
  return name;
}

function startOnline(link, myName) {
  state.mode = 'online';
  state.names[link.role] = myName;
  const seat = new Seat(link, 0);
  state.seats = [seat];

  // Handshake: Gast meldet sich zuerst, Host antwortet.
  const offHello = link.on('hello', (data) => {
    if (seat.joined) return;
    seat.joined = true;
    offHello();
    state.names[seat.opponentRole] = cleanName(data && data.name, 'Gegner');
    if (link.role === 'host') link.send('hello', { name: myName });
    enterStage();
    soundLogin();
    toast(`Verbunden mit ${seat.opponentName}`);
  });
  if (link.role === 'guest') link.send('hello', { name: myName });
}

async function onCreate() {
  const name = readName(true);
  if (!name) return;
  homeError('');
  setBusy(true);

  const attempt = { cancelled: false, room: null, cancel() { this.cancelled = true; if (this.room) this.room.cancel(); } };
  state.pending = attempt;
  $('room-code').textContent = '––––';
  $('btn-copy').disabled = true;
  $('room-status').textContent = 'Verbinde …';
  showScreen('room');

  try {
    const room = await createRoom();
    attempt.room = room;
    if (attempt.cancelled) { room.cancel(); return; }
    $('room-code').textContent = room.code;
    $('btn-copy').disabled = false;
    $('room-status').textContent = 'Warte auf Mitspieler …';
    const link = await room.guest;
    if (attempt.cancelled) { link.close(); return; }
    state.pending = null;
    startOnline(link, name);
  } catch (err) {
    if (attempt.cancelled) return;
    state.pending = null;
    showScreen('home');
    homeError(err && err.message ? err.message : 'Raum konnte nicht erstellt werden.');
  } finally {
    setBusy(false);
  }
}

async function onJoin() {
  const name = readName(true);
  if (!name) return;
  const code = $('inp-code').value.trim();
  if (!/^\d{4}$/.test(code)) {
    homeError('Bitte einen 4-stelligen Raumcode eingeben.');
    $('inp-code').focus();
    return;
  }
  homeError('');
  setBusy(true);
  const label = $('btn-join').textContent;
  $('btn-join').textContent = 'Verbinde …';
  try {
    const link = await joinRoom(code);
    startOnline(link, name);
  } catch (err) {
    homeError(err && err.message ? err.message : 'Beitritt fehlgeschlagen.');
  } finally {
    $('btn-join').textContent = label;
    setBusy(false);
  }
}

function onLocal() {
  homeError('');
  const name = readName(false) || 'Spieler 1';
  state.mode = 'local';
  state.names = { host: name, guest: 'Spieler 2' };
  const [hostLink, guestLink] = createLocalPair();
  state.seats = [new Seat(hostLink, 0), new Seat(guestLink, 1)];
  state.seats.forEach((seat) => { seat.joined = true; });
  enterStage();
  toast('Lokaler Test: oben zwischen Spieler 1 und 2 wechseln');
}

async function copyCode() {
  const code = $('room-code').textContent.trim();
  if (!/^\d{4}$/.test(code)) return;
  try {
    await navigator.clipboard.writeText(code);
  } catch {
    const tmp = el('input');
    tmp.value = code;
    tmp.readOnly = true;
    tmp.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px';
    document.body.appendChild(tmp);
    tmp.select();
    tmp.setSelectionRange(0, 4);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* nicht unterstützt */ }
    tmp.remove();
    if (!ok) { toast('Kopieren nicht möglich – Code bitte abtippen.'); return; }
  }
  toast('Code kopiert');
}

/* ------------------------------------------------------------------ */
/* Tab-Wechsel-Überwachung (nur online, nur während laufender Runden)  */
/* ------------------------------------------------------------------ */

document.addEventListener('visibilitychange', () => {
  if (state.mode !== 'online') return;
  const seat = state.seats[0];
  if (!seat) return;
  if (document.hidden) {
    if (seat.roundActive) {
      seat.awaySent = true;
      seat.link.send('away', { away: true });
    }
  } else if (seat.awaySent) {
    seat.awaySent = false;
    seat.link.send('away', { away: false });
  }
});

/* ------------------------------------------------------------------ */
/* Start                                                               */
/* ------------------------------------------------------------------ */

function init() {
  initSound();
  // iOS Safari: ohne Touch-Listener greift :active nicht zuverlässig.
  document.addEventListener('touchstart', () => {}, { passive: true });

  try { $('inp-name').value = cleanName(localStorage.getItem(NAME_KEY), ''); } catch { /* egal */ }

  const muteBtn = $('btn-mute');
  const syncMute = () => {
    muteBtn.textContent = isMuted() ? '🔇' : '🔊';
    muteBtn.setAttribute('aria-pressed', String(isMuted()));
    muteBtn.setAttribute('aria-label', isMuted() ? 'Ton einschalten' : 'Ton ausschalten');
  };
  muteBtn.addEventListener('click', () => { setMuted(!isMuted()); syncMute(); });
  syncMute();

  $('btn-create').addEventListener('click', onCreate);
  $('btn-join').addEventListener('click', onJoin);
  $('btn-local').addEventListener('click', onLocal);
  $('btn-copy').addEventListener('click', copyCode);
  $('btn-room-cancel').addEventListener('click', () => {
    if (state.pending) { state.pending.cancel(); state.pending = null; }
    setBusy(false);
    showScreen('home');
  });
  $('inp-code').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4); });
  $('inp-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') onJoin(); });

  showScreen('home');
}

init();
