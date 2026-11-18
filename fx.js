/* Boxing Trophy 20 — mise en scène
   Intro « Round 20 », titre placé derrière le boxeur, poussière dans la lumière,
   zoom à travers le « 20 », panneaux du week-end, inclinaison de l'affiche et du billet. */
(function () {
  'use strict';
  var root = document.documentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia('(pointer: fine)').matches;
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  /* ── Intro « Round 20 » (une fois par session) ── */
  var intro = document.getElementById('intro');
  var seen = false;
  try { seen = sessionStorage.getItem('bt20-intro') === '1'; } catch (e) {}

  function ready() { root.classList.add('is-ready'); }

  if (!intro || reduce || seen) {
    if (intro) intro.classList.add('is-gone');
    requestAnimationFrame(ready);
  } else {
    root.classList.add('intro-lock');
    // L'intro s'ouvre toujours sur le hero
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    if (!location.hash) window.scrollTo(0, 0);
    var bar = document.getElementById('introBar');
    var start = null, DURATION = 900;
    var step = function (t) {
      if (start === null) start = t;
      var p = clamp((t - start) / DURATION, 0, 1);
      var e = 1 - Math.pow(1 - p, 3);
      bar.style.transform = 'scaleX(' + e + ')';
      if (p < 1) return requestAnimationFrame(step);
      setTimeout(function () {
        intro.classList.add('is-done');
        root.classList.remove('intro-lock');
        ready();
        try { sessionStorage.setItem('bt20-intro', '1'); } catch (e) {}
        setTimeout(function () { intro.classList.add('is-gone'); }, 1200);
      }, 250);
    };
    requestAnimationFrame(step);
  }

  /* ── Hero : le titre se cale derrière la tête du boxeur ──
     Repères mesurés sur la photo (1600 × 1983) : haut des cheveux ≈ 35 %, yeux ≈ 53 %. */
  var hero = document.getElementById('hero');
  var title = hero && hero.querySelector('.hero-title');
  /* Repères mesurés sur la photo (en fraction de la photo) :
     centre de la tête x ≈ 48 %, largeur des cheveux ≈ 36→60 %, yeux y ≈ 53 %. */
  var num = document.getElementById('heroNum');
  var HEAD_X = 0.48, HEAD_HALF = 0.12, EYES = 0.53, RATIO = 1600 / 1986, ZOOM = 1.04;
  function layoutHero() {
    if (!hero || !num) return;
    var stage = hero.querySelector('.hero-bg');
    var W = hero.clientWidth, H = stage ? stage.clientHeight : hero.clientHeight;
    var pw = H * RATIO * ZOOM;                                  // largeur affichée de la photo
    var cx = W / 2 + (HEAD_X - 0.5) * pw;                       // axe de la tête
    var eyesY = H / 2 + (EYES * H - H / 2) * ZOOM;
    var small = W < 700;
    var gapHalf = (small ? HEAD_HALF - 0.01 : HEAD_HALF + 0.035) * pw; // le 20 s'écarte autour de la tête
    var pad = small ? -4 : 40;
    var maxByWidth = (Math.min(cx, W - cx) - gapHalf - pad) / 0.5; // un chiffre Anton ≈ 0,5 em
    var size = clamp(Math.min(H * 0.52, maxByWidth), 120, 600);
    var top = eyesY - size * 0.4;
    var titleBottom = title ? title.offsetTop + title.offsetHeight + 16 : 0;
    if (top < titleBottom) top = titleBottom;
    num.style.setProperty('--num-size', size.toFixed(1) + 'px');
    num.style.setProperty('--num-top', top.toFixed(1) + 'px');
    num.style.setProperty('--num-right', (W - (cx - gapHalf)).toFixed(1) + 'px');
    num.style.setProperty('--num-left', (cx + gapHalf).toFixed(1) + 'px');
  }
  layoutHero();
  window.addEventListener('resize', layoutHero);

  /* ── Poussière dans le faisceau de lumière (discrète) ── */
  var canvas = document.getElementById('heroEmbers');
  if (canvas && !reduce) {
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var parts = [], cw = 0, ch = 0, running = true;
    var size = function () {
      cw = canvas.clientWidth; ch = canvas.clientHeight;
      canvas.width = cw * dpr; canvas.height = ch * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();
    window.addEventListener('resize', size);
    var N = cw < 700 ? 28 : 55;
    for (var i = 0; i < N; i++) {
      parts.push({
        x: Math.random() * cw, y: Math.random() * ch,
        r: Math.random() * 1.4 + 0.3, vy: -(Math.random() * 0.25 + 0.05),
        vx: (Math.random() - 0.5) * 0.15, a: Math.random() * 0.35 + 0.08,
        warm: Math.random() < 0.35
      });
    }
    var loop = function () {
      if (!running) return;
      ctx.clearRect(0, 0, cw, ch);
      for (var k = 0; k < parts.length; k++) {
        var p = parts[k];
        p.x += p.vx; p.y += p.vy;
        if (p.y < -10) { p.y = ch + 10; p.x = Math.random() * cw; }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, 6.283);
        ctx.fillStyle = p.warm ? 'rgba(255,120,90,' + p.a + ')' : 'rgba(255,245,235,' + p.a + ')';
        ctx.fill();
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) {
        var vis = en[0].isIntersecting;
        if (vis && !running) { running = true; requestAnimationFrame(loop); }
        running = vis;
      }).observe(hero);
    }
  }

  /* ── Défilement : progression, parallaxe du hero, zoom « 20 » ── */
  var progress = document.getElementById('scrollProgress');
  var zoom = document.getElementById('zoom20');
  var zText = document.getElementById('zoom20Text');
  var z0 = zText && zText.querySelector('.z0');
  function originZoom() {
    if (!zText || !z0) return;
    // Point d'entrée : jambage gauche du « 0 », à mi-hauteur
    zText.style.setProperty('--ox', (z0.offsetLeft + z0.offsetWidth * 0.2) + 'px');
    zText.style.setProperty('--oy', (zText.offsetHeight * 0.5) + 'px');
  }
  originZoom();
  window.addEventListener('resize', originZoom);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { originZoom(); layoutHero(); });

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      var y = window.scrollY, vh = window.innerHeight;
      var max = document.documentElement.scrollHeight - vh;
      if (progress) progress.style.transform = 'scaleX(' + (max > 0 ? y / max : 0) + ')';
      if (hero && !reduce && y < vh * 1.2) hero.style.setProperty('--hero-shift', (y * 0.18).toFixed(1) + 'px');
      if (zoom && zText && !reduce) {
        var top = zoom.offsetTop, len = zoom.offsetHeight - vh;
        var p = clamp((y - top) / len, 0, 1);
        zText.style.setProperty('--z', (1 + Math.pow(p, 3) * 70).toFixed(3));
        zoom.style.setProperty('--cap', clamp(1 - p * 4, 0, 1).toFixed(3));
        zoom.style.setProperty('--fill', clamp((p - 0.5) / 0.25, 0, 1).toFixed(3));
        zoom.style.setProperty('--final', clamp((p - 0.72) / 0.2, 0, 1).toFixed(3));
      }
      ticking = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ── Panneaux du week-end ── */
  var nights = document.querySelectorAll('[data-nights] .night');
  function openNight(n) { nights.forEach(function (o) { o.classList.toggle('is-open', o === n); }); }
  nights.forEach(function (n) {
    if (fine) n.addEventListener('mouseenter', function () { openNight(n); });
    n.addEventListener('click', function () { openNight(n); });
  });

  /* ── Inclinaison légère de l'affiche et du billet ── */
  if (fine && !reduce) {
    document.querySelectorAll('[data-tilt]').forEach(function (el) {
      var target = el.querySelector('.poster-btn') || el;
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width, yy = (e.clientY - r.top) / r.height;
        target.style.setProperty('--ry', ((x - 0.5) * 7).toFixed(2) + 'deg');
        target.style.setProperty('--rx', ((0.5 - yy) * 5).toFixed(2) + 'deg');
        target.style.setProperty('--gx', (x * 100).toFixed(1) + '%');
        target.style.setProperty('--gy', (yy * 100).toFixed(1) + '%');
      });
      el.addEventListener('pointerleave', function () {
        target.style.setProperty('--rx', '0deg');
        target.style.setProperty('--ry', '0deg');
      });
    });
  }
})();
