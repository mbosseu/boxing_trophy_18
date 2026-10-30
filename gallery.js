/* ============================================
   Boxing Trophy 19 — Galerie photos & affiche (lightbox)
   ============================================ */
(function () {
  'use strict';

  var lightbox = document.getElementById('lightbox');
  var stage = document.getElementById('lightboxStage');
  var counter = document.getElementById('lightboxCount');
  if (!lightbox || !stage) return;

  var prevBtn = lightbox.querySelector('.lb-prev');
  var nextBtn = lightbox.querySelector('.lb-next');
  var closeBtn = lightbox.querySelector('.lb-close');

  var items = [];
  var index = 0;
  var lastFocus = null;

  function collect(selector, attr) {
    return Array.prototype.map.call(document.querySelectorAll(selector), function (el) {
      var img = el.querySelector('img');
      return { src: el.getAttribute(attr), alt: img ? img.alt : '', trigger: el };
    });
  }

  var photos = collect('[data-gallery] [data-full]', 'data-full');
  var posters = collect('[data-poster]', 'data-poster');

  function render() {
    var item = items[index];
    stage.innerHTML = '';
    var node = document.createElement('img');
    node.src = item.src;
    node.alt = item.alt;
    stage.appendChild(node);
    var many = items.length > 1;
    prevBtn.hidden = !many;
    nextBtn.hidden = !many;
    counter.textContent = many ? (index + 1) + ' / ' + items.length : '';
  }

  function open(list, i) {
    items = list;
    index = i;
    lastFocus = document.activeElement;
    render();
    lightbox.hidden = false;
    document.body.style.overflow = 'hidden';
    document.dispatchEvent(new CustomEvent('bt19:lightbox', { detail: { open: true } }));
    closeBtn.focus();
  }

  function close() {
    lightbox.hidden = true;
    stage.innerHTML = '';
    document.body.style.overflow = '';
    document.dispatchEvent(new CustomEvent('bt19:lightbox', { detail: { open: false } }));
    if (lastFocus) lastFocus.focus();
  }

  function step(delta) {
    index = (index + delta + items.length) % items.length;
    render();
  }

  photos.forEach(function (p, i) {
    p.trigger.addEventListener('click', function () { open(photos, i); });
  });
  posters.forEach(function (p) {
    p.trigger.addEventListener('click', function () { open([p], 0); });
  });

  prevBtn.addEventListener('click', function () { step(-1); });
  nextBtn.addEventListener('click', function () { step(1); });
  closeBtn.addEventListener('click', close);
  lightbox.addEventListener('click', function (e) {
    if (e.target === lightbox || e.target === stage) close();
  });

  document.addEventListener('keydown', function (e) {
    if (lightbox.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'Tab') {
      // garder le focus dans la visionneuse
      var focusables = Array.prototype.filter.call(
        lightbox.querySelectorAll('button'),
        function (el) { return !el.hidden; }
      );
      var first = focusables[0];
      var last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  // Swipe mobile
  var touchX = null;
  lightbox.addEventListener('touchstart', function (e) { touchX = e.touches[0].clientX; }, { passive: true });
  lightbox.addEventListener('touchend', function (e) {
    if (touchX === null || items.length < 2) return;
    var dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
    touchX = null;
  });
})();
