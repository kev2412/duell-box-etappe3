// games/wwm.js – Spiel 2: Wer wird Millionär? (Punkte-Duell, 1 gegen 1).
// Schnittstelle: init(ctx) -> { onMessage(type, data), destroy() }.
// Das Modul kennt PeerJS nicht; es sendet/empfängt nur über ctx.send / onMessage.
//
// Ablauf: 10 Fragen (je eine pro Stufe 1–10, aufsteigend), 15 s je Frage. Beide loggen ihre Antwort
// verdeckt ein; aufgedeckt wird erst, wenn beide eingeloggt haben oder die Zeit abläuft. Kein Ausscheiden.
// Nach 10 Fragen erhält der Gesamtsieger 1 Stern (ctx.finish), bei Gleichstand keiner.
//
// Verdeckt heißt: Über die Leitung geht zuerst nur `lock` (ohne Antwort). Antwort, Restsekunden und
// Joker folgen in `guess`, sobald beide eingeloggt haben oder die eigene Zeit um ist.

import { QUIZ_FRAGEN } from '../data.js';
import * as sound from '../sound.js';

export const LEVELS = 10;
export const SECONDS = 15;
export const EXTRA_SECONDS = 15;
export const BASE_PER_LEVEL = 100;     // Basispunkte = Stufe × 100 (100 … 1.000)
export const BONUS_PER_SECOND = 2;     // Zeitbonus = Restsekunden × Stufe × 2 (höchstens 30 % der Basis)
export const JOKERS = ['fifty', 'time', 'double'];
const LETTERS = ['A', 'B', 'C', 'D'];

/* ------------------------------------------------------------------ */
/* Reine Logik (ohne DOM, per Node testbar)                            */
/* ------------------------------------------------------------------ */

export const basePoints = (level) => level * BASE_PER_LEVEL;

/** Restsekunden -> ganze Zahl 0…SECONDS (der +15-s-Joker bringt keinen zusätzlichen Bonus). */
export function cleanSeconds(value) {
  return Number.isFinite(value) ? Math.max(0, Math.min(SECONDS, Math.floor(value))) : 0;
}

export const timeBonus = (level, seconds) => cleanSeconds(seconds) * level * BONUS_PER_SECOND;

/** Eingehende Antwort ist unvertrauenswürdig: 0–3 oder null (keine Antwort). */
export function cleanAnswer(value) {
  return Number.isInteger(value) && value >= 0 && value <= 3 ? value : null;
}

export function cleanJokerFlags(value) {
  const src = value && typeof value === 'object' ? value : {};
  return { fifty: src.fifty === true, time: src.time === true, double: src.double === true };
}

/** Eintrag { a, t, j } -> { correct, base, bonus, doubled, total }. Falsch/keine Antwort = 0. */
export function scoreEntry(entry, question) {
  const a = cleanAnswer(entry && entry.a);
  if (a === null || a !== question.richtig) return { correct: false, base: 0, bonus: 0, doubled: false, total: 0 };
  const base = basePoints(question.level);
  const bonus = timeBonus(question.level, entry.t);
  const doubled = cleanJokerFlags(entry.j).double;
  return { correct: true, base, bonus, doubled, total: (base + bonus) * (doubled ? 2 : 1) };
}

/** Joker 50:50: genau zwei verschiedene falsche Antwortindizes (nie die richtige). */
export function fiftyFifty(correct, rng = Math.random) {
  const wrong = [0, 1, 2, 3].filter((i) => i !== correct);
  for (let i = wrong.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [wrong[i], wrong[j]] = [wrong[j], wrong[i]];
  }
  return wrong.slice(0, 2).sort((x, y) => x - y);
}

/** Joker-Verwaltung: jeder Joker einmal pro Match. */
export const newJokers = () => ({ fifty: false, time: false, double: false });
export function useJoker(used, name) {
  if (!JOKERS.includes(name) || used[name]) return false;
  used[name] = true;
  return true;
}

/** Zeitjoker: neue Deadline (ms) = alte + 15 s. */
export const extendDeadline = (deadline) => deadline + EXTRA_SECONDS * 1000;

/** Eine zufällige Frage je Stufe 1…10 -> 10 IDs in aufsteigender Stufe. */
export function pickQuiz(rng = Math.random, pool = QUIZ_FRAGEN) {
  const ids = [];
  for (let level = 1; level <= LEVELS; level++) {
    const candidates = pool.filter((q) => q.level === level);
    if (!candidates.length) return null;
    ids.push(candidates[Math.floor(rng() * candidates.length)].id);
  }
  return ids;
}

/** Setup vom Host prüfen: 10 verschiedene IDs, Position i hat Stufe i+1 -> Fragenobjekte, sonst null. */
export function validSetup(data, pool = QUIZ_FRAGEN) {
  if (!data || !Array.isArray(data.ids) || data.ids.length !== LEVELS) return null;
  if (new Set(data.ids).size !== LEVELS) return null;
  const list = data.ids.map((id) => pool.find((q) => q.id === id));
  return list.every((q, i) => q && q.level === i + 1) ? list : null;
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

const JOKER_LABEL = { fifty: '50:50', time: '+15 s', double: '×2' };
const JOKER_NAME = { fifty: '50:50', time: '+15 Sekunden', double: 'Doppelte Punkte' };

export function init(ctx) {
  const root = ctx.container;
  const opp = ctx.opponent;
  const S = {
    destroyed: false,
    phase: 'setup',               // setup | input | reveal | final
    questions: [],
    index: 0,
    totals: { mine: 0, theirs: 0 },
    history: [],                  // { pm, pt } je Frage
    jokers: newJokers(),          // matchweit verbrauchte Joker (nur eigene)
    finished: false,
    timer: 0,
  };
  let Q = null;                   // Zustand der aktuellen Frage
  let ui = {};

  const mount = (node) => {
    root.replaceChildren(node);
    if (ctx.audible()) window.scrollTo({ top: 0 });
  };
  const screen = () => el('div', 'wq');
  const current = () => S.questions[S.index];

  function newQuestion() {
    Q = {
      selected: null,
      hidden: [],                                 // per 50:50 ausgeblendete Optionen
      used: { fifty: false, time: false, double: false },   // Joker dieser Frage
      mineLocked: false, mine: null,              // { a, t, j }
      theirLocked: false, theirs: undefined,      // undefined = noch nicht erhalten
      timeUp: false, sent: false,
      deadline: 0, barAnim: null,
      nextMe: false, nextThem: false,
    };
  }

  /* ----- Setup ----- */

  function renderSetup() {
    S.phase = 'setup';
    const box = screen();
    box.append(el('h2', 'title', 'Wer wird Millionär?'));
    if (ctx.isHost) {
      box.append(el('p', 'sub', `${LEVELS} Fragen, immer schwerer. ${SECONDS} Sekunden pro Frage, 3 Joker. Die meisten Punkte gewinnen.`));
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
    const ids = pickQuiz();
    if (!ids) return;
    ctx.send('setup', { ids });
    startMatch(validSetup({ ids }));
  }

  function startMatch(list) {
    S.questions = list;
    S.index = 0;
    S.totals = { mine: 0, theirs: 0 };
    S.history = [];
    S.jokers = newJokers();
    enterInput();
  }

  /* ----- Eingabe ----- */

  function enterInput() {
    S.phase = 'input';
    newQuestion();
    ctx.setRoundActive(true);
    const q = current();

    const box = screen();
    const head = el('div', 'wq-head');
    const stage = el('span', 'pill', `Stufe ${q.level}/${LEVELS}`);
    const worth = el('span', 'pill score', `${basePoints(q.level)} Punkte`);
    head.append(stage, worth);

    const score = el('p', 'wq-score', `Du ${S.totals.mine} : ${S.totals.theirs} ${opp}`);

    const card = el('div', 'card wq-question');
    card.append(el('p', 'wq-text', q.frage));

    const timer = el('div', 'wq-timer');
    timer.setAttribute('role', 'timer');
    const secs = el('b', 'wq-secs', String(SECONDS));
    const bar = el('div', 'countdown-bar');
    const fill = el('i');
    fill.style.animation = 'none';             // Balken läuft per Web Animations API (Joker verlängert die Zeit)
    bar.append(fill);
    timer.append(secs, bar);

    const opts = el('div', 'wq-opts');
    opts.setAttribute('role', 'group');
    opts.setAttribute('aria-label', 'Antwortmöglichkeiten');
    const buttons = q.optionen.map((text, i) => {
      const btn = el('button', 'wq-opt');
      btn.type = 'button';
      btn.setAttribute('aria-pressed', 'false');
      btn.append(el('span', 'wq-letter', LETTERS[i]), el('span', 'wq-opt-text', text));
      btn.addEventListener('click', () => select(i));
      opts.append(btn);
      return btn;
    });

    const jokerRow = el('div', 'wq-jokers');
    jokerRow.setAttribute('role', 'group');
    jokerRow.setAttribute('aria-label', 'Joker');
    const jokerBtns = {};
    for (const name of JOKERS) {
      const btn = el('button', 'wq-joker', JOKER_LABEL[name]);
      btn.type = 'button';
      btn.setAttribute('aria-label', `Joker ${JOKER_NAME[name]}`);
      btn.addEventListener('click', () => playJoker(name));
      jokerRow.append(btn);
      jokerBtns[name] = btn;
    }

    const lockBtn = el('button', 'btn btn-primary', 'Einloggen');
    lockBtn.type = 'button';
    lockBtn.disabled = true;
    lockBtn.addEventListener('click', () => lock());

    const status = el('p', 'waiting');
    status.setAttribute('aria-live', 'polite');
    status.textContent = `${opp} überlegt noch …`;

    box.append(head, score, card, timer, opts, jokerRow, lockBtn, status);
    ui = { buttons, jokerBtns, lockBtn, status, secs, fill, timer };
    refreshJokers();
    mount(box);
    startTimer();
  }

  function select(i) {
    if (S.phase !== 'input' || Q.mineLocked || Q.hidden.includes(i)) return;
    Q.selected = i;
    ui.buttons.forEach((btn, k) => {
      btn.classList.toggle('selected', k === i);
      btn.setAttribute('aria-pressed', String(k === i));
    });
    ui.lockBtn.disabled = false;
  }

  /* ----- Joker ----- */

  function refreshJokers() {
    for (const name of JOKERS) {
      const btn = ui.jokerBtns[name];
      const spent = S.jokers[name];
      btn.disabled = spent || Q.mineLocked || Q.timeUp;
      btn.classList.toggle('spent', spent && !Q.used[name]);
      btn.classList.toggle('active', Q.used[name]);
      btn.setAttribute('aria-pressed', String(Q.used[name]));
    }
  }

  function playJoker(name) {
    if (S.phase !== 'input' || Q.mineLocked || Q.timeUp) return;
    if (!useJoker(S.jokers, name)) return;
    Q.used[name] = true;
    if (name === 'fifty') {
      Q.hidden = fiftyFifty(current().richtig);
      Q.hidden.forEach((i) => {
        ui.buttons[i].disabled = true;
        ui.buttons[i].classList.add('gone');
        ui.buttons[i].classList.remove('selected');
        ui.buttons[i].setAttribute('aria-pressed', 'false');
      });
      if (Q.selected !== null && Q.hidden.includes(Q.selected)) {
        Q.selected = null;
        ui.lockBtn.disabled = true;
      }
    } else if (name === 'time') {
      const remaining = Math.max(0, Q.deadline - Date.now());
      Q.deadline = extendDeadline(Q.deadline);
      animateBar(remaining + EXTRA_SECONDS * 1000, (remaining + EXTRA_SECONDS * 1000) / ((SECONDS + EXTRA_SECONDS) * 1000));
      tickNow();
    }
    refreshJokers();
  }

  /* ----- Timer ----- */

  function animateBar(durationMs, fromScale) {
    if (Q.barAnim) Q.barAnim.cancel();
    if (!ui.fill.animate) return;
    ui.fill.style.transform = 'scaleX(0)';
    Q.barAnim = ui.fill.animate(
      [{ transform: `scaleX(${fromScale})` }, { transform: 'scaleX(0)' }],
      { duration: durationMs, easing: 'linear', fill: 'forwards' },
    );
  }

  const secondsLeft = () => Math.max(0, Math.ceil((Q.deadline - Date.now()) / 1000));
  let lastShown = -1;

  function tickNow() {
    if (S.phase !== 'input') return;
    const remaining = secondsLeft();
    if (remaining !== lastShown) {
      lastShown = remaining;
      ui.secs.textContent = String(remaining);
      ui.timer.classList.toggle('urgent', remaining <= 5);
      if (remaining > 0 && remaining <= 5 && !Q.mineLocked && ctx.audible()) sound.tick(remaining <= 3);
    }
    if (remaining <= 0) onTimeUp();
  }

  function startTimer() {
    Q.deadline = Date.now() + SECONDS * 1000;
    lastShown = -1;
    animateBar(SECONDS * 1000, 1);
    S.timer = setInterval(tickNow, 200);
  }

  function clearTimer() {
    clearInterval(S.timer);
    S.timer = 0;
  }

  /* ----- Einloggen ----- */

  /** Eigene Antwort festschreiben (nur einmal). Ohne Markierung/Einloggen vor Ablauf = keine Antwort. */
  function lock(auto = false) {
    if (S.phase !== 'input' || Q.mineLocked) return;
    const answered = !auto && Q.selected !== null;
    Q.mineLocked = true;
    Q.mine = {
      a: answered ? Q.selected : null,
      t: answered ? cleanSeconds(secondsLeft()) : 0,
      j: { fifty: Q.used.fifty, time: Q.used.time, double: Q.used.double },
    };
    if (Q.barAnim) Q.barAnim.pause();
    ui.buttons.forEach((btn) => { btn.disabled = true; });
    ui.lockBtn.disabled = true;
    ui.lockBtn.textContent = answered ? 'Eingeloggt ✓' : 'Keine Antwort';
    refreshJokers();
    if (answered && ctx.audible()) sound.login();
    ctx.send('lock', { i: S.index });
    ui.status.textContent = Q.theirLocked ? 'Beide haben eingeloggt …' : `Eingeloggt – warte auf ${opp} …`;
    trySendGuess();
  }

  function onTimeUp() {
    if (S.phase !== 'input' || Q.timeUp) return;
    Q.timeUp = true;
    clearTimer();
    if (ctx.audible() && !Q.mineLocked) sound.stop();
    lock(true);
    trySendGuess();
  }

  /** Antwort erst freigeben, wenn beide eingeloggt haben oder die eigene Zeit abgelaufen ist. */
  function trySendGuess() {
    if (Q.sent || !Q.mineLocked || !(Q.theirLocked || Q.timeUp)) return;
    Q.sent = true;
    clearTimer();
    ctx.send('guess', { i: S.index, a: Q.mine.a, t: Q.mine.t, j: Q.mine.j });
    maybeReveal();
  }

  function maybeReveal() {
    if (S.phase === 'input' && Q.sent && Q.theirs !== undefined) enterReveal();
  }

  /* ----- Aufdecken ----- */

  function enterReveal() {
    S.phase = 'reveal';
    clearTimer();
    if (Q.barAnim) Q.barAnim.cancel();
    ctx.setRoundActive(false);
    const q = current();
    const mine = scoreEntry(Q.mine, q);
    const theirs = scoreEntry(Q.theirs, q);
    S.totals.mine += mine.total;
    S.totals.theirs += theirs.total;
    S.history.push({ pm: mine.total, pt: theirs.total });

    const box = screen();
    box.append(el('h2', 'title', `Stufe ${q.level} · Auflösung`));
    box.append(el('p', 'wq-text wq-small', q.frage));

    const list = el('div', 'wq-opts wq-reveal');
    q.optionen.forEach((text, i) => {
      const row = el('div', 'wq-opt');
      if (i === q.richtig) row.classList.add('correct');
      else if (i === Q.mine.a || i === Q.theirs.a) row.classList.add('wrong');
      row.append(el('span', 'wq-letter', LETTERS[i]), el('span', 'wq-opt-text', text));
      const tags = el('span', 'wq-tags');
      if (i === Q.mine.a) tags.append(el('em', 'wq-tag me', 'Du'));
      if (i === Q.theirs.a) tags.append(el('em', 'wq-tag', opp));
      row.append(tags);
      list.append(row);
    });
    box.append(list);

    const cards = el('div', 'wq-cards');
    cards.append(resultCard('Du', Q.mine, mine, q), resultCard(opp, Q.theirs, theirs, q));
    box.append(cards);

    const total = el('div', 'sum');
    total.append(...sumCells(S.totals.mine, S.totals.theirs, 'Gesamt'));
    box.append(total);

    const last = S.index >= LEVELS - 1;
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
    if (ctx.audible() && mine.total > theirs.total) sound.login();
  }

  function resultCard(name, entry, result, q) {
    const card = el('div', 'card wq-res');
    card.classList.toggle('won', result.total > 0);
    card.append(el('span', 'sz-label', name));
    const answer = cleanAnswer(entry.a);
    card.append(el('b', '', result.total > 0 ? `+${result.total}` : '+0'));
    let detail;
    if (answer === null) detail = 'keine Antwort';
    else if (!result.correct) detail = `falsch (${LETTERS[answer]})`;
    else detail = `${result.base} + ${result.bonus} Zeitbonus${result.doubled ? ' · ×2' : ''}`;
    card.append(el('span', 'sz-diff', detail));
    const used = JOKERS.filter((j) => cleanJokerFlags(entry.j)[j]).map((j) => JOKER_LABEL[j]);
    card.append(el('span', 'wq-used', used.length ? `Joker: ${used.join(', ')}` : 'ohne Joker'));
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
    if (S.index >= LEVELS - 1) { enterFinal(); return; }
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
    total.append(...sumCells(mine, theirs, 'Punkte'));
    box.append(total);

    const list = el('div', 'rev-list');
    S.history.forEach((h, i) => {
      list.append(el('p', 'hint', `Stufe ${i + 1}: Du ${h.pm} · ${opp} ${h.pt}`));
    });
    box.append(list);
    box.append(el('p', 'sub', winnerRole ? `★ 1 Stern für ${iWon ? ctx.me : opp}` : 'Kein Stern bei Unentschieden'));

    const back = el('button', 'btn btn-primary', 'Weiter');
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
          ui.status.textContent = Q.mineLocked ? 'Beide haben eingeloggt …' : `${opp} hat eingeloggt ✓`;
          trySendGuess();
        }
        break;
      case 'guess':
        if (S.phase === 'input' && data && data.i === S.index && Q.theirs === undefined) {
          Q.theirLocked = true;
          Q.theirs = { a: cleanAnswer(data.a), t: cleanSeconds(data.t), j: cleanJokerFlags(data.j) };
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
    if (Q && Q.barAnim) Q.barAnim.cancel();
    root.replaceChildren();
  }

  renderSetup();
  return { onMessage, destroy };
}
