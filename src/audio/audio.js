// Sound, all of it made here (no recordings): the suit's own quiet hum, the wind where
// there is air, the rush of flight, footsteps and landings as the suit carries them, a
// chime for a place found, the shimmer of very fast travel. Web Audio; nothing plays
// until the first tap (browsers require it) and one switch silences it all.
//
// In a vacuum nothing outside the suit is heard: wind needs air (its loudness follows the
// world's air density), and footsteps are dull thuds through the boots everywhere.
export class Audio {
  constructor() { this.ctx = null; this.on = true; this.steps = 0; this.lastAir = false; this.warp = 0; }

  // Call from a tap or key press (the first one starts the sound).
  start() {
    if (this.ctx || typeof window === 'undefined') { this.ctx?.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = this.on ? 0.9 : 0; this.master.connect(c.destination);
    // two seconds of noise, looped by every voice that needs it
    const len = 2 * c.sampleRate, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.0990460; b1 = 0.96300 * b1 + w * 0.2965164; b2 = 0.57000 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.16; }
    this.noise = buf;
    const voice = (type, freq, q) => {
      const src = c.createBufferSource(); src.buffer = buf; src.loop = true; src.playbackRate.value = 0.8 + Math.random() * 0.4;
      const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = c.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(this.master); src.start();
      return { f, g };
    };
    this.wind = voice('bandpass', 400, 0.6);
    this.gust = voice('bandpass', 900, 1.2);
    this.rush = voice('lowpass', 300, 0.3);
    this.shimmer = voice('highpass', 2500, 0.4);
    // the suit: two low tones a hair apart, beating slowly, and a breath of air
    this.hum = c.createGain(); this.hum.gain.value = 0; this.hum.connect(this.master);
    for (const f of [54, 54.7, 108.4]) { const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f; const g = c.createGain(); g.gain.value = f > 100 ? 0.25 : 0.5; o.connect(g); g.connect(this.hum); o.start(); }
    this.air = voice('bandpass', 1800, 0.5);
  }

  setOn(on) { this.on = on; if (this.master) this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.05); }

  // A short thud (a footstep, a landing): strength 0..1.
  thud(strength, pitch = 1) {
    const c = this.ctx; if (!c || !this.on) return;
    const t = c.currentTime, src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    src.playbackRate.value = 0.5 + Math.random() * 0.3;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 170 * pitch; f.Q.value = 1.2;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.9 * strength, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14 + 0.2 * strength);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t, Math.random()); src.stop(t + 0.5);
  }

  // Two rising notes: a place found.
  chime() {
    const c = this.ctx; if (!c || !this.on) return;
    const t = c.currentTime;
    [[523.25, 0], [783.99, 0.14], [1046.5, 0.28]].forEach(([f, at]) => {
      const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + at); g.gain.exponentialRampToValueAtTime(0.16, t + at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.9);
      o.connect(g); g.connect(this.master); o.start(t + at); o.stop(t + at + 1);
    });
  }

  // Every frame. s: { airDensity (kg/m3 at the traveller, 0 in vacuum), speed (m/s), onFoot,
  // airborne, throttle (0..1), boost, flying, warp (0..1), landed (m/s, once, or 0) }
  update(dt, s) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime, set = (p, v, k = 0.15) => p.setTargetAtTime(v, t, k);
    // wind: the air's own (a breeze even standing still) and the air rushing past
    const air = Math.min(1, Math.pow(Math.max(0, s.airDensity) / 1.2, 0.33));            // Earth 1, Mars 0.26, Titan 1 (capped), Pluto 0.04
    const pass = Math.min(1, s.speed / 120);
    set(this.wind.g.gain, air * (0.10 + 0.5 * pass)); set(this.wind.f.frequency, 260 + 900 * pass + 120 * Math.sin(t * 0.31));
    set(this.gust.g.gain, air * 0.06 * (0.5 + 0.5 * Math.sin(t * 0.17) * Math.sin(t * 0.059)) * (1 + 2 * pass));
    // flight: the suit's thrust, heard through the suit (so in vacuum too), louder with the stick
    const fly = s.flying ? 0.05 + 0.22 * s.throttle + (s.boost ? 0.12 : 0) : 0;
    set(this.rush.g.gain, fly); set(this.rush.f.frequency, 160 + 500 * s.throttle + (s.boost ? 500 : 0));
    set(this.shimmer.g.gain, 0.16 * s.warp, 0.3); set(this.shimmer.f.frequency, 1800 + 3000 * s.warp);
    set(this.hum.gain, 0.045); set(this.air.g.gain, 0.012 + 0.006 * Math.sin(t * 1.3));
    // footsteps: one every stride
    if (s.onFoot && !s.airborne && s.speed > 0.4) {
      this.steps += s.speed * dt;
      const stride = s.speed > 9 ? 2.6 : s.speed > 3 ? 1.5 : 0.75;
      if (this.steps > stride) { this.steps = 0; this.thud(0.16 + Math.min(0.2, s.speed * 0.012), 0.9 + Math.random() * 0.3); }
    } else this.steps = 0.5;
    if (s.landed > 0.5) this.thud(Math.min(1, 0.25 + s.landed * 0.05), 0.7);
  }
}
