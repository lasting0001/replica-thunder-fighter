'use strict';
/* =========================================================
   音效：WebAudio 合成（不使用任何原作音频）
   ========================================================= */
const Sound = {
  ctx: null,
  master: null,
  enabled: true,
  volume: 0.7,
  noise: null,
  lastShot: 0,

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? this.volume * 0.78 : 0;
    this.master.connect(this.ctx.destination);
    const len = Math.floor(this.ctx.sampleRate * 0.5);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buf;
  },

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },

  applyVolume() {
    if (this.master) {
      this.master.gain.setTargetAtTime(this.enabled ? this.volume * 0.78 : 0, this.ctx.currentTime, 0.02);
    }
  },

  tone(freq, dur, type, vol, slideTo) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(24, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.03);
  },

  burst(dur, vol, freq) {
    if (!this.ctx || !this.enabled || !this.noise) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(110, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + dur);
  },

  shoot() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (t - this.lastShot < 0.06) return;
    this.lastShot = t;
    this.tone(1250, 0.05, 'square', 0.014, 720);
  },
  enemyShoot() { this.tone(330, 0.07, 'triangle', 0.016, 220); },
  hit() { this.tone(140, 0.18, 'sawtooth', 0.07, 55); },
  explode() { this.burst(0.28, 0.18, 1500); },
  bigExplode() { this.burst(0.55, 0.28, 900); this.tone(74, 0.5, 'sine', 0.12, 38); },
  pickup() {
    this.tone(880, 0.07, 'sine', 0.045, 1320);
    const self = this;
    setTimeout(() => self.tone(1320, 0.09, 'sine', 0.035, 1760), 62);
  },
  rage() { this.tone(220, 0.38, 'sawtooth', 0.055, 880); },
  bomb() { this.burst(0.5, 0.3, 2600); this.tone(92, 0.5, 'sine', 0.13, 40); },
  warn() {
    this.tone(660, 0.14, 'square', 0.05);
    const self = this;
    setTimeout(() => self.tone(660, 0.14, 'square', 0.05), 190);
  },
  click() { this.tone(660, 0.04, 'square', 0.02, 520); }
};
