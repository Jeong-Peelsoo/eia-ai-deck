/* 전신 원화 로봇 재생기 — 46장 맺음 진행자(2026-10-18 사용자 지시: Live2D/source/full-body-v4 전신 원화로 바꾸고, '감사합니다' 에 배꼽인사 — 인사 뒤 춤은 같은 날 뺐다).
   자산 — graph/avatar/fullbody/(scripts/build_fullbody_frames.py 가 굽는다) · window.FULLBODY_META(fullbody_meta.js).
   AstraAvatar 와 같은 사용법을 받는다 — ready · start() · stop() · setPose(이름) · vis(입 모양 문자) · smile · bow · setAngle() · slowHead.
     setPose — 예전 포즈 이름(right-index-up 등)이나 프레임 이름을 받아 0.08초 교차 페이드로 바꾼다.
     vis    — '.' 다문 입 · A a E I O U m. 머리 픽셀이 원본인 프레임(meta head)에만 입 조각을 덧그린다(인사 · 미소 프레임에는 안 그린다).
     smile  — 1 이면 다문 입일 때 부드러운 미소 얼굴 조각을 덧그린다. 눈은 3–5초마다 깜빡인다(머리 원본 프레임만).
     bow    — 1 을 넣으면 배꼽인사(15° → 30° 머묾 → 15° → 밝은 미소)를 한 번 한다. 도는 동안 busy 가 참이고 setPose 는 무시한다(끝나면 미소 차렷).
     _final  — 인사 뒤 마무리 동작(팔짱 · 생각 · 갸우뚱 · 윙크)을 차렷 휴식과 번갈아 되풀이한다. 장을 떠나거나 cancel() 하면 멈춘다.
     cancel() — 인사 · 마무리를 멈추고 차렷으로. setAngle · slowHead 는 이 재생기에서 쓰지 않는다(원화에 머리 각도 층이 없다). */
(function(){
  const POSE = {   // 예전 AstraAvatar 포즈 이름 → 전신 프레임(46장 PLAN 몸짓표)
    'neutral': 'face-neutral', 'left-palm-present-right': '1h-palm-sr', 'right-palm-present-left': '1h-palm-sl',
    'right-index-up': '1h-index-up', 'right-point-down-left': '1h-point-down-sl', 'right-count-two': '1h-count-two',
    'right-count-three': '1h-count-three', 'both-hands-sphere': '2h-sphere', 'both-hands-spread': '2h-spread',
    'fingertips-steeple': '2h-steeple', 'hand-on-chest': '1h-hand-on-chest' };
  // 배꼽인사 — [프레임, 머무는 초]. 2026-10-18 사용자 지시로 인사 뒤 춤은 뺐다. 인사 → 밝은 미소 → 미소 차렷.
  const BOW = [['greet-bow-15', .35], ['greet-bow-30', 1.5], ['greet-bow-15', .35], ['expr-bright-smile', 1.6]];
  // 2026-10-18 사용자 지적 — 이전 동작 잔상이 길다. 0.18 → 0.08초로 줄이고, 이전 프레임 투명도를 처음부터 빠르게 떨어뜨린다((1-u)³)
  // 인사 뒤 마무리(2026-10-18 사용자 지시) — 팔짱 → 턱에 손가락 → 곰곰이 생각(갸웃 · 눈 위로) → 차렷 → 갸우뚱 → 윙크 → 밝은 미소.
  //   46장은 질의응답 동안 오래 머무므로, 차렷으로 IDLE_GAP 초 쉬었다가 되풀이한다. 잔상이 없게 페이드 없이 바꾼다(인사와 같다)
  const FINAL = [['pose-arms-crossed', 2.4], ['1h-thinking-chin', 1.4], ['pose-thinking-tilt-sl', 2.6], ['face-neutral', .7],
    ['expr-cute-tilt', 1.6], ['expr-cute-wink', .9], ['expr-bright-smile', 1.6]];
  const IDLE_GAP = 8;
  const FADE = .08;

  class FullBodyAvatar {
    constructor(cv, base){
      this.cv = cv; this.g = cv.getContext('2d'); this.M = window.FULLBODY_META; this.base = base;
      const [w, h] = this.M.size; cv.width = w; cv.height = h;
      this.img = {}; const load = (k, src) => new Promise(r => { const im = new Image(); im.onload = im.onerror = () => r(); im.src = base + src; this.img[k] = im; });
      this.ready = Promise.all([...Object.entries(this.M.frames).map(([k, f]) => load(k, f.src)), ...Object.entries(this.M.patches).map(([k, p]) => load('p:' + k, p.src))]);
      this.cur = 'face-neutral'; this.prev = null; this.t0 = 0; this.fade = FADE;
      this.vis = '.'; this.smile = 1; this.slowHead = false; this._bow = 0; this._latch = false; this.busy = false;
      this.raf = 0; this.timers = []; this.blinkAt = 0; this.blinkUntil = 0;
    }
    // ⚠ 한 번 돈 인사는 잠근다(_latch) — 46장 내레이션 루프는 bow 가 0 이면 매 프레임 다시 1 을 넣으므로, 시퀀스가 끝나며 풀면 처음부터 다시 돈다(2026-10-18 실측).
    //   잠금은 bow = 0(rest — 내레이션 루프가 끝날 때) 또는 cancel() 에서만 푼다.
    set bow(v){ if (v) { if (!this._latch) { this._latch = true; this._seq(); } this._bow = 1; } else { this._bow = 0; if (!this.busy) this._latch = false; } }
    get bow(){ return this._bow; }
    setAngle(){}
    // 인사 · 마무리 동안은 포즈 호출을 모두 무시한다 — 46장 내레이션 루프가 끝나기 전까지 매 프레임 지금 문장의 포즈를 다시 넣어 마무리를 끊었다(2026-10-18 실측).
    //   마무리는 cancel() · stop()(Esc · 뒤로 · 장 떠남)으로만 끝난다
    setPose(name){ if (this.busy || this.finalOn) return; const f = POSE[name] || (this.M.frames[name] ? name : 'face-neutral'); this._go(f, FADE); }   // 인사 동안은 무시 — 끝나면 미소 차렷
    // fade 0 = 바로 바꾼다(겹친 장면 없음). 0 으로 나누지 않게 prev 를 바로 걷는다
    _go(f, fade){ if (f === this.cur) return; this.prev = fade > 0 ? this.cur : null; this.cur = f; this.t0 = performance.now(); this.fade = fade; }
    _seq(){
      this.busy = true; this.vis = '.'; let t = 0;
      const add = (list, fade) => list.forEach(([f, d]) => { this.timers.push(setTimeout(() => this._go(f, fade), t * 1000)); t += d; });
      // 인사 구간은 페이드 없이 바로 바꾼다(2026-10-18 사용자 지적 — '감사합니다' 때 잔상). 0.35초 간격으로 네 장을 넘기는데,
      //   프레임이 느린 컴퓨터에서는 겹친 중간 장면이 한두 장씩 걸려 잔상으로 보였다. 인사는 끊어 보여도 어색하지 않다
      add(BOW, 0);
      this.timers.push(setTimeout(() => { this.busy = false; this._go('face-neutral', 0); this.smile = 1; this._final(0); }, t * 1000));
    }
    // 마무리 동작 — busy 가 아니다(내레이션 루프가 끝나 rest() 를 부를 수 있게). 그동안 setPose 는 무시하고 cancel() · stop() 만 끊는다
    _final(wait){
      this.finalOn = true; let t = wait;
      FINAL.forEach(([f, d]) => { this.timers.push(setTimeout(() => this._go(f, 0), t * 1000)); t += d; });
      this.timers.push(setTimeout(() => { this._go('face-neutral', 0); this._final(IDLE_GAP); }, t * 1000));
    }
    cancel(){ this.timers.forEach(clearTimeout); this.timers = []; this.finalOn = false; this.busy = false; this._bow = 0; this._latch = false; this._go('face-neutral', FADE); }
    start(){ if (this.raf) return; const tick = () => { this._draw(); this.raf = requestAnimationFrame(tick); }; this.raf = requestAnimationFrame(tick); }
    stop(){ cancelAnimationFrame(this.raf); this.raf = 0; this.cancel(); this.prev = null; this.cur = 'face-neutral'; this._draw(true); }
    _frame(f, a){
      const g = this.g, im = this.img[f]; if (!im || !im.naturalWidth) return;
      g.globalAlpha = a; g.drawImage(im, 0, 0, this.cv.width, this.cv.height);
      if (!this.M.frames[f].head) return;
      const now = performance.now(), P = this.M.patches;
      const put = k => { const p = P[k], pi = this.img['p:' + k]; if (p && pi && pi.naturalWidth) g.drawImage(pi, p.x, p.y, p.w, p.h); };
      const m = this.M.vis[this.vis];
      if (m) put(m); else if (this.smile) put('gentle');
      if (now < this.blinkUntil) put('blink');
    }
    // 2026-10-18 사용자 지시 — 46장에서 지구본과 겹쳐 버벅였다. 매 프레임 지우고 다시 그리던 것을, 그림이 바뀔 때만(프레임 · 페이드 · 입 · 미소 · 깜빡임 · 그림 적재) 그린다
    _draw(force){
      const g = this.g, now = performance.now();
      if (!this.blinkAt) this.blinkAt = now + 2500;
      if (now > this.blinkAt) { this.blinkUntil = now + 130; this.blinkAt = now + 3000 + Math.random() * 2000; }
      const u = this.prev ? Math.min(1, (now - this.t0) / 1000 / this.fade) : 1;
      const loaded = Object.values(this.img).filter(im => im.complete).length;
      const sig = [this.cur, this.prev && u < 1 ? u : '', this.M.vis[this.vis] || '', this.smile, now < this.blinkUntil, loaded].join('|');
      if (!force && sig === this._sig) return;
      this._sig = sig;
      g.clearRect(0, 0, this.cv.width, this.cv.height);
      // 새 프레임을 먼저 온전히 그리고, 이전 프레임을 위에서 걷어 낸다 — 반대로 하면 페이드 끝에 옛 팔 · 손이 '툭' 사라진다
      this._frame(this.cur, 1);
      if (this.prev && u < 1) this._frame(this.prev, Math.pow(1 - u, 3));
      if (u >= 1) this.prev = null;
      g.globalAlpha = 1;
    }
  }
  window.FullBodyAvatar = FullBodyAvatar;
})();
