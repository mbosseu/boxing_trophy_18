/* ============================================
   Boxing Trophy 19 — Lecteur « En coulisses »
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
  var soundLabel = document.querySelector('[data-film-sound-label]');

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

  function tick() {
    renderProgress();
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
    if (soundLabel) soundLabel.textContent = value ? 'Activer le son' : 'Couper le son';
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
})();
