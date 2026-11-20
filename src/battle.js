'use strict';
/* =========================================================
   战斗场景：数据驱动，一行代码一个子系统
   ========================================================= */
const BOMB = { x: 88, y: 1178, r: 58 };
const PAUSE_BTN = { x: 662, y: 1178, r: 30 };
const MUTE_BTN = { x: 666, y: 1108, r: 22 };

const input = { dragId: null, sx: 0, sy: 0, px: 0, py: 0 };
const keys = new Set();

const Battle = {
  onEnd: null,           // App 注入：结算回调

  /* ---------------- 生命周期 ---------------- */
  start(levelId, shipId) {
    const level = LEVELS[clamp(levelId | 0, 0, LEVELS.length - 1)];
    this.begin(shipId);
    G.mode = 'story';
    G.level = level;
    G.bossMeta = level.boss;
    G.script = level.waves;
    G.si = 0;
    G.banner = 2.6;
  },

  startEndless(shipId) {
    this.begin(shipId);
    G.mode = 'endless';
    G.level = {
      id: -1, no: 0, chapter: '无尽', chapterCode: 'ENDLESS',
      chapterIndex: 0, name: '无尽挑战',
      isBoss: false, boss: null, waves: [], scale: 1
    };
    G.bossMeta = null;
    G.script = [];
    G.si = 0;
    G.banner = 0;
    G.endless = {
      wave: 0,
      nextWave: ENDLESS.startDelay,
      pendingBoss: 0,
      maxWave: 0
    };
  },

  begin(shipId) {
    const ship = shipById(shipId || Save.data.ships.equipped);
    const stats = getShipStats(ship.id);
    Sound.init();
    Sound.resume();
    Screen.hideAll();

    G.level = null;
    G.bossMeta = null;
    G.mode = 'story';
    G.ship = ship;
    G.shipStats = stats;
    G.state = 'playing';
    G.time = 0;
    G.endless = null;
    G.player = {
      x: CFG.player.startX, y: CFG.player.startY,
      hp: stats.hp, maxHp: stats.hp, power: 0,
      inv: 0, fireCd: 0, shield: 0, shieldHits: 0, alive: true
    };
    G.bullets.length = 0;
    G.ebullets.length = 0;
    G.enemies.length = 0;
    G.pickups.length = 0;
    G.particles.length = 0;
    G.texts.length = 0;
    G.boss = null;
    G.score = 0; G.kills = 0; G.crystals = 0; G.bombs = CFG.bomb.start;
    G.rage = 0; G.shake = 0; G.flash = 0; G.warn = 0; G.banner = 0;
    G.finished = false; G.victory = false; G.endTimer = 0;
    G.script = [];
    G.si = 0;
    Battle.acc = 0;
    input.dragId = null;
    keys.clear();
  },

  pause() {
    if (!Screen.is('battle') || G.state !== 'playing' || G.finished) return;
    G.state = 'paused';
    Screen.show('pause');
  },

  resume() {
    if (G.state !== 'paused') return;
    G.state = 'playing';
    Screen.hideAll();
    Battle.acc = 0;
  },

  quit() {
    G.state = 'menu';
    input.dragId = null;
    keys.clear();
  },

  /* ---------------- 更新 ---------------- */
  update(dt) {
    G.time += dt;
    if (G.banner > 0) G.banner -= dt;
    if (G.warn > 0) G.warn -= dt;
    if (G.shake > 0) G.shake = Math.max(0, G.shake - 55 * dt);
    if (G.flash > 0) G.flash = Math.max(0, G.flash - 2.8 * dt);

    if (G.finished) {
      G.endTimer -= dt;
      if (G.endTimer <= 0) {
        const win = G.victory;
        G.state = win ? 'victory' : 'defeat';
        if (this.onEnd) this.onEnd(win);
        return;
      }
    } else {
      if (G.mode === 'endless') this.updateEndless(dt);
      else this.runScript();
      this.updatePlayer(dt);
      if (G.mode !== 'endless') this.checkLevelComplete();
    }

    this.updateBoss(dt);
    this.updateEnemies(dt);
    this.updateBullets(dt);
    this.updatePickups(dt);
    this.updateParticles(dt);
    this.updateTexts(dt);
    this.handleCollisions();
  },

  updateEndless(dt) {
    const E = G.endless;
    if (!E || G.boss) return;
    if (E.pendingBoss > 0) {
      E.pendingBoss -= dt;
      if (E.pendingBoss <= 0) this.spawnEndlessBoss();
      return;
    }
    if (G.time < E.nextWave) return;

    E.wave++;
    E.maxWave = Math.max(E.maxWave, E.wave);
    G.level.scale = 1 + (E.wave - 1) * 0.075;

    const kinds = ['line', 'v', 'divers', 'fighters'];
    const kind = kinds[(E.wave - 1) % 4];
    const n = kind === 'line' ? 4 + Math.min(4, Math.floor(E.wave / 4))
      : kind === 'v' ? 5 + Math.min(4, Math.floor(E.wave / 5))
      : kind === 'divers' ? 4 + Math.min(6, E.wave)
      : 2 + Math.min(2, Math.floor(E.wave / 6));

    if (kind === 'line') spawnScoutLine(n);
    else if (kind === 'v') spawnScoutV(n);
    else if (kind === 'divers') spawnDivers(n);
    else spawnFighterGroup(n);

    E.nextWave = G.time + Math.max(2.4, ENDLESS.waveGap - E.wave * 0.03);
    if (E.wave % 3 === 0) spawnPickup('weapon', W / 2, -30);
    if (E.wave % 4 === 2) spawnPickup('shield', 200, -30);
    if (E.wave % ENDLESS.bossEvery === 0) {
      E.pendingBoss = ENDLESS.bossWarn;
      G.warn = ENDLESS.bossWarn;
      Sound.warn();
    }
  },

  spawnEndlessBoss() {
    const w = G.endless ? G.endless.wave : 5;
    G.bossMeta = {
      name: '无尽守卫',
      bars: 3,
      hpPerBar: Math.round(150 + w * 34),
      score: 1200 + w * 150,
      cd: [
        Math.max(1.5, 1.85 - w * 0.01),
        Math.max(1.25, 1.5 - w * 0.008),
        Math.max(1.05, 1.25 - w * 0.006)
      ],
      speed: 235 + Math.min(60, w * 2),
      variant: w % 2
    };
    spawnBoss();
  },

  checkLevelComplete() {
    if (G.finished || G.level.isBoss) return;
    if (G.si >= G.script.length && G.enemies.length === 0) {
      G.finished = true;
      G.victory = true;
      G.endTimer = 1.0;
      addText(W / 2, 520, '区域肃清', '#5dff9b');
    }
  },

  runScript() {
    const s = G.script;
    while (G.si < s.length && G.time >= s[G.si].t) {
      const step = s[G.si++];
      this.execStep(step);
    }
  },

  execStep(step) {
    switch (step.kind) {
      case 'line': spawnScoutLine(step.n); break;
      case 'v': spawnScoutV(step.n); break;
      case 'divers': spawnDivers(step.n); break;
      case 'fighters': spawnFighterGroup(step.n); break;
      case 'drop': spawnPickup(step.type, step.x, -30); break;
      case 'warn': G.warn = 3.2; Sound.warn(); break;
      case 'boss': spawnBoss(); break;
    }
  },

  updatePlayer(dt) {
    const p = G.player;
    if (!p || !p.alive) return;

    if (p.inv > 0) p.inv -= dt;
    if (p.shield > 0) {
      p.shield -= dt;
      if (p.shield <= 0) { p.shield = 0; p.shieldHits = 0; }
    }
    if (G.rage > 0) G.rage = Math.max(0, G.rage - dt);

    let kx = 0, ky = 0;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) kx -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) kx += 1;
    if (keys.has('ArrowUp') || keys.has('KeyW')) ky -= 1;
    if (keys.has('ArrowDown') || keys.has('KeyS')) ky += 1;
    if (kx || ky) {
      const len = Math.hypot(kx, ky);
      p.x += (kx / len) * CFG.player.keySpeed * dt;
      p.y += (ky / len) * CFG.player.keySpeed * dt;
    }
    p.x = clamp(p.x, 34, W - 34);
    p.y = clamp(p.y, 110, H - 80);

    p.fireCd -= dt;
    if (p.fireCd <= 0) {
      const interval = CFG.player.fireIntervals[p.power] *
        (G.rage > 0 ? CFG.player.rageFireScale : 1) *
        (G.ship ? G.ship.fireScale : 1);
      p.fireCd += interval;
      this.shootPlayer();
    }
  },

  shootPlayer() {
    const p = G.player;
    if (!p || !p.alive) return;
    const offsets = G.ship ? G.ship.offsets[p.power] : CFG.player.offsets[p.power];
    const dmg = CFG.player.baseDamage *
      (G.shipStats ? G.shipStats.dmg : (G.ship ? G.ship.dmg : 1)) *
      (G.rage > 0 ? CFG.player.rageDamage : 1);
    for (const ox of offsets) {
      G.bullets.push({ x: p.x + ox, y: p.y - 28, vy: -CFG.player.bulletSpeed, dmg, r: 6 });
    }
    spawnParticles(p.x - 8, p.y - 26, 1, '#9ff4ff', 0.12, 40, 120);
    spawnParticles(p.x + 8, p.y - 26, 1, '#9ff4ff', 0.12, 40, 120);
    Sound.shoot();
  },

  updateEnemies(dt) {
    const p = G.player;
    for (const e of G.enemies) {
      if (e.dead) continue;
      e.t += dt;
      if (e.flash > 0) e.flash -= dt;

      if (e.type === 'scout') {
        e.y += e.vy * dt;
        e.x = e.baseX + Math.sin(e.t * 1.7 + e.phase) * e.sway;
        if (p && p.alive && e.y > 20 && e.y < H * 0.78) {
          e.shootCd -= dt;
          if (e.shootCd <= 0) {
            e.shootCd = 1.7 + Math.random() * 0.9;
            aimShot(e, CFG.enemy.scout.bulletSpeed);
          }
        }
      } else if (e.type === 'diver') {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
      } else if (e.type === 'fighter') {
        if (e.y < e.targetY) {
          e.y += 110 * dt;
        } else {
          e.x = e.baseX + Math.sin(e.t * 0.9 + e.phase) * 92;
        }
        if (p && p.alive && e.y > 20) {
          e.shootCd -= dt;
          if (e.shootCd <= 0) {
            e.shootCd = 1.5 + Math.random() * 0.4;
            fanShot(e, 3, 0.3, CFG.enemy.fighter.bulletSpeed);
          }
        }
      }
    }
    G.enemies = G.enemies.filter(e => !e.dead && e.y < H + 120);
  },

  updateBoss(dt) {
    const b = G.boss;
    if (!b) return;
    const p = G.player;
    b.t += dt;
    if (b.flash > 0) b.flash -= dt;

    if (b.y < b.baseY) {
      b.y += 100 * dt;
    } else {
      b.x += b.vx * dt;
      if (b.x < 150) { b.x = 150; b.vx = Math.abs(b.vx); }
      if (b.x > 570) { b.x = 570; b.vx = -Math.abs(b.vx); }
      b.y = b.baseY + Math.sin(b.t * 1.1) * 16;
      if (p && p.alive && !G.finished) {
        b.atkCd -= dt;
        if (b.atkCd <= 0) this.bossAttack();
      }
    }
  },

  bossAttack() {
    const b = G.boss, p = G.player;
    if (!b || !p) return;
    const ph = b.bar;
    const pattern = b.pattern++ % 3;
    const base = Math.atan2(p.y - b.y, p.x - b.x);
    const spd = G.bossMeta.speed;

    if (pattern === 0) {
      const n = 5 + ph * 2, spread = 0.55 + ph * 0.08;
      for (let i = 0; i < n; i++) {
        const a = base - spread / 2 + spread * (i / (n - 1));
        fireEnemyBullet(b.x, b.y + 46, a, spd, 'fan');
      }
    } else if (pattern === 1) {
      for (let i = -1; i <= 1; i++) {
        fireEnemyBullet(b.x + i * 34, b.y + 46, base + i * 0.07, spd + 100, 'aim');
      }
    } else {
      const n = 12 + ph * 3;
      for (let i = 0; i < n; i++) {
        fireEnemyBullet(b.x, b.y, (TAU * i) / n + b.t * 0.6, 168 + ph * 18, 'ring');
      }
    }
    if (ph >= 1 && pattern !== 2) {
      fireEnemyBullet(b.x - 78, b.y + 26, Math.PI / 2 - 0.18, 250, 'fan');
      fireEnemyBullet(b.x + 78, b.y + 26, Math.PI / 2 + 0.18, 250, 'fan');
    }
    b.atkCd = G.bossMeta.cd[ph] * rand(0.78, 1.24);
    Sound.enemyShoot();
  },

  updateBullets(dt) {
    for (const b of G.bullets) b.y += b.vy * dt;
    G.bullets = G.bullets.filter(b => b.y > -50);

    for (const b of G.ebullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }
    G.ebullets = G.ebullets.filter(b => b.x > -80 && b.x < W + 80 && b.y > -80 && b.y < H + 80);
  },

  updatePickups(dt) {
    const p = G.player;
    for (const it of G.pickups) {
      if (it.dead) continue;
      it.t += dt;
      it.life -= dt;
      if (p && p.alive) {
        const dx = p.x - it.x, dy = p.y - it.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < 130) {
          it.x += (dx / d) * 270 * dt;
          it.y += (dy / d) * 270 * dt;
        } else {
          it.y += 190 * dt;
        }
        if (Math.hypot(p.x - it.x, p.y - it.y) < CFG.player.pickupR) {
          this.collect(it);
          it.dead = true;
        }
      } else {
        it.y += 190 * dt;
      }
    }
    G.pickups = G.pickups.filter(it => !it.dead && it.y < H + 50 && it.life > 0);
  },

  collect(it) {
    const p = G.player;
    if (!p) return;
    Sound.pickup();
    if (it.type === 'crystal') {
      addScore(50);
      G.crystals++;
      addText(it.x, it.y - 16, '+50', '#5dff9b');
    } else if (it.type === 'weapon') {
      if (p.power < 3) {
        p.power++;
        addText(it.x, it.y - 18, '火力 LV' + (p.power + 1), '#ffd84d');
      } else {
        activateRage();
      }
    } else if (it.type === 'rage') {
      activateRage();
    } else if (it.type === 'heal') {
      p.hp = Math.min(p.maxHp, p.hp + 30);
      addText(it.x, it.y - 18, '+30', '#5dff9b');
    } else if (it.type === 'shield') {
      p.shield = 8;
      p.shieldHits = 4;
      addText(it.x, it.y - 18, '护盾', '#5fd8ff');
    }
  },

  updateParticles(dt) {
    for (const pt of G.particles) {
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.985;
      pt.vy *= 0.985;
    }
    G.particles = G.particles.filter(pt => pt.life > 0);
  },

  updateTexts(dt) {
    for (const t of G.texts) {
      t.life -= dt;
      t.y -= 46 * dt;
    }
    G.texts = G.texts.filter(t => t.life > 0);
  },

  /* ---------------- 碰撞与伤害 ---------------- */
  handleCollisions() {
    if (G.finished) return;
    const p = G.player;

    // 玩家子弹 → 敌机 / BOSS
    for (let i = G.bullets.length - 1; i >= 0; i--) {
      const b = G.bullets[i];
      let hit = false;
      if (G.boss && G.boss.y > -30) {
        const dx = (b.x - G.boss.x) / (CFG.boss.r * 1.35);
        const dy = (b.y - G.boss.y - 8) / CFG.boss.r;
        if (dx * dx + dy * dy < 1) {
          this.damageBoss(b.dmg);
          hit = true;
        }
      }
      if (!hit) {
        for (const e of G.enemies) {
          if (e.dead) continue;
          if (Math.hypot(b.x - e.x, b.y - e.y) < e.r) {
            e.hp -= b.dmg;
            e.flash = 0.08;
            spawnSpark(b.x, b.y);
            if (e.hp <= 0) this.killEnemy(e);
            hit = true;
            break;
          }
        }
      }
      if (hit) G.bullets.splice(i, 1);
    }

    if (!p || !p.alive || G.finished) return;

    // 敌弹 → 玩家
    for (let i = G.ebullets.length - 1; i >= 0; i--) {
      const b = G.ebullets[i];
      if (!b) continue;
      if (Math.hypot(b.x - p.x, b.y - p.y) < b.r + CFG.player.hitR) {
        G.ebullets.splice(i, 1);
        this.damagePlayer(20);
        if (!p.alive) break;
      }
    }
    if (!p.alive) return;

    // 敌机撞机
    for (const e of G.enemies) {
      if (e.dead) continue;
      if (Math.hypot(e.x - p.x, e.y - p.y) < e.r * 0.8 + 18) {
        this.damagePlayer(35);
        this.killEnemy(e, false);
      }
    }

    // BOSS 撞机
    if (G.boss && Math.hypot(G.boss.x - p.x, G.boss.y - p.y) < 80) {
      this.damagePlayer(35);
    }
  },

  killEnemy(e, giveScore) {
    if (e.dead) return;
    e.dead = true;
    if (giveScore !== false) {
      G.kills++;
      addScore(e.score);
      this.maybeDrop(e);
    }
    const isFighter = e.type === 'fighter';
    spawnExplosion(e.x, e.y, isFighter ? 16 : 9, isFighter ? 1.35 : 0.95);
    Sound.explode();
  },

  maybeDrop(e) {
    if (e.type === 'fighter') {
      if (Math.random() < CFG.drop.weapon) spawnPickup('weapon', e.x, e.y);
      else if (Math.random() < CFG.drop.shield) spawnPickup('shield', e.x, e.y);
    }
    if (Math.random() < CFG.drop.crystal) spawnPickup('crystal', e.x + rand(-12, 12), e.y + rand(-8, 8));
  },

  damageBoss(dmg) {
    const b = G.boss;
    if (!b) return;
    b.hp -= dmg;
    b.flash = Math.max(b.flash, 0.06);
    if (b.hp <= 0) {
      b.bar++;
      spawnExplosion(b.x, b.y, 26, 1.5);
      Sound.bigExplode();
      G.shake = 14;
      if (b.bar >= b.bars) {
        this.bossDefeated();
        return;
      }
      b.hp = b.maxHp;
      b.flash = 0.5;
      addScore(500);
      addText(b.x, b.y - 40, '装甲破损', '#ffb0b8');
      for (const eb of G.ebullets) spawnSpark(eb.x, eb.y, '#ffe9a8');
      G.ebullets.length = 0;
      spawnPickup('weapon', b.x - 46, b.y + 20);
      spawnPickup('shield', b.x + 46, b.y + 20);
    }
  },

  bossDefeated() {
    const b = G.boss;
    if (!b) return;
    const meta = G.bossMeta || { score: 0, name: 'BOSS' };
    G.boss = null;
    G.bossMeta = null;
    G.kills++;
    G.shake = 24;
    G.ebullets.length = 0;
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * TAU, r = rand(0, 70);
      spawnExplosion(b.x + Math.cos(a) * r, b.y + Math.sin(a) * r, 18, 1.7);
    }
    Sound.bigExplode();

    if (G.mode === 'endless') {
      G.score += meta.score;
      if (G.endless) G.endless.nextWave = G.time + 2.4;
      const p = G.player;
      if (p && p.alive) {
        p.hp = Math.min(p.maxHp, p.hp + 20);
        spawnPickup('weapon', W / 2, 320);
      }
      addText(W / 2, 500, '守卫击破 +' + meta.score, '#ffd84d');
      return;
    }

    G.score += meta.score;
    G.finished = true;
    G.victory = true;
    G.endTimer = 2.2;
    addText(W / 2, 500, 'BOSS 击破', '#ffd84d');
  },

  damagePlayer(amount) {
    const p = G.player;
    if (!p || !p.alive || p.inv > 0 || G.finished) return;
    if (p.shield > 0 && p.shieldHits > 0) {
      p.shieldHits--;
      spawnSpark(p.x, p.y, '#5fd8ff');
      G.shake = Math.max(G.shake, 5);
      if (p.shieldHits <= 0) p.shield = 0;
      return;
    }
    p.hp -= amount;
    p.inv = CFG.player.invTime;
    G.flash = 0.35;
    G.shake = 12;
    Sound.hit();
    if (p.hp <= 0) {
      p.hp = 0;
      this.playerDie();
    }
  },

  playerDie() {
    const p = G.player;
    if (!p || !p.alive) return;
    p.alive = false;
    G.finished = true;
    G.victory = false;
    G.endTimer = 1.7;
    G.ebullets.length = 0;
    G.shake = 20;
    spawnExplosion(p.x, p.y, 34, 1.9);
    Sound.bigExplode();
  },

  useBomb() {
    if (!Screen.is('battle') || G.state !== 'playing' || G.finished ||
      !G.player || !G.player.alive || G.bombs <= 0) return;
    G.bombs--;
    G.shake = 18;
    G.flash = 0.22;
    Sound.bomb();
    for (const b of G.ebullets) spawnSpark(b.x, b.y, '#ffe9a8');
    G.ebullets.length = 0;
    for (const e of G.enemies) {
      if (e.dead) continue;
      e.hp -= CFG.bomb.damage;
      if (e.hp <= 0) this.killEnemy(e);
    }
    if (G.boss) this.damageBoss(CFG.bomb.damage);
    G.player.inv = Math.max(G.player.inv, CFG.bomb.invTime);
    spawnBombWave();
    addText(W / 2, 520, '必杀!', '#ffe9a8');
  },

  /* ---------------- 绘制 ---------------- */
  render() {
    const bg = BG[G.level ? G.level.chapterIndex : 0];
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(bg, 0, 0);
    Stars.draw();

    const sh = G.shake;
    ctx.save();
    if (sh > 0) ctx.translate(rand(-sh, sh) * 0.55, rand(-sh, sh) * 0.55);

    drawPickups();
    drawEnemies();
    drawBoss();
    drawPlayer();
    drawBullets();
    drawEnemyBullets();
    drawParticles();
    drawTexts();

    ctx.restore();

    drawHUD();
    drawOverlayEffects();
  },

  renderMenu() {
    const bg = BG[0];
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(bg, 0, 0);
    Stars.draw();

    const t = G.visual;
    const ty = 800 + Math.sin(t * 1.6) * 12;
    const ship = shipById(Save.data.ships.equipped);
    // 氛围光环
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(W / 2, ty + 10, 20, W / 2, ty + 10, 190);
    g.addColorStop(0, 'rgba(80,200,255,0.20)');
    g.addColorStop(1, 'rgba(0,80,160,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, ty - 190, W, 420);
    ctx.restore();
    drawPlayerShip(W / 2, ty, t, 1, ship, 1.5);

    // 尾迹
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      const yy = ty + 90 + i * 40 + ((t * 90) % 40);
      ctx.globalAlpha = 0.14 - i * 0.02;
      ctx.fillStyle = '#5fd8ff';
      roundRect(W / 2 - 24 + i * 2, yy, 48 - i * 4, 10, 5);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
};

/* =========================================================
   生成器
   ========================================================= */
function spawnScout(x, y) {
  const c = CFG.enemy.scout;
  const hp = c.hp * (G.level ? G.level.scale : 1);
  G.enemies.push({
    type: 'scout', x, y, baseX: x, r: c.r,
    hp, maxHp: hp, vy: c.vy, sway: c.sway,
    phase: Math.random() * TAU, t: 0, flash: 0,
    shootCd: 0.9 + Math.random() * 0.9, score: c.score,
    dead: false
  });
}
function spawnScoutLine(n) {
  const gap = 96;
  for (let i = 0; i < n; i++) {
    spawnScout(W / 2 + (i - (n - 1) / 2) * gap, -60 - Math.random() * 20);
  }
}
function spawnScoutV(n) {
  const gap = 86, depth = 46;
  for (let i = 0; i < n; i++) {
    spawnScout(W / 2 + (i - (n - 1) / 2) * gap, -60 - Math.abs(i - (n - 1) / 2) * depth);
  }
}
function spawnFighter(x, targetY) {
  const c = CFG.enemy.fighter;
  const hp = c.hp * (G.level ? G.level.scale : 1);
  G.enemies.push({
    type: 'fighter', x, baseX: x, y: -70, targetY, r: c.r,
    hp, maxHp: hp, t: 0, flash: 0,
    phase: Math.random() * TAU, shootCd: 1.3 + Math.random() * 0.5,
    score: c.score, dead: false
  });
}
function spawnFighterGroup(n) {
  const xs = n <= 1 ? [W / 2] : n === 2 ? [160, 560] : [130, 360, 590];
  for (let i = 0; i < Math.min(n, xs.length); i++) {
    spawnFighter(xs[i], 240 + (i % 2) * 50);
  }
}
function spawnDivers(n) {
  const c = CFG.enemy.diver;
  const hp = c.hp * (G.level ? G.level.scale : 1);
  for (let i = 0; i < n; i++) {
    const fromLeft = i % 2 === 0;
    G.enemies.push({
      type: 'diver',
      x: fromLeft ? -40 : W + 40,
      y: -60 - i * 52,
      vx: (fromLeft ? 1 : -1) * rand(130, 175),
      vy: rand(210, 250),
      r: c.r, hp, maxHp: hp,
      t: 0, flash: 0, score: c.score, dead: false
    });
  }
}
function spawnBoss() {
  const lb = G.bossMeta;
  if (!lb) return;
  G.warn = 0;
  G.boss = {
    x: W / 2, y: -150, baseY: 210,
    bar: 0, bars: lb.bars,
    hp: lb.hpPerBar, maxHp: lb.hpPerBar,
    r: CFG.boss.r, t: 0, vx: 100,
    atkCd: 2.4, pattern: 0, flash: 0
  };
  addText(W / 2, 560, lb.name, '#ffb0b8');
}
function spawnPickup(type, x, y) {
  G.pickups.push({ type, x, y, r: 20, t: Math.random() * TAU, life: 12, dead: false });
}
function fireEnemyBullet(x, y, angle, speed, kind) {
  if (G.ebullets.length > 420) return;
  G.ebullets.push({
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    r: kind === 'ring' ? 9 : 8,
    kind
  });
}
function aimShot(e, speed) {
  const p = G.player;
  if (!p || !p.alive) return;
  const a = Math.atan2(p.y - e.y, p.x - e.x);
  fireEnemyBullet(e.x, e.y + 10, a, speed, 'aim');
  Sound.enemyShoot();
}
function fanShot(e, count, spread, speed) {
  const p = G.player;
  if (!p || !p.alive) return;
  const base = Math.atan2(p.y - e.y, p.x - e.x);
  for (let i = 0; i < count; i++) {
    const a = base - spread / 2 + spread * (i / (count - 1));
    fireEnemyBullet(e.x, e.y + 10, a, speed, 'fan');
  }
  Sound.enemyShoot();
}

/* =========================================================
   特效与计分
   ========================================================= */
function particleScale() {
  const q = Save.data.settings.quality;
  return (QUALITY[q] || QUALITY.high).particle;
}
function addScore(base) {
  G.score += Math.round(base * (G.rage > 0 ? 2 : 1));
}
function spawnParticles(x, y, count, color, life, sMin, sMax) {
  const n = Math.max(1, Math.round(count * particleScale()));
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, sp = rand(sMin, sMax);
    G.particles.push({
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: life * rand(0.7, 1.3),
      maxLife: life,
      size: rand(2, 4.5),
      color
    });
  }
}
function spawnSpark(x, y, color) {
  spawnParticles(x, y, 3, color || '#ffe9a8', 0.16, 40, 160);
}
function spawnExplosion(x, y, count, scale) {
  const colors = ['#fff3b0', '#ffb347', '#ff6b4a', '#ff2d55'];
  const n = Math.max(2, Math.round(count * particleScale()));
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, sp = rand(40, 300) * scale;
    G.particles.push({
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: rand(0.4, 0.9) * scale,
      maxLife: 0.9 * scale,
      size: rand(2.5, 7) * scale,
      color: colors[(Math.random() * colors.length) | 0]
    });
  }
}
function spawnBombWave() {
  const p = G.player;
  if (!p) return;
  for (let i = 0; i < 38; i++) {
    const a = (TAU * i) / 38;
    G.particles.push({
      x: p.x, y: p.y,
      vx: Math.cos(a) * rand(300, 620),
      vy: Math.sin(a) * rand(300, 620),
      life: 0.55, maxLife: 0.55,
      size: rand(3, 7), color: i % 3 === 0 ? '#ffffff' : '#8ff4ff'
    });
  }
}
function addText(x, y, text, color) {
  G.texts.push({ x, y, text, color: color || '#ffffff', life: 0.95, maxLife: 0.95 });
}
function activateRage() {
  if (!G.player) return;
  G.rage = CFG.player.rageDuration;
  Sound.rage();
  addText(G.player.x, G.player.y - 80, '暴走!', '#ffd84d');
  G.shake = Math.max(G.shake, 6);
}

/* =========================================================
   战斗绘制
   ========================================================= */
function drawPlayer() {
  const p = G.player;
  if (!p) return;
  let alpha = 1;
  if (p.inv > 0) alpha = 0.35 + 0.65 * Math.abs(Math.sin(G.visual * 28));
  drawPlayerShip(p.x, p.y, G.visual, alpha, G.ship, 1);
  if (p.shield > 0 && p.shieldHits > 0) {
    ctx.save();
    ctx.translate(p.x, p.y);
    const a = 0.55 + Math.sin(G.visual * 8) * 0.15;
    ctx.strokeStyle = 'rgba(95,216,255,' + a + ')';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 0, 42 + Math.sin(G.visual * 6) * 2.5, 0, TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(180,245,255,' + (a * 0.5) + ')';
    ctx.beginPath(); ctx.arc(0, 0, 48, 0, TAU); ctx.stroke();
    ctx.restore();
  }
}

function drawEnemies() {
  for (const e of G.enemies) {
    if (e.dead || e.y < -90) continue;
    if (e.type === 'scout') drawScout(e);
    else if (e.type === 'fighter') drawFighter(e);
    else if (e.type === 'diver') drawDiver(e);
  }
}

function drawScout(e) {
  ctx.save();
  ctx.translate(e.x, e.y);
  const g = ctx.createLinearGradient(0, -18, 0, 24);
  g.addColorStop(0, '#ff9d6b');
  g.addColorStop(0.55, '#e0424f');
  g.addColorStop(1, '#8c1a2a');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, 24);
  ctx.lineTo(-14, 6); ctx.lineTo(-24, -10); ctx.lineTo(-8, -6);
  ctx.lineTo(0, -18);
  ctx.lineTo(8, -6); ctx.lineTo(24, -10); ctx.lineTo(14, 6);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,238,170,0.95)';
  ctx.beginPath(); ctx.arc(0, 3, 4, 0, TAU); ctx.fill();
  if (e.flash > 0) {
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(0, 2, 20, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function drawFighter(e) {
  ctx.save();
  ctx.translate(e.x, e.y);
  const g = ctx.createLinearGradient(0, -28, 0, 28);
  g.addColorStop(0, '#d8b6ff');
  g.addColorStop(0.45, '#8b4bc4');
  g.addColorStop(1, '#3a1a56');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, -30);
  ctx.lineTo(16, -12); ctx.lineTo(40, -2); ctx.lineTo(30, 18);
  ctx.lineTo(12, 10); ctx.lineTo(0, 26);
  ctx.lineTo(-12, 10); ctx.lineTo(-30, 18); ctx.lineTo(-40, -2); ctx.lineTo(-16, -12);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,225,150,0.95)';
  ctx.beginPath(); ctx.arc(0, -4, 5.5, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(120,240,255,0.75)';
  ctx.beginPath(); ctx.arc(-18, 14, 4, 0, TAU); ctx.arc(18, 14, 4, 0, TAU); ctx.fill();
  if (e.flash > 0) {
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(0, 0, 30, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function drawDiver(e) {
  const ang = Math.atan2(e.vy, e.vx) - Math.PI / 2;
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(ang);
  const g = ctx.createLinearGradient(0, -22, 0, 22);
  g.addColorStop(0, '#ffd08a');
  g.addColorStop(0.5, '#ff8b3d');
  g.addColorStop(1, '#a83218');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, 24); ctx.lineTo(-9, -4); ctx.lineTo(0, -22); ctx.lineTo(9, -4);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath(); ctx.arc(0, 4, 2.6, 0, TAU); ctx.fill();
  if (e.flash > 0) {
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(0, 0, 22, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function drawBoss() {
  const b = G.boss;
  if (!b || b.y < -200) return;
  const variant = G.bossMeta ? G.bossMeta.variant : 0;
  const palettes = [
    ['#ffb347', '#ff6b5c', '#ff5cc8'],
    ['#ffd36b', '#ff8a4a', '#ff4d6b']
  ];
  const accent = palettes[variant][b.bar] || '#ff6b5c';

  ctx.save();
  ctx.translate(b.x, b.y);

  // 外翼
  ctx.fillStyle = variant ? '#2a1410' : '#38101c';
  ctx.beginPath();
  ctx.moveTo(-138, 12); ctx.lineTo(-72, -44); ctx.lineTo(-40, 16);
  ctx.lineTo(0, 44); ctx.lineTo(40, 16); ctx.lineTo(72, -44); ctx.lineTo(138, 12);
  ctx.lineTo(86, 74); ctx.lineTo(0, 96); ctx.lineTo(-86, 74);
  ctx.closePath(); ctx.fill();

  // 主装甲
  const g = ctx.createLinearGradient(0, -70, 0, 96);
  g.addColorStop(0, '#ffe0cc');
  g.addColorStop(0.38, accent);
  g.addColorStop(1, variant ? '#40150c' : '#480f22');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, -66);
  ctx.lineTo(48, -22); ctx.lineTo(36, 62); ctx.lineTo(0, 88);
  ctx.lineTo(-36, 62); ctx.lineTo(-48, -22);
  ctx.closePath(); ctx.fill();

  // 炮口
  ctx.fillStyle = '#24080f';
  ctx.fillRect(-96, -6, 28, 54);
  ctx.fillRect(68, -6, 28, 54);
  ctx.fillStyle = accent;
  ctx.beginPath(); ctx.arc(-82, 48, 9, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(82, 48, 9, 0, TAU); ctx.fill();

  // 能量核心
  const pulse = 1 + Math.sin(b.t * 5) * 0.1;
  const cg = ctx.createRadialGradient(0, 8, 2, 0, 8, 30 * pulse);
  cg.addColorStop(0, '#ffffff');
  cg.addColorStop(0.35, '#ffe9a8');
  cg.addColorStop(0.7, accent);
  cg.addColorStop(1, 'rgba(255,60,120,0)');
  ctx.fillStyle = cg;
  ctx.beginPath(); ctx.arc(0, 8, 30 * pulse, 0, TAU); ctx.fill();

  // 核心旋转环
  ctx.save();
  ctx.translate(0, 8);
  ctx.rotate(b.t * 1.6);
  ctx.strokeStyle = 'rgba(255,230,210,0.7)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(0, 0, 34, (TAU * i) / 3, (TAU * i) / 3 + 0.9);
    ctx.stroke();
  }
  ctx.restore();

  if (b.flash > 0) {
    ctx.globalAlpha = Math.min(0.75, b.flash * 1.6);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(0, 12, 92, 70, 0, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function drawBullets() {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const b of G.bullets) {
    ctx.drawImage(SPR.pBullet, b.x - 8, b.y - 20, 16, 40);
  }
  ctx.restore();
}

function drawEnemyBullets() {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const b of G.ebullets) {
    let spr = SPR.eOrange;
    if (b.kind === 'ring') spr = SPR.ePink;
    else if (b.kind === 'aim') spr = SPR.eRed;
    const s = b.r * 4;
    ctx.drawImage(spr, b.x - s / 2, b.y - s / 2, s, s);
  }
  ctx.restore();
}

function drawPickups() {
  for (const it of G.pickups) {
    const pulse = 1 + Math.sin(G.visual * 6 + it.t) * 0.1;
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.scale(pulse, pulse);
    if (it.type === 'crystal') {
      ctx.shadowColor = '#5dff9b'; ctx.shadowBlur = 18;
      ctx.rotate(it.t * 1.4);
      const g = ctx.createLinearGradient(-14, -14, 14, 14);
      g.addColorStop(0, '#d6ffe4'); g.addColorStop(0.5, '#5dff9b'); g.addColorStop(1, '#0d8a4a');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, -16); ctx.lineTo(13, 0); ctx.lineTo(0, 16); ctx.lineTo(-13, 0);
      ctx.closePath(); ctx.fill();
    } else if (it.type === 'weapon') {
      ctx.shadowColor = '#ffd84d'; ctx.shadowBlur = 18;
      ctx.fillStyle = '#ffd84d';
      ctx.beginPath();
      ctx.moveTo(0, -17); ctx.lineTo(11, -3); ctx.lineTo(4, -3); ctx.lineTo(4, 15);
      ctx.lineTo(-4, 15); ctx.lineTo(-4, -3); ctx.lineTo(-11, -3);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5; ctx.stroke();
    } else if (it.type === 'rage') {
      ctx.shadowColor = '#ffd84d'; ctx.shadowBlur = 20;
      ctx.fillStyle = '#ffd84d';
      ctx.beginPath(); ctx.arc(0, 0, 15, 0, TAU); ctx.fill();
      ctx.fillStyle = '#3a2600';
      ctx.font = 'bold 18px "Bahnschrift", monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('S', 0, 1);
    } else if (it.type === 'heal') {
      ctx.shadowColor = '#5dff9b'; ctx.shadowBlur = 18;
      ctx.fillStyle = '#5dff9b';
      ctx.fillRect(-5, -16, 10, 32);
      ctx.fillRect(-16, -5, 32, 10);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5;
      ctx.strokeRect(-5, -16, 10, 32);
    } else if (it.type === 'shield') {
      ctx.shadowColor = '#5fd8ff'; ctx.shadowBlur = 20;
      ctx.strokeStyle = '#9ff4ff'; ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (TAU * i) / 6 - Math.PI / 2;
        const x = Math.cos(a) * 15, y = Math.sin(a) * 15;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath(); ctx.stroke();
      ctx.fillStyle = 'rgba(50,170,230,0.35)';
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.shadowBlur = 0;
}

function drawParticles() {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const pt of G.particles) {
    const a = clamp(pt.life / pt.maxLife, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size * a + 0.5, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawTexts() {
  ctx.save();
  ctx.textAlign = 'center';
  for (const t of G.texts) {
    const a = clamp(t.life / t.maxLife, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = t.color;
    ctx.font = 'bold 20px "Noto Sans SC", "Microsoft YaHei", sans-serif';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 6;
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.restore();
  ctx.shadowBlur = 0;
}

/* =========================================================
   HUD 与覆盖层
   ========================================================= */
function drawHUD() {
  const p = G.player;
  if (!p) return;
  const maxHp = p.maxHp || CFG.player.maxHp;

  // 装甲
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#7fd7ff';
  ctx.font = '13px "Noto Sans SC", "Microsoft YaHei", sans-serif';
  ctx.fillText('装甲', 24, 20);

  ctx.fillStyle = 'rgba(10,22,38,0.85)';
  roundRect(24, 28, 280, 22, 6); ctx.fill();
  ctx.strokeStyle = 'rgba(70,150,200,0.75)';
  ctx.lineWidth = 1.5;
  roundRect(24, 28, 280, 22, 6); ctx.stroke();

  const ratio = clamp(p.hp / maxHp, 0, 1);
  if (ratio > 0) {
    ctx.fillStyle = ratio > 0.55 ? '#5dff9b' : (ratio > 0.28 ? '#ffd84d' : '#ff4d5a');
    roundRect(27, 31, 274 * ratio, 16, 5); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 5; i++) {
    const x = 24 + (280 * i) / 5;
    ctx.beginPath(); ctx.moveTo(x, 29); ctx.lineTo(x, 49); ctx.stroke();
  }
  ctx.fillStyle = '#cfe7f5';
  ctx.font = 'bold 13px "Bahnschrift", monospace';
  ctx.textAlign = 'right';
  ctx.fillText(Math.ceil(p.hp) + ' / ' + maxHp, 296, 45);

  // 分数
  ctx.fillStyle = '#6fb6d8';
  ctx.font = '12px "Bahnschrift", monospace';
  ctx.fillText('SCORE', 696, 26);
  ctx.fillStyle = '#eafcff';
  ctx.font = 'bold 30px "Bahnschrift", "Courier New", monospace';
  ctx.fillText(String(G.score).padStart(7, '0'), 696, 54);
  ctx.fillStyle = '#5dff9b';
  ctx.font = '14px "Bahnschrift", monospace';
  ctx.fillText('◇ ' + G.crystals, 696, 78);

  if (G.mode === 'endless') {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#9fe8ff';
    ctx.font = 'bold 16px "Noto Sans SC", "Microsoft YaHei", sans-serif';
    ctx.fillText('无尽挑战 · 第 ' + (G.endless ? G.endless.wave : 1) + ' 波', 24, 76);
  }

  // BOSS 血条
  if (G.boss) drawBossBar(G.boss);

  // 必杀按钮
  drawBombButton();

  // 暂停 / 静音
  drawCircleButton(PAUSE_BTN.x, PAUSE_BTN.y, PAUSE_BTN.r, 'rgba(8,24,40,0.75)', 'rgba(95,216,255,0.6)');
  ctx.fillStyle = '#bfe9ff';
  ctx.fillRect(PAUSE_BTN.x - 8, PAUSE_BTN.y - 10, 5, 20);
  ctx.fillRect(PAUSE_BTN.x + 3, PAUSE_BTN.y - 10, 5, 20);

  drawCircleButton(MUTE_BTN.x, MUTE_BTN.y, MUTE_BTN.r, 'rgba(8,24,40,0.75)', 'rgba(95,216,255,0.45)');
  drawMuteIcon();

  // 火力 / 暴走
  drawPowerMeter();
}

function drawBossBar(b) {
  const x0 = 120, y0 = 90, totalW = 480, h = 16, gap = 6;
  const segW = (totalW - gap * 2) / 3;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd9c2';
  ctx.font = 'bold 18px "Noto Sans SC", "Microsoft YaHei", sans-serif';
  ctx.fillText(G.bossMeta ? G.bossMeta.name : 'BOSS', W / 2, 82);

  for (let i = 0; i < 3; i++) {
    const x = x0 + i * (segW + gap);
    ctx.fillStyle = 'rgba(10,14,26,0.9)';
    roundRect(x, y0, segW, h, 4); ctx.fill();
    ctx.strokeStyle = 'rgba(255,120,120,0.4)';
    ctx.lineWidth = 1;
    roundRect(x, y0, segW, h, 4); ctx.stroke();

    let ratio = 0;
    if (i > b.bar) ratio = 1;
    else if (i === b.bar) ratio = clamp(b.hp / b.maxHp, 0, 1);

    if (ratio > 0) {
      const g = ctx.createLinearGradient(x, y0, x, y0 + h);
      g.addColorStop(0, '#ff8a6b');
      g.addColorStop(1, '#ff2d55');
      ctx.fillStyle = g;
      roundRect(x + 2, y0 + 2, (segW - 4) * ratio, h - 4, 3); ctx.fill();
    }
    if (b.flash > 0 && i === b.bar) {
      ctx.globalAlpha = Math.min(0.8, b.flash);
      ctx.fillStyle = '#ffffff';
      roundRect(x, y0, segW, h, 4); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

function drawBombButton() {
  const disabled = G.bombs <= 0;
  drawCircleButton(BOMB.x, BOMB.y, BOMB.r,
    disabled ? 'rgba(16,26,40,0.7)' : 'rgba(10,36,64,0.9)',
    disabled ? 'rgba(90,120,140,0.4)' : 'rgba(95,216,255,0.85)');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = disabled ? 'rgba(140,170,190,0.5)' : '#dff6ff';
  ctx.font = 'bold 22px "Noto Sans SC", "Microsoft YaHei", sans-serif';
  ctx.fillText('必杀', BOMB.x, BOMB.y + 2);

  const bx = BOMB.x + 40, by = BOMB.y - 40;
  ctx.beginPath(); ctx.arc(bx, by, 17, 0, TAU);
  ctx.fillStyle = disabled ? '#3a4652' : '#ffb347'; ctx.fill();
  ctx.fillStyle = disabled ? '#8fa2b2' : '#2a1600';
  ctx.font = 'bold 16px "Bahnschrift", monospace';
  ctx.fillText(String(G.bombs), bx, by + 1);
  ctx.textBaseline = 'alphabetic';
}

function drawCircleButton(x, y, r, fill, stroke) {
  const g = ctx.createRadialGradient(x, y - r * 0.4, r * 0.2, x, y, r);
  g.addColorStop(0, fill);
  g.addColorStop(1, 'rgba(2,8,16,0.9)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, r - 1, 0, TAU); ctx.stroke();
}

function drawMuteIcon() {
  ctx.save();
  ctx.translate(MUTE_BTN.x, MUTE_BTN.y);
  ctx.fillStyle = Sound.enabled ? '#bfe9ff' : 'rgba(150,180,200,0.55)';
  ctx.beginPath();
  ctx.moveTo(-8, -4); ctx.lineTo(-3, -4); ctx.lineTo(3, -9); ctx.lineTo(3, 9); ctx.lineTo(-3, 4); ctx.lineTo(-8, 4);
  ctx.closePath(); ctx.fill();
  if (Sound.enabled) {
    ctx.strokeStyle = '#bfe9ff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(3, 0, 7, -0.7, 0.7); ctx.stroke();
    ctx.beginPath(); ctx.arc(3, 0, 11, -0.7, 0.7); ctx.stroke();
  } else {
    ctx.strokeStyle = 'rgba(255,120,140,0.85)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-9, -9); ctx.lineTo(9, 9); ctx.stroke();
  }
  ctx.restore();
}

function drawPowerMeter() {
  const p = G.player;
  const rage = G.rage > 0;
  const pips = 4;
  const w = 38, h = 7, gap = 6;
  const totalW = pips * w + (pips - 1) * gap;
  const x0 = W / 2 - totalW / 2;
  for (let i = 0; i < pips; i++) {
    const on = rage || i <= p.power;
    ctx.fillStyle = on ? (rage ? '#ffd84d' : '#5fd8ff') : 'rgba(60,90,120,0.5)';
    roundRect(x0 + i * (w + gap), 1158, w, h, 3); ctx.fill();
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = rage ? '#ffd84d' : '#9fe8ff';
  ctx.font = 'bold 16px "Noto Sans SC", "Microsoft YaHei", sans-serif';
  ctx.fillText(rage ? '暴走 ' + G.rage.toFixed(1) + 's' : '火力 LV' + (p.power + 1), W / 2, 1192);
}

function drawOverlayEffects() {
  // 受击红晕
  if (G.flash > 0) {
    const g = ctx.createRadialGradient(W / 2, H / 2, 220, W / 2, H / 2, 740);
    g.addColorStop(0, 'rgba(255,40,60,0)');
    g.addColorStop(1, 'rgba(255,40,60,' + (0.45 * Math.min(1, G.flash * 2.4)) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // BOSS 警告
  if (G.warn > 0) {
    const blink = 0.5 + 0.5 * Math.sin(G.visual * 18);
    ctx.save();
    ctx.globalAlpha = 0.4 + 0.6 * blink;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff4d5a';
    ctx.font = 'bold 54px "Bahnschrift", "Courier New", monospace';
    ctx.fillText('WARNING', W / 2, 370);
    ctx.fillStyle = '#ffb0b8';
    ctx.font = '18px "Noto Sans SC", "Microsoft YaHei", sans-serif';
    ctx.fillText('强敌「' + (G.bossMeta ? G.bossMeta.name : '未知') + '」接近', W / 2, 404);
    ctx.restore();

    const g = ctx.createLinearGradient(0, 0, 0, 90);
    g.addColorStop(0, 'rgba(255,40,60,0.35)');
    g.addColorStop(1, 'rgba(255,40,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, 90);
  }

  // 开场横幅（仅闯关模式）
  if (G.banner > 0 && G.level && G.mode === 'story') {
    const a = clamp(Math.min((2.6 - G.banner) * 2.4, G.banner * 1.4), 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(120,220,255,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(170, 430); ctx.lineTo(550, 430); ctx.stroke();
    ctx.fillStyle = '#eafcff';
    ctx.font = 'bold 44px "Noto Sans SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(G.level.chapter + ' · 第' + G.level.no + '关', W / 2, 410);
    ctx.fillStyle = '#7fd4ff';
    ctx.font = '20px "Noto Sans SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(G.level.name + ' · 拖动移动 · 自动射击', W / 2, 466);
    ctx.restore();
  }
}

/* =========================================================
   战斗输入
   ========================================================= */
canvas.addEventListener('pointerdown', (e) => {
  Sound.init();
  Sound.resume();
  if (!Screen.is('battle') || G.state !== 'playing') return;
  const p = toLogical(e);

  if (Math.hypot(p.x - BOMB.x, p.y - BOMB.y) <= BOMB.r) { Battle.useBomb(); return; }
  if (Math.hypot(p.x - PAUSE_BTN.x, p.y - PAUSE_BTN.y) <= PAUSE_BTN.r) { Battle.pause(); return; }
  if (Math.hypot(p.x - MUTE_BTN.x, p.y - MUTE_BTN.y) <= MUTE_BTN.r) { App.toggleMute(); return; }

  if (!G.player || !G.player.alive || G.finished) return;
  input.dragId = e.pointerId;
  input.sx = p.x; input.sy = p.y;
  input.px = G.player.x; input.py = G.player.y;
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  e.preventDefault();
}, { passive: false });

canvas.addEventListener('pointermove', (e) => {
  if (!Screen.is('battle') || e.pointerId !== input.dragId || !G.player) return;
  const p = toLogical(e);
  G.player.x = clamp(input.px + (p.x - input.sx), 34, W - 34);
  G.player.y = clamp(input.py + (p.y - input.sy), 110, H - 80);
  e.preventDefault();
}, { passive: false });

function endDrag(e) {
  if (e.pointerId === input.dragId) input.dragId = null;
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('pointerleave', (e) => {
  if (e.pointerId === input.dragId && e.buttons === 0) input.dragId = null;
});

window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (Screen.is('battle')) {
    keys.add(e.code);
    if (e.code === 'Space' && !e.repeat) Battle.useBomb();
    if ((e.code === 'KeyP' || e.code === 'Escape') && !e.repeat) {
      if (G.state === 'playing') Battle.pause();
      else if (G.state === 'paused') Battle.resume();
    }
  } else if (Screen.is('pause')) {
    if ((e.code === 'KeyP' || e.code === 'Escape') && !e.repeat) Battle.resume();
  }
}, { passive: false });

window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
