'use strict';
/* =========================================================
   1. 画布、全局状态、背景、贴图、存档、屏幕路由
   ========================================================= */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const DPR = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = Math.round(W * DPR);
canvas.height = Math.round(H * DPR);
ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

/* ---------------- 全局游戏状态 ---------------- */
const G = {
  visual: 0,
  stars: [],
  player: null,
  bullets: [],
  ebullets: [],
  enemies: [],
  pickups: [],
  particles: [],
  texts: [],
  boss: null,
  score: 0, kills: 0, crystals: 0, bombs: 0,
  rage: 0, shake: 0, flash: 0, warn: 0, banner: 0,
  time: 0,
  finished: false, victory: false, endTimer: 0,
  script: [], si: 0,
  level: null, ship: null,
  state: 'menu'    // menu | playing | paused | victory | defeat
};

/* ---------------- 星空 ---------------- */
const Stars = {
  init() {
    G.stars.length = 0;
    for (let i = 0; i < 110; i++) {
      const z = Math.random();
      G.stars.push({ x: Math.random() * W, y: Math.random() * H, z, s: 0.8 + z * 1.8, sp: 30 + z * 120 });
    }
  },
  update(dt) {
    for (const s of G.stars) {
      s.y += s.sp * dt;
      if (s.y > H + 4) { s.y = -4; s.x = Math.random() * W; }
    }
  },
  draw() {
    for (const s of G.stars) {
      ctx.globalAlpha = 0.25 + s.z * 0.65;
      ctx.fillStyle = s.z > 0.72 ? '#bfe9ff' : '#ffffff';
      ctx.fillRect(s.x, s.y, s.s, s.s * 2.2);
    }
    ctx.globalAlpha = 1;
  }
};

/* ---------------- 背景（两章各一张，离屏缓存） ---------------- */
function buildBackground(chapterIndex) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const lg = x.createLinearGradient(0, 0, 0, H);
  if (chapterIndex === 0) {
    lg.addColorStop(0, '#070d22');
    lg.addColorStop(0.45, '#040a18');
    lg.addColorStop(1, '#02040b');
  } else {
    lg.addColorStop(0, '#0b0a1c');
    lg.addColorStop(0.45, '#0a0714');
    lg.addColorStop(1, '#050207');
  }
  x.fillStyle = lg; x.fillRect(0, 0, W, H);

  const neb = (nx, ny, r, col) => {
    const g = x.createRadialGradient(nx, ny, 10, nx, ny, r);
    g.addColorStop(0, col);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
  };
  if (chapterIndex === 0) {
    neb(140, 260, 520, 'rgba(80,66,210,0.34)');
    neb(600, 880, 560, 'rgba(0,140,190,0.16)');
    neb(590, 160, 380, 'rgba(180,40,80,0.16)');
    neb(260, 1160, 420, 'rgba(40,90,200,0.12)');
  } else {
    neb(200, 220, 540, 'rgba(120,50,40,0.30)');
    neb(600, 760, 560, 'rgba(180,70,40,0.16)');
    neb(520, 140, 400, 'rgba(90,40,180,0.18)');
    neb(180, 1120, 420, 'rgba(60,30,90,0.16)');
  }

  // 远处行星
  const px = chapterIndex === 0 ? 600 : 130;
  const py = chapterIndex === 0 ? 170 : 250;
  const pr = chapterIndex === 0 ? 112 : 96;
  const pg = x.createRadialGradient(px - 36, py - 42, 10, px, py, pr);
  if (chapterIndex === 0) {
    pg.addColorStop(0, '#3a6ea8');
    pg.addColorStop(0.55, '#1a3760');
    pg.addColorStop(1, '#060d1d');
  } else {
    pg.addColorStop(0, '#a86a3a');
    pg.addColorStop(0.55, '#60351a');
    pg.addColorStop(1, '#1d0b06');
  }
  x.fillStyle = pg;
  x.beginPath(); x.arc(px, py, pr, 0, TAU); x.fill();
  x.strokeStyle = chapterIndex === 0 ? 'rgba(120,190,255,0.22)' : 'rgba(255,190,120,0.22)';
  x.lineWidth = 2;
  x.beginPath(); x.arc(px, py, pr - 1, Math.PI * 1.15, Math.PI * 1.72); x.stroke();

  // 暗角
  const vg = x.createRadialGradient(W / 2, H / 2, 280, W / 2, H / 2, 760);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  x.fillStyle = vg; x.fillRect(0, 0, W, H);
  return c;
}
const BG = [buildBackground(0), buildBackground(1)];

/* ---------------- 子弹贴图 ---------------- */
function makePlayerBullet() {
  const c = document.createElement('canvas');
  c.width = 20; c.height = 44;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 44);
  g.addColorStop(0, 'rgba(120,250,255,0)');
  g.addColorStop(0.28, 'rgba(120,250,255,0.85)');
  g.addColorStop(0.65, '#ffffff');
  g.addColorStop(1, 'rgba(80,190,255,0)');
  x.fillStyle = g;
  x.beginPath(); x.ellipse(10, 22, 6.5, 20, 0, 0, TAU); x.fill();
  const g2 = x.createLinearGradient(0, 0, 0, 44);
  g2.addColorStop(0, 'rgba(255,255,255,0)');
  g2.addColorStop(0.6, 'rgba(255,255,255,0.95)');
  g2.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g2;
  x.beginPath(); x.ellipse(10, 22, 2.2, 16, 0, 0, TAU); x.fill();
  return c;
}

function makeEnemyBullet(color) {
  const c = document.createElement('canvas');
  c.width = 40; c.height = 40;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(20, 20, 1, 20, 20, 19);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.3, color);
  g.addColorStop(0.72, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.beginPath(); x.arc(20, 20, 19, 0, TAU); x.fill();
  return c;
}

const SPR = {
  pBullet: makePlayerBullet(),
  eOrange: makeEnemyBullet('rgba(255,150,60,0.95)'),
  eRed: makeEnemyBullet('rgba(255,80,90,0.95)'),
  ePink: makeEnemyBullet('rgba(255,92,200,0.95)')
};

/* ---------------- 存档 ---------------- */
const SAVE_KEY = 'tf_replica_save_v1';
const defaultSave = () => ({
  version: 2,
  bestScore: 0,
  coins: 0,
  shards: 0,
  gems: 0,
  progress: { unlocked: 1, cleared: 0 },
  ships: {
    equipped: 'assault',
    levels: { assault: 1, spike: 1, falcon: 1 },
    stars: { assault: 0, spike: 0, falcon: 0 }
  },
  endless: { bestScore: 0, bestWave: 0 },
  settings: { volume: 70, muted: false, quality: 'high' }
});

const Save = {
  data: defaultSave(),
  load() {
    const base = defaultSave();
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && typeof s === 'object') {
          Object.assign(base, {
            bestScore: Number(s.bestScore) || 0,
            coins: Number(s.coins) || 0,
            shards: Number(s.shards) || 0,
            gems: Number(s.gems) || 0
          });
          if (s.progress && typeof s.progress === 'object') {
            base.progress.unlocked = clamp(Math.floor(Number(s.progress.unlocked) || 1), 1, LEVELS.length);
            base.progress.cleared = clamp(Math.floor(Number(s.progress.cleared) || 0), 0, LEVELS.length);
          }
          if (s.ships && typeof s.ships === 'object') {
            if (typeof s.ships.equipped === 'string') base.ships.equipped = s.ships.equipped;
            for (const sh of SHIPS) {
              const lv = s.ships.levels ? Number(s.ships.levels[sh.id]) : 1;
              const st = s.ships.stars ? Number(s.ships.stars[sh.id]) : 0;
              base.ships.levels[sh.id] = clamp(Math.floor(lv || 1), 1, 100);
              base.ships.stars[sh.id] = clamp(Math.floor(st || 0), 0, SHIP_PROG.maxStar);
            }
          }
          if (!SHIPS.some(sh => sh.id === base.ships.equipped)) base.ships.equipped = SHIPS[0].id;
          if (s.endless && typeof s.endless === 'object') {
            base.endless.bestScore = Math.max(0, Math.floor(Number(s.endless.bestScore) || 0));
            base.endless.bestWave = Math.max(0, Math.floor(Number(s.endless.bestWave) || 0));
          }
          if (s.settings && typeof s.settings === 'object') {
            base.settings.volume = clamp(Math.round(Number(s.settings.volume) || 0), 0, 100);
            base.settings.muted = !!s.settings.muted;
            base.settings.quality = QUALITY[s.settings.quality] ? s.settings.quality : 'high';
          }
        }
      }
    } catch (e) {
      /* 存档损坏 → 回退默认值 */
    }
    base.version = 2;
    this.data = base;
    return base;
  },
  save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); } catch (e) { /* 隐私模式忽略 */ }
  },
  reset() {
    this.data = defaultSave();
    this.save();
  }
};

/* ---------------- 战机成长数值 ---------------- */
function getShipProgress(id) {
  const ship = shipById(id);
  const star = clamp(Math.floor(Save.data.ships.stars[ship.id] || 0), 0, SHIP_PROG.maxStar);
  const maxLevel = SHIP_PROG.maxLevel(star);
  const level = clamp(Math.floor(Save.data.ships.levels[ship.id] || 1), 1, maxLevel);
  return { id: ship.id, level, star, maxLevel };
}

function getShipStats(id) {
  const ship = shipById(id);
  const p = getShipProgress(ship.id);
  const mul = SHIP_PROG.mult(p.level, p.star);
  return {
    level: p.level,
    star: p.star,
    maxLevel: p.maxLevel,
    power: Math.round(ship.power * mul),
    hp: Math.round(ship.hp * mul),
    dmg: Math.round(ship.dmg * mul * 100) / 100
  };
}

/* ---------------- 屏幕路由 ---------------- */
const Screen = {
  current: 'title',
  show(id) {
    const all = document.querySelectorAll('.screen');
    for (const el of all) el.classList.remove('active');
    const el = document.getElementById('scr-' + id);
    if (el) el.classList.add('active');
    this.current = id;
  },
  hideAll() {
    const all = document.querySelectorAll('.screen');
    for (const el of all) el.classList.remove('active');
    this.current = 'battle';
  },
  is(id) { return this.current === id; },
  isMenu() {
    return this.current === 'title' || this.current === 'home' || this.current === 'map' ||
      this.current === 'hangar' || this.current === 'settings';
  }
};

/* ---------------- 通用绘制 ---------------- */
function roundRect(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function toLogical(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) / r.width) * W,
    y: ((e.clientY - r.top) / r.height) * H
  };
}

/* 战机绘制（菜单展示与战斗共用） */
function drawPlayerShip(x, y, t, alpha, ship, scale) {
  const s = ship || SHIPS[0];
  const pal = s.palette;
  const sc = scale || 1;
  ctx.save();
  ctx.translate(x, y);
  if (sc !== 1) ctx.scale(sc, sc);
  ctx.globalAlpha = alpha === undefined ? 1 : alpha;

  // 尾焰
  const fl = 32 + Math.sin(t * 42) * 8;
  const fg = ctx.createLinearGradient(0, 12, 0, 12 + fl);
  fg.addColorStop(0, 'rgba(150,245,255,0.9)');
  fg.addColorStop(1, 'rgba(40,120,255,0)');
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.moveTo(-9, 12); ctx.lineTo(0, 12 + fl); ctx.lineTo(9, 12);
  ctx.closePath(); ctx.fill();

  // 机翼
  ctx.fillStyle = pal.wing;
  ctx.beginPath();
  ctx.moveTo(0, -16);
  ctx.lineTo(-38, 14); ctx.lineTo(-23, 24); ctx.lineTo(0, 14);
  ctx.lineTo(23, 24); ctx.lineTo(38, 14);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = pal.wingEdge;
  ctx.beginPath();
  ctx.moveTo(-38, 14); ctx.lineTo(-23, 24); ctx.lineTo(-18, 12); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(38, 14); ctx.lineTo(23, 24); ctx.lineTo(18, 12); ctx.closePath(); ctx.fill();

  // 机身
  const bg = ctx.createLinearGradient(0, -38, 0, 26);
  bg.addColorStop(0, pal.body[0]);
  bg.addColorStop(0.42, pal.body[1]);
  bg.addColorStop(1, pal.body[2]);
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.moveTo(0, -38);
  ctx.lineTo(11, -6); ctx.lineTo(9, 18); ctx.lineTo(0, 26);
  ctx.lineTo(-9, 18); ctx.lineTo(-11, -6);
  ctx.closePath(); ctx.fill();

  // 能量线
  ctx.strokeStyle = pal.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -34); ctx.lineTo(-8, 6);
  ctx.moveTo(0, -34); ctx.lineTo(8, 6);
  ctx.stroke();

  // 座舱
  const cg = ctx.createRadialGradient(0, -10, 1, 0, -10, 10);
  cg.addColorStop(0, '#ffffff');
  cg.addColorStop(0.5, pal.cockpit);
  cg.addColorStop(1, 'rgba(30,120,200,0)');
  ctx.fillStyle = cg;
  ctx.beginPath(); ctx.arc(0, -10, 9, 0, TAU); ctx.fill();

  // 判定亮点
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = pal.glow;
  ctx.shadowBlur = 12;
  ctx.beginPath(); ctx.arc(0, 2, 3.6, 0, TAU); ctx.fill();
  ctx.shadowBlur = 0;

  ctx.restore();
  ctx.globalAlpha = 1;
}
