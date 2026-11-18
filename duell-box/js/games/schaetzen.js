// games/schaetzen.js – Spiel 3: Schätz-Duell (1 gegen 1).
// Schnittstelle: init(ctx) -> { onMessage(type, data), destroy() }.
// Das Modul kennt PeerJS nicht; es sendet/empfängt nur über ctx.send / onMessage.
//
// Ablauf je Frage: verdeckte Zahleneingabe (15 s) -> beide Tipps werden gleichzeitig aufgedeckt
// -> Wertung -> „Weiter“ (beide). Nach 5 Fragen erhält der Gesamtsieger 1 Stern (ctx.finish).
//
// Verdeckt heißt: Über die Leitung geht zuerst nur `lock` (ohne Zahl). Die Zahl folgt erst
// (`guess`), wenn beide abgegeben haben oder die Zeit abgelaufen ist.

import { SCHAETZ_FRAGEN } from '../data.js';
import * as sound from '../sound.js';

export const QUESTIONS = 5;
export const SECONDS = 15;
export const MAX_VALUE = 1e15;

/* ------------------------------------------------------------------ */
/* Reine Logik (ohne DOM, per Node testbar)                            */
/* ------------------------------------------------------------------ */

/**
 * Eingabetext -> Zahl oder null (kein gültiger Tipp).
 * Komma = Dezimaltrenner. Ein Punkt gilt als Tausendertrenner, wenn er dem Muster 1.234 / 12.345.678
 * folgt, sonst als Dezimalpunkt (iOS-Zifferntastatur liefert je nach Region Punkt oder Komma).
 * Leerzeichen werden ignoriert; leer, Text, negativ oder unendlich -> null.
 */
export function parseGuess(text) {
  if (typeof text !== 'string') return null;
  const s = text.replace(/[\s'’]/g, '');
  if (s === '' || !/^[0-9.,]+$/.test(s)) return null;
  let normalized;
  if (s.includes(',')) {
    if ((s.match(/,/g) || []).length > 1) return null;
    const [intPart, frac] = s.split(',');
    if (!/^\d{1,3}(\.\d{3})*$|^\d+$/.test(intPart) || !/^\d+$/.test(frac)) return null;
    normalized = `${intPart.replace(/\./g, '')}.${frac}`;
  } else if (s.includes('.')) {
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) normalized = s.replace(/\./g, '');
    else if (/^\d+\.\d+$/.test(s)) normalized = s;
    else return null;
  } else {
    normalized = s;
  }
  const value = Number(normalized);
  return Number.isFinite(value) && value >= 0 && value <= MAX_VALUE ? value : null;
}

/** Eingehende Zahl ist unvertrauenswürdig: gültige endliche Zahl >= 0 oder null. */
export function cleanGuess(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_VALUE ? value : null;
}

const isExact = (guess, target) => Math.abs(guess - target) < 1e-9;

/**
 * Wertung einer Frage. Symmetrisch: der Gegner rechnet mit vertauschten Argumenten.
 * Exakter Treffer 2; sonst näher dran 1; gleicher Abstand beide 1; kein gültiger Tipp 0
 * (der Mitspieler bekommt dann 1, bei Volltreffer 2). Beide ungültig: 0:0.
 * @returns {{mine:number, theirs:number}}
 */
export function scoreQuestion(mine, theirs, target) {
  const a = cleanGuess(mine);
  const b = cleanGuess(theirs);
  if (a === null && b === null) return { mine: 0, theirs: 0 };
  if (a === null) return { mine: 0, theirs: isExact(b, target) ? 2 : 1 };
  if (b === null) return { mine: isExact(a, target) ? 2 : 1, theirs: 0 };
  const exactA = isExact(a, target);
  const exactB = isExact(b, target);
  if (exactA || exactB) return { mine: exactA ? 2 : 0, theirs: exactB ? 2 : 0 };
  const da = Math.abs(a - target);
  const db = Math.abs(b - target);
  if (da === db) return { mine: 1, theirs: 1 };
  return da < db ? { mine: 1, theirs: 0 } : { mine: 0, theirs: 1 };
}

/** n verschiedene Fragen-IDs (Fisher-Yates). */
export function pickQuestions(n = QUESTIONS, rng = Math.random, pool = SCHAETZ_FRAGEN) {
  const ids = pool.map((q) => q.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, n);
}

/** Setup vom Host prüfen: genau n verschiedene, bekannte IDs -> Fragenobjekte, sonst null. */
export function validSetup(data, pool = SCHAETZ_FRAGEN) {
  if (!data || !Array.isArray(data.ids) || data.ids.length !== QUESTIONS) return null;
  if (new Set(data.ids).size !== QUESTIONS) return null;
  const list = data.ids.map((id) => pool.find((q) => q.id === id));
  return list.every(Boolean) ? list : null;
}

/** Anzeige einer Zahl auf Deutsch; Jahreszahlen ohne Tausenderpunkt. */
export function formatValue(value, unit) {
  if (value === null) return '—';
  if (unit === 'Jahreszahl') return String(value);
  return value.toLocaleString('de-DE', { maximumFractionDigits: 2 });
}

/* ------------------------------------------------------------------ */
/* Spielinstanz                                                        */
/* ------------------------------------------------------------------ */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;   // niemals innerHTML mit Fremddaten
  return node;
}

export function init(ctx) {
  const root = ctx.container;
  const opp = ctx.opponent;
  const S = {
    destroyed: false,
    phase: 'setup',               // setup | input | reveal | final
    questions: [],
    index: 0,
    totals: { mine: 0, theirs: 0 },
    history: [],                  // { frage, mine, theirs, pm, pt } je Frage
    finished: false,
    timer: 0,
  };
  let Q = null;                   // Zustand der aktuellen Frage
  let ui = {};

  const mount = (node) => {
    root.replaceChildren(node);
    if (ctx.audible()) window.scrollTo({ top: 0 });
  };
  const screen = () => el('div', 'sz');
  const current = () => S.questions[S.index];

  function newQuestion() {
    Q = {
      mineLocked: false, mineVal: null,
      theirLocked: false, theirVal: undefined,   // undefined = noch nicht aufgedeckt erhalten
      timeUp: false, sent: false,
      nextMe: false, nextThem: false,
    };
  }

  /* ----- Setup ----- */

  function renderSetup() {
    S.phase = 'setup';
    const box = screen();
    box.append(el('h2', 'title', 'Schätz-Duell'));
    if (ctx.isHost) {
      box.append(el('p', 'sub', `${QUESTIONS} Fragen · ${SECONDS} Sekunden pro Frage. Wer näher dran liegt, punktet.`));
      const start = el('button', 'btn btn-primary', 'Los geht’s');
      start.type = 'button';
      start.addEventListener('click', hostStart);
      const back = el('button', 'btn btn-ghost', 'Zurück zur Lobby');
      back.type = 'button';
      back.addEventListener('click', () => { ctx.send('abort'); ctx.exit(); });
      box.append(start, back);
    } else {
      box.append(el('p', 'waiting', `${opp} startet das Spiel …`));
    }
    mount(box);
  }

  function hostStart() {
    const ids = pickQuestions(QUESTIONS);
    ctx.send('setup', { ids });
    startMatch(validSetup({ ids }));
  }

  function startMatch(list) {
    S.questions = list;
    S.index = 0;
    S.totals = { mine: 0, theirs: 0 };
    S.history = [];
    enterInput();
  }

  /* ----- Eingabe ----- */

  function enterInput() {
    S.phase = 'input';
    newQuestion();
    ctx.setRoundActive(true);
    const q = current();

    const box = screen();
    const head = el('div', 'sz-head');
    head.append(
      el('span', 'pill', `Frage ${S.index + 1}/${QUESTIONS}`),
      el('span', 'pill score', `Du ${S.totals.mine} : ${S.totals.theirs}`),
    );

    const card = el('div', 'card sz-question');
    card.append(el('p', 'sz-text', q.frage), el('p', 'sz-unit', `Antwort in: ${q.einheit}`));

    const countdown = el('div', 'countdown');
    countdown.setAttribute('role', 'timer');
    const cdText = el('span', 'countdown-text', `${SECONDS} s`);
    const cdBar = el('div', 'countdown-bar');
    const bar = el('i');
    bar.style.setProperty('--cd', `${SECONDS}s`);
    cdBar.append(bar);
    countdown.append(cdText, cdBar);

    const form = el('form', 'sz-form');
    form.addEventListener('submit', (e) => { e.preventDefault(); lock(); });
    const label = el('label', 'field');
    label.append(el('span', '', 'Dein Tipp (bleibt verdeckt)'));
    const input = el('input', 'sz-input');
    input.type = 'text';
    input.inputMode = Number.isInteger(q.wert) ? 'numeric' : 'decimal';
    input.autocomplete = 'off';
    input.setAttribute('autocorrect', 'off');
    input.spellcheck = false;
    input.maxLength = 20;
    input.enterKeyHint = 'done';
    input.placeholder = q.einheit;
    input.addEventListener('input', updateLockButton);
    label.append(input);

    const lockBtn = el('button', 'btn btn-primary', 'Tipp abgeben');
    lockBtn.type = 'submit';
    lockBtn.disabled = true;
    form.append(label, lockBtn);

    const status = el('p', 'waiting');
    status.setAttribute('aria-live', 'polite');
    status.textContent = `${opp} tippt noch …`;

    box.append(head, card, countdown, form, status);
    ui = { input, lockBtn, cdText, status, bar };
    mount(box);
    startTimer();
  }

  function updateLockButton() {
    if (S.phase !== 'input' || Q.mineLocked) return;
    ui.lockBtn.disabled = parseGuess(ui.input.value) === null;
  }

  function startTimer() {
    const deadline = Date.now() + SECONDS * 1000;
    let lastShown = -1;
    const tick = () => {
      if (S.phase !== 'input') return;
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      if (remaining !== lastShown) {
        lastShown = remaining;
        ui.cdText.textContent = `${remaining} s`;
        if (remaining > 0 && remaining <= 5 && !Q.mineLocked && ctx.audible()) sound.tick(remaining <= 3);
      }
      if (remaining <= 0) onTimeUp();
    };
    S.timer = setInterval(tick, 200);
  }

  function clearTimer() {
    clearInterval(S.timer);
    S.timer = 0;
  }

  /** Eigenen Tipp festschreiben (nur einmal). Leere/ungültige Eingabe = kein Tipp (null). */
  function lock() {
    if (S.phase !== 'input' || Q.mineLocked) return;
    Q.mineLocked = true;
    Q.mineVal = parseGuess(ui.input.value);
    ui.input.disabled = true;
    ui.lockBtn.disabled = true;
    if (Q.mineVal !== null && ctx.audible()) sound.login();
    ctx.send('lock', { i: S.index });
    ui.status.textContent = Q.theirLocked ? 'Beide haben getippt …' : `Tipp abgegeben – warte auf ${opp} …`;
    trySendGuess();
  }

  function onTimeUp() {
    if (S.phase !== 'input' || Q.timeUp) return;
    Q.timeUp = true;
    clearTimer();
    if (ctx.audible()) sound.stop();
    lock();            // Falls noch nicht geschehen: aktuelle Eingabe übernehmen
    trySendGuess();
  }

  /** Zahl erst freigeben, wenn beide abgegeben haben oder die Zeit abgelaufen ist. */
  function trySendGuess() {
    if (Q.sent || !Q.mineLocked || !(Q.theirLocked || Q.timeUp)) return;
    Q.sent = true;
    clearTimer();
    ctx.send('guess', { i: S.index, v: Q.mineVal });
    maybeReveal();
  }

  function maybeReveal() {
    if (S.phase === 'input' && Q.sent && Q.theirVal !== undefined) enterReveal();
  }

  /* ----- Aufdecken ----- */

  function enterReveal() {
    S.phase = 'reveal';
    clearTimer();
    ctx.setRoundActive(false);
    const q = current();
    const pts = scoreQuestion(Q.mineVal, Q.theirVal, q.wert);
    S.totals.mine += pts.mine;
    S.totals.theirs += pts.theirs;
    S.history.push({ frage: q.frage, mine: Q.mineVal, theirs: Q.theirVal, pm: pts.mine, pt: pts.theirs });

    const box = screen();
    box.append(el('h2', 'title', `Frage ${S.index + 1} · Auflösung`));
    box.append(el('p', 'sz-text sz-small', q.frage));

    const truth = el('div', 'card sz-truth');
    truth.append(el('span', 'sz-label', 'Richtig ist'), el('b', '', formatValue(q.wert, q.einheit)), el('span', 'sz-unit', q.einheit));
    box.append(truth);

    const cards = el('div', 'sz-cards');
    cards.append(
      guessCard('Du', Q.mineVal, q, pts.mine),
      guessCard(opp, Q.theirVal, q, pts.theirs),
    );
    box.append(cards);

    const total = el('div', 'sum');
    total.append(...sumCells(S.totals.mine, S.totals.theirs, 'Gesamt'));
    box.append(total);

    const last = S.index >= QUESTIONS - 1;
    const next = el('button', 'btn btn-primary', last ? 'Zum Ergebnis' : 'Weiter');
    next.type = 'button';
    next.addEventListener('click', () => {
      if (Q.nextMe) return;
      Q.nextMe = true;
      next.disabled = true;
      next.textContent = `Warte auf ${opp} …`;
      ctx.send('next', { i: S.index });
      maybeAdvance();
    });
    box.append(next);
    mount(box);
    if (ctx.audible() && pts.mine > pts.theirs) sound.login();
  }

  function guessCard(name, value, q, points) {
    const card = el('div', 'card sz-guess');
    card.classList.toggle('won', points > 0);
    card.append(el('span', 'sz-label', name));
    card.append(el('b', '', value === null ? 'kein Tipp' : formatValue(value, q.einheit)));
    card.append(el('span', 'sz-diff', value === null ? '—' : (isExact(value, q.wert) ? 'Volltreffer!' : `Abstand ${formatValue(Math.abs(value - q.wert), q.einheit)}`)));
    card.append(el('em', 'sz-pts', `+${points}`));
    return card;
  }

  function sumCells(mine, theirs, label) {
    const a = el('div');
    a.append(el('b', '', String(mine)), el('span', '', `Du · ${label}`));
    const b = el('div');
    b.append(el('b', '', String(theirs)), el('span', '', `${opp} · ${label}`));
    return [a, b];
  }

  function maybeAdvance() {
    if (S.phase !== 'reveal' || !Q.nextMe || !Q.nextThem) return;
    if (S.index >= QUESTIONS - 1) { enterFinal(); return; }
    S.index += 1;
    enterInput();
  }

  /* ----- Ende ----- */

  function enterFinal() {
    S.phase = 'final';
    const { mine, theirs } = S.totals;
    const winnerRole = mine === theirs ? null : (mine > theirs ? ctx.role : (ctx.role === 'host' ? 'guest' : 'host'));
    const iWon = mine > theirs;

    const box = screen();
    box.classList.add('final');
    box.append(el('div', 'trophy', winnerRole ? '🏆' : '🤝'));
    box.append(el('h2', '', winnerRole ? `${iWon ? ctx.me : opp} gewinnt!` : 'Unentschieden'));
    const total = el('div', 'sum');
    total.append(...sumCells(mine, theirs, 'Gesamt'));
    box.append(total);

    const list = el('div', 'rev-list');
    S.history.forEach((h, i) => {
      list.append(el('p', 'hint', `Frage ${i + 1}: Du ${h.pm} · ${opp} ${h.pt}`));
    });
    box.append(list);
    box.append(el('p', 'sub', winnerRole ? `★ 1 Stern für ${iWon ? ctx.me : opp}` : 'Kein Stern bei Unentschieden'));

    const back = el('button', 'btn btn-primary', 'Zurück zur Lobby');
    back.type = 'button';
    back.addEventListener('click', () => ctx.exit());
    box.append(back);
    mount(box);

    if (iWon && ctx.audible()) sound.win();
    if (!S.finished) {
      S.finished = true;
      ctx.finish(winnerRole);
    }
  }

  /* ----- Nachrichten vom Mitspieler ----- */

  function onMessage(type, data) {
    if (S.destroyed) return;
    switch (type) {
      case 'abort':
        if (S.phase === 'setup') ctx.exit();
        break;
      case 'setup': {
        if (ctx.isHost || S.phase !== 'setup') return;
        const list = validSetup(data);
        if (list) startMatch(list);
        break;
      }
      case 'lock':
        if (S.phase === 'input' && data && data.i === S.index && !Q.theirLocked) {
          Q.theirLocked = true;
          if (!Q.mineLocked) ui.status.textContent = `${opp} hat getippt ✓`;
          else ui.status.textContent = 'Beide haben getippt …';
          trySendGuess();
        }
        break;
      case 'guess':
        if (S.phase === 'input' && data && data.i === S.index && Q.theirVal === undefined) {
          Q.theirLocked = true;
          Q.theirVal = cleanGuess(data.v);
          trySendGuess();
          maybeReveal();
        }
        break;
      case 'next':
        if (S.phase === 'reveal' && data && data.i === S.index) {
          Q.nextThem = true;
          maybeAdvance();
        }
        break;
      default:
        break;
    }
  }

  function destroy() {
    S.destroyed = true;
    clearTimer();
    root.replaceChildren();
  }

  renderSetup();
  return { onMessage, destroy };
}
