/* Volleyball Manager — отрисовка клубной символики: эмблемы и рисунка формы.
   Данные берутся из S.Identity, здесь только SVG. */
(function (global) {
  const S = global.SETKA;
  const NS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs, text) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }

  const SHAPES = {
    shield: 'M50 6 L88 18 V50 C88 72 70 86 50 94 C30 86 12 72 12 50 V18 Z',
    circle: 'M50 6 A44 44 0 1 1 49.9 6 Z',
    diamond: 'M50 4 L94 50 L50 96 L6 50 Z',
    hex: 'M50 5 L88 27 V73 L50 95 L12 73 V27 Z',
  };

  /** заливка формы: полосы, диагональ, обруч или сплошной цвет.
      scale уменьшает рисунок для маленьких фигурок на площадке. */
  function kitFill(defs, kit, id, scale) {
    const p = kit.pattern;
    const k = scale || 1;
    if (p === 'stripes') {
      const pat = el('pattern', { id, width: 4 * k, height: 8 * k, patternUnits: 'userSpaceOnUse' });
      pat.appendChild(el('rect', { width: 4 * k, height: 8 * k, fill: kit.shirt }));
      pat.appendChild(el('rect', { width: 1.5 * k, height: 8 * k, fill: kit.trim, opacity: 0.88 }));
      defs.appendChild(pat);
      return 'url(#' + id + ')';
    }
    if (p === 'hoop') {
      const pat = el('pattern', { id, width: 8 * k, height: 6 * k, patternUnits: 'userSpaceOnUse' });
      pat.appendChild(el('rect', { width: 8 * k, height: 6 * k, fill: kit.shirt }));
      pat.appendChild(el('rect', { width: 8 * k, height: 1.9 * k, y: 2 * k, fill: kit.trim, opacity: 0.88 }));
      defs.appendChild(pat);
      return 'url(#' + id + ')';
    }
    if (p === 'sash') {
      const pat = el('pattern', { id, width: 8 * k, height: 8 * k, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(35)' });
      pat.appendChild(el('rect', { width: 8 * k, height: 8 * k, fill: kit.shirt }));
      pat.appendChild(el('rect', { width: 2.4 * k, height: 8 * k, fill: kit.trim, opacity: 0.88 }));
      defs.appendChild(pat);
      return 'url(#' + id + ')';
    }
    if (p === 'split') {
      const grad = el('linearGradient', { id, x1: 0, y1: 0, x2: 1, y2: 0 });
      grad.appendChild(el('stop', { offset: '0.5', 'stop-color': kit.shirt }));
      grad.appendChild(el('stop', { offset: '0.5', 'stop-color': kit.trim }));
      defs.appendChild(grad);
      return 'url(#' + id + ')';
    }
    return kit.shirt;
  }

  let seq = 0;
  /** эмблема клуба как самостоятельный SVG */
  function crestSvg(club, size) {
    const id = S.Identity.of(club);
    const uid = 'cr' + (seq++);
    const svg = el('svg', { viewBox: '0 0 100 100', width: size, height: size, class: 'crest-svg' });
    const defs = el('defs', {});
    svg.appendChild(defs);
    const clip = el('clipPath', { id: uid + 'c' });
    clip.appendChild(el('path', { d: SHAPES[id.crest] || SHAPES.shield }));
    defs.appendChild(clip);
    const fill = kitFill(defs, { shirt: id.primary, trim: id.secondary, pattern: id.pattern }, uid + 'p');
    const g = el('g', { 'clip-path': 'url(#' + uid + 'c)' });
    g.appendChild(el('rect', { x: 0, y: 0, width: 100, height: 100, fill }));
    g.appendChild(el('rect', { x: 0, y: 0, width: 100, height: 38, fill: 'rgba(255,255,255,.14)' }));
    svg.appendChild(g);
    svg.appendChild(el('path', {
      d: SHAPES[id.crest] || SHAPES.shield, fill: 'none',
      stroke: 'rgba(0,0,0,.45)', 'stroke-width': 5,
    }));
    svg.appendChild(el('text', {
      x: 50, y: 50, 'text-anchor': 'middle', 'dominant-baseline': 'central',
      'font-size': id.monogram.length > 1 ? 38 : 46, 'font-weight': 900, 'letter-spacing': -1,
      fill: id.ink, stroke: 'rgba(0,0,0,.25)', 'stroke-width': 1.2, 'paint-order': 'stroke fill',
    }, id.monogram));
    return svg;
  }

  /** эмблема в html-обёртке нужного размера */
  function crestNode(club, size, cls) {
    const wrap = document.createElement('span');
    wrap.className = 'crest-wrap' + (cls ? ' ' + cls : '');
    wrap.style.width = size + 'px';
    wrap.style.height = size + 'px';
    wrap.appendChild(crestSvg(club, size));
    return wrap;
  }

  /** маленькая майка для редактора формы и списков */
  function shirtSvg(kit, size) {
    const uid = 'sh' + (seq++);
    const svg = el('svg', { viewBox: '0 0 48 44', width: size, height: size * 44 / 48 });
    const defs = el('defs', {});
    svg.appendChild(defs);
    const fill = kitFill(defs, kit, uid + 'p');
    svg.appendChild(el('path', {
      d: 'M16 4 L8 9 L4 20 L11 23 L11 40 H37 V23 L44 20 L40 9 L32 4 C30 9 18 9 16 4 Z',
      fill, stroke: 'rgba(0,0,0,.35)', 'stroke-width': 1.4, 'stroke-linejoin': 'round',
    }));
    return svg;
  }

  const SKIN = ['#e8b48c', '#d79a6f', '#c98a5e', '#f0c9a6', '#a8704a'];

  /**
   * Фигурка волейболиста: майка клуба, номер, руки внизу и поднятые.
   * Одна и та же используется на площадке и на церемонии награждения.
   */
  function figure(o) {
    const kit = o.kit, ink = o.ink || '#12203a', skin = o.skin || SKIN[0];
    const shorts = o.shorts || '#1b2233';
    const g = el('g', { class: o.cls || 'figure' });
    g.appendChild(el('ellipse', { cx: 0, cy: 0.6, rx: 5.2, ry: 1.9, fill: 'rgba(0,0,0,.32)' }));
    g.appendChild(el('rect', { x: -2.7, y: -7.2, width: 2.1, height: 7.4, rx: 1, fill: skin }));
    g.appendChild(el('rect', { x: 0.6, y: -7.2, width: 2.1, height: 7.4, rx: 1, fill: skin }));
    g.appendChild(el('rect', { x: -3.6, y: -10.2, width: 7.2, height: 3.8, rx: 1.2, fill: shorts }));
    const armsDown = el('g', { class: 'arms-down' });
    armsDown.appendChild(el('rect', { x: -5.9, y: -15.2, width: 1.9, height: 6.4, rx: 0.95, fill: skin }));
    armsDown.appendChild(el('rect', { x: 4.0, y: -15.2, width: 1.9, height: 6.4, rx: 0.95, fill: skin }));
    g.appendChild(armsDown);
    const armsUp = el('g', { class: 'arms-up' });
    armsUp.appendChild(el('rect', { x: -6.2, y: -21.4, width: 1.9, height: 7.4, rx: 0.95, fill: skin, transform: 'rotate(-12 -5.2 -14)' }));
    armsUp.appendChild(el('rect', { x: 4.3, y: -21.4, width: 1.9, height: 7.4, rx: 0.95, fill: skin, transform: 'rotate(12 5.2 -14)' }));
    g.appendChild(armsUp);
    g.appendChild(el('rect', { x: -4.3, y: -16.4, width: 8.6, height: 6.8, rx: 2.2, fill: kit }));
    g.appendChild(el('rect', { x: -4.3, y: -16.4, width: 8.6, height: 1.6, rx: 0.8, fill: 'rgba(255,255,255,.35)' }));
    if (o.number != null) {
      g.appendChild(el('text', {
        x: 0, y: -11.4, 'text-anchor': 'middle', 'font-size': 4.2, 'font-weight': 800, fill: ink,
      }, String(o.number)));
    }
    g.appendChild(el('circle', { cx: 0, cy: -19.1, r: 2.75, fill: skin }));
    g.appendChild(el('path', { d: 'M-2.75 -19.6a2.75 2.75 0 015.5 0z', fill: 'rgba(20,14,8,.55)' }));
    return g;
  }

  S.Crest = { crestSvg, crestNode, shirtSvg, kitFill, figure, SKIN, SHAPES, el };
})(typeof window !== 'undefined' ? window : globalThis);
