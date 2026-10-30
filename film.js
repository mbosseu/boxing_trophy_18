/* ============================================
   Boxing Trophy 19 — Lecteur « Édition 18 »
   Les séquences s'enchaînent comme un seul film.
   Lecture quand le lecteur est à l'écran, pause dès que l'attention part
   (défilement, autre onglet, autre fenêtre).
   ============================================ */
(function () {
  'use strict';

  var root = document.querySelector('[data-film]');
  if (!root) return;

  var clips = (root.getAttribute('data-clips') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  if (!clips.length) return;

  var videos = Array.prototype.slice.call(root.querySelectorAll('.film-video'));
  var active = videos[0];
  var buffer = videos[1];
  var progressEl = root.querySelector('[data-film-progress]');
  var timeEl = root.querySelector('[data-film-time]');
  var toggleBtn = root.querySelector('[data-film-toggle]');
  var totalEl = document.querySelector('[data-film-total]');
  var soundBtn = document.querySelector('[data-film-sound]');
  var section = root.closest('section');
  var ambient = section ? section.querySelector('.film-ambient') : null;
  var ambientCtx = ambient ? ambient.getContext('2d') : null;
  var lastAmbient = 0;

  var durations = clips.map(function () { return 0; });
  var current = 0;
  var bufferedIndex = -1;
  var inView = false;
  var settleTimer = null;
  var userPaused = false;
  var lightboxOpen = false;
  var muted = true;
  var saveData = !!(navigator.connection && navigator.connection.saveData);
  var rafId = null;
  var windowFocused = true;

  /* ---------- Barre de progression (un segment par séquence) ---------- */
  var fills = clips.map(function () {
    var seg = document.createElement('span');
    seg.className = 'film-seg';
    var fill = document.createElement('span');
    fill.className = 'film-seg-fill';
    seg.appendChild(fill);
    progressEl.appendChild(seg);
    return fill;
  });
  var segs = Array.prototype.slice.call(progressEl.children);

  function fmt(t) {
    t = Math.max(0, Math.floor(t));
    return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
  }

  function totalDuration() {
    return durations.reduce(function (a, b) { return a + b; }, 0);
  }

  function layoutSegments() {
    if (!durations.every(Boolean)) return;
    segs.forEach(function (seg, i) { seg.style.flexGrow = durations[i]; });
    if (totalEl) totalEl.textContent = fmt(totalDuration());
  }

  function renderProgress() {
    var t = active.currentTime || 0;
    var d = active.duration || durations[current] || 1;
    fills.forEach(function (fill, i) {
      var ratio = i < current ? 1 : i > current ? 0 : Math.min(1, t / d);
      fill.style.transform = 'scaleX(' + ratio + ')';
    });
    var elapsed = durations.slice(0, current).reduce(function (a, b) { return a + b; }, 0) + t;
    if (timeEl) timeEl.textContent = fmt(elapsed);
  }

  // Lumière d'ambiance : une miniature de l'image, floutée en CSS derrière la section
  function paintAmbient(force) {
    if (!ambientCtx || active.readyState < 2) return;
    var now = performance.now();
    if (!force && now - lastAmbient < 120) return;
    lastAmbient = now;
    try {
      ambientCtx.drawImage(active, 0, 0, ambient.width, ambient.height);
      section.classList.add('is-lit');
    } catch (e) {
      ambientCtx = null;
    }
  }

  function tick() {
    renderProgress();
    paintAmbient(false);
    rafId = active.paused ? null : requestAnimationFrame(tick);
  }

  // Durées réelles, chargées seulement à l'approche de la section
  function loadDurations() {
    clips.forEach(function (src, i) {
      var probe = document.createElement('video');
      probe.preload = 'metadata';
      probe.muted = true;
      probe.addEventListener('loadedmetadata', function () {
        durations[i] = probe.duration || 0;
        layoutSegments();
        probe.removeAttribute('src');
        probe.load();
      }, { once: true });
      probe.src = src;
    });
  }

  /* ---------- Enchaînement des séquences ---------- */
  function prepareBuffer(index) {
    if (bufferedIndex === index) return;
    bufferedIndex = index;
    buffer.preload = 'auto';
    buffer.src = clips[index];
    buffer.load();
  }

  function playVideo(v) {
    v.muted = muted;
    var p = v.play();
    if (p && p.catch) {
      p.catch(function () {
        // Lecture avec son refusée par le navigateur : on repasse en muet
        if (!v.muted) {
          setMuted(true);
          v.play().catch(function () {});
        }
      });
    }
  }

  function goTo(index, autoplay) {
    var next = index % clips.length;
    var useBuffer = bufferedIndex === next && buffer.readyState >= 2;
    if (useBuffer) {
      var old = active;
      active = buffer;
      buffer = old;
      buffer.pause();
      active.currentTime = 0;
    } else {
      active.src = clips[next];
    }
    videos.forEach(function (v) { v.classList.toggle('is-active', v === active); });
    current = next;
    bufferedIndex = -1;
    prepareBuffer((current + 1) % clips.length);
    renderProgress();
    if (autoplay) playVideo(active);
  }

  videos.forEach(function (v) {
    v.addEventListener('loadeddata', function () {
      if (v === active) paintAmbient(true);
    });
    v.addEventListener('ended', function () {
      if (v !== active) return;
      goTo(current + 1, shouldPlay());
    });
    v.addEventListener('play', function () {
      if (v !== active) return;
      root.classList.add('is-playing');
      toggleBtn.setAttribute('aria-label', 'Mettre la vidéo en pause');
      if (!rafId) rafId = requestAnimationFrame(tick);
    });
    v.addEventListener('pause', function () {
      if (v !== active) return;
      root.classList.remove('is-playing');
      toggleBtn.setAttribute('aria-label', 'Lire la vidéo');
    });
  });

  /* ---------- Attention de l'utilisateur ---------- */
  function shouldPlay() {
    return inView && !userPaused && !lightboxOpen &&
      document.visibilityState === 'visible' && windowFocused;
  }

  function sync() {
    if (shouldPlay()) {
      if (active.paused) playVideo(active);
    } else if (!active.paused) {
      active.pause();
    }
  }

  var started = false;
  function start() {
    if (started) return;
    started = true;
    loadDurations();
    active.src = clips[0];
    active.preload = 'auto';
    prepareBuffer(1);
  }

  if ('IntersectionObserver' in window) {
    // Préchargement à l'approche
    new IntersectionObserver(function (entries, obs) {
      if (entries[0].isIntersecting) { start(); obs.disconnect(); }
    }, { rootMargin: '600px 0px' }).observe(root);

    // Lecture quand le lecteur est bien visible et que le défilement s'est posé
    new IntersectionObserver(function (entries) {
      var visible = entries[0].intersectionRatio >= 0.6;
      if (visible) root.classList.add('is-locked');
      clearTimeout(settleTimer);
      if (visible && !inView) {
        settleTimer = setTimeout(function () {
          inView = true;
          if (!saveData) sync();
        }, 280);
      } else if (!visible) {
        inView = false;
        sync();
      }
    }, { threshold: [0, 0.6, 1] }).observe(root.querySelector('.film-frame'));
  } else {
    start();
  }

  document.addEventListener('visibilitychange', sync);
  window.addEventListener('blur', function () { windowFocused = false; sync(); });
  window.addEventListener('focus', function () { windowFocused = true; sync(); });
  document.addEventListener('bt19:lightbox', function (e) {
    lightboxOpen = !!(e.detail && e.detail.open);
    sync();
  });

  /* ---------- Contrôles ---------- */
  toggleBtn.addEventListener('click', function () {
    start();
    if (active.paused) {
      userPaused = false;
      inView = true;
      playVideo(active);
    } else {
      userPaused = true;
      active.pause();
    }
  });

  function setMuted(value) {
    muted = value;
    videos.forEach(function (v) { v.muted = value; });
    if (soundBtn) {
      soundBtn.setAttribute('aria-pressed', String(!value));
      soundBtn.classList.toggle('is-on', !value);
    }
    if (soundBtn) soundBtn.setAttribute('aria-label', value ? 'Activer le son' : 'Couper le son');
  }

  if (soundBtn) {
    soundBtn.addEventListener('click', function () {
      setMuted(!muted);
      if (!muted) {
        start();
        userPaused = false;
        sync();
      }
    });
  }

  /* ---------- Mise en scène : texte défilant, entrée 3D, inclinaison ---------- */
  var stage = section && section.querySelector('.film-stage');
  var tilt = root.querySelector('.film-tilt');
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!stage || !tilt || reduceMotion) return;

  var rows = Array.prototype.slice.call(stage.querySelectorAll('[data-marquee]')).map(function (el) {
    return { el: el, dir: Number(el.getAttribute('data-marquee')) || 1, offset: 0 };
  });
  var finePointer = window.matchMedia('(pointer: fine)').matches;
  var target = { rx: 0, ry: 0 };
  var tiltNow = { rx: 0, ry: 0 };
  var lastY = window.scrollY;
  var boost = 0;
  var lastT = 0;
  var stageVisible = false;
  var loopId = null;

  function frame(t) {
    var dt = lastT ? Math.min(64, t - lastT) / 1000 : 0;
    lastT = t;

    // Le défilement de la page accélère le texte
    var y = window.scrollY;
    boost = Math.min(900, boost * 0.92 + Math.abs(y - lastY) * 6);
    lastY = y;
    var speed = 50 + boost;
    rows.forEach(function (r) {
      var w = r.el.firstElementChild.offsetWidth || 1;
      r.offset = (r.offset + speed * dt) % w;
      var x = r.dir < 0 ? -r.offset : r.offset - w;
      r.el.style.transform = 'translate3d(' + x + 'px,0,0)';
    });

    // Entrée : le lecteur se redresse en arrivant à l'écran
    var rect = stage.getBoundingClientRect();
    var p = Math.max(0, Math.min(1, (window.innerHeight - rect.top) / (window.innerHeight * 0.75)));
    var eased = 1 - Math.pow(1 - p, 3);

    tiltNow.rx += (target.rx - tiltNow.rx) * 0.08;
    tiltNow.ry += (target.ry - tiltNow.ry) * 0.08;
    tilt.style.setProperty('--p', eased.toFixed(3));
    tilt.style.setProperty('--rx', tiltNow.rx.toFixed(2) + 'deg');
    tilt.style.setProperty('--ry', tiltNow.ry.toFixed(2) + 'deg');

    loopId = stageVisible ? requestAnimationFrame(frame) : null;
  }

  new IntersectionObserver(function (entries) {
    stageVisible = entries[0].isIntersecting;
    if (stageVisible && !loopId) { lastT = 0; loopId = requestAnimationFrame(frame); }
  }).observe(section);

  if (finePointer) {
    stage.addEventListener('pointermove', function (e) {
      var r = tilt.getBoundingClientRect();
      var x = (e.clientX - (r.left + r.width / 2)) / window.innerWidth;
      var y = (e.clientY - (r.top + r.height / 2)) / window.innerHeight;
      target.ry = Math.max(-1, Math.min(1, x * 2)) * 9;
      target.rx = Math.max(-1, Math.min(1, -y * 2)) * 7;
    });
    stage.addEventListener('pointerleave', function () { target.rx = 0; target.ry = 0; });
  }
})();
