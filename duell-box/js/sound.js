// sound.js – Web Audio API: Timer-Ticken, Einloggen, Stopp-Signal, Gewinn-Fanfare.
// iOS Safari startet Audio erst nach einer Nutzergeste: Entsperrung bei pointerdown/pointerup.

const MUTE_KEY = 'duellbox.muted';

let audioCtx = null;
let unlocked = false;
let muted = readMuted();

function readMuted() {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}

function getCtx() {
  if (audioCtx) return audioCtx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  audioCtx = new AC();
  return audioCtx;
}

/** Muss innerhalb einer Nutzergeste laufen (pointerdown/pointerup). */
export function unlock() {
  const c = getCtx();
  if (!c) return;
  if (c.state !== 'running') c.resume().catch(() => {});
  if (!unlocked) {
    // Stiller 1-Sample-Puffer: schaltet iOS-Audio zuverlässig frei.
    const buf = c.createBuffer(1, 1, 22050);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(c.destination);
    src.start(0);
    unlocked = true;
  }
}

export function initSound() {
  document.addEventListener('pointerdown', unlock, { passive: true });
  document.addEventListener('pointerup', unlock, { passive: true });
}

export function isMuted() { return muted; }

export function setMuted(value) {
  muted = Boolean(value);
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* Speicher gesperrt: egal */ }
}

function tone(freq, delay, duration, { type = 'sine', gain = 0.16 } = {}) {
  if (muted) return;
  const c = getCtx();
  if (!c || c.state !== 'running') return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const amp = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(amp).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

/** Timer-Ticken; urgent = höher und lauter für die letzten Sekunden. */
export function tick(urgent = false) {
  tone(urgent ? 1320 : 880, 0, 0.07, { type: 'square', gain: urgent ? 0.09 : 0.05 });
}

/** Mitspieler ist beigetreten. */
export function login() {
  tone(660, 0, 0.14, { type: 'triangle' });
  tone(990, 0.12, 0.2, { type: 'triangle' });
}

/** Stopp-Signal (Gegner hat „Stopp!“ gedrückt bzw. eigener Stopp). */
export function stop() {
  tone(220, 0, 0.35, { type: 'sawtooth', gain: 0.12 });
  tone(165, 0.05, 0.4, { type: 'sawtooth', gain: 0.1 });
}

/** Gewinn-Fanfare. */
export function win() {
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((f, i) => tone(f, i * 0.13, 0.28, { type: 'triangle', gain: 0.17 }));
  tone(1046.5, notes.length * 0.13, 0.7, { type: 'triangle', gain: 0.17 });
  tone(783.99, notes.length * 0.13, 0.7, { type: 'sine', gain: 0.1 });
}
