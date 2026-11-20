/* BOXING TROPHY 20 — Fumée rouge / bleue de l'affiche, calculée en temps réel.
   Un seul canevas WebGL derrière tout le site : coin rouge à gauche, coin bleu à droite, braises qui montent.
   Chaque section règle l'équilibre rouge/bleu et l'intensité (data-smoke="équilibre,intensité"). */
(function () {
  'use strict';
  var cv = document.getElementById('smoke');
  if (!cv) return;
  var gl = cv.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' });
  if (!gl) { cv.classList.add('no-gl'); return; }

  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var small = matchMedia('(max-width: 760px)').matches;

  var VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  var FS = [
    'precision mediump float;',
    'uniform vec2 R;uniform float T,B,I;uniform vec2 M;',
    'float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
    'float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x),f.y);}',
    'float fbm(vec2 p){float v=0.,a=.5;mat2 m=mat2(1.6,1.2,-1.2,1.6);for(int i=0;i<5;i++){v+=a*n(p);p=m*p;a*=.5;}return v;}',
    'void main(){',
    ' vec2 uv=gl_FragCoord.xy/R; float asp=R.x/R.y; vec2 p=uv*vec2(asp,1.);',
    ' float t=T*.05;',
    // fumée : bruit replié deux fois (domain warping), elle tourbillonne et monte
    ' vec2 q=vec2(fbm(p*1.5+vec2(0.,-t)),fbm(p*1.5+vec2(5.2,1.3)+t*.7));',
    ' vec2 r=vec2(fbm(p*1.8+2.8*q+vec2(1.7,9.2)-vec2(0.,t*1.4)),fbm(p*1.8+2.8*q+vec2(8.3,2.8)+t*.5));',
    ' float f=fbm(p*1.3+2.4*r);',
    ' float x=uv.x+(M.x-.5)*.05;',
    ' float s=.5+B*.22;',
    ' float wr=smoothstep(s+.18,s-.42,x), wb=smoothstep(s-.18,s+.42,x);',
    ' float d=smoothstep(.32,.98,f)*(.5+.5*length(q));',
    ' vec3 c=vec3(.010,.012,.026);',
    ' c+=mix(vec3(.62,.03,.07),vec3(1.,.32,.2),smoothstep(.55,1.,f))*d*wr*1.25;',
    ' c+=mix(vec3(.03,.22,.85),vec3(.45,.75,1.),smoothstep(.55,1.,f))*d*wb*1.25;',
    // le centre reste plus sombre : le texte se lit toujours
    ' float v=smoothstep(.0,.62,abs(uv.x-.5)*1.25+abs(uv.y-.5)*.35);',
    ' c*=I*(.38+.62*v);',
    // braises : une sur quinze cellules s'allume et monte
    ' vec2 g=vec2(uv.x*asp,uv.y)*vec2(22.,12.); g.y-=T*.55+sin(uv.x*9.+T*.3)*.3;',
    ' vec2 id=floor(g), fp=fract(g)-.5; float rr=h(id);',
    ' vec2 o=vec2(h(id+3.1),h(id+7.7))-.5; float e=length(fp-o*.6);',
    ' float sp=step(.935,rr)*smoothstep(.09,.0,e)*(.55+.45*sin(T*2.6+rr*60.));',
    ' c+=mix(vec3(1.,.42,.18),vec3(.5,.74,1.),smoothstep(s-.08,s+.08,uv.x))*sp*I*1.15;',
    ' gl_FragColor=vec4(c,1.);',
    '}'
  ].join('\n');

  function sh(type, src) {
    var o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o);
    if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o));
    return o;
  }
  var pr;
  try {
    pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error('link');
  } catch (e) { cv.classList.add('no-gl'); return; }
  gl.useProgram(pr);
  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(pr, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  var U = { R: gl.getUniformLocation(pr, 'R'), T: gl.getUniformLocation(pr, 'T'), B: gl.getUniformLocation(pr, 'B'), I: gl.getUniformLocation(pr, 'I'), M: gl.getUniformLocation(pr, 'M') };

  // Résolution réduite : la fumée est douce, la différence ne se voit pas, le téléphone ne chauffe pas
  var SCALE = small ? 0.32 : 0.42;
  function size() {
    var w = Math.max(2, Math.round(innerWidth * SCALE)), h = Math.max(2, Math.round(innerHeight * SCALE));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; gl.viewport(0, 0, w, h); }
  }
  size(); addEventListener('resize', size);

  // Équilibre rouge/bleu et intensité : suivent la section au centre de l'écran
  var cur = { b: 0, i: 1 }, tgt = { b: 0, i: 1 }, mouse = { x: .5, tx: .5 };
  var secs = document.querySelectorAll('[data-smoke]');
  if ('IntersectionObserver' in window && secs.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var v = (en.target.getAttribute('data-smoke') || '0,1').split(',');
        tgt.b = parseFloat(v[0]) || 0; tgt.i = parseFloat(v[1]); if (isNaN(tgt.i)) tgt.i = 1;
      });
    }, { rootMargin: '-48% 0px -48% 0px' });
    secs.forEach(function (s) { io.observe(s); });
  }
  addEventListener('scroll', function () { if (scrollY < innerHeight * .5) { tgt.b = 0; tgt.i = 1; } }, { passive: true });
  addEventListener('pointermove', function (e) { mouse.tx = e.clientX / innerWidth; }, { passive: true });

  var t0 = performance.now(), last = 0, raf = 0, running = true;
  function draw(now) {
    raf = requestAnimationFrame(draw);
    if (now - last < 33) return;           // 30 images par seconde suffisent pour de la fumée
    last = now;
    cur.b += (tgt.b - cur.b) * .04; cur.i += (tgt.i - cur.i) * .04; mouse.x += (mouse.tx - mouse.x) * .03;
    gl.uniform2f(U.R, cv.width, cv.height);
    gl.uniform1f(U.T, (now - t0) / 1000);
    gl.uniform1f(U.B, cur.b); gl.uniform1f(U.I, cur.i);
    gl.uniform2f(U.M, mouse.x, .5);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  if (reduce) {
    gl.uniform2f(U.R, cv.width, cv.height); gl.uniform1f(U.T, 12.0); gl.uniform1f(U.B, 0); gl.uniform1f(U.I, 1); gl.uniform2f(U.M, .5, .5);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return;
  }
  raf = requestAnimationFrame(draw);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && running) { cancelAnimationFrame(raf); running = false; }
    else if (!document.hidden && !running) { running = true; raf = requestAnimationFrame(draw); }
  });
})();
