// games/slf.js – Spiel 1: Stadt-Land-Fluss (1 gegen 1).
// Schnittstelle: init(ctx) -> { onMessage(type, data), destroy() }.
// Das Modul kennt PeerJS nicht; es sendet/empfängt nur über ctx.send / onMessage.
//
// Ablauf je Runde: Eingabe -> (Stopp -> 10 s Countdown beim Gegner) -> Auswertung (gegenseitiges
// Streichen, Bestätigen) -> Rundenwertung. Nach 3 Runden erhält der Gesamtsieger 1 Stern (ctx.finish).

import { SLF_LETTERS, SLF_SETS } from '../data.js';
import * as sound from '../sound.js';

export const ROUNDS = 3;
export const STOP_SECONDS = 10;
export const MAX_ANSWER = 40;
export const POINTS = { alone: 20, different: 10, same: 5 };

/* ------------------------------------------------------------------ */
/* Reine Logik (ohne DOM, per Node testbar)                            */
/* ------------------------------------------------------------------ */

/** Vergleichsform: ohne Groß-/Kleinschreibung, Umlaute als ae/oe/ue, ß als ss, übrige Akzente entfernt. */
export function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Wertung einer Runde aus Sicht von „mine“. Symmetrisch: Gegner rechnet mit vertauschten Argumenten.
 * @param {string[]} mine            meine Antworten
 * @param {string[]} theirs          Antworten des Gegners
 * @param {boolean[]} struckOnMine   meine Antworten, vom Gegner gestrichen
 * @param {boolean[]} struckOnTheirs gegnerische Antworten, von mir gestrichen
 * @returns {{mine: number[], theirs: number[]}} Punkte je Kategorie
 */
export function scoreRound(mine, theirs, struckOnMine, struckOnTheirs) {
  const outMine = [];
  const outTheirs = [];
  for (let i = 0; i < mine.length; i++) {
    const a = normalize(mine[i]);
    const b = normalize(theirs[i]);
    const validA = a !== '' && !struckOnMine[i];
    const validB = b !== '' && !struckOnTheirs[i];
    if (validA && validB) {
      const pts = a === b ? POINTS.same : POINTS.different;
      outMine.push(pts);
      outTheirs.push(pts);
    } else {
      outMine.push(validA ? POINTS.alone : 0);
      outTheirs.push(validB ? POINTS.alone : 0);
    }
  }
  return { mine: outMine, theirs: outTheirs };
}

const sum = (list) => list.reduce((acc, n) => acc + n, 0);

/** n verschiedene Zufallsbuchstaben (ohne Q, X, Y). */
export function pickLetters(n = ROUNDS, rng = Math.random) {
  const pool = [...SLF_LETTERS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

/** Eingehende Antworten sind unvertrauenswürdig: immer genau n bereinigte Strings. */
export function cleanAnswers(value, n) {
  const list = Array.isArray(value) ? value : [];
  return Array.from({ length: n }, (_, i) =>
    typeof list[i] === 'string' ? list[i].replace(/\s+/g, ' ').trim().slice(0, MAX_ANSWER) : '');
}

export function cleanFlags(value, n) {
  const list = Array.isArray(value) ? value : [];
  return Array.from({ length: n }, (_, i) => list[i] === true);
}

function validSetup(data) {
  if (!data || typeof data.set !== 'string' || !Array.isArray(data.letters)) return null;
  const set = SLF_SETS.find((s) => s.id === data.set);
  const letters = data.letters;
  const ok = set && letters.length === ROUNDS
    && letters.every((l) => SLF_LETTERS.includes(l))
    && new Set(letters).size === ROUNDS;
  return ok ? { set, letters: [...letters] } : null;
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
    phase: 'setup',               // setup | input | review | roundDone | final
    set: null,
    letters: [],
    round: 0,
    totals: { mine: 0, theirs: 0 },
    history: [],                  // { letter, mine, theirs } je beendeter Runde
    finished: false,
    timer: 0,
  };
  let R = null;                   // Rundenzustand
  let ui = {};                    // Referenzen auf aktuelle Oberfläche

  const n = () => S.set.categories.length;
  const mount = (node) => {
    root.replaceChildren(node);
    if (ctx.audible()) window.scrollTo({ top: 0 });
  };
  const screen = () => el('div', 'slf');

  function newRound() {
    R = {
      mine: null, theirs: null,
      submitted: false, stoppedByMe: false, stoppedByThem: false,
      struckOnMine: Array(n()).fill(false),      // vom Gegner gestrichen
      struckOnTheirs: Array(n()).fill(false),    // von mir gestrichen
      iConfirmed: false, theyConfirmed: false,
      nextMe: false, nextThem: false,
    };
  }

  /* ----- Setup ----- */

  function renderSetup() {
    S.phase = 'setup';
    const box = screen();
    box.append(el('h2', 'title', 'Stadt-Land-Fluss'));
    if (ctx.isHost) {
      box.append(el('p', 'sub', 'Wähle das Kategorien-Set'));
      for (const set of SLF_SETS) {
        const btn = el('button', `set-card ${set.tone}`);
        btn.type = 'button';
        btn.append(el('b', '', set.title), el('span', '', set.categories.join(' · ')));
        btn.addEventListener('click', () => hostPick(set));
        box.append(btn);
      }
      const back = el('button', 'btn btn-ghost', 'Zurück zur Lobby');
      back.type = 'button';
      back.addEventListener('click', () => { ctx.send('abort'); ctx.exit(); });
      box.append(back);
    } else {
      box.append(el('p', 'waiting', `${ctx.opponent} wählt das Kategorien-Set …`));
    }
    mount(box);
  }

  function hostPick(set) {
    const letters = pickLetters(ROUNDS);
    ctx.send('setup', { set: set.id, letters });
    startMatch(set, letters);
  }

  function startMatch(set, letters) {
    S.set = set;
    S.letters = letters;
    S.round = 0;
    S.totals = { mine: 0, theirs: 0 };
    S.history = [];
    enterInput();
  }

  /* ----- Eingabe ----- */

  function enterInput() {
    S.phase = 'input';
    newRound();
    ctx.setRoundActive(true);

    const box = screen();
    const head = el('div', 'slf-head');
    const letter = el('div', 'letter', S.letters[S.round]);
    letter.setAttribute('aria-label', `Buchstabe ${S.letters[S.round]}`);
    const score = el('span', 'pill score', `Du ${S.totals.mine} : ${S.totals.theirs}`);
    head.append(el('span', 'pill', `Runde ${S.round + 1}/${ROUNDS}`), letter, score);

    const countdown = el('div', 'countdown');
    countdown.hidden = true;
    countdown.setAttribute('role', 'timer');
    const cdText = el('span', 'countdown-text');
    const cdBar = el('div', 'countdown-bar');
    cdBar.append(el('i'));
    countdown.append(cdText, cdBar);

    const form = el('form', 'cat-list');
    form.addEventListener('submit', (e) => e.preventDefault());
    const inputs = S.set.categories.map((name, i) => {
      const label = el('label', 'cat');
      const input = el('input');
      input.type = 'text';
      input.maxLength = MAX_ANSWER;
      input.placeholder = `${S.letters[S.round]} …`;
      input.autocomplete = 'off';
      input.autocapitalize = 'words';
      input.setAttribute('autocorrect', 'off');
      input.spellcheck = false;
      input.enterKeyHint = i === S.set.categories.length - 1 ? 'done' : 'next';
      input.addEventListener('input', updateStopButton);
      input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const next = ui.inputs[i + 1];
        if (next) next.focus(); else input.blur();
      });
      label.append(el('span', '', name), input);
      form.append(label);
      return input;
    });

    const stopBtn = el('button', 'btn btn-danger', 'Stopp!');
    stopBtn.type = 'button';
    stopBtn.disabled = true;
    stopBtn.addEventListener('click', onStopButton);

    const waiting = el('p', 'waiting');
    waiting.hidden = true;
    waiting.setAttribute('aria-live', 'polite');

    box.append(head, countdown, form, stopBtn, waiting);
    ui = { inputs, stopBtn, countdown, cdText, cdBar, waiting };
    mount(box);
  }

  function allFilled() { return ui.inputs.every((input) => input.value.trim() !== ''); }

  function updateStopButton() {
    if (S.phase !== 'input' || R.submitted) return;
    ui.stopBtn.disabled = !(R.stoppedByThem || allFilled());
  }

  function onStopButton() {
    if (S.phase !== 'input' || R.submitted) return;
    if (R.stoppedByThem) { submit(); return; }       // Countdown läuft: vorzeitig abgeben
    if (!allFilled()) return;
    R.stoppedByMe = true;
    if (ctx.audible()) sound.stop();
    ctx.send('stop', { r: S.round });
    submit();
  }

  function startCountdown() {
    R.stoppedByThem = true;
    if (ctx.audible()) sound.stop();
    ui.countdown.hidden = false;
    ui.stopBtn.textContent = 'Abgeben';
    ui.stopBtn.className = 'btn btn-primary';
    ui.stopBtn.disabled = false;

    const deadline = Date.now() + STOP_SECONDS * 1000;
    let lastShown = -1;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      if (remaining !== lastShown) {
        lastShown = remaining;
        ui.cdText.textContent = `${opp} hat Stopp gedrückt – noch ${remaining} s`;
        if (remaining > 0 && ctx.audible()) sound.tick(remaining <= 3);
      }
      if (remaining <= 0) submit();
    };
    S.timer = setInterval(tick, 200);
    tick();
  }

  function clearTimer() {
    clearInterval(S.timer);
    S.timer = 0;
  }

  function submit() {
    if (S.phase !== 'input' || R.submitted) return;
    clearTimer();
    R.submitted = true;
    R.mine = cleanAnswers(ui.inputs.map((input) => input.value), n());
    ctx.setRoundActive(false);
    ctx.send('answers', { r: S.round, a: R.mine });

    ui.inputs.forEach((input) => { input.disabled = true; });
    ui.stopBtn.hidden = true;
    ui.countdown.hidden = true;
    ui.waiting.hidden = false;
    ui.waiting.textContent = R.stoppedByMe
      ? `Gestoppt! ${opp} hat noch ${STOP_SECONDS} Sekunden …`
      : `Abgegeben – warte auf ${opp} …`;
    maybeReview();
  }

  function maybeReview() {
    if (S.phase === 'input' && R.submitted && R.theirs) enterReview();
  }

  /* ----- Auswertung ----- */

  function enterReview() {
    S.phase = 'review';
    const box = screen();
    box.append(el('h2', 'title', `Auswertung · ${S.letters[S.round]}`));
    box.append(el('p', 'sub', `Tippe ungültige Antworten von ${opp} an, um sie zu streichen.`));

    const head = el('div', 'rev-head');
    head.append(el('span', '', 'Du'), el('span', '', opp));
    box.append(head);

    const list = el('div', 'rev-list');
    const rows = S.set.categories.map((name, i) => {
      const row = el('div', 'rev-row');
      const cells = el('div', 'rev-cells');
      const mineCell = el('div', 'cell');
      const theirCell = el('button', 'cell-btn');
      theirCell.type = 'button';
      theirCell.addEventListener('click', () => toggleStrike(i));
      cells.append(mineCell, theirCell);
      row.append(el('div', 'rev-cat', name), cells);
      list.append(row);
      return { mineCell, theirCell };
    });
    box.append(list);

    const totals = el('div', 'sum');
    const mineSum = el('div');
    const theirSum = el('div');
    totals.append(mineSum, theirSum);
    box.append(totals);

    const confirm = el('button', 'btn btn-success', 'Punkte bestätigen');
    confirm.type = 'button';
    confirm.addEventListener('click', onConfirm);
    const note = el('p', 'hint', 'Die Punkte gelten endgültig, sobald ihr beide bestätigt habt.');
    note.setAttribute('aria-live', 'polite');
    box.append(confirm, note);

    ui = { rows, mineSum, theirSum, confirm, note };
    updateReview();
    mount(box);
  }

  function fillCell(cell, text, struck, points, byline) {
    const empty = text === '';
    cell.classList.toggle('empty', empty);
    cell.classList.toggle('struck', struck && !empty);
    const txt = el('span', 'txt', empty ? '—' : text);
    const pts = el('em', '', struck && !empty ? `gestrichen${byline}` : `+${points}`);
    cell.replaceChildren(txt, pts);
  }

  function updateReview() {
    const pts = scoreRound(R.mine, R.theirs, R.struckOnMine, R.struckOnTheirs);
    ui.rows.forEach((row, i) => {
      fillCell(row.mineCell, R.mine[i], R.struckOnMine[i], pts.mine[i], ` von ${opp}`);
      fillCell(row.theirCell, R.theirs[i], R.struckOnTheirs[i], pts.theirs[i], '');
      row.theirCell.disabled = R.iConfirmed || R.theirs[i] === '';
      row.theirCell.setAttribute('aria-pressed', String(R.struckOnTheirs[i]));
      row.theirCell.setAttribute('aria-label', R.theirs[i] === ''
        ? `${opp}: keine Antwort`
        : `Antwort von ${opp}: ${R.theirs[i]}. ${R.struckOnTheirs[i] ? 'Gestrichen, antippen zum Zurücknehmen' : 'Antippen zum Streichen'}`);
    });
    ui.mineSum.replaceChildren(el('b', '', String(sum(pts.mine))), el('span', '', 'Du (vorläufig)'));
    ui.theirSum.replaceChildren(el('b', '', String(sum(pts.theirs))), el('span', '', `${opp} (vorläufig)`));
    ui.confirm.disabled = R.iConfirmed;
    ui.confirm.textContent = R.iConfirmed ? `Warte auf ${opp} …` : 'Punkte bestätigen';
  }

  function toggleStrike(i) {
    if (S.phase !== 'review' || R.iConfirmed || R.theirs[i] === '') return;
    R.struckOnTheirs[i] = !R.struckOnTheirs[i];
    ctx.send('strikes', { r: S.round, s: R.struckOnTheirs.slice() });
    updateReview();
  }

  function onConfirm() {
    if (S.phase !== 'review' || R.iConfirmed) return;
    R.iConfirmed = true;
    ctx.send('confirm', { r: S.round, s: R.struckOnTheirs.slice() });
    updateReview();
    maybeFinalize();
  }

  function maybeFinalize() {
    if (S.phase !== 'review' || !R.iConfirmed || !R.theyConfirmed) return;
    const pts = scoreRound(R.mine, R.theirs, R.struckOnMine, R.struckOnTheirs);
    const mine = sum(pts.mine);
    const theirs = sum(pts.theirs);
    S.totals.mine += mine;
    S.totals.theirs += theirs;
    S.history.push({ letter: S.letters[S.round], mine, theirs });
    if (S.round >= ROUNDS - 1) enterFinal(); else enterRoundDone();
  }

  /* ----- Rundenwertung & Ende ----- */

  function enterRoundDone() {
    S.phase = 'roundDone';
    const last = S.history[S.history.length - 1];
    const box = screen();
    box.append(el('h2', 'title', `Runde ${S.round + 1} · ${last.letter}`));

    const roundSum = el('div', 'sum');
    roundSum.append(...sumCells(last.mine, last.theirs, 'Diese Runde'));
    const totalSum = el('div', 'sum');
    totalSum.append(...sumCells(S.totals.mine, S.totals.theirs, 'Gesamt'));

    const next = el('button', 'btn btn-primary', `Weiter zu Runde ${S.round + 2}`);
    next.type = 'button';
    next.addEventListener('click', () => {
      if (R.nextMe) return;
      R.nextMe = true;
      next.disabled = true;
      next.textContent = `Warte auf ${opp} …`;
      ctx.send('next', { r: S.round });
      maybeAdvance();
    });
    box.append(roundSum, totalSum, next);
    mount(box);
  }

  function sumCells(mine, theirs, label) {
    const a = el('div');
    a.append(el('b', '', String(mine)), el('span', '', `Du · ${label}`));
    const b = el('div');
    b.append(el('b', '', String(theirs)), el('span', '', `${opp} · ${label}`));
    return [a, b];
  }

  function maybeAdvance() {
    if (S.phase !== 'roundDone' || !R.nextMe || !R.nextThem) return;
    S.round += 1;
    enterInput();
  }

  function enterFinal() {
    S.phase = 'final';
    const { mine, theirs } = S.totals;
    const winnerRole = mine === theirs ? null : (mine > theirs ? ctx.role : (ctx.role === 'host' ? 'guest' : 'host'));
    const iWon = mine > theirs;

    const box = screen();
    box.classList.add('final');
    box.append(el('div', 'trophy', winnerRole ? '🏆' : '🤝'));
    box.append(el('h2', '', winnerRole ? `${iWon ? ctx.me : opp} gewinnt!` : 'Unentschieden'));
    const totalSum = el('div', 'sum');
    totalSum.append(...sumCells(mine, theirs, 'Gesamt'));
    box.append(totalSum);

    const rounds = el('div', 'rev-list');
    S.history.forEach((h, i) => {
      rounds.append(el('p', 'hint', `Runde ${i + 1} (${h.letter}): Du ${h.mine} · ${opp} ${h.theirs}`));
    });
    box.append(rounds);
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
        const valid = validSetup(data);
        if (valid) startMatch(valid.set, valid.letters);
        break;
      }
      case 'stop':
        if (S.phase === 'input' && data && data.r === S.round && !R.submitted && !R.stoppedByThem) startCountdown();
        break;
      case 'answers':
        if (S.phase === 'input' && data && data.r === S.round && !R.theirs) {
          R.theirs = cleanAnswers(data.a, n());
          maybeReview();
        }
        break;
      case 'strikes':
        if (S.phase === 'review' && data && data.r === S.round) {
          R.struckOnMine = cleanFlags(data.s, n());
          updateReview();
        }
        break;
      case 'confirm':
        if (S.phase === 'review' && data && data.r === S.round && !R.theyConfirmed) {
          R.struckOnMine = cleanFlags(data.s, n());
          R.theyConfirmed = true;
          updateReview();
          maybeFinalize();
        }
        break;
      case 'next':
        if (S.phase === 'roundDone' && data && data.r === S.round) {
          R.nextThem = true;
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
