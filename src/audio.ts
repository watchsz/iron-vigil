// Sons synthétisés en Web Audio (aucun fichier). Démarre au premier geste de l'utilisateur.
import type { TowerKind } from './data/content';

let ctx: AudioContext | null = null;
let master: GainNode;
let noise: AudioBuffer;
let muted = false;

function init() {
  if (ctx) return;
  ctx = new AudioContext();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.4;
  master.connect(ctx.destination);
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  drone();
}
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, init, { once: true });

export function toggleMute() {
  muted = !muted;
  if (ctx) master.gain.value = muted ? 0 : 0.4;
  return muted;
}

/** Enveloppe percussive : attaque immédiate, décroissance exponentielle. */
function env(gain: number, decay: number, at = 0) {
  const g = ctx!.createGain(), t = ctx!.currentTime + at;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + decay);
  g.connect(master);
  return g;
}
function tone(type: OscillatorType, f0: number, f1: number, gain: number, decay: number, at = 0) {
  const o = ctx!.createOscillator(), t = ctx!.currentTime + at;
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + decay);
  o.connect(env(gain, decay, at));
  o.start(t); o.stop(t + decay);
}
function hiss(filter: BiquadFilterType, freq: number, gain: number, decay: number, at = 0) {
  const s = ctx!.createBufferSource(), f = ctx!.createBiquadFilter(), t = ctx!.currentTime + at;
  s.buffer = noise; f.type = filter; f.frequency.value = freq;
  s.connect(f).connect(env(gain, decay, at));
  s.start(t, Math.random() * 0.5); s.stop(t + decay);
}

function drone() {
  const g = ctx!.createGain(); g.gain.value = 0.12; g.connect(master);
  for (const f of [43.65, 65.4, 87.3]) { // fa grave, quinte : bourdon sinistre
    const o = ctx!.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    const lp = ctx!.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180;
    o.connect(lp).connect(g); o.start();
  }
  const wind = ctx!.createBufferSource(); wind.buffer = noise; wind.loop = true;
  const bp = ctx!.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 400; bp.Q.value = 0.7;
  const lfo = ctx!.createOscillator(); lfo.frequency.value = 0.07;
  const depth = ctx!.createGain(); depth.gain.value = 250;
  lfo.connect(depth).connect(bp.frequency); lfo.start();
  const wg = ctx!.createGain(); wg.gain.value = 0.25;
  wind.connect(bp).connect(wg).connect(g); wind.start();
}

const SHOT: Record<TowerKind, () => void> = {
  crossbow: () => { hiss('highpass', 2500, 0.25, 0.08); tone('square', 900, 300, 0.05, 0.05); },
  bombard: () => { tone('sine', 120, 35, 0.8, 0.5); hiss('lowpass', 600, 0.6, 0.4); },
  brazier: () => hiss('bandpass', 1200, 0.18, 0.25),
  chapel: () => { tone('sine', 660, 655, 0.15, 1.2); tone('sine', 990, 985, 0.06, 0.9); },
};

export const sfx = {
  shot: (k: TowerKind) => ctx && SHOT[k](),
  death: () => ctx && (tone('triangle', 180, 60, 0.25, 0.18), hiss('lowpass', 900, 0.15, 0.12)),
  leak: () => ctx && tone('sawtooth', 110, 55, 0.3, 0.6),
  wave: () => ctx && [0, 0.35].forEach((at) => tone('sawtooth', 98, 92, 0.25, 0.9, at)),
  won: () => ctx && [261.6, 329.6, 392, 523.3].forEach((f, k) => tone('triangle', f, f, 0.25, 1.2, k * 0.18)),
  lost: () => ctx && [196, 185, 174.6, 130.8].forEach((f, k) => tone('sawtooth', f, f * 0.98, 0.2, 1.4, k * 0.3)),
};
