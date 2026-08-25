/* Сетка — церемония награждения: команда выходит на подиум, капитану вручают кубок,
   он поднимает его над головой, и над залом бьёт салют в клубных цветах.
   Всё рисуется вектором и частицами на canvas: ни картинок, ни видео. */
(function (global) {
  const S = global.SETKA;
  const { U, ROLES } = S;
  const P = S.Players;
  const UI = S.UI, h = UI.h;
  const NS = 'http://www.w3.org/2000/svg';

  const STYLES = {
    league:    { ribbon: 'Чемпион',                 tint: '#ff9f1c' },
    cup:       { ribbon: 'Обладатель Кубка',        tint: '#e0e7ff' },
    euro:      { ribbon: 'Победитель еврокубка',    tint: '#2dd4bf' },
    promotion: { ribbon: 'Повышение в классе',      tint: '#4ade80' },
    awards:    { ribbon: 'Итоги сезона',            tint: '#fbbf24' },
  };

  function el(tag, attrs, text) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }

  /* ---------- кубок ---------- */
  function trophyGroup(tint, uid) {
    const g = el('g', { class: 'cer-cup' });
    const grad = el('linearGradient', { id: uid, x1: 0, y1: 0, x2: 1, y2: 1 });
    grad.appendChild(el('stop', { offset: 0, 'stop-color': '#ffe6a8' }));
    grad.appendChild(el('stop', { offset: 0.5, 'stop-color': tint }));
    grad.appendChild(el('stop', { offset: 1, 'stop-color': '#a35c00' }));
    const defs = el('defs', {});
    defs.appendChild(grad);
    g.appendChild(defs);
    const fill = 'url(#' + uid + ')';
    // кубок нарисован в системе координат, где 0,0 — точка хвата
    g.appendChild(el('path', { d: 'M-9 -30h18v10a9 9 0 01-18 0z', fill }));
    g.appendChild(el('path', { d: 'M-9 -28h-4a5 5 0 005 8', fill: 'none', stroke: fill, 'stroke-width': 2.4, 'stroke-linecap': 'round' }));
    g.appendChild(el('path', { d: 'M9 -28h4a5 5 0 01-5 8', fill: 'none', stroke: fill, 'stroke-width': 2.4, 'stroke-linecap': 'round' }));
    g.appendChild(el('rect', { x: -2.2, y: -10, width: 4.4, height: 6, fill }));
    g.appendChild(el('path', { d: 'M-6.5 -4h13l1.4 4.6H-7.9z', fill }));
    g.appendChild(el('rect', { x: -8, y: 0.4, width: 16, height: 3.4, rx: 1, fill: '#2a3550' }));
    g.appendChild(el('rect', { x: -6, y: 1.2, width: 12, height: 1.2, rx: .6, fill: 'rgba(255,255,255,.3)' }));
    return g;
  }

  /* ---------- сцена ---------- */
  function buildScene(game, cer, club, style) {
    const W = 340, H = 190;
    const svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'cer-scene' });
    const uid = 'cup' + Math.random().toString(36).slice(2, 7);
    const id = S.Identity.of(club);
    const kitFillDefs = el('defs', {});
    svg.appendChild(kitFillDefs);
    const kitFill = S.Crest.kitFill(kitFillDefs, { shirt: id.primary, trim: id.secondary, pattern: id.pattern }, uid + 'kit', 0.42);

    // зал: тёмный фон и два конуса света
    svg.appendChild(el('rect', { x: 0, y: 0, width: W, height: H, fill: 'transparent' }));
    [90, 250].forEach((x, i) => {
      const beam = el('path', {
        d: 'M' + x + ' -10 L' + (x - 46) + ' ' + H + ' L' + (x + 46) + ' ' + H + ' Z',
        fill: style.tint, opacity: 0, class: 'cer-beam',
      });
      beam.style.animationDelay = (0.15 + i * 0.12) + 's';
      svg.appendChild(beam);
    });

    // трибуны на заднем плане
    const stands = el('g', { class: 'cer-stands' });
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i < 26; i++) {
        if (Math.random() > 0.72) continue;
        stands.appendChild(el('circle', {
          cx: 10 + i * 13 + (r % 2) * 6, cy: 24 - r * 9, r: 2.4,
          fill: Math.random() > 0.5 ? id.primary : '#64748b', opacity: 0.55,
        }));
      }
    }
    svg.appendChild(stands);

    // подиум
    const podium = el('g', { class: 'cer-podium' });
    podium.appendChild(el('rect', { x: 40, y: 150, width: 260, height: 8, rx: 2, fill: '#1a2438' }));
    podium.appendChild(el('rect', { x: 128, y: 132, width: 84, height: 20, rx: 3, fill: '#243050' }));
    podium.appendChild(el('rect', { x: 128, y: 132, width: 84, height: 4, rx: 2, fill: 'rgba(255,255,255,.10)' }));
    podium.appendChild(el('text', {
      x: 170, y: 146, 'text-anchor': 'middle', 'font-size': 9, 'font-weight': 800, fill: style.tint,
    }, '1'));
    svg.appendChild(podium);

    // команда: капитан в центре на пьедестале, остальные по бокам
    const squad = club.squad.map((pid) => game.players[pid]).filter(Boolean)
      .sort((a, b) => (b.season.points || 0) - (a.season.points || 0));
    const captain = (club.fans && club.fans.favoriteId && game.players[club.fans.favoriteId]) || squad[0];
    const line = squad.filter((p) => p !== captain).slice(0, 6);
    const slots = [58, 90, 122, 218, 250, 282];
    const figures = [];
    line.forEach((p, i) => {
      const g = S.Crest.figure({
        kit: kitFill, ink: id.ink, number: i + 2, shorts: id.secondary,
        skin: S.Crest.SKIN[i % S.Crest.SKIN.length], cls: 'figure cer-player',
      });
      g.setAttribute('transform', 'translate(' + slots[i] + ' 152)');
      g.style.animationDelay = (0.25 + i * 0.09) + 's';
      svg.appendChild(g);
      figures.push(g);
    });
    const capG = S.Crest.figure({
      kit: kitFill, ink: id.ink, number: 1, shorts: id.secondary,
      skin: S.Crest.SKIN[2], cls: 'figure cer-player cer-captain',
    });
    capG.setAttribute('transform', 'translate(170 132)');
    capG.style.animationDelay = '0.7s';
    svg.appendChild(capG);
    figures.push(capG);

    // кубок: сначала спускается сверху, затем оказывается в руках капитана
    const cup = trophyGroup(style.tint, uid);
    cup.setAttribute('transform', 'translate(170 -40) scale(1.1)');
    svg.appendChild(cup);

    return { svg, cup, figures, capG, captain, id, W, H };
  }

  /* ---------- частицы: конфетти и салют ---------- */
  function particles(canvas, colors, reduce) {
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => { canvas.width = canvas.offsetWidth * dpr; canvas.height = canvas.offsetHeight * dpr; };
    resize();
    let confetti = [], sparks = [], rockets = [], raf = null, stopped = false;

    const addConfetti = (n) => {
      for (let i = 0; i < n; i++) {
        confetti.push({
          x: Math.random() * canvas.width, y: -20 * dpr - Math.random() * canvas.height * 0.6,
          w: (3 + Math.random() * 4) * dpr, hgt: (5 + Math.random() * 6) * dpr,
          vy: (1.2 + Math.random() * 2.4) * dpr, vx: (Math.random() - 0.5) * 1.6 * dpr,
          rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.2,
          color: colors[Math.floor(Math.random() * colors.length)],
          life: 1,
        });
      }
    };
    const burst = (x, y, color, n) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = (1.8 + Math.random() * 4.6) * dpr;
        sparks.push({
          x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: 1, decay: 0.008 + Math.random() * 0.009,
          color: Math.random() > 0.72 ? '#fff6e0' : color,
          size: (1.4 + Math.random() * 1.8) * dpr,
        });
      }
    };
    const launch = (color) => {
      const x = (0.12 + Math.random() * 0.76) * canvas.width;
      rockets.push({
        x, y: canvas.height * 0.92, vx: (Math.random() - 0.5) * 1.2 * dpr,
        vy: -(14 + Math.random() * 4) * dpr,
        target: (0.08 + Math.random() * 0.26) * canvas.height,
        color: color || colors[Math.floor(Math.random() * colors.length)],
      });
    };

    function frame() {
      // холст чистим полностью: хвосты рисуем сами отрезками, иначе конфетти размазывается
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      confetti.forEach((p) => {
        p.y += p.vy; p.x += p.vx; p.rot += p.vr;
        if (p.y > canvas.height + 24) { p.y = -20 * dpr; p.x = Math.random() * canvas.width; }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = 0.95;
        ctx.fillRect(-p.w / 2, -p.hgt / 2, p.w, p.hgt);
        ctx.restore();
      });
      ctx.globalAlpha = 1;

      rockets = rockets.filter((r) => {
        const px = r.x, py = r.y;
        r.x += r.vx; r.y += r.vy; r.vy += 0.17 * dpr;
        ctx.strokeStyle = '#fff3d6';
        ctx.lineWidth = 2 * dpr;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(r.x, r.y);
        ctx.stroke();
        if (r.y <= r.target || r.vy >= 0) {
          burst(r.x, r.y, r.color, 90);
          if (S.Audio) S.Audio.firework(0.9 + Math.random() * 0.3);
          return false;
        }
        return true;
      });

      ctx.globalCompositeOperation = 'lighter';
      sparks = sparks.filter((sp) => {
        const px = sp.x, py = sp.y;
        sp.x += sp.vx; sp.y += sp.vy;
        sp.vy += 0.055 * dpr; sp.vx *= 0.985; sp.vy *= 0.985;
        sp.life -= sp.decay;
        if (sp.life <= 0) return false;
        ctx.globalAlpha = Math.max(0, sp.life);
        ctx.strokeStyle = sp.color;
        ctx.lineWidth = sp.size;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(sp.x, sp.y);
        ctx.stroke();
        return true;
      });
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      if (!stopped) raf = requestAnimationFrame(frame);
    }

    if (reduce) {
      addConfetti(50);
      // один статичный кадр без движения
      confetti.forEach((p) => { p.y = Math.random() * canvas.height; });
      frame();
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
    } else {
      frame();
    }
    return {
      addConfetti, launch, burst,
      stop: () => { stopped = true; if (raf) cancelAnimationFrame(raf); },
    };
  }

  function awardRow(label, card, accent) {
    if (!card) return null;
    return h('div', { class: 'cer-award' },
      h('span', { class: 'role-badge role-' + card.role, text: ROLES[card.role] ? ROLES[card.role].short : '★' }),
      h('span', { class: 'grow' },
        h('div', { class: 'small', style: 'font-weight:600', text: card.name }),
        h('div', { class: 'tiny dim', text: card.club + (card.note ? ' · ' + card.note : '') })),
      h('span', { class: 'tiny', style: 'color:' + accent, text: label }));
  }

  /**
   * Показать церемонию. Сцена играется по шагам; onDone вызывается после закрытия.
   */
  function show(game, cer, onDone) {
    const club = game.clubs[cer.clubId] || game.clubs[game.playerClubId];
    const style = STYLES[cer.type] || STYLES.awards;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ov = document.getElementById('overlay');
    ov.hidden = false;
    ov.innerHTML = '';
    ov.classList.add('ceremony');

    const canvas = h('canvas', { class: 'cer-fx' });
    const scene = buildScene(game, cer, club, style);
    const sceneWrap = h('div', { class: 'cer-scene-wrap' }, scene.svg);
    const stage = h('div', { class: 'cer-stage' });
    ov.append(canvas, sceneWrap, stage);

    const id = scene.id;
    const fx = particles(canvas, [id.primary, id.secondary, '#ffd166', '#ffffff'], reduce);

    // текстовая часть появляется после кульминации
    const text = h('div', { class: 'cer-text' + (reduce ? ' shown' : '') },
      h('div', { class: 'cer-ribbon', style: 'color:' + style.tint, text: style.ribbon.toUpperCase() }),
      h('h2', { class: 'cer-title', text: cer.title }),
      h('div', { class: 'cer-sub', text: cer.subtitle + ' · сезон ' + (cer.season || game.seasonLabel) }),
      h('div', { class: 'cer-club' },
        UI.crest(club, 44),
        h('span', null,
          h('div', { style: 'font-weight:700', text: club.name }),
          h('div', { class: 'tiny dim', text: 'трибуны: ' + S.Fans.moodLabel(club.fans ? club.fans.mood : 60) }))));
    stage.appendChild(text);

    const rest = h('div', { class: 'cer-rest' + (reduce ? ' shown' : '') });
    stage.appendChild(rest);
    if (scene.captain) {
      rest.appendChild(h('div', { class: 'cer-captain-line' },
        'Кубок поднимает ', h('b', { text: P.fullName(scene.captain) }),
        h('span', { class: 'dim', text: ' · ' + ROLES[scene.captain.role].name.toLowerCase() })));
    }
    if (cer.awards) {
      const a = cer.awards;
      rest.appendChild(h('div', { class: 'cer-block' },
        h('div', { class: 'section-title', style: 'margin:0 0 8px', text: 'Награды сезона' }),
        awardRow('MVP', a.mvp, style.tint),
        awardRow('бомбардир', a.scorer, style.tint),
        awardRow('блок', a.blocker, style.tint),
        awardRow('подача', a.server, style.tint),
        awardRow('либеро', a.libero, style.tint)));
      rest.appendChild(h('div', { class: 'cer-block' },
        h('div', { class: 'section-title', style: 'margin:0 0 8px', text: 'Символическая сборная' }),
        ...a.team.map((t) => awardRow(t.label, t.player, style.tint))));
    }
    if (cer.type !== 'awards') {
      rest.appendChild(h('div', { class: 'cer-chant', text: '«' + S.Fans.chantFor(game, club, 'trophy') + '»' }));
    }
    const done = h('button', {
      class: 'btn primary full', style: 'margin-top:18px',
      onclick: () => {
        clearTimers();
        fx.stop();
        S.Audio.stopCrowd();
        ov.classList.remove('ceremony');
        ov.hidden = true;
        ov.innerHTML = '';
        if (onDone) onDone();
      },
    }, 'Спасибо, трибуны');
    rest.appendChild(done);

    /* ---------- сценарий ---------- */
    const timers = [];
    const at = (ms, fn) => timers.push(setTimeout(fn, ms));
    const clearTimers = () => { timers.forEach(clearTimeout); timers.length = 0; if (live.raf) cancelAnimationFrame(live.raf); };
    const live = { raf: null };
    const sound = game.settings.sound;

    /** плавно провести кубок из точки в точку */
    function moveCup(from, to, ms, after) {
      if (reduce) {
        scene.cup.setAttribute('transform', 'translate(' + to[0] + ' ' + to[1] + ') scale(' + to[2] + ')');
        if (after) after();
        return;
      }
      const t0 = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - t0) / ms);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;   // мягкий вход и выход
        const x = from[0] + (to[0] - from[0]) * e;
        const y = from[1] + (to[1] - from[1]) * e;
        const s = from[2] + (to[2] - from[2]) * e;
        scene.cup.setAttribute('transform', 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ') scale(' + s.toFixed(2) + ')');
        if (t < 1) live.raf = requestAnimationFrame(step);
        else if (after) after();
      };
      live.raf = requestAnimationFrame(step);
    }

    if (sound) { S.Audio.resume(); S.Audio.startCrowd(0.9); }

    if (reduce) {
      scene.figures.forEach((g) => g.classList.add('shown'));
      scene.capG.classList.add('reach');
      scene.cup.setAttribute('transform', 'translate(170 110) scale(1.15)');
      if (sound) { S.Audio.fanfare(); }
    } else {
      // 1. команда выходит на подиум
      scene.figures.forEach((g) => g.classList.add('shown'));
      // 2. кубок спускается к капитану
      at(1100, () => {
        if (sound) S.Audio.fanfare();
        moveCup([170, -40, 1.1], [170, 119, 1.0], 900, () => {
          scene.capG.classList.add('hold');
        });
      });
      // 3. капитан поднимает кубок — команда прыгает, летит конфетти
      at(2200, () => {
        scene.capG.classList.remove('hold');
        scene.capG.classList.add('reach');
        moveCup([170, 119, 1.0], [170, 110, 1.18], 520);
        scene.figures.forEach((g, i) => {
          setTimeout(() => { g.classList.add('cheer'); }, i * 70);
        });
        fx.addConfetti(110);
        if (sound) { S.Audio.crowdReact(true, 1.6); S.Audio.applause(3.4); }
      });
      // 4. салют — три волны
      [2500, 3000, 3600, 4300, 5000].forEach((ms, i) => at(ms, () => {
        const n = i >= 3 ? 3 : 2;
        for (let k = 0; k < n; k++) {
          setTimeout(() => {
            fx.launch(k % 2 ? id.secondary : id.primary);
            if (sound) S.Audio.rocket(0.8);
          }, k * 240);
        }
      }));
      at(5900, () => { if (sound) S.Audio.chant(4, 1); });
      // 5. текст и награды
      at(2600, () => text.classList.add('shown'));
      at(3200, () => rest.classList.add('shown'));
    }

    return stage;
  }

  /** показать все накопившиеся церемонии подряд */
  function drain(game, onDone) {
    const queue = game.ceremonies || [];
    if (!queue.length) { if (onDone) onDone(); return false; }
    const next = queue.shift();
    show(game, next, () => drain(game, onDone));
    return true;
  }

  S.Ceremony = { show, drain, STYLES };
})(typeof window !== 'undefined' ? window : globalThis);
