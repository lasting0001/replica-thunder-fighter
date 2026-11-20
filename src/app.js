'use strict';
/* =========================================================
   应用层：屏幕导航、星图、仓库、设置、结算、主循环
   ========================================================= */
const $ = (id) => document.getElementById(id);

const App = {
  chapter: 0,
  selected: 0,
  lastResult: null,
  toastTimer: 0,

  /* ---------------- 初始化 ---------------- */
  init() {
    Save.load();
    // 低端设备自动降画质（仅极低配置触发）
    const cores = navigator.hardwareConcurrency || 8;
    const mem = navigator.deviceMemory || 4;
    if (Save.data.settings.quality === 'high' && (cores <= 2 || mem <= 2)) {
      Save.data.settings.quality = 'low';
    }
    Sound.enabled = !Save.data.settings.muted;
    Sound.musicVolume = Save.data.settings.music / 100;
    Sound.sfxVolume = Save.data.settings.sfx / 100;
    Stars.init();
    Battle.onEnd = (win) => this.handleBattleEnd(win);

    this.bindEvents();
    this.buildShipList();
    this.selected = Math.min(Save.data.progress.unlocked - 1, LEVELS.length - 1);
    this.chapter = this.selected >= 8 ? 1 : 0;
    this.refreshAll();
    Screen.show('title');
    G.state = 'menu';
    requestAnimationFrame((t) => this.frame(t));
  },

  refreshAll() {
    this.refreshResources();
    this.refreshHome();
    this.renderMap();
    this.refreshSettings();
  },

  refreshResources() {
    $('homeCoins').textContent = Save.data.coins;
    $('homeShards').textContent = Save.data.shards;
    $('mapShards').textContent = Save.data.shards;
    $('hangarShards').textContent = Save.data.shards;
    $('titleBest').textContent = Save.data.bestScore;
    $('homeBest').textContent = Save.data.bestScore;
  },

  refreshHome() {
    const no = Math.min(Save.data.progress.unlocked, LEVELS.length);
    const lv = LEVELS[no - 1];
    $('storyProgress').textContent = lv.chapter + ' · 第 ' + lv.no + ' 关';
    const ship = shipById(Save.data.ships.equipped);
    const p = getShipProgress(ship.id);
    $('hangarShipName').textContent = ship.name + ' LV' + p.level;
    const e = Save.data.endless;
    $('endlessDesc').textContent = e.bestWave > 0
      ? '最高第 ' + e.bestWave + ' 波 · ' + e.bestScore + ' 分'
      : '无限波次 · 每 5 波守卫';
  },

  /* ---------------- 导航 ---------------- */
  goTitle() {
    G.state = 'menu';
    Screen.show('title');
  },

  goHome() {
    G.state = 'menu';
    this.refreshResources();
    this.refreshHome();
    Screen.show('home');
  },

  goMap(chapter) {
    G.state = 'menu';
    if (chapter !== undefined) this.chapter = chapter;
    else this.chapter = this.selected >= 8 ? 1 : 0;
    this.selected = clamp(this.selected, this.chapter * 8, this.chapter * 8 + 7);
    this.renderMap();
    Screen.show('map');
  },

  goHangar() {
    G.state = 'menu';
    this.buildShipList();
    Screen.show('hangar');
  },

  goSettings() {
    G.state = 'menu';
    this.refreshSettings();
    Screen.show('settings');
  },

  /* ---------------- 星图 ---------------- */
  renderMap() {
    const grid = $('levelGrid');
    const from = this.chapter * 8;
    grid.innerHTML = '';
    for (let i = from; i < from + 8; i++) {
      const lv = LEVELS[i];
      const btn = document.createElement('button');
      btn.className = 'lvl' + (lv.isBoss ? ' boss' : '');
      if (lv.no > Save.data.progress.unlocked) btn.classList.add('locked');
      if (lv.no <= Save.data.progress.cleared) btn.classList.add('cleared');
      if (i === this.selected) btn.classList.add('sel');
      btn.innerHTML = '<span class="no">' + String(lv.no).padStart(2, '0') + '</span>' +
        '<span class="nm">' + lv.name + '</span>';
      btn.addEventListener('click', () => this.selectLevel(i));
      grid.appendChild(btn);
    }
    document.querySelectorAll('.chapter-tab').forEach((tab, idx) => {
      tab.classList.toggle('active', idx === this.chapter);
    });
    this.refreshDetail();
  },

  selectLevel(i) {
    const lv = LEVELS[i];
    if (lv.no > Save.data.progress.unlocked) {
      this.toast('通关上一关后解锁');
      return;
    }
    this.selected = i;
    this.renderMap();
  },

  refreshDetail() {
    const lv = LEVELS[this.selected];
    const shipId = Save.data.ships.equipped;
    const power = getShipStats(shipId).power;
    const locked = lv.no > Save.data.progress.unlocked;
    const cleared = lv.no <= Save.data.progress.cleared;

    $('ldChapter').textContent = lv.chapter + ' · 第' + lv.no + '关';
    $('ldName').textContent = lv.name;
    $('ldState').textContent = locked ? '未解锁' : (cleared ? '已通关' : '未通关');
    $('ldPower').textContent = lv.recommended;
    const myPower = $('ldMyPower');
    myPower.textContent = power;
    myPower.classList.toggle('warn', power < lv.recommended);
    $('ldBoss').textContent = lv.boss ? lv.boss.name : '无';
    $('ldReward').textContent = '金币 ' + lv.reward.coins + ' / 残骸 ' + lv.reward.shards;
    const d = lv.drops;
    $('ldDrops').textContent = '武器 ×' + d.weapon + ' · 护盾 ×' + d.shield +
      ' · 暴走 ×' + d.rage + ' · 回血 ×' + d.heal;

    const tip = $('ldTip');
    if (locked) {
      tip.textContent = '尚未解锁，请先通关第 ' + (lv.no - 1) + ' 关。';
    } else if (power < lv.recommended) {
      tip.textContent = '战力低于推荐值，可前往仓库强化战机。';
    } else {
      tip.textContent = '';
    }
    $('btnLaunch').disabled = locked;
    $('btnLaunch').textContent = cleared ? '再次出击' : '出击';
  },

  /* ---------------- 仓库 ---------------- */
  buildShipList() {
    const list = $('shipList');
    list.innerHTML = '';
    const equipped = Save.data.ships.equipped;
    for (const s of SHIPS) {
      const p = getShipProgress(s.id);
      const st = getShipStats(s.id);
      const card = document.createElement('div');
      card.className = 'ship-card' + (s.id === equipped ? ' equipped' : '');

      const bars = [
        ['攻击', s.stats.atk],
        ['装甲', s.stats.hp],
        ['机动', s.stats.spd]
      ].map(([lb, v]) =>
        '<div class="stat-row"><span class="lb">' + lb + '</span>' +
        '<span class="stat-bar"><i style="width:' + (v * 20) + '%"></i></span>' +
        '<b>' + v + '</b></div>'
      ).join('');

      const stars = '★'.repeat(p.star) + '☆'.repeat(SHIP_PROG.maxStar - p.star);
      const maxed = p.level >= p.maxLevel;
      const canAdv = maxed && p.star < SHIP_PROG.maxStar;
      const upCost = SHIP_PROG.upgradeCost(p.level, p.star);
      const advCost = SHIP_PROG.advanceCost(p.star);

      card.innerHTML =
        '<div class="sc-head"><span class="sc-name">' + s.name + '</span>' +
        '<span class="sc-tag">' + (s.id === equipped ? '出战中' : s.code) + '</span></div>' +
        '<div class="sc-desc">' + s.desc + '</div>' +
        '<div class="sc-meta">' +
        '<span class="lv">LV ' + p.level + ' / ' + p.maxLevel + '</span>' +
        '<span class="stars">' + stars + '</span>' +
        '<span class="pw">战力 ' + st.power + '</span>' +
        '</div>' +
        bars +
        '<div class="cost-note"><span>强化 +2% 攻击 / 生命</span>' +
        '<span>需残骸 <b>' + upCost + '</b></span></div>' +
        '<div class="sc-actions">' +
        '<button class="btn small" data-up="' + s.id + '"' + (maxed ? ' disabled' : '') + '>强化</button>' +
        '<button class="btn small ' + (canAdv ? '' : 'ghost') + '" data-adv="' + s.id + '"' +
        (canAdv ? '' : ' disabled') + '>进阶 ' + advCost + '</button>' +
        '<button class="btn small ' + (s.id === equipped ? 'ghost' : '') + '" data-ship="' + s.id + '"' +
        (s.id === equipped ? ' disabled' : '') + '>' +
        (s.id === equipped ? '当前装备' : '设为出战') + '</button>' +
        '</div>';

      list.appendChild(card);
    }
    list.querySelectorAll('[data-ship]').forEach((btn) => {
      btn.addEventListener('click', () => this.equipShip(btn.dataset.ship));
    });
    list.querySelectorAll('[data-up]').forEach((btn) => {
      btn.addEventListener('click', () => this.upgradeShip(btn.dataset.up));
    });
    list.querySelectorAll('[data-adv]').forEach((btn) => {
      btn.addEventListener('click', () => this.advanceShip(btn.dataset.adv));
    });
  },

  equipShip(id) {
    Save.data.ships.equipped = shipById(id).id;
    Save.save();
    this.buildShipList();
    this.refreshHome();
    this.refreshDetail();
    this.toast('已切换：' + shipById(id).name);
    Sound.click();
  },

  upgradeShip(id) {
    const p = getShipProgress(id);
    if (p.level >= p.maxLevel) {
      this.toast('已满级，请先进阶');
      return;
    }
    const cost = SHIP_PROG.upgradeCost(p.level, p.star);
    if (Save.data.shards < cost) {
      this.toast('残骸不足，需要 ' + cost);
      return;
    }
    Save.data.shards -= cost;
    Save.data.ships.levels[p.id] = p.level + 1;
    Save.save();
    this.buildShipList();
    this.refreshResources();
    this.refreshDetail();
    Sound.click();
    this.toast(shipById(p.id).name + ' 强化至 LV' + (p.level + 1));
  },

  advanceShip(id) {
    const p = getShipProgress(id);
    if (p.star >= SHIP_PROG.maxStar) {
      this.toast('已达到最高星级');
      return;
    }
    if (p.level < p.maxLevel) {
      this.toast('需先强化至 LV' + p.maxLevel);
      return;
    }
    const cost = SHIP_PROG.advanceCost(p.star);
    if (Save.data.shards < cost) {
      this.toast('残骸不足，需要 ' + cost);
      return;
    }
    Save.data.shards -= cost;
    Save.data.ships.stars[p.id] = p.star + 1;
    Save.save();
    this.buildShipList();
    this.refreshResources();
    this.refreshDetail();
    Sound.click();
    this.toast(shipById(p.id).name + ' 进阶成功 ★' + (p.star + 1));
  },

  /* ---------------- 设置 ---------------- */
  refreshSettings() {
    const st = Save.data.settings;
    $('musicRange').value = st.music;
    $('sfxRange').value = st.sfx;
    $('soundSwitch').classList.toggle('on', !st.muted);
    document.querySelectorAll('#qualitySeg button').forEach((b) => {
      b.classList.toggle('on', b.dataset.q === st.quality);
    });
  },

  toggleMute() {
    Sound.init();
    Sound.enabled = !Sound.enabled;
    Save.data.settings.muted = !Sound.enabled;
    Save.save();
    Sound.applyVolume();
    if (Sound.enabled) Sound.click();
    this.refreshSettings();
  },

  setQuality(q) {
    Save.data.settings.quality = QUALITY[q] ? q : 'high';
    Save.save();
    this.refreshSettings();
    this.toast('画质：' + ({ high: '高', mid: '中', low: '低' })[Save.data.settings.quality]);
  },

  /* ---------------- 战斗 ---------------- */
  launch(levelIndex) {
    const lv = LEVELS[levelIndex];
    if (lv.no > Save.data.progress.unlocked) {
      this.toast('尚未解锁');
      return;
    }
    Sound.init();
    Sound.resume();
    Battle.start(levelIndex, Save.data.ships.equipped);
  },

  launchEndless() {
    Sound.init();
    Sound.resume();
    Battle.startEndless(Save.data.ships.equipped);
  },

  handleBattleEnd(win) {
    if (G.mode === 'endless') {
      this.handleEndlessEnd();
      return;
    }
    const lv = G.level;
    const stats = {
      score: G.score,
      kills: G.kills,
      crystals: G.crystals,
      time: G.time
    };
    let reward = { coins: 0, shards: 0 };
    if (win) {
      reward = lv.reward;
      Save.data.coins += reward.coins;
      Save.data.shards += reward.shards;
      Save.data.progress.cleared = Math.max(Save.data.progress.cleared, lv.no);
      Save.data.progress.unlocked = Math.max(
        Save.data.progress.unlocked,
        Math.min(LEVELS.length, lv.no + 1)
      );
    }
    if (stats.score > Save.data.bestScore) Save.data.bestScore = stats.score;
    Save.save();

    this.lastResult = { mode: 'story', win, levelId: lv.id, stats, reward };
    this.showResult(win, lv, stats, reward);
    this.refreshResources();
    this.refreshHome();
  },

  handleEndlessEnd() {
    const stats = {
      score: G.score,
      kills: G.kills,
      crystals: G.crystals,
      time: G.time
    };
    const wave = G.endless ? G.endless.maxWave : 0;
    const e = Save.data.endless;
    if (stats.score > e.bestScore) e.bestScore = stats.score;
    if (wave > e.bestWave) e.bestWave = wave;
    Save.save();

    this.lastResult = { mode: 'endless', win: false, wave, stats };
    this.showEndlessResult(stats, wave);
    this.refreshResources();
    this.refreshHome();
  },

  showResult(win, lv, stats, reward) {
    const tag = $('resultTag');
    tag.textContent = win ? 'MISSION COMPLETE' : 'MISSION FAILED';
    tag.classList.toggle('fail', !win);
    $('resultTitle').textContent = win ? '出击成功' : '战机坠毁';
    $('statScore').textContent = 0;
    $('statKills').textContent = 0;
    $('statCrystals').textContent = 0;
    this.countTo($('statScore'), stats.score, 620);
    this.countTo($('statKills'), stats.kills, 460);
    this.countTo($('statCrystals'), stats.crystals, 520);
    const sec = Math.floor(stats.time);
    $('statTime').textContent = Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
    $('resultReward').innerHTML = win
      ? '金币 <b>' + reward.coins + '</b> · 残骸 <b>' + reward.shards + '</b>'
      : '本次未获得奖励';
    $('resultBest').innerHTML = '最高分 <b>' + Save.data.bestScore + '</b>';

    const next = LEVELS[lv.id + 1];
    const btnNext = $('btnNext');
    const canNext = win && next && next.no <= Save.data.progress.unlocked;
    btnNext.style.display = canNext ? '' : 'none';
    if (canNext) btnNext.textContent = '下一关 · 第' + next.no + '关';
    $('btnToMap').style.display = '';

    G.state = win ? 'victory' : 'defeat';
    Screen.show('result');
  },

  showEndlessResult(stats, wave) {
    const tag = $('resultTag');
    tag.textContent = 'ENDLESS RUN';
    tag.classList.remove('fail');
    $('resultTitle').textContent = '挑战结束';
    $('statScore').textContent = 0;
    $('statKills').textContent = 0;
    $('statCrystals').textContent = 0;
    this.countTo($('statScore'), stats.score, 620);
    this.countTo($('statKills'), stats.kills, 460);
    this.countTo($('statCrystals'), stats.crystals, 520);
    const sec = Math.floor(stats.time);
    $('statTime').textContent = Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
    const e = Save.data.endless;
    $('resultReward').innerHTML = '到达第 <b>' + wave + '</b> 波 · 最高第 <b>' + e.bestWave + '</b> 波';
    $('resultBest').innerHTML = '无尽最高分 <b>' + e.bestScore + '</b>';
    $('btnNext').style.display = 'none';
    $('btnToMap').style.display = 'none';
    G.state = 'defeat';
    Screen.show('result');
  },

  /* ---------------- 提示 ---------------- */
  countTo(el, to, dur) {
    const token = (el._ct = (el._ct || 0) + 1);
    const t0 = performance.now();
    const step = (now) => {
      if (el._ct !== token) return;
      const k = Math.min(1, (now - t0) / dur);
      el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  },

  toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('show'), 1600);
  },

  /* ---------------- 事件绑定 ---------------- */
  bindEvents() {
    // 首次手势解锁音频
    const unlock = () => {
      Sound.init();
      Sound.resume();
      Sound.applyVolume();
      Sound.startBgm(Screen.is('battle') ? 'battle' : 'menu');
    };
    window.addEventListener('pointerdown', unlock, { once: true });

    $('btnEnter').addEventListener('click', () => { Sound.click(); this.goHome(); });
    $('menuStory').addEventListener('click', () => { Sound.click(); this.goMap(); });
    $('menuEndless').addEventListener('click', () => { Sound.click(); this.launchEndless(); });
    $('menuHangar').addEventListener('click', () => { Sound.click(); this.goHangar(); });
    $('menuSettings').addEventListener('click', () => { Sound.click(); this.goSettings(); });

    $('mapBack').addEventListener('click', () => { Sound.click(); this.goHome(); });
    $('hangarBack').addEventListener('click', () => { Sound.click(); this.goMap(); });
    $('settingsBack').addEventListener('click', () => { Sound.click(); this.goHome(); });
    $('btnHangarFromMap').addEventListener('click', () => { Sound.click(); this.goHangar(); });

    document.querySelectorAll('.chapter-tab').forEach((tab, idx) => {
      tab.addEventListener('click', () => {
        Sound.click();
        this.chapter = idx;
        this.selected = clamp(this.selected, idx * 8, idx * 8 + 7);
        this.renderMap();
      });
    });

    $('btnLaunch').addEventListener('click', () => { Sound.click(); this.launch(this.selected); });

    // 结算
    $('btnNext').addEventListener('click', () => {
      Sound.click();
      const r = this.lastResult;
      if (r) this.launch(r.levelId + 1);
    });
    $('btnRetry').addEventListener('click', () => {
      Sound.click();
      const r = this.lastResult;
      if (!r) return;
      if (r.mode === 'endless') this.launchEndless();
      else this.launch(r.levelId);
    });
    $('btnToMap').addEventListener('click', () => {
      Sound.click();
      const r = this.lastResult;
      if (r) { this.selected = r.levelId; this.chapter = r.levelId >= 8 ? 1 : 0; }
      this.goMap();
    });
    $('btnToHome').addEventListener('click', () => { Sound.click(); this.goHome(); });

    // 暂停
    $('btnResume').addEventListener('click', () => { Sound.click(); Battle.resume(); });
    $('btnPauseRetry').addEventListener('click', () => {
      Sound.click();
      if (G.mode === 'endless') this.launchEndless();
      else this.launch(G.level ? G.level.id : this.selected);
    });
    $('btnPauseQuit').addEventListener('click', () => {
      Sound.click();
      const endless = G.mode === 'endless';
      Battle.quit();
      if (endless) this.goHome();
      else this.goMap();
    });

    // 设置
    $('musicRange').addEventListener('input', (e) => {
      Save.data.settings.music = clamp(parseInt(e.target.value, 10) || 0, 0, 100);
      Sound.musicVolume = Save.data.settings.music / 100;
      Sound.init();
      Sound.applyVolume();
    });
    $('musicRange').addEventListener('change', () => { Save.save(); Sound.click(); });
    $('sfxRange').addEventListener('input', (e) => {
      Save.data.settings.sfx = clamp(parseInt(e.target.value, 10) || 0, 0, 100);
      Sound.sfxVolume = Save.data.settings.sfx / 100;
      Sound.init();
      Sound.applyVolume();
    });
    $('sfxRange').addEventListener('change', () => { Save.save(); Sound.click(); });
    $('soundSwitch').addEventListener('click', () => { this.toggleMute(); });
    document.querySelectorAll('#qualitySeg button').forEach((b) => {
      b.addEventListener('click', () => { Sound.click(); this.setQuality(b.dataset.q); });
    });
    $('btnClearSave').addEventListener('click', () => {
      if (!window.confirm('确定清除全部存档？此操作不可恢复。')) return;
      Save.reset();
      Sound.enabled = true;
      Sound.musicVolume = Save.data.settings.music / 100;
      Sound.sfxVolume = Save.data.settings.sfx / 100;
      Sound.applyVolume();
      this.selected = 0;
      this.chapter = 0;
      this.refreshAll();
      this.toast('存档已清除');
    });
  },

  /* ---------------- 主循环 ---------------- */
  frame(now) {
    const dt = Math.min(0.08, (now - (this._last || now)) / 1000);
    this._last = now;
    G.visual += dt;
    Stars.update(dt);

    if (Screen.is('battle') && G.state === 'playing') {
      Battle.acc = (Battle.acc || 0) + dt;
      let steps = 0;
      const step = 1 / 60;
      while (Battle.acc >= step && steps < 5) {
        Battle.update(step);
        Battle.acc -= step;
        steps++;
        if (Screen.is('battle') && G.state !== 'playing') break;
        if (!Screen.is('battle')) break;
      }
      if (steps >= 5) Battle.acc = 0;
      Battle.render();
    } else if (Screen.is('battle') || Screen.is('pause')) {
      Battle.render();
    } else if (Screen.is('result')) {
      Battle.render();
    } else {
      Battle.renderMenu();
    }

    requestAnimationFrame((t) => this.frame(t));
  }
};

window.addEventListener('load', () => App.init());
