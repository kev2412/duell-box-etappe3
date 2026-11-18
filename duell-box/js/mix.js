// mix.js – reine Logik des 4er-Mix-Turniers (ohne DOM, per Node testbar).
// Ein Mix-Zustand ist { index, results }: `index` = aktuelles Spiel in MIX_ORDER,
// `results[i]` = 'host' | 'guest' | 'tie' für bereits beendete Spiele.

export const MIX_ORDER = ['slf', 'schaetzen', 'sprint', 'wwm'];
const RESULT_VALUES = ['host', 'guest', 'tie'];

export function newMix() {
  return { index: 0, results: [] };
}

export const hasResult = (mix, i = mix.index) => RESULT_VALUES.includes(mix.results[i]);

/** Ergebnis des aktuellen Spiels festhalten. Der erste Eintrag gilt (idempotent). winnerRole null = Unentschieden. */
export function recordResult(mix, winnerRole, index = mix.index) {
  if (!Number.isInteger(index) || index < 0 || index >= MIX_ORDER.length || hasResult(mix, index)) return false;
  mix.results[index] = winnerRole === 'host' || winnerRole === 'guest' ? winnerRole : 'tie';
  return true;
}

/** Alle vier Spiele beendet? */
export const isComplete = (mix) => MIX_ORDER.every((_, i) => hasResult(mix, i));

/** Nächstes Spiel (Index) oder null, wenn das aktuelle noch läuft bzw. der Mix komplett ist. */
export function nextIndex(mix) {
  if (!hasResult(mix) || mix.index >= MIX_ORDER.length - 1) return null;
  return mix.index + 1;
}

export function advance(mix) {
  const next = nextIndex(mix);
  if (next === null) return null;
  mix.index = next;
  return next;
}

/** Gewonnene Spiele je Rolle (= Sterne dieses Mix). */
export function mixWins(mix) {
  const wins = { host: 0, guest: 0, ties: 0 };
  for (let i = 0; i < MIX_ORDER.length; i++) {
    const r = mix.results[i];
    if (r === 'host') wins.host += 1;
    else if (r === 'guest') wins.guest += 1;
    else if (r === 'tie') wins.ties += 1;
  }
  return wins;
}

/** Gesamtsieger nach gewonnenen Spielen; null bei Gleichstand oder solange nicht komplett. */
export function mixWinner(mix) {
  if (!isComplete(mix)) return null;
  const { host, guest } = mixWins(mix);
  if (host === guest) return null;
  return host > guest ? 'host' : 'guest';
}

/** Eingehendes `start.mix` prüfen: gültiger Index, passend zum Spiel -> Index, sonst null. */
export function validStart(gameId, mixIndex) {
  return Number.isInteger(mixIndex) && mixIndex >= 0 && mixIndex < MIX_ORDER.length && MIX_ORDER[mixIndex] === gameId
    ? mixIndex : null;
}

/** Eingehende Ergebnisliste bereinigen: Array aus gültigen Werten (Lücken = null) mit höchstens 4 Einträgen. */
export function cleanResults(value) {
  const list = Array.isArray(value) ? value.slice(0, MIX_ORDER.length) : [];
  return Array.from({ length: MIX_ORDER.length }, (_, i) => (RESULT_VALUES.includes(list[i]) ? list[i] : null));
}
