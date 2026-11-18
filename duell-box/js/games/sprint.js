// games/sprint.js – Spiel 4: 5-Sekunden-Sprint (1 gegen 1, mündlich).
// Schnittstelle: init(ctx) -> { onMessage(type, data), destroy() }.
// Das Modul kennt PeerJS nicht; es sendet/empfängt nur über ctx.send / onMessage.
//
// Ablauf: 10 Aufgaben im Wechsel (Host beginnt). Der Host steuert den Ablauf:
//   prep {r}  -> 3 s „Mach dich bereit“ auf beiden Geräten
//   go {r}    -> Aufgabe + 7-s-Countdown erscheinen gleichzeitig
//   verdict {r, ok}  (Gast als Schiedsrichter -> Host)  /  result {r, ok}  (Host -> Gast)
//   end       -> Ergebnis. Der Gesamtsieger erhält 1 Stern (ctx.finish), bei Gleichstand keiner.
// Die Zeit läuft nur zur Anzeige; es gibt kein automatisches Urteil, das Urteil trifft der Mitspieler.

import { SPRINT_AUFGABEN } from '../data.js';
import * as sound from '../sound.js';

export const TASKS_PER_PLAYER = 5;
export const TASKS = TASKS_PER_PLAYER * 2;
export const PREP_SECONDS = 3;
export const TASK_SECONDS = 7;
export const RESULT_MS = 1600;

/* ------------------------------------------------------------------ */
/* Reine Logik (ohne DOM, per Node testbar)                            */
/* ------------------------------------------------------------------ */

/** Wer ist in Runde r (0-basiert) dran? Der Host beginnt, dann im Wechsel. */
export function activeRole(r) {
  return r % 2 === 0 ? 'host' : 'guest';
}

export function judgeRole(r) {
  return activeRole(r) === 'host' ? 'guest' : 'host';
}

/** Punkte je Rolle aus den Ergebnissen [{ok}] (Index = Runde). Nur der aktive Spieler punktet. */
export function tally(results) {
  const totals = { host: 0, guest: 0 };
  results.forEach((res, r) => {
    if (res && res.ok === true) totals[activeRole(r)] += 1;
  });
  return totals;
}

/** Gewinner-Rolle oder null bei Gleichstand. */
export function winnerOf(totals) {
  if (totals.host === totals.guest) return null;
  return totals.host > totals.guest ? 'host' : 'guest';
}

/** n verschiedene Aufgaben-IDs (Fisher-Yates). */
export function pickTasks(n = TASKS, rng = Math.random, pool = SPRINT_AUFGABEN) {
  const ids = pool.map((t) => t.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, n);
}

/** Setup vom Host prüfen: genau TASKS verschiedene, bekannte IDs -> Aufgabenobjekte, sonst null. */
export function validSetup(data, pool = SPRINT_AUFGABEN) {
  if (!data || !Array.isArray(data.ids) || data.ids.length !== TASKS) return null;
  if (new Set(data.ids).size !== TASKS) return null;
  const list = data.ids.map((id) => pool.find((t) => t.id === id));
  return list.every(Boolean) ? list : null;
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
    phase: 'setup',               // setup | wait | prep | play | result | final
    tasks: [],
    round: 0,
    results: [],                  // [{ ok }] je beendeter Runde
    finished: false,
    countdown: 0,                 // setInterval (Countdown)
    delay: 0,                     // setTimeout (Host: Vorbereitung / Ergebnis-Pause)
  };
  let R = null;                   // Zustand der aktuellen Runde
  let ui = {};

  const mount = (node) => {
    root.replaceChildren(node);
    if (ctx.audible()) window.scrollTo({ top: 0 });
  };
  const screen = () => el('div', 'sp');
  const imActive = () => activeRole(S.round) === ctx.role;
  const whoName = (role) => (role === ctx.role ? ctx.me : opp);
  const scoreOf = () => {
    const t = tally(S.results);
    const other = ctx.role === 'host' ? 'guest' : 'host';
    return { mine: t[ctx.role], theirs: t[other] };
  };

  function clearTimers() {
    clearInterval(S.countdown);
    clearTimeout(S.delay);
    S.countdown = 0;
    S.delay = 0;
  }

  /* ----- Setup ----- */

  function renderSetup() {
    S.phase = 'setup';
    const box = screen();
    box.append(el('h2', 'title', '5-Sekunden-Sprint'));
    if (ctx.isHost) {
      box.append(el('p', 'sub', `${TASKS} Aufgaben im Wechsel, je ${TASK_SECONDS} Sekunden. Antworte laut – der Mitspieler urteilt.`));
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
    const ids = pickTasks(TASKS);
    ctx.send('setup', { ids });
    startMatch(validSetup({ ids }));
    hostPrep(0);
  }

  function startMatch(list) {
    S.tasks = list;
    S.round = 0;
    S.results = [];
    ctx.setRoundActive(true);
    S.phase = 'wait';
    if (!ctx.isHost) {
      const box = screen();
      box.append(el('p', 'waiting', 'Gleich geht’s los …'));
      mount(box);
    }
  }

  /* ----- Vorbereitung (3 s) ----- */

  function hostPrep(r) {
    ctx.send('prep', { r });
    enterPrep(r);
    S.delay = setTimeout(() => hostGo(r), PREP_SECONDS * 1000);
  }

  function enterPrep(r) {
    S.round = r;
    S.phase = 'prep';
    R = { decided: false, ok: null, stopped: false };
    const active = activeRole(r);
    const box = screen();
    box.append(el('span', 'pill', `Aufgabe ${r + 1}/${TASKS}`));
    const stage = el('div', 'sp-stage');
    stage.append(
      el('p', 'sp-who', imActive() ? 'Du bist dran' : `${whoName(active)} ist dran`),
      el('p', 'sp-ready', 'Mach dich bereit …'),
    );
    const sum = el('div', 'sum');
    const s = scoreOf();
    sum.append(...sumCells(s.mine, s.theirs));
    box.append(stage, sum);
    mount(box);
  }

  /* ----- Aufgabe (7 s) ----- */

  function hostGo(r) {
    if (S.destroyed || S.phase !== 'prep' || S.round !== r) return;
    ctx.send('go', { r });
    enterPlay();
  }

  function enterPlay() {
    S.phase = 'play';
    const task = S.tasks[S.round];
    const active = activeRole(S.round);
    const active_me = imActive();

    const box = screen();
    const head = el('div', 'sp-head');
    const s = scoreOf();
    head.append(el('span', 'pill', `Aufgabe ${S.round + 1}/${TASKS}`), el('span', 'pill score', `Du ${s.mine} : ${s.theirs}`));

    const stage = el('div', 'sp-stage');
    stage.append(el('p', 'sp-who', active_me ? 'Du bist dran – antworte laut!' : `${whoName(active)} antwortet – du urteilst`));
    const taskCard = el('div', 'card sp-task');
    taskCard.append(el('p', '', task.text));
    const timer = el('div', 'sp-timer');
    timer.setAttribute('role', 'timer');
    const big = el('b', 'sp-big', String(TASK_SECONDS));
    const bar = el('div', 'countdown-bar');
    const fill = el('i');
    fill.style.setProperty('--cd', `${TASK_SECONDS}s`);
    bar.append(fill);
    timer.append(big, bar);
    stage.append(taskCard, timer);

    const actions = el('div', 'sp-actions');
    const status = el('p', 'waiting');
    status.setAttribute('aria-live', 'polite');
    if (active_me) {
      status.textContent = `${opp} bewertet deine Antwort.`;
      box.append(head, stage, status);
    } else {
      const ok = el('button', 'btn btn-success', 'Geschafft');
      ok.type = 'button';
      ok.addEventListener('click', () => judge(true));
      const fail = el('button', 'btn btn-danger', 'Zu langsam / Falsch');
      fail.type = 'button';
      fail.addEventListener('click', () => judge(false));
      actions.append(ok, fail);
      box.append(head, stage, actions);
    }
    ui = { big, fill, status, actions, stage, box };
    mount(box);
    startCountdown();
  }

  function startCountdown() {
    const deadline = Date.now() + TASK_SECONDS * 1000;
    let lastShown = -1;
    const tick = () => {
      if (S.phase !== 'play' || R.stopped) return;
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      if (remaining !== lastShown) {
        lastShown = remaining;
        ui.big.textContent = String(remaining);
        ui.big.classList.toggle('urgent', remaining <= 3);
        if (remaining > 0 && ctx.audible()) sound.tick(remaining <= 3);
        if (remaining === 0) onTimeUp();
      }
    };
    S.countdown = setInterval(tick, 200);
  }

  function onTimeUp() {
    if (ctx.audible()) sound.stop();
    if (imActive()) ui.status.textContent = `Zeit ist um – ${opp} entscheidet.`;
    else ui.status.textContent = 'Zeit ist um – bewerte jetzt die Antwort.';
    if (!imActive() && !ui.actions.contains(ui.status)) ui.actions.before(ui.status);
  }

  function stopCountdown() {
    R.stopped = true;
    clearInterval(S.countdown);
    S.countdown = 0;
    if (ui.fill) ui.fill.style.animationPlayState = 'paused';
  }

  /* ----- Urteil ----- */

  /** Schiedsrichter: Urteil abgeben. Der Host entscheidet und verteilt `result`. */
  function judge(ok) {
    if (S.phase !== 'play' || R.decided || imActive()) return;
    ui.actions.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    if (ctx.isHost) {
      hostDecide(ok);
    } else {
      stopCountdown();
      ctx.send('verdict', { r: S.round, ok });
    }
  }

  function hostDecide(ok) {
    if (S.phase !== 'play' || R.decided) return;
    ctx.send('result', { r: S.round, ok });
    enterResult(ok);
    S.delay = setTimeout(hostNext, RESULT_MS);
  }

  function hostNext() {
    if (S.destroyed || S.phase !== 'result') return;
    if (S.round >= TASKS - 1) {
      ctx.send('end');
      enterFinal();
    } else {
      hostPrep(S.round + 1);
    }
  }

  function enterResult(ok) {
    R.decided = true;
    R.ok = ok;
    stopCountdown();
    S.phase = 'result';
    S.results[S.round] = { ok };
    if (ctx.audible()) { if (ok) sound.login(); else sound.stop(); }

    const active = activeRole(S.round);
    const box = screen();
    const s = scoreOf();
    box.append(el('span', 'pill', `Aufgabe ${S.round + 1}/${TASKS}`));
    const flash = el('div', `sp-result ${ok ? 'ok' : 'fail'}`);
    flash.setAttribute('role', 'status');
    flash.append(
      el('b', '', ok ? 'Geschafft!' : 'Zu langsam / Falsch'),
      el('span', '', ok ? `+1 für ${whoName(active)}` : `0 Punkte für ${whoName(active)}`),
    );
    const sum = el('div', 'sum');
    sum.append(...sumCells(s.mine, s.theirs));
    box.append(flash, sum);
    mount(box);
  }

  function sumCells(mine, theirs) {
    const a = el('div');
    a.append(el('b', '', String(mine)), el('span', '', 'Du'));
    const b = el('div');
    b.append(el('b', '', String(theirs)), el('span', '', opp));
    return [a, b];
  }

  /* ----- Ende ----- */

  function enterFinal() {
    clearTimers();
    S.phase = 'final';
    ctx.setRoundActive(false);
    const totals = scoreOf();
    const winnerRole = winnerOf(tally(S.results));
    const iWon = winnerRole === ctx.role;

    const box = screen();
    box.classList.add('final');
    box.append(el('div', 'trophy', winnerRole ? '🏆' : '🤝'));
    box.append(el('h2', '', winnerRole ? `${iWon ? ctx.me : opp} gewinnt!` : 'Unentschieden'));
    const sum = el('div', 'sum');
    sum.append(...sumCells(totals.mine, totals.theirs));
    box.append(sum);
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

  const validRound = (data, expected) => data && Number.isInteger(data.r) && data.r === expected;

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
      case 'prep':
        if (!ctx.isHost && (S.phase === 'wait' || S.phase === 'result') && validRound(data, S.results.length)) {
          enterPrep(data.r);
        }
        break;
      case 'go':
        if (!ctx.isHost && S.phase === 'prep' && validRound(data, S.round)) enterPlay();
        break;
      case 'verdict':   // nur der Host nimmt Urteile an, und nur vom Schiedsrichter (= Gast, wenn der Host dran ist)
        if (ctx.isHost && S.phase === 'play' && !R.decided && validRound(data, S.round)
            && judgeRole(S.round) === 'guest' && typeof data.ok === 'boolean') {
          hostDecide(data.ok);
        }
        break;
      case 'result':
        if (!ctx.isHost && S.phase === 'play' && !R.decided && validRound(data, S.round) && typeof data.ok === 'boolean') {
          enterResult(data.ok);
        }
        break;
      case 'end':
        if (!ctx.isHost && S.phase === 'result' && S.results.length === TASKS) enterFinal();
        break;
      default:
        break;
    }
  }

  function destroy() {
    S.destroyed = true;
    clearTimers();
    root.replaceChildren();
  }

  renderSetup();
  return { onMessage, destroy };
}
