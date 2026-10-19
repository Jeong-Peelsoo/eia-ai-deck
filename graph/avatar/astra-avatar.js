/* ASTRA 로봇 진행자 v3 — 덱용 그림 합성기(2026-10-16, 5장). Cubism 모델이 아니다.
 * 그림 = scripts/build_avatar_assets.py 가 v2 · v3 원화로 만든 '몸 프레임'(graph/avatar/body/, 정수리 ~ 허벅지)과
 *        '머리 층'(graph/avatar/head/, 고개 각도 c · l15 · l30 · r15 · r30 · d10 × 입 모양), 머리 가림(head-mask.webp), 자리표(astra_meta.js).
 * 그리기 — 몸 프레임을 그리고, 그 몸의 머리 자리(ASTRA_META.bodies)를 가림으로 지운 뒤, 지금 고개 · 입 모양의 머리 층을 얹는다.
 *   팔 — 포즈를 바꾸면 중간 동작 프레임(tween)을 거쳐 75 ms 씩 이어 간다(앞 포즈 → 내림 → 다음 포즈로 올림).
 *   고개 — c ↔ 15° ↔ 30° 를 한 칸씩 90 ms 로 돈다. 입 — 코드(. m A a E I O U)를 그 각도에 있는 입 모양으로 바꾼다. 깜빡임은 입이 닫혀 있을 때만.
 *   숨쉬기 · 몸 흔들림 · 몸짓 쪽으로 조금 기울기는 그림 전체를 아주 작게 움직여 낸다. */
(function(){
  'use strict';
  const TW = {   // 양손 내림 → 그 포즈까지 거치는 중간 프레임
    'right-point': ['tween-right-point-33', 'tween-right-point-66'], 'right-point-down-left': ['tween-right-point-down-left-50'],
    'both-present': ['tween-both-present-33', 'tween-both-present-66'], 'arms-crossed': ['tween-arms-crossed-33', 'tween-arms-crossed-66'],
    'both-raised': ['tween-both-raised-33', 'tween-both-raised-66'], 'right-palm-present-left': ['tween-right-palm-present-left-50'],
    'hand-on-chest': ['tween-hand-on-chest-50'], 'right-index-up': ['tween-right-index-up-50'], 'right-count-two': ['tween-right-index-up-50'],
    'right-count-three': ['tween-right-index-up-50'], 'both-hands-spread': ['tween-both-hands-spread-50'], 'both-hands-sphere': ['tween-both-present-33'],
    'fingertips-steeple': ['tween-both-present-33'], 'left-palm-present-right': [], 'body-shrug': ['tween-both-present-33'] };
  const LEAN = { 'right-point': -.7, 'right-point-down-left': -.9, 'right-palm-present-left': -.6, 'right-index-up': -.3, 'right-count-two': -.3,
    'right-count-three': -.3, 'left-palm-present-right': .6, 'hand-on-chest': .2 };   // 몸짓 쪽으로 기우는 각도(도)
  const VMAP = { '.': 'closed', m: 'm', A: 'A', a: 'a', E: 'E', I: 'I', O: 'O', U: 'U' };
  const FALL = { m: 'closed', a: 'A', I: 'E', U: 'O', E: 'A', O: 'A', smile: 'closed', blink: 'closed' };
  const ease = u => u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
  const FR = .11, HD = .12;   // 한 프레임 머무는 시간 — 그 동안 다음 프레임으로 섞여 넘어간다

  class AstraAvatar {
    constructor(canvas, base){
      const M = this.M = window.ASTRA_META; this.cv = canvas; this.g = canvas.getContext('2d'); this.body = {}; this.head = {};
      canvas.width = M.W; canvas.height = M.H;
      this.pose = 'neutral'; this.q = []; this.cur = 'neutral'; this.prev = 'neutral'; this.tf = -1e9;
      this.angle = 'c'; this.hq = []; this.hcur = 'c-closed'; this.hprev = 'c-closed'; this.th = -1e9; this.hangle = 'c';
      this.vis = '.'; this.smile = 1; this.blinkAt = 2.5; this.raf = 0; this.t0 = performance.now(); this.lean = 0;
      const ld = (src) => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = src; });
      this.ready = Promise.all([
        ...Object.keys(M.bodies).map(n => ld(base + 'body/' + n + '.webp').then(im => this.body[n] = im)),
        ...M.heads.map(n => ld(base + 'head/' + n + '.webp').then(im => this.head[n] = im)),
        ld(base + 'head-mask.webp').then(im => this.mask = im)]).then(() => this.draw());
    }
    now(){ return (performance.now() - this.t0) / 1000; }
    path(a, b){ const down = (TW[a] || []).slice().reverse(), up = TW[b] || [];
      if (a === b) return []; if (a === 'neutral') return [...up, b]; if (b === 'neutral') return [...down, 'neutral']; return [...down, ...up, b]; }
    setPose(p){ if (!this.M.bodies[p] || p === this.pose) return; this.q = this.path(this.pose, p).filter(n => this.M.bodies[n]); this.pose = p; }
    setAngle(a){ if (a === this.angle) return; const L = ['l30', 'l15', 'c', 'r15', 'r30'], i0 = L.indexOf(this.angle), i1 = L.indexOf(a);
      this.hq = i0 >= 0 && i1 >= 0 ? (i1 > i0 ? L.slice(i0 + 1, i1 + 1) : L.slice(i1, i0).reverse()) : [a]; this.angle = a; }
    key(angle, v){ let k = v; while (k && !this.head[angle + '-' + k]) k = FALL[k]; return angle + '-' + (k || 'closed'); }
    mix(a, b, u, x, y, w, h, k){
      this.off = this.off || {}; let c = this.off[k]; if (!c) { c = this.off[k] = document.createElement('canvas'); c.width = w; c.height = h; c.x = c.getContext('2d'); }
      const x2 = c.x; x2.globalCompositeOperation = 'source-over'; x2.globalAlpha = 1; x2.clearRect(0, 0, w, h);
      if (u >= 1 || a === b) { x2.drawImage(b, 0, 0); return; }
      x2.globalAlpha = 1 - u; x2.drawImage(a, 0, 0); x2.globalCompositeOperation = 'lighter'; x2.globalAlpha = u; x2.drawImage(b, 0, 0);
      x2.globalCompositeOperation = 'source-over'; x2.globalAlpha = 1; }
    start(){ if (this.raf) return; const f = () => { this.draw(); this.raf = requestAnimationFrame(f); }; this.raf = requestAnimationFrame(f); }
    stop(){ cancelAnimationFrame(this.raf); this.raf = 0; }
    draw(){
      if (!this.mask) return;
      const g = this.g, t = this.now(), M = this.M, W = M.W, H = M.H;
      // 팔 — 줄 선 프레임을 하나씩
      if (this.q.length && t - this.tf >= FR) { this.prev = this.cur; this.cur = this.q.shift(); this.tf = t; }
      if (this.hq.length && t - this.th >= (this.slowHead ? .45 : HD)) { this.hangle = this.hq.shift(); this.th = t; }   // slowHead — 말하기 전 천천히 돌아본다
      // 머리 층 — 각도 · 입 모양 · 깜빡임
      const talking = this.vis !== '.' && this.vis !== 'm';
      if (t > this.blinkAt + .2) this.blinkAt = t + 2.8 + ((t * 7.31) % 2.2);
      const blink = !talking && t >= this.blinkAt && t <= this.blinkAt + .16;
      const want = this.key(this.hangle, blink ? 'blink' : (this.vis === '.' && this.smile ? 'smile' : VMAP[this.vis] || 'closed'));
      // 입 모양을 너무 자주 바꾸지 않는다 — 한 모양을 최소 0.1초 머문다(1초 25번 바꾸면 떨려 보였다)
      if (want !== this.hcur && (t - (this.hfade || -9) >= .1 || want.endsWith('blink') || this.hcur.endsWith('blink'))) { this.hprev = this.hcur; this.hcur = want; this.hfade = t; }
      // 그림 전체 — 숨쉬기 · 흔들림 · 몸짓 쪽 기울기(골반 기준)
      this.lean += ((LEAN[this.pose] || 0) - this.lean) * .06;
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
      const by = Math.sin(t * 1.45) * 1.6, rot = (Math.sin(t * .5) * .35 + this.lean) * Math.PI / 180;
      // 인사(bow 0–1, 35장 '감사합니다', 2026-10-16) — 골반을 축으로 윗몸을 세로로 조금 눌러 앞으로 숙인 원근을 낸다. 고개 숙임(d10) · 가슴에 손은 부르는 쪽이 함께 건다
      this.bw = (this.bw || 0) + ((this.bow || 0) - (this.bw || 0)) * .07;
      g.translate(W / 2, H * .82); g.rotate(rot); g.scale(1 - .015 * this.bw, 1 - .085 * this.bw); g.translate(-W / 2, -H * .82 + by);
      const fu = ease((t - this.tf) / FR);
      // 두 프레임 섞기 — 이전 프레임을 밑에 깔지 않는다(깔면 이전 팔이 계속 남아 두 동작이 겹쳐 보였다). 미리 곱한 색을 더하는 'lighter' 로 1 − u : u 섞는다
      this.mix(this.body[this.prev], this.body[this.cur], fu, 0, 0, W, H, 'b'); g.drawImage(this.off.b, 0, 0);
      // 머리 자리 — 두 몸 프레임의 자리를 섞은 곳
      const o0 = M.bodies[this.prev], o1 = M.bodies[this.cur], hx = M.head.x + o0[0] + (o1[0] - o0[0]) * fu, hy = M.head.y + o0[1] + (o1[1] - o0[1]) * fu;
      g.globalCompositeOperation = 'destination-out'; g.drawImage(this.mask, hx, hy); g.globalCompositeOperation = 'source-over';
      const hu = ease((t - (this.hfade || -9)) / (this.slowHead ? .45 : .06));
      const hc = this.head[this.hcur], hp = this.head[this.hprev] || hc; this.mix(hp, hc, hu, 0, 0, hc.width, hc.height, 'h'); g.drawImage(this.off.h, hx, hy);
    }
  }
  window.AstraAvatar = AstraAvatar;
})();
