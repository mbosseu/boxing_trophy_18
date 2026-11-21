/* BOXING TROPHY 20 — sections « nuit » : le film, le face-à-face rouge/bleu, la galerie, l'entrée des combattants. */
(function () {
  'use strict';
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function cl(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function eo(t) { return 1 - Math.pow(1 - t, 3); }

  /* ── Défilement : l'écran du film se déplie, les deux coins se rejoignent ── */
  var screen = document.querySelector('.cine-screen');
  var vs = document.querySelector('[data-vs]');
  var phone = matchMedia('(max-width: 760px)');
  var ticking = false;
  function onScroll() {
    if (ticking) return; ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      var vh = innerHeight;
      if (screen) {
        var r = screen.getBoundingClientRect();
        screen.style.setProperty('--cp', eo(cl((vh * .98 - r.top) / (vh * .62))).toFixed(3));
      }
      if (vs && !phone.matches) {
        var rv = vs.getBoundingClientRect();
        vs.style.setProperty('--vp', eo(cl((vh * 1.02 - rv.top) / (vh * .75))).toFixed(3));
      } else if (vs) {                // téléphone : chaque coin arrive de son côté, le badge VS tourne et tombe entre les deux
        vsSides.forEach(function (sd) { var r = sd.getBoundingClientRect(); sd.style.setProperty('--pp', eo(cl((vh * 1.02 - r.top) / (vh * .6))).toFixed(3)); });
        if (vsBadge) { var rb = vsBadge.getBoundingClientRect(); vs.style.setProperty('--vp', eo(cl((vh * .98 - rb.top) / (vh * .4))).toFixed(3)); }
      }
      if (week) {                     // les trois affiches sortent de la pile et se déploient (ordinateur et téléphone)
        var rw = week.getBoundingClientRect();
        week.style.setProperty('--wp', eo(cl((vh * 1.05 - rw.top) / (vh * (phone.matches ? .55 : .7)))).toFixed(3));
      }
    });
  }
  var week = document.querySelector('[data-week]');
  var vsSides = vs ? Array.prototype.slice.call(vs.querySelectorAll('.vs-side')) : [];
  var vsBadge = vs ? vs.querySelector('.vs-badge') : null;
  if (!reduce) { addEventListener('scroll', onScroll, { passive: true }); addEventListener('resize', onScroll); onScroll(); }
  else { if (screen) screen.style.setProperty('--cp', 1); if (vs) vs.style.setProperty('--vp', 1); }

  /* ── Les affiches du week-end : reflet qui suit la souris, carrousel en couverture sur téléphone ── */
  if (week) {
    var stage = week.querySelector('[data-week-stage]');
    var nights = Array.prototype.slice.call(week.querySelectorAll('.wk-night'));
    var tabs = Array.prototype.slice.call(week.querySelectorAll('[data-wk-go]'));
    if (matchMedia('(hover: hover) and (pointer: fine)').matches && !reduce) {
      nights.forEach(function (n) {
        var poster = n.querySelector('.wk-poster');
        poster.addEventListener('pointermove', function (e) {
          var r = poster.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
          poster.style.setProperty('--ty', ((x - .5) * 14).toFixed(2) + 'deg');
          poster.style.setProperty('--tx', ((.5 - y) * 10).toFixed(2) + 'deg');
          poster.style.setProperty('--gx', (x * 100).toFixed(1) + '%');
          poster.style.setProperty('--gy', (y * 100).toFixed(1) + '%');
        });
        poster.addEventListener('pointerleave', function () { poster.style.setProperty('--tx', '0deg'); poster.style.setProperty('--ty', '0deg'); });
      });
    }
    var flowTick = false;
    function flow() {
      if (flowTick) return; flowTick = true;
      requestAnimationFrame(function () {
        flowTick = false;
        if (!phone.matches) { nights.forEach(function (n) { n.style.removeProperty('--d'); n.style.removeProperty('--ad'); }); return; }
        var sr = stage.getBoundingClientRect(), mid = sr.left + sr.width / 2, best = 0, bestD = 9;
        nights.forEach(function (n, i) {
          var r = n.getBoundingClientRect(), d = ((r.left + r.width / 2) - mid) / r.width;
          d = Math.max(-1.2, Math.min(1.2, d));
          n.style.setProperty('--d', d.toFixed(3)); n.style.setProperty('--ad', Math.abs(d).toFixed(3));
          if (Math.abs(d) < bestD) { bestD = Math.abs(d); best = i; }
        });
        tabs.forEach(function (t, i) { t.classList.toggle('is-on', i === best); });
      });
    }
    function centerOn(i, smooth) {
      var n = nights[i]; if (!n) return;
      stage.scrollTo({ left: n.offsetLeft - (stage.clientWidth - n.offsetWidth) / 2, behavior: smooth ? 'smooth' : 'auto' });
    }
    // les trois affiches se chargent ensemble dès que la section approche : jamais de cadre noir en changeant de soir
    if ('IntersectionObserver' in window) {
      var wio = new IntersectionObserver(function (en) {
        if (!en[0].isIntersecting) return;
        week.querySelectorAll('.wk-poster img').forEach(function (im) { im.loading = 'eager'; });
        wio.disconnect();
      }, { rootMargin: '900px 0px' });
      wio.observe(week);
    }
    stage.addEventListener('scroll', flow, { passive: true });
    if (!matchMedia('(pointer: fine)').matches && !reduce) {
      var wkIn = false;
      if ('IntersectionObserver' in window) new IntersectionObserver(function (en) { wkIn = en[0].isIntersecting; if (wkIn) requestAnimationFrame(gyroLoop); }, { threshold: .1 }).observe(week);
      var gyroLoop = function () {
        if (!wkIn) return;
        var g = window.BTGyro;
        if (g && g.on) {
          week.classList.add('has-gyro');
          var posters = week.querySelectorAll('.wk-poster');
          for (var i = 0; i < posters.length; i++) {
            posters[i].style.setProperty('--tx', (-g.x * 9).toFixed(2) + 'deg');
            posters[i].style.setProperty('--ty', (g.y * 13).toFixed(2) + 'deg');
            posters[i].style.setProperty('--gx', (50 + g.y * 45).toFixed(1) + '%');
            posters[i].style.setProperty('--gy', (40 + g.x * 40).toFixed(1) + '%');
          }
        }
        requestAnimationFrame(gyroLoop);
      };
    }
    addEventListener('resize', function () { if (phone.matches) centerOn(1, false); flow(); });
    tabs.forEach(function (t) { t.addEventListener('click', function () { centerOn(parseInt(t.getAttribute('data-wk-go'), 10), !reduce); }); });
    if (phone.matches) centerOn(1, false);   // sur téléphone, on arrive sur le samedi
    flow();
  }

  /* ── Le film : lecture muette quand il est à l'écran, son au clic, chapitres ── */
  var cine = document.querySelector('[data-cine]');
  if (cine) {
    var video = cine.querySelector('video');
    var tc = cine.querySelector('[data-tc]');
    var label = cine.querySelector('[data-label]');
    var soundBtn = cine.querySelector('[data-sound]');
    var chs = Array.prototype.slice.call(cine.querySelectorAll('.cine-ch'));
    var marks = chs.map(function (b) { return parseFloat(b.getAttribute('data-t')) || 0; });
    var inView = false, userPaused = false;

    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function update() {
      var t = video.currentTime || 0, d = video.duration || 32.4;
      if (tc) tc.textContent = '00:' + pad(Math.floor(t)) + ':' + pad(Math.floor((t % 1) * 25));
      var idx = 0;
      for (var i = 0; i < marks.length; i++) if (t >= marks[i] - .05) idx = i;
      chs.forEach(function (b, i) {
        var end = i + 1 < marks.length ? marks[i + 1] : d;
        var f = i < idx ? 1 : i > idx ? 0 : cl((t - marks[i]) / (end - marks[i]));
        b.style.setProperty('--f', f.toFixed(3));
        b.classList.toggle('is-on', i === idx);
      });
      if (label && chs[idx]) {
        var txt = chs[idx].getAttribute('data-label');
        if (label.getAttribute('data-cur') !== txt) { label.setAttribute('data-cur', txt); label.querySelector('span').textContent = txt; }
      }
    }
    video.addEventListener('timeupdate', update);
    function play() { if (!video.getAttribute('src')) video.setAttribute('src', video.getAttribute('data-src')); var p = video.play(); if (p && p.catch) p.catch(function () {}); }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) {
        inView = en[0].isIntersecting;
        if (inView && !userPaused && !reduce) play(); else video.pause();
      }, { threshold: .35 }).observe(cine);
    }
    soundBtn.addEventListener('click', function () {
      var on = video.muted;
      video.muted = !on;
      soundBtn.classList.toggle('is-on', on);
      soundBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      soundBtn.querySelector('[data-sound-txt]').textContent = on ? 'Couper le son' : 'Mettre le son';
      if (on) { userPaused = false; video.currentTime = 0; play(); }
    });
    chs.forEach(function (b, i) {
      b.addEventListener('click', function () { userPaused = false; play(); video.currentTime = marks[i]; update(); });
    });
    document.addEventListener('visibilitychange', function () { if (document.hidden) video.pause(); else if (inView && !userPaused && !reduce) play(); });
  }

  /* ── Les films complets, avec le son, dans une visionneuse ── */
  var box = document.getElementById('vbox');
  if (box) {
    var bv = box.querySelector('video'), bt = box.querySelector('.vbox-title'), lastFocus = null;
    function closeBox() {
      bv.pause(); bv.removeAttribute('src'); bv.load(); box.hidden = true; document.body.style.overflow = '';
      if (lastFocus) lastFocus.focus();
    }
    document.querySelectorAll('[data-film-src]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        lastFocus = btn;
        var cineVideo = document.querySelector('[data-cine] video'); if (cineVideo) cineVideo.pause();
        bv.setAttribute('poster', btn.getAttribute('data-film-poster') || '');
        bv.setAttribute('src', btn.getAttribute('data-film-src'));
        bt.textContent = btn.getAttribute('data-film-title') || '';
        box.hidden = false; document.body.style.overflow = 'hidden';
        var p = bv.play(); if (p && p.catch) p.catch(function () {});
        box.querySelector('.vbox-close').focus();
      });
    });
    box.querySelector('.vbox-close').addEventListener('click', closeBox);
    box.addEventListener('click', function (e) { if (e.target === box) closeBox(); });
    addEventListener('keydown', function (e) { if (e.key === 'Escape' && !box.hidden) closeBox(); });
  }

  /* ── Galerie : sur écran tactile, la photo au centre de l'écran reprend ses couleurs ── */
  if ('IntersectionObserver' in window && !matchMedia('(hover: hover)').matches) {
    var mio = new IntersectionObserver(function (en) {
      en.forEach(function (e) { e.target.classList.toggle('is-on', e.isIntersecting); });
    }, { rootMargin: '-38% 0px -38% 0px' });
    document.querySelectorAll('.m-item').forEach(function (m) { mio.observe(m); });
  }

  /* ── Rounds : le trait rouge/bleu se dessine quand le round arrive ── */
  if ('IntersectionObserver' in window) {
    var rio = new IntersectionObserver(function (en) {
      en.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('visible'); rio.unobserve(e.target); } });
    }, { threshold: .4 });
    document.querySelectorAll('.rounds li').forEach(function (li) { rio.observe(li); });
  }

  /* ── L'entrée des combattants : boucle muette, seulement quand elle est visible ── */
  var walk = document.querySelector('.ringwalk video');
  if (walk && 'IntersectionObserver' in window && !reduce) {
    new IntersectionObserver(function (en) {
      if (en[0].isIntersecting) { if (!walk.getAttribute('src')) walk.setAttribute('src', walk.getAttribute('data-src')); var p = walk.play(); if (p && p.catch) p.catch(function () {}); }
      else walk.pause();
    }, { threshold: .2 }).observe(walk);
  }
})();
