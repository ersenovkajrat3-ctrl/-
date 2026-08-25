/* Сетка — графики: линия, столбики со знаком и радар навыков.
   Всё рисуется SVG вручную: библиотек нет, стиль общий с интерфейсом.
   Палитра серий проверена на различимость при дальтонизме и контраст с тёмным фоном. */
(function (global) {
  const S = global.SETKA;
  const NS = 'http://www.w3.org/2000/svg';
  const C1 = '#cf7a12';   // основная серия
  const C2 = '#0f9d90';   // вторая серия
  const cssVar = (name, fallback) => {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    } catch (e) { return fallback; }
  };
  // сетка и подписи берут цвет из темы, чтобы график читался и на светлом фоне
  const GRID = () => cssVar('--line', 'rgba(255,255,255,.10)');
  const INK = () => cssVar('--dim', '#8b98b0');
  const SURFACE = () => cssVar('--panel', '#131c2e');

  function el(tag, attrs, text) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }
  function wrap(svg, caption) {
    const box = document.createElement('div');
    box.className = 'chart';
    box.appendChild(svg);
    if (caption) {
      const cap = document.createElement('div');
      cap.className = 'chart-cap';
      cap.textContent = caption;
      box.appendChild(cap);
    }
    return box;
  }

  /**
   * Линия изменения во времени. Одна серия — легенда не нужна, заголовок её называет.
   * invert — для мест в таблице: первое место сверху.
   */
  function line(points, opts = {}) {
    const w = 300, hgt = opts.height || 110;
    const padL = 24, padR = 10, padT = 10, padB = 18;
    const svg = el('svg', { viewBox: '0 0 ' + w + ' ' + hgt, class: 'chart-svg', role: 'img' });
    if (!points.length) return wrap(svg, opts.caption);
    const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    let minY = opts.minY != null ? opts.minY : Math.min(...ys);
    let maxY = opts.maxY != null ? opts.maxY : Math.max(...ys);
    if (minY === maxY) { minY -= 1; maxY += 1; }
    const px = (x) => padL + (maxX === minX ? 0.5 : (x - minX) / (maxX - minX)) * (w - padL - padR);
    const py = (y) => {
      const t = (y - minY) / (maxY - minY);
      return opts.invert ? padT + t * (hgt - padT - padB) : hgt - padB - t * (hgt - padT - padB);
    };
    // сетка и подписи оси — приглушённые, чтобы не спорить с данными
    const ticks = opts.ticks || [minY, (minY + maxY) / 2, maxY];
    ticks.forEach((t) => {
      const y = py(t);
      svg.appendChild(el('line', { x1: padL, y1: y, x2: w - padR, y2: y, stroke: GRID(), 'stroke-width': 1 }));
      svg.appendChild(el('text', { x: padL - 5, y: y + 3, 'text-anchor': 'end', 'font-size': 8, fill: INK() }, opts.fmtY ? opts.fmtY(t) : Math.round(t)));
    });
    const d = points.map((p, i) => (i ? 'L' : 'M') + px(p.x).toFixed(1) + ' ' + py(p.y).toFixed(1)).join(' ');
    if (opts.area) {
      svg.appendChild(el('path', {
        d: d + ' L' + px(maxX).toFixed(1) + ' ' + (hgt - padB) + ' L' + px(minX).toFixed(1) + ' ' + (hgt - padB) + ' Z',
        fill: (opts.color || C1) + '22',
      }));
    }
    svg.appendChild(el('path', { d, fill: 'none', stroke: opts.color || C1, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    // выделяем последнюю точку — она отвечает на вопрос «а сейчас как»
    const last = points[points.length - 1];
    svg.appendChild(el('circle', { cx: px(last.x), cy: py(last.y), r: 4.2, fill: opts.color || C1, stroke: SURFACE(), 'stroke-width': 2 }));
    svg.appendChild(el('text', {
      x: Math.min(w - padR, px(last.x) + 8), y: py(last.y) - 7, 'text-anchor': 'end', 'font-size': 10,
      'font-weight': 700, fill: cssVar('--text', '#e9eefa'),
    }, opts.fmtY ? opts.fmtY(last.y) : last.y));
    // подписи краёв по оси X
    svg.appendChild(el('text', { x: padL, y: hgt - 5, 'font-size': 8, fill: INK() }, opts.xFirst || ''));
    svg.appendChild(el('text', { x: w - padR, y: hgt - 5, 'text-anchor': 'end', 'font-size': 8, fill: INK() }, opts.xLast || ''));
    return wrap(svg, opts.caption);
  }

  /** Столбики со знаком: направление от нуля само кодирует плюс/минус, цвет лишь дублирует. */
  function signedBars(items, opts = {}) {
    const w = 300, hgt = opts.height || 108;
    const padT = 12, padB = 16, padL = 6, padR = 6;
    const svg = el('svg', { viewBox: '0 0 ' + w + ' ' + hgt, class: 'chart-svg', role: 'img' });
    if (!items.length) return wrap(svg, opts.caption);
    const max = Math.max(1, ...items.map((i) => Math.abs(i.value)));
    const zoneH = hgt - padT - padB;
    const zeroY = padT + zoneH / 2;
    // столбики не расползаются на всю ширину, когда их мало
    const usable = w - padL - padR;
    const bw = Math.max(6, Math.min(34, usable / items.length - 6));
    const step = Math.min(usable / items.length, bw + 10);
    const x0 = padL + (usable - step * items.length) / 2;
    svg.appendChild(el('line', { x1: padL, y1: zeroY, x2: w - padR, y2: zeroY, stroke: GRID(), 'stroke-width': 1 }));
    items.forEach((it, i) => {
      const x = x0 + i * step + (step - bw) / 2;
      const h = Math.max(2, Math.abs(it.value) / max * (zoneH / 2 - 10));
      const up = it.value >= 0;
      svg.appendChild(el('rect', {
        x, y: up ? zeroY - h : zeroY, width: bw, height: h, rx: 3,
        fill: up ? C2 : C1,
      }));
      if (opts.fmtValue) {
        svg.appendChild(el('text', {
          x: x + bw / 2, y: up ? zeroY - h - 4 : zeroY + h + 9, 'text-anchor': 'middle',
          'font-size': 8, 'font-weight': 700, fill: cssVar('--text', '#e9eefa'),
        }, opts.fmtValue(it.value)));
      }
      if (it.label) {
        svg.appendChild(el('text', {
          x: x + bw / 2, y: hgt - 4, 'text-anchor': 'middle', 'font-size': 7.5, fill: INK(),
        }, it.label));
      }
    });
    return wrap(svg, opts.caption);
  }

  /** Радар навыков: игрок и средний по составу — две серии, обе подписаны по осям. */
  function radar(axes, series, opts = {}) {
    const size = 210, cx = size / 2, cy = size / 2 - 4, r = 68;
    const svg = el('svg', { viewBox: '0 0 ' + size + ' ' + size, class: 'chart-svg', role: 'img' });
    const n = axes.length;
    const pt = (i, v) => {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
      const rr = (v / 100) * r;
      return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
    };
    [25, 50, 75, 100].forEach((ring) => {
      const d = axes.map((_, i) => { const [x, y] = pt(i, ring); return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1); }).join(' ') + ' Z';
      svg.appendChild(el('path', { d, fill: 'none', stroke: GRID(), 'stroke-width': 1 }));
    });
    axes.forEach((_, i) => {
      const [x, y] = pt(i, 100);
      svg.appendChild(el('line', { x1: cx, y1: cy, x2: x, y2: y, stroke: GRID(), 'stroke-width': 1 }));
    });
    series.forEach((ser) => {
      const d = ser.values.map((v, i) => { const [x, y] = pt(i, v); return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1); }).join(' ') + ' Z';
      svg.appendChild(el('path', { d, fill: ser.color + (ser.fill === false ? '00' : '28'), stroke: ser.color, 'stroke-width': 2, 'stroke-linejoin': 'round' }));
      if (ser.dots !== false) {
        ser.values.forEach((v, i) => {
          const [x, y] = pt(i, v);
          svg.appendChild(el('circle', { cx: x, cy: y, r: 3, fill: ser.color, stroke: SURFACE(), 'stroke-width': 1.5 }));
        });
      }
    });
    axes.forEach((label, i) => {
      const [x, y] = pt(i, 128);
      svg.appendChild(el('text', {
        x, y: y + 3, 'text-anchor': x > cx + 6 ? 'start' : x < cx - 6 ? 'end' : 'middle',
        'font-size': 9, fill: INK(),
      }, label));
    });
    return wrap(svg, opts.caption);
  }

  /** легенда: цвет плюс подпись, никогда не цвет в одиночку */
  function legend(items) {
    const box = document.createElement('div');
    box.className = 'chart-legend';
    items.forEach((it) => {
      const s = document.createElement('span');
      s.innerHTML = '<i style="background:' + it.color + '"></i>';
      s.appendChild(document.createTextNode(it.label));
      box.appendChild(s);
    });
    return box;
  }

  S.Charts = { line, signedBars, radar, legend, C1, C2 };
})(typeof window !== 'undefined' ? window : globalThis);
