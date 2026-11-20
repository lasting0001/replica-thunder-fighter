'use strict';
/* =========================================================
   0. 基础常量与工具
   ========================================================= */
const W = 720, H = 1280;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));

/* =========================================================
   1. 手感参数表（与 Demo 验收版一致，调整只改这里）
   ========================================================= */
const CFG = {
  player: {
    startX: W / 2, startY: 1010,
    keySpeed: 620,
    hitR: 5,               // 命中判定半径（中心亮点）
    pickupR: 46,
    maxHp: 100,
    invTime: 1.2,
    bulletSpeed: 1150,
    baseDamage: 1,
    fireIntervals: [0.13, 0.12, 0.11, 0.10],
    offsets: [
      [-13, 13],
      [-27, 0, 27],
      [-39, -14, 14, 39],
      [-50, -26, 0, 26, 50]
    ],
    rageDuration: 6,
    rageFireScale: 0.62,
    rageDamage: 1.6
  },
  bomb: { damage: 140, start: 2, invTime: 1.6 },
  enemy: {
    scout:   { hp: 6,  r: 24, vy: 150, sway: 60, score: 100, bulletSpeed: 235 },
    fighter: { hp: 34, r: 34, score: 300, bulletSpeed: 235 },
    diver:   { hp: 8,  r: 20, score: 120 },
    turret:  { hp: 30, r: 32, score: 280, bulletSpeed: 260 }
  },
  boss: { bars: 3, hpPerBar: 240, r: 72, score: 3000 },
  drop: { crystal: 0.55, weapon: 0.45, shield: 0.15 }
};

/* 画质：粒子数量倍率 */
const QUALITY = {
  high: { particle: 1,    spark: 1 },
  mid:  { particle: 0.7,  spark: 0.8 },
  low:  { particle: 0.42, spark: 0.55 }
};

/* =========================================================
   2. 战机数据（仓库展示 + 战斗数值）
   ========================================================= */
const SHIPS = [
  {
    id: 'assault',
    name: '突击零式',
    code: 'ASSAULT ZERO',
    desc: '均衡机型，标准双路弹道，攻守兼备。',
    power: 130,
    hp: 100,
    dmg: 1,
    fireScale: 1,
    offsets: [
      [-13, 13],
      [-27, 0, 27],
      [-39, -14, 14, 39],
      [-50, -26, 0, 26, 50]
    ],
    stats: { atk: 3, hp: 3, spd: 3 },
    palette: { wing: '#1d4f86', wingEdge: 'rgba(95,216,255,0.4)', body: ['#eafcff', '#7fd4ff', '#1b5ea8'], line: 'rgba(150,245,255,0.9)', cockpit: '#6ff2ff', glow: '#7ff6ff' }
  },
  {
    id: 'spike',
    name: '尖峰零式',
    code: 'SPIKE ZERO',
    desc: '重炮机型，单发伤害更高，射速略慢。',
    power: 185,
    hp: 88,
    dmg: 1.45,
    fireScale: 1.18,
    offsets: [
      [-16, 16],
      [-24, 0, 24],
      [-34, -12, 12, 34],
      [-46, -22, 0, 22, 46]
    ],
    stats: { atk: 5, hp: 2, spd: 3 },
    palette: { wing: '#7a5a16', wingEdge: 'rgba(255,220,120,0.45)', body: ['#fffbe8', '#ffd87a', '#a06a12'], line: 'rgba(255,232,160,0.9)', cockpit: '#ffe9a8', glow: '#ffd84d' }
  },
  {
    id: 'falcon',
    name: '猎鹰零式',
    code: 'FALCON ZERO',
    desc: '高机动机型，三路散射覆盖，装甲偏薄。',
    power: 160,
    hp: 80,
    dmg: 0.8,
    fireScale: 0.92,
    offsets: [
      [-20, 0, 20],
      [-30, -10, 10, 30],
      [-42, -21, 0, 21, 42],
      [-54, -27, 0, 27, 54]
    ],
    stats: { atk: 3, hp: 2, spd: 5 },
    palette: { wing: '#176b56', wingEdge: 'rgba(120,255,200,0.4)', body: ['#eafff6', '#66e2b0', '#0d6e4e'], line: 'rgba(140,255,210,0.9)', cockpit: '#8effd0', glow: '#5dffb0' }
  }
];
const shipById = (id) => SHIPS.find(s => s.id === id) || SHIPS[0];

/* =========================================================
   3. 关卡数据表（白羊座 8 关 + 金牛座 8 关 = 16 关）
   ========================================================= */
const CHAPTERS = [
  { id: 'aries',  name: '白羊座', code: 'ARIES' },
  { id: 'taurus', name: '金牛座', code: 'TAURUS' }
];

const LEVEL_NAMES = [
  '星尘前哨', '陨石带', '边境巡逻', '红色重装机',
  '破碎环带', '暗流回廊', '双星夹击', '白羊座守卫',
  '深空裂谷', '静默雷区', '钢铁堡垒', '布莱特',
  '引力漩涡', '燃烧星云', '最后一公里', '金牛座要塞'
];

const BOSS_NAMES = {
  4: '红色重装机',
  8: '红色重装机·改',
  12: '布莱特',
  16: '金牛座守卫'
};

/* 三种 BOSS 形态：heavy / bright / taurus */
const BOSS_DEFS = {
  heavy: {
    kind: 'heavy', name: '红色重装机',
    bars: 3, hpPerBar: 240, score: 3000,
    speed: 240, vx: 100,
    cd: [1.7, 1.35, 1.05],
    accent: ['#ffb347', '#ff6b5c', '#ff5cc8']
  },
  bright: {
    kind: 'bright', name: '布莱特',
    bars: 3, hpPerBar: 250, score: 3600,
    speed: 330, vx: 190,
    cd: [1.15, 0.95, 0.8],
    accent: ['#9ff4ff', '#5fa8ff', '#c86bff']
  },
  taurus: {
    kind: 'taurus', name: '金牛座守卫',
    bars: 3, hpPerBar: 330, score: 4800,
    speed: 215, vx: 80,
    cd: [1.5, 1.2, 0.95],
    accent: ['#ffd36b', '#ff9a3d', '#ff5c5c']
  }
};
const BOSS_KINDS = ['heavy', 'bright', 'taurus'];

/**
 * 关卡由数据描述：waves 中每一项都是 { t, kind, ... }。
 * kind: line / v / divers / fighters / drop / warn / boss
 */
function buildLevel(id) {
  const no = id + 1;
  const chapterIndex = no <= 8 ? 0 : 1;
  const isBoss = no % 4 === 0;
  const scale = 1 + (no - 1) * 0.055;
  const waves = [];
  const cycle = ['line', 'v', 'divers', 'fighters'];
  let t = 0.8;
  for (let i = 0; i < 9; i++) {
    const kind = cycle[(i + no) % 4];
    let n = 0;
    if (kind === 'line') n = 4 + Math.min(3, Math.floor(no / 4));
    else if (kind === 'v') n = 5 + (no >= 9 ? 2 : 0);
    else if (kind === 'divers') n = 4 + (no % 3) * 2;
    else n = 2 + (no >= 8 ? 1 : 0);
    waves.push({ t, kind, n });
    t += 3.6;
  }
  // 第 5 关起加入哨戒炮台（第 4 种敌机）
  if (no >= 5) {
    waves.push({ t: 10.5, kind: 'turret', n: no >= 13 ? 2 : 1 });
    if (no >= 9) waves.push({ t: 26.5, kind: 'turret', n: 2 });
  }
  const drops = [
    { t: 5.0,  type: 'weapon', x: W / 2 },
    { t: 14.0, type: 'shield', x: 230 },
    { t: 21.5, type: 'weapon', x: 500 },
    { t: 29.0, type: 'rage',   x: W / 2 },
    { t: 33.0, type: 'heal',   x: 480 },
    { t: 37.0, type: 'weapon', x: 260 }
  ];
  const dropSummary = { weapon: 0, shield: 0, rage: 0, heal: 0 };
  for (const d of drops) dropSummary[d.type]++;
  for (const d of drops) waves.push({ t: d.t, kind: 'drop', type: d.type, x: d.x });

  let boss = null;
  if (isBoss) {
    waves.push({ t: t + 0.4, kind: 'warn' });
    waves.push({ t: t + 3.8, kind: 'boss' });
    const key = no === 12 ? 'bright' : (no === 16 ? 'taurus' : 'heavy');
    const def = BOSS_DEFS[key];
    boss = Object.assign({}, def, {
      name: BOSS_NAMES[no] || def.name,
      hpPerBar: Math.round(def.hpPerBar * (0.92 + no * 0.03)),
      score: def.score + no * 250,
      speed: def.speed + chapterIndex * 20,
      variant: chapterIndex
    });
  }
  waves.sort((a, b) => a.t - b.t);

  const rec = 100 + (no - 1) * 6;
  return {
    id,
    no,
    chapterIndex,
    chapter: CHAPTERS[chapterIndex].name,
    chapterCode: CHAPTERS[chapterIndex].code,
    name: LEVEL_NAMES[id],
    isBoss,
    boss,
    waves,
    scale,
    recommended: rec,
    drops: dropSummary,
    reward: { coins: 20 + no * 4, shards: 15 + no * 4 }
  };
}

const LEVELS = LEVEL_NAMES.map((_, i) => buildLevel(i));

/* =========================================================
   4. 战机成长与无尽模式参数
   ========================================================= */
const SHIP_PROG = {
  baseMax: 25,          // 初始等级上限
  stepMax: 15,          // 每提升 1 星，上限 +15
  maxStar: 3,
  maxLevel: (star) => 25 + star * 15,
  upgradeCost: (level, star) => 8 + level * 2 + star * 20,
  advanceCost: (star) => 100 + star * 50,
  mult: (level, star) => 1 + (level - 1) * 0.02 + star * 0.12
};

const ENDLESS = {
  startDelay: 2.2,
  waveGap: 3.4,
  bossEvery: 5,
  bossWarn: 2.4
};

