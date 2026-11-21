/* BOXING TROPHY 20 — le pass combattant du sas licence.
   Suit la souris (ou le doigt), se balance quand on ne le touche pas, grave le numéro de licence
   pendant la saisie, tamponne « Validée » à 6-7 chiffres, se retourne sur la licence loisir quand on répond « Non ». */
(function () {
  'use strict';
  var pass = document.getElementById('fightPass');
  if (!pass) return;
  var tilt = pass.querySelector('.pass-tilt');
  var edge = pass.querySelector('.pass-edge');
  var burst = pass.querySelector('.pass-burst');
  var slots = Array.prototype.slice.call(pass.querySelectorAll('[data-pass-digits] i'));
  var input = document.getElementById('gateNumeroLicence');
  var cont = document.getElementById('gateLicenceContinue');
  var section = document.getElementById('licence') || pass;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var RE = /^\d{6,7}$/;

  // épaisseur : 9 tranches entre les deux faces
  for (var z = -4; z <= 4; z++) {
    var s = document.createElement('span');
    s.style.transform = 'translateZ(' + z + 'px)';
    s.style.filter = 'brightness(' + (0.55 + (4 - Math.abs(z)) * 0.08).toFixed(2) + ')';
    edge.appendChild(s);
  }

  /* ── Le numéro se grave chiffre par chiffre ── */
  var last = '';
  function render(val, animate) {
    val = String(val || '').replace(/\D/g, '').slice(0, 7);
    slots.forEach(function (el, i) {
      var ch = val.charAt(i);
      el.textContent = ch || '–';
      el.classList.toggle('on', !!ch);
      if (animate && ch && i >= last.length) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
    });
    if (animate && val.length > last.length) kick(val.length % 2 ? 7 : -7);
    var wasValid = pass.getAttribute('data-state') === 'valid';
    var valid = RE.test(val);
    if (!pass.classList.contains('is-flipped')) pass.setAttribute('data-state', valid ? 'valid' : 'idle');
    if (valid && !wasValid && animate) sparks();
    last = val;
  }
  if (input) input.addEventListener('input', function () { render(input.value, true); });

  /* ── Oui : recto (numéro) · Non : verso (licence loisir 50 €) ── */
  document.querySelectorAll('input[name="gateLicencie"]').forEach(function (r) {
    r.addEventListener('change', function () {
      var no = r.value === 'Non' && r.checked;
      pass.classList.toggle('is-flipped', no);
      pass.setAttribute('data-state', no ? 'idle' : (RE.test(last) ? 'valid' : 'idle'));
      kick(no ? 0 : 0);
    });
  });
  if (cont) cont.addEventListener('click', function () {
    if (input && !RE.test(input.value.trim())) { pass.classList.remove('is-shake'); void pass.offsetWidth; pass.classList.add('is-shake'); }
  });
  pass.addEventListener('animationend', function (e) { if (e.animationName === 'pass-shake') pass.classList.remove('is-shake'); });

  // Retour sur la page avec un sas déjà franchi : le pass l'affiche
  try {
    var g = window.BT20LicenceGate && window.BT20LicenceGate.readGate();
    if (g && g.kind === 'existing' && RE.test(String(g.numeroLicence || ''))) render(g.numeroLicence, false);
    else if (g && g.kind === 'paid_50') { pass.classList.add('is-flipped'); pass.setAttribute('data-state', 'paid'); }
  } catch (e) {}

  /* ── Étincelles rouges à gauche, bleues à droite ── */
  function sparks() {
    if (reduce) return;
    for (var i = 0; i < 22; i++) {
      var b = document.createElement('b');
      var a = Math.random() * Math.PI * 2, d = 90 + Math.random() * 150;
      var x = Math.cos(a) * d, y = Math.sin(a) * d * 0.8 - 30;
      b.style.setProperty('--x', x.toFixed(0) + 'px');
      b.style.setProperty('--y', y.toFixed(0) + 'px');
      b.style.setProperty('--d', (0.7 + Math.random() * 0.6).toFixed(2) + 's');
      b.style.background = x < 0 ? '#ff4b3a' : '#5c9dff';
      b.style.boxShadow = '0 0 8px 2px ' + (x < 0 ? 'rgba(255,60,50,.8)' : 'rgba(80,150,255,.8)');
      burst.appendChild(b);
      setTimeout(function (el) { return function () { el.remove(); }; }(b), 1500);
    }
  }

  /* ── Mouvement : balancement au repos, la souris (ou le doigt) prend la main ── */
  var cur = { rx: 0, ry: 0 }, tgt = { rx: 0, ry: 0 }, imp = 0, hov = 0, hovT = 0, ptr = null, lastMove = 0, inView = false, raf = 0;
  function kick(v) { imp += v; }
  var fine = matchMedia('(pointer: fine)').matches;
  function aim(clientX, clientY, strong) {
    var r = tilt.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var dx = (clientX - cx) / (strong ? r.width * .7 : innerWidth * .5), dy = (clientY - cy) / (strong ? r.height * .7 : innerHeight * .5);
    dx = Math.max(-1, Math.min(1, dx)); dy = Math.max(-1, Math.min(1, dy));
    ptr = { ry: dx * (strong ? 26 : 18), rx: -dy * (strong ? 18 : 10) };
    lastMove = performance.now();
  }
  if (fine) {
    section.addEventListener('pointermove', function (e) {
      var r = tilt.getBoundingClientRect();
      var over = e.clientX > r.left - 40 && e.clientX < r.right + 40 && e.clientY > r.top - 40 && e.clientY < r.bottom + 40;
      hovT = over ? 1 : 0;
      aim(e.clientX, e.clientY, over);
    });
    section.addEventListener('pointerleave', function () { ptr = null; hovT = 0; });
  } else {
    pass.addEventListener('pointermove', function (e) { if (e.pointerType === 'touch') { aim(e.clientX, e.clientY, true); hovT = 1; } }, { passive: true });
    pass.addEventListener('pointerup', function () { ptr = null; hovT = 0; });
    pass.addEventListener('pointercancel', function () { ptr = null; hovT = 0; });
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    var t = now / 1000;
    if (ptr && now - lastMove > 2600) { ptr = null; hovT = 0; }
    var gy = window.BTGyro;
    if (ptr) { tgt.rx = ptr.rx; tgt.ry = ptr.ry; }
    else if (!fine && gy && gy.on) { tgt.rx = -gy.x * 16; tgt.ry = gy.y * 24; hovT = .75; }   // téléphone : on incline l'appareil, le pass suit
    else { tgt.rx = Math.cos(t * .5) * 6; tgt.ry = Math.sin(t * .62) * 16; }
    cur.rx += (tgt.rx - cur.rx) * .08; cur.ry += (tgt.ry - cur.ry) * .08;
    imp *= .86; hov += (hovT - hov) * .1;
    var ry = cur.ry + imp, rx = cur.rx;
    var ty = reduce ? 0 : Math.sin(t * .9) * 7;
    pass.style.setProperty('--rx', rx.toFixed(2) + 'deg');
    pass.style.setProperty('--ry', ry.toFixed(2) + 'deg');
    pass.style.setProperty('--ty', ty.toFixed(1) + 'px');
    pass.style.setProperty('--fl', (1 - (ty + 7) / 14).toFixed(2));
    // le film holographique et le reflet glissent avec l'angle
    var side = pass.classList.contains('is-flipped') ? -1 : 1;
    pass.style.setProperty('--hx', (50 + ry * 2.4 * side).toFixed(1) + '%');
    pass.style.setProperty('--hy', (50 - rx * 3).toFixed(1) + '%');
    pass.style.setProperty('--gx', (50 + ry * 2.2 * side).toFixed(1) + '%');
    pass.style.setProperty('--gy', (35 - rx * 2.6).toFixed(1) + '%');
    pass.style.setProperty('--hov', hov.toFixed(2));
  }
  if (reduce) {
    pass.style.setProperty('--ry', '-12deg'); pass.style.setProperty('--rx', '4deg');
    return;
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (en) {
      inView = en[0].isIntersecting;
      if (inView && !raf) raf = requestAnimationFrame(frame);
      else if (!inView && raf) { cancelAnimationFrame(raf); raf = 0; }
    }, { rootMargin: '120px' }).observe(pass);
  } else raf = requestAnimationFrame(frame);
})();
