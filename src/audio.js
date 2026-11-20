'use strict';
/* =========================================================
   音效：WebAudio 合成（不使用任何原作音频）
   ========================================================= */
const Sound = {
  ctx: null,
  master: null,
  musicBus: null,
  sfxBus: null,
  enabled: true,
  musicVolume: 0.55,
  sfxVolume: 0.8,
  noise: null,
  lastShot: 0,
  bgmTimer: null,
  bgmName: null,
  bgmP: null,
  bgmStep: 0,
  bgmNext: 0,
  patterns: {
    menu: {
      bpm: 72,
      bass: [110, 110, 146.83, 98],
      lead: [440, 523.25, 659.25, 587.33, 523.25, 440, 392, 329.63]
    },
    battle: {
      bpm: 136,
      bass: [82.41, 82.41, 98, 110, 82.41, 123.47, 98, 73.42],
      lead: [659.25, 783.99, 880, 783.99, 659.25, 587.33, 523.25, 587.33]
    }
  },

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? 0.9 : 0;
    this.master.connect(this.ctx.destination);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = this.musicVolume * 0.5;
    this.musicBus.connect(this.master);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = this.sfxVolume;
    this.sfxBus.connect(this.master);
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
    if (!this.master) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.enabled ? 0.9 : 0, t, 0.02);
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(this.musicVolume * 0.5, t, 0.03);
    if (this.sfxBus) this.sfxBus.gain.setTargetAtTime(this.sfxVolume, t, 0.02);
  },

  /* ---------------- 程序化 BGM ---------------- */
  startBgm(name) {
    if (!this.ctx || !this.patterns[name]) return;
    if (this.bgmName === name && this.bgmTimer) return;
    this.stopBgm();
    this.bgmName = name;
    this.bgmP = this.patterns[name];
    this.bgmStep = 0;
    this.bgmNext = this.ctx.currentTime + 0.08;
    this.bgmTimer = setInterval(() => this.scheduleBgm(), 100);
    this.scheduleBgm();
  },

  stopBgm() {
    if (this.bgmTimer) clearInterval(this.bgmTimer);
    this.bgmTimer = null;
    this.bgmName = null;
    this.bgmP = null;
  },

  scheduleBgm() {
    if (!this.ctx || !this.bgmP || !this.enabled) return;
    const spb = 60 / this.bgmP.bpm / 2;
    if (this.bgmNext < this.ctx.currentTime - 0.4) {
      this.bgmNext = this.ctx.currentTime + 0.05;
    }
    let guard = 0;
    while (this.bgmNext < this.ctx.currentTime + 0.24 && guard++ < 16) {
      const step = this.bgmStep++;
      const t = this.bgmNext;
      this.bgmNote(this.bgmP.bass[step % this.bgmP.bass.length], t, spb * 1.85, 'triangle', 0.12);
      if (step % 2 === 0) {
        this.bgmNote(this.bgmP.lead[(step / 2 | 0) % this.bgmP.lead.length], t, spb * 1.5, 'sine', 0.055);
      }
      if (this.bgmName === 'battle' && step % 4 === 0) {
        this.bgmNoise(t, 0.16);
      }
      this.bgmNext += spb;
    }
  },

  bgmNote(freq, t, dur, type, vol) {
    if (!this.musicBus) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.musicBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  },

  bgmNoise(t, vol) {
    if (!this.musicBus || !this.noise) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 4200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    src.connect(f); f.connect(g); g.connect(this.musicBus);
    src.start(t);
    src.stop(t + 0.1);
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
    g.connect(this.sfxBus || this.master);
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
    g.connect(this.sfxBus || this.master);
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
