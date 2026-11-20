/* Medaillon 3D Trophy 20 (section licence) : epaisseur, etincelles, inclinaison souris. */
(function () {
  var root = document.getElementById('trophy3d');
  if (!root) return;

  // Epaisseur de la piece : couches empilees entre les deux faces
  var edge = root.querySelector('.t3d-edge');
  for (var z = -13; z <= 13; z += 2) {
    var layer = document.createElement('span');
    layer.style.transform = 'translateZ(' + z + 'px)';
    edge.appendChild(layer);
  }

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;

  // Etincelles qui montent
  var sparks = root.querySelector('.t3d-sparks');
  for (var i = 0; i < 14; i++) {
    var b = document.createElement('b');
    b.style.left = (25 + Math.random() * 50) + '%';
    b.style.setProperty('--d', (3 + Math.random() * 3).toFixed(2) + 's');
    b.style.setProperty('--w', (Math.random() * 5).toFixed(2) + 's');
    b.style.setProperty('--x', Math.round(Math.random() * 80 - 40) + 'px');
    sparks.appendChild(b);
  }

  // Inclinaison suivant la souris (ecrans avec pointeur fin)
  if (!window.matchMedia('(pointer: fine)').matches) return;
  var section = document.getElementById('licence') || root;
  var tilt = root.querySelector('.t3d-tilt');
  var raf = 0;
  section.addEventListener('mousemove', function (e) {
    if (raf) return;
    raf = requestAnimationFrame(function () {
      raf = 0;
      var r = root.getBoundingClientRect();
      var dx = (e.clientX - (r.left + r.width / 2)) / window.innerWidth;
      var dy = (e.clientY - (r.top + r.height / 2)) / window.innerHeight;
      tilt.style.setProperty('--t3d-ry', (dx * 40).toFixed(2) + 'deg');
      tilt.style.setProperty('--t3d-rx', (8 - dy * 30).toFixed(2) + 'deg');
    });
  });
  section.addEventListener('mouseleave', function () {
    tilt.style.setProperty('--t3d-ry', '0deg');
    tilt.style.setProperty('--t3d-rx', '8deg');
  });
})();
