/* Сетка — церемонии награждения: подиум, кубок, конфетти, фанфара и овация трибун.
   Показываются очередью после того, как неделя или сезон досчитаны. */
(function (global) {
  const S = global.SETKA;
  const { U, ROLES } = S;
  const UI = S.UI, h = UI.h;

  const STYLES = {
    league:    { emoji: '🏆', ribbon: 'Чемпион', tint: '#ff9f1c', confetti: ['#ff9f1c', '#ffd166', '#ffffff', '#2dd4bf'] },
    cup:       { emoji: '🏅', ribbon: 'Обладатель Кубка', tint: '#e0e7ff', confetti: ['#c7d2fe', '#ffffff', '#ff9f1c'] },
    euro:      { emoji: '🌍', ribbon: 'Победитель еврокубка', tint: '#2dd4bf', confetti: ['#2dd4bf', '#ffffff', '#ff9f1c', '#60a5fa'] },
    promotion: { emoji: '⬆️', ribbon: 'Повышение', tint: '#4ade80', confetti: ['#4ade80', '#ffffff', '#ff9f1c'] },
    awards:    { emoji: '⭐', ribbon: 'Итоги сезона', tint: '#fbbf24', confetti: ['#fbbf24', '#ffffff'] },
  };

  /** кубок рисуем вектором: один файл, любой размер, без картинок */
  function trophySvg(tint) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 120 140');
    svg.setAttribute('width', '110');
    svg.setAttribute('height', '128');
    svg.innerHTML = `
      <defs>
        <linearGradient id="cupg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#ffe6a8"/><stop offset="0.5" stop-color="${tint}"/><stop offset="1" stop-color="#a35c00"/>
        </linearGradient>
      </defs>
      <path d="M34 14h52v28a26 26 0 01-52 0z" fill="url(#cupg)"/>
      <path d="M34 20H22a14 14 0 0014 22" fill="none" stroke="url(#cupg)" stroke-width="7" stroke-linecap="round"/>
      <path d="M86 20h12a14 14 0 01-14 22" fill="none" stroke="url(#cupg)" stroke-width="7" stroke-linecap="round"/>
      <rect x="53" y="66" width="14" height="20" fill="url(#cupg)"/>
      <path d="M38 92h44l4 14H34z" fill="url(#cupg)"/>
      <rect x="28" y="108" width="64" height="12" rx="3" fill="#2a3550"/>
      <rect x="34" y="112" width="52" height="4" rx="2" fill="rgba(255,255,255,.25)"/>`;
    return svg;
  }

  /** конфетти на canvas: дешевле и плавнее, чем сотня DOM-элементов */
  function confetti(canvas, colors) {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
    };
    resize();
    const count = reduce ? 40 : 130;
    const parts = [];
    for (let i = 0; i < count; i++) {
      parts.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height - canvas.height,
        w: (4 + Math.random() * 6) * dpr,
        hgt: (7 + Math.random() * 9) * dpr,
        vy: (1.1 + Math.random() * 2.2) * dpr,
        vx: (Math.random() - 0.5) * 1.4 * dpr,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.16,
        color: colors[i % colors.length],
      });
    }
    let raf = null, stopped = false;
    function frame() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      parts.forEach((p) => {
        p.y += p.vy; p.x += p.vx; p.rot += p.vr;
        if (p.y > canvas.height + 20) { p.y = -20; p.x = Math.random() * canvas.width; }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = 0.9;
        ctx.fillRect(-p.w / 2, -p.hgt / 2, p.w, p.hgt);
        ctx.restore();
      });
      if (!stopped) raf = requestAnimationFrame(frame);
    }
    if (reduce) { frame(); stopped = true; } else frame();
    return () => { stopped = true; if (raf) cancelAnimationFrame(raf); };
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
   * Показать одну церемонию. onDone вызывается после закрытия.
   */
  function show(game, cer, onDone) {
    const club = game.clubs[cer.clubId] || game.clubs[game.playerClubId];
    const style = STYLES[cer.type] || STYLES.awards;
    const ov = document.getElementById('overlay');
    ov.hidden = false;
    ov.innerHTML = '';
    ov.classList.add('ceremony');

    const canvas = h('canvas', { class: 'cer-confetti' });
    const stage = h('div', { class: 'cer-stage' });
    ov.append(canvas, stage);

    const fans = club.fans || { mood: 60 };
    stage.append(
      h('div', { class: 'cer-ribbon', style: 'color:' + style.tint, text: style.ribbon.toUpperCase() }),
      h('div', { class: 'cer-trophy' }, trophySvg(style.tint)),
      h('h2', { class: 'cer-title', text: cer.title }),
      h('div', { class: 'cer-sub', text: cer.subtitle + ' · сезон ' + (cer.season || game.seasonLabel) }),
      h('div', { class: 'cer-club' },
        UI.crest(club, 48),
        h('span', null,
          h('div', { style: 'font-weight:700', text: club.name }),
          h('div', { class: 'tiny dim', text: 'трибуны: ' + S.Fans.moodLabel(fans.mood) })))
    );

    if (cer.awards) {
      const a = cer.awards;
      stage.appendChild(h('div', { class: 'cer-block' },
        h('div', { class: 'section-title', style: 'margin:0 0 8px', text: 'Награды сезона' }),
        awardRow('MVP', a.mvp, style.tint),
        awardRow('бомбардир', a.scorer, style.tint),
        awardRow('блок', a.blocker, style.tint),
        awardRow('подача', a.server, style.tint),
        awardRow('либеро', a.libero, style.tint)));
      stage.appendChild(h('div', { class: 'cer-block' },
        h('div', { class: 'section-title', style: 'margin:0 0 8px', text: 'Символическая сборная' }),
        ...a.team.map((t) => awardRow(t.label, t.player, style.tint))));
    }

    if (cer.type !== 'awards') {
      const chant = S.Fans.chantFor(game, club, 'trophy');
      stage.appendChild(h('div', { class: 'cer-chant', text: '«' + chant + '»' }));
    }

    const stop = confetti(canvas, style.confetti);
    if (game.settings.sound) {
      S.Audio.resume();
      S.Audio.startCrowd(0.95);
      S.Audio.fanfare();
      setTimeout(() => S.Audio.chant(4, 1), 900);
    }

    stage.appendChild(h('button', {
      class: 'btn primary full', style: 'margin-top:18px',
      onclick: () => {
        stop();
        S.Audio.stopCrowd();
        ov.classList.remove('ceremony');
        ov.hidden = true;
        ov.innerHTML = '';
        if (onDone) onDone();
      },
    }, 'Спасибо, трибуны'));
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
