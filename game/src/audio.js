// The Midnight Teller — audio.js
// All sound is synthesised with WebAudio (oscillator blips, no audio files,
// no network). The context is created lazily on the first user gesture so
// autoplay rules never block the page; every call is a safe no-op before that.

let ctx = null;
let alarmOsc = null;
let alarmGain = null;

function ensure() {
  if (!ctx) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    } catch {
      return null;
    }
  }
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq, dur, type = 'sine', vol = 0.12, when = 0) {
  const c = ensure();
  if (!c) return;
  const t0 = c.currentTime + when;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

export const SFX = {
  unlock() {
    ensure();
  },
  pickup() {
    tone(880, 0.12, 'sine', 0.12);
    tone(1318, 0.16, 'sine', 0.1, 0.07);
  },
  cash() {
    tone(660, 0.1, 'triangle', 0.1);
    tone(990, 0.14, 'triangle', 0.09, 0.06);
  },
  tool() {
    tone(520, 0.1, 'square', 0.06);
    tone(780, 0.14, 'square', 0.05, 0.08);
  },
  denied() {
    tone(180, 0.18, 'square', 0.08);
  },
  crackOk() {
    tone(523, 0.1, 'sine', 0.12);
    tone(784, 0.12, 'sine', 0.12, 0.08);
    tone(1046, 0.18, 'sine', 0.12, 0.16);
  },
  crackBad() {
    tone(220, 0.22, 'sawtooth', 0.09);
    tone(160, 0.26, 'sawtooth', 0.09, 0.1);
  },
  vaultOpen() {
    tone(392, 0.14, 'triangle', 0.12);
    tone(523, 0.14, 'triangle', 0.12, 0.1);
    tone(659, 0.14, 'triangle', 0.12, 0.2);
    tone(784, 0.3, 'triangle', 0.12, 0.3);
  },
  caught() {
    tone(311, 0.3, 'sawtooth', 0.12);
    tone(233, 0.4, 'sawtooth', 0.12, 0.18);
  },
  win() {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.12, i * 0.12));
  },
  spotted() {
    tone(1200, 0.08, 'square', 0.05);
  },
  // A soft pulsing alarm bed while the meter is high; call every frame.
  alarmBed(level) {
    const c = ensure();
    if (!c) return;
    if (level < 0.45) {
      if (alarmOsc) {
        try { alarmOsc.stop(); } catch { /* already stopped */ }
        alarmOsc = null;
        alarmGain = null;
      }
      return;
    }
    if (!alarmOsc) {
      alarmOsc = c.createOscillator();
      alarmGain = c.createGain();
      alarmOsc.type = 'sine';
      alarmOsc.frequency.value = 196;
      alarmGain.gain.value = 0.0;
      alarmOsc.connect(alarmGain).connect(c.destination);
      alarmOsc.start();
    }
    const target = 0.02 + 0.05 * level;
    alarmGain.gain.setTargetAtTime(target, c.currentTime, 0.1);
    alarmOsc.frequency.setTargetAtTime(196 + 120 * level, c.currentTime, 0.1);
  },
};
