/* Volleyball Manager — СМИ: вымышленные газеты и интернет-порталы.
   Отдельная от «Подачи» колонка: соцсети реагируют эмоцией, пресса — заголовком,
   разбором и оценкой за матч. У каждого издания свой охват и своя редакционная линия,
   поэтому один и тот же матч читается по-разному в зависимости от того, кто пишет. */
(function (global) {
  const S = global.SETKA || (global.SETKA = {});
  const { U } = S;

  /* kind: paper — газета, portal — интернет-портал.
     slant: loyal — лояльное, neutral — взвешенное, analytic — аналитическое,
            critic — критическое, tabloid — жёлтое.
     reach: охват в тысячах читателей, он же вес издания для медийности.
     divMax: до какого дивизиона включительно издание вообще замечает клуб. */
  const OUTLETS = [
    { id: 'ploshadka', name: 'Спортивная площадка', short: 'СП', kind: 'paper',  slant: 'neutral',  reach: 320, divMax: 1 },
    { id: 'ataka',     name: 'Атака',               short: 'АТ', kind: 'paper',  slant: 'analytic', reach: 145, divMax: 1 },
    { id: 'tribuna',   name: 'Трибуна недели',      short: 'ТН', kind: 'paper',  slant: 'tabloid',  reach: 260, divMax: 1 },
    { id: 'vesti',     name: 'Городские вести',     short: 'ГВ', kind: 'paper',  slant: 'loyal',    reach: 42,  divMax: 3 },
    { id: 'pipe',      name: 'Пайп.ру',             short: 'ПР', kind: 'portal', slant: 'neutral',  reach: 520, divMax: 1 },
    { id: 'online',    name: 'Волейбол-Онлайн',     short: 'ВО', kind: 'portal', slant: 'neutral',  reach: 380, divMax: 2 },
    { id: 'tempo',     name: 'Первый темп',         short: 'ПТ', kind: 'portal', slant: 'analytic', reach: 230, divMax: 2 },
    { id: 'libero',    name: 'Либеро',              short: 'ЛБ', kind: 'portal', slant: 'critic',   reach: 175, divMax: 2 },
    { id: 'sektorb',   name: 'Сектор Б',            short: 'СБ', kind: 'portal', slant: 'loyal',    reach: 88,  divMax: 3 },
  ];

  const BY_ID = {};
  OUTLETS.forEach((o) => { BY_ID[o.id] = o; });

  const KIND_LABEL = { paper: 'газета', portal: 'интернет-портал' };

  /* авторы колонок: подпись под текстом делает мнение мнением, а не системным сообщением */
  const COLUMNISTS = {
    ploshadka: 'Игорь Ветлугин', ataka: 'Артём Сомов', tribuna: 'Лада Кириченко',
    vesti: 'Пётр Заславский', pipe: 'Никита Ершов', online: 'Марина Дробыш',
    tempo: 'Егор Сазанов', libero: 'Дмитрий Тучин', sektorb: 'Роман Пылёв',
  };

  /* Шаблоны. Первый элемент пары — заголовок, второй — текст.
     Разбивка по редакционной линии: loyal/neutral/analytic/critic/tabloid. */
  const T = {
    win: {
      loyal: [
        ['«{club}» снова забирает своё', 'Домашняя победа {score} над «{opp}». Зал гнал команду весь матч, и это тот случай, когда трибуны стоит записать в состав.'],
        ['Уверенно и по делу', '«{club}» обыгрывает «{opp}» {score}. Команда наконец играет так, как от неё ждали в начале сезона.'],
      ],
      neutral: [
        ['«{club}» — «{opp}»: {score}', 'Матч решился на подаче: хозяева дожали приём соперника в концовках. Лучший в составе — {mvp} ({pts} очк).'],
        ['Победа «{club}» в {score}', 'Ровный матч без длинных серий. «{opp}» держались до середины, дальше сказалась разница в атаке.'],
      ],
      analytic: [
        ['Победа на первом темпе', 'Разбор {score}: центр «{club}» закрыла зону соперника, эффективность атаки выше на девять пунктов. {mvp} набрал {pts} очк, но ключевым был не он, а приём.'],
        ['Как «{club}» обыграл «{opp}»', 'Модель матча простая: короткая подача в третью зону, съём с края. «{opp}» так и не нашли ответ. Итог — {score}.'],
      ],
      critic: [
        ['Победа, которая ничего не доказала', '{score} над «{opp}» — результат нужный, но качество прежнее. Первые два сета команда снова начала с чужих ошибок.'],
        ['«{club}» выиграл, вопросы остались', 'Да, {score}. Да, три очка. Только соперник в этом сезоне не выигрывал на выезде ни разу.'],
      ],
      tabloid: [
        ['Разнесли и не заметили', '{score}! После матча в «{opp}» отказались от комментариев, а в подтрибунке, говорят, было громко.'],
        ['«{club}» устроил шоу', 'Зал взорвался на {score}. {mvp} ({pts} очк) уходил с площадки под скандирование — такое здесь видели нечасто.'],
      ],
    },
    loss: {
      loyal: [
        ['Обидное поражение', '{score} от «{opp}». Команда билась, не хватило концовок — на трибунах это поняли и проводили без свиста.'],
        ['Не наш вечер', 'Уступили {score}. Сезон длинный, а такие матчи забываются быстрее, чем кажется.'],
      ],
      neutral: [
        ['«{club}» — «{opp}»: {score}', 'Поражение при своих зрителях. Приём рассыпался во второй половине матча, замены результата не дали.'],
        ['{score}: «{club}» уступает', 'Гости точнее сыграли на блоке. У хозяев лучший — {mvp} ({pts} очк), но этого оказалось мало.'],
      ],
      analytic: [
        ['Где «{club}» потерял матч', 'Поражение {score} объясняется подачей: восемь эйсов у соперника против двух. Пока приём не станет стабильнее, такие матчи будут повторяться.'],
        ['Диагноз: концовки', '{score}. Команда ведёт по ходу сетов и отдаёт их на отрезках 20+. Это не про физику, это про решения связующего.'],
      ],
      critic: [
        ['Так титулы не выигрывают', '{score} от «{opp}» — закономерность, а не случайность. Состав собирали под другие задачи, и это уже видно всем, кроме руководства.'],
        ['Провал без оправданий', 'Поражение {score}. Разговоры про «молодую команду» пора заканчивать: зарплатная ведомость намекает на другой уровень.'],
      ],
      tabloid: [
        ['Свист на трибунах', '{score}. Часть сектора ушла за сет до конца, и это была самая честная рецензия на матч.'],
        ['Кому это сходит с рук?', 'После {score} в клубе снова обещают «разобраться». Разбираются с осени — результата нет.'],
      ],
    },
    transferIn: {
      loyal: [['{player} — усиление, которого ждали', 'Клуб оформил переход. {role} закрывает позицию, которая проваливалась весь отрезок.']],
      neutral: [['Переход: {player}', '{player} ({role}) переходит в «{club}». Сумма сделки — около {fee}.']],
      analytic: [['Что даёт клубу {player}', 'На бумаге {role} поднимает потолок состава, но потребует времени на связку. Цена — {fee} — рыночная.']],
      critic: [['Деньги вместо системы', 'Клуб снова закрывает дыру покупкой: {player} за {fee}. Через сезон вопрос вернётся.']],
      tabloid: [['{player} наш! Но за какие деньги?', 'Источники называют {fee}, и в лиге это обсуждают активнее, чем сам переход.']],
    },
    transferOut: {
      loyal: [['Спасибо, {player}', 'Игрок уходит, клуб получает {fee}. Расстались по-человечески.']],
      neutral: [['{player} покидает «{club}»', 'Сделка закрыта, сумма — {fee}. Позицию будут закрывать из заявки.']],
      analytic: [['Продажа {player}: плюс и минус', '{fee} в бюджет — это плюс. Минус в том, что равноценной замены в составе нет.']],
      critic: [['Клуб распродаётся', '{player} ушёл за {fee}. Сначала обещания, потом продажа лидера — сценарий знакомый.']],
      tabloid: [['{player} сбежал', 'Говорят, отношения с тренерским штабом испортились задолго до {fee} на счету клуба.']],
    },
    trophy: {
      loyal: [['{trophy} — наш!', 'Клуб выигрывает {trophy}. Этот сезон войдёт в историю города.']],
      neutral: [['«{club}» выигрывает {trophy}', 'Титул оформлен. Команда прошла сезон ровнее конкурентов.']],
      analytic: [['Как построен чемпион', '{trophy} у «{club}»: глубина состава и лучшая подача в лиге дали результат уже к весне.']],
      critic: [['Титул есть, вопросы остаются', '{trophy} взят, но лига в этом сезоне была слабее обычного.']],
      tabloid: [['ЧЕМПИОНЫ!', '{trophy}! Празднование в городе, по слухам, продолжалось до утра.']],
    },
    promo: {
      loyal: [['Мы возвращаемся выше', 'Клуб выходит в {division}. Следующий сезон будет другим.']],
      neutral: [['«{club}» выходит в {division}', 'Повышение оформлено. Бюджет и заявку придётся пересобирать.']],
      analytic: [['Готов ли клуб к дивизиону «{division}»', 'Повышение — половина дела: разница в среднем рейтинге состава с новой лигой около десяти пунктов.']],
      critic: [['Повышение без базы', '{division} — это другие требования к арене и зарплатам. Клуб к ним не готов.']],
      tabloid: [['Наверх!', '{division}! Болельщики жгли файеры до полуночи.']],
    },
    releg: {
      loyal: [['Год, который надо пережить', 'Вылет в {division}. Возвращаться будем всей командой.']],
      neutral: [['«{club}» вылетает в {division}', 'Сезон закончен понижением. Часть контрактов пересмотрят.']],
      analytic: [['Почему клуб вылетел', 'Провал в {division} готовился всю осень: худший приём и минус в разнице сетов.']],
      critic: [['Закономерный конец', 'Вылет в {division} — итог года, в котором решения принимались с опозданием.']],
      tabloid: [['Кто ответит за вылет?', '{division}. Болельщики требуют объяснений, в клубе молчат.']],
    },
    euro: {
      loyal: [['Клуб выходит в Европу', 'Путёвка в {cup} — награда за сезон.']],
      neutral: [['«{club}» — участник {cup}', 'Квалификация подтверждена, арена прошла лицензирование.']],
      analytic: [['{cup}: чего ждать', 'Еврокубок добавит семь-девять матчей к календарю. Глубина состава станет решающей.']],
      critic: [['Европа не по бюджету', '{cup} — это расходы на перелёты и заявку. Хватит ли — большой вопрос.']],
      tabloid: [['Мы в Европе!', '{cup}! Такого здесь ждали годами.']],
    },
    sponsor: {
      loyal: [['{brand} — с клубом', 'Новый партнёр приходит на {years}.']],
      neutral: [['«{club}» и {brand} подписали соглашение', 'Партнёрство рассчитано на {years}, сумма — порядка {money} в месяц.']],
      analytic: [['Что даёт контракт с {brand}', 'Около {money} в месяц — это примерно четверть платёжной ведомости. Деньги логично пустить в состав.']],
      tabloid: [['{brand} заплатит {money}', 'В лиге сумму называют завышенной, в клубе — рыночной.']],
    },
    arena: {
      loyal: [['{object} — открыт', 'Арена стала удобнее, а домашние матчи — громче.']],
      neutral: [['«{club}» сдал объект: {object}', 'Работы завершены в срок.']],
      analytic: [['{object}: что это меняет', 'Объект окупится за полтора-два сезона при текущей посещаемости.']],
      critic: [['Стройка вместо состава', '{object} готов, но деньги ушли из трансферного бюджета.']],
    },
  };

  /* колонки: выходят не по событию, а по состоянию клуба */
  const COLUMNS = {
    hot: [
      ['Серия, в которую поверили', '«{club}» выигрывает матч за матчем, и разговор в городе сменился с «когда уволят» на «а куда мы можем зайти».'],
      ['Команда поймала свой волейбол', 'Приём стабилен, съём с края идёт, зал полный. Главное сейчас — не начать считать очки заранее.'],
    ],
    cold: [
      ['Пора говорить честно', 'Серия поражений «{club}» перестала быть случайностью. Проблема не в календаре, а в решениях на площадке.'],
      ['Что происходит с клубом', 'Три недели без побед. В таких ситуациях обычно меняют тренера — здесь менять некого, значит, менять придётся игру.'],
    ],
    fans: [
      ['Трибуны держат', 'Посещаемость «{club}» растёт даже без результата — редкая история для лиги. Такое доверие обычно возвращают титулом.'],
      ['Зал пустеет', 'На последних матчах «{club}» трибуны заметно тише. Абонементы продлевают неохотно, и это разговор не про волейбол, а про доверие.'],
    ],
    money: [
      ['Экономика клуба под вопросом', 'Платёжная ведомость «{club}» растёт быстрее доходов. Ещё один такой сезон — и придётся продавать.'],
      ['Клуб научился зарабатывать', 'Мерч, буфеты, абонементы: «{club}» собирает деньги там, где раньше их просто не считали.'],
    ],
    market: [
      ['Трансферное окно: чего ждать от «{club}»', 'В лиге считают, что клубу нужен доигровщик. В клубе, судя по всему, считают так же — вопрос в сумме.'],
      ['Кого клуб отпустит', 'По слухам, предложения есть минимум по двум игрокам основы. Отказ будет стоить бюджету, согласие — состава.'],
    ],
  };

  /* ---------- вспомогательное ---------- */

  function covers(outlet, club) {
    return club.division <= outlet.divMax;
  }

  /** какие издания вообще пишут про клуб */
  function outletsFor(club) {
    return OUTLETS.filter((o) => covers(o, club));
  }

  function fill(str, vars) {
    return str.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
  }

  function pickLine(rng, slantMap, slant) {
    const node = slantMap[slant] || slantMap.neutral;
    if (!node) return null;
    return rng.pick(node);
  }

  /** оценка матча по десятибалльной: результат плюс редакционная линия */
  function mark(rng, win, score, slant) {
    const diff = Math.abs((score[0] || 0) - (score[1] || 0));
    let m = win ? 6.6 + diff * 0.5 : 4.6 - diff * 0.45;
    m += { loyal: 0.7, neutral: 0, analytic: 0.1, critic: -0.8, tabloid: rng.range(-0.6, 0.9) }[slant] || 0;
    m += rng.range(-0.35, 0.35);
    return Math.round(U.clamp(m, 1.5, 10) * 10) / 10;
  }

  /** вероятность, что издание вообще возьмётся за событие: крупные пишут только про крупное */
  function interest(outlet, club, importance) {
    const size = outlet.reach / 520;                       // 0.08…1
    const localBonus = outlet.divMax >= 3 ? 0.55 : 0;      // местные пишут про всё
    const fame = (club.mediaIndex || 20) / 100;
    return U.clamp(importance * (0.35 + fame * 0.9) * (1.15 - size * 0.75) + localBonus, 0.05, 0.95);
  }

  function store(game, article) {
    game.press = game.press || [];
    if (game.press.slice(0, 6).some((a) => a.headline === article.headline)) return false;
    game.press.unshift(article);
    if (game.press.length > 80) game.press.pop();
    return true;
  }

  function publish(game, club, outlet, headline, text, opts = {}) {
    const article = {
      id: 'a' + U.id(),
      week: game.week,
      season: game.season,
      clubId: club.id,
      outlet: outlet.id,
      kind: outlet.kind,
      headline: fill(headline, opts.vars || {}),
      text: fill(text, opts.vars || {}),
      tone: opts.tone || 0,
      mark: opts.mark != null ? opts.mark : null,
      author: opts.column ? COLUMNISTS[outlet.id] : null,
      reads: Math.round(outlet.reach * 1000 * (0.25 + (club.mediaIndex || 20) / 130)),
    };
    if (!store(game, article)) return null;
    // охват издания двигает медийность: заметка в крупном портале весит больше городской газеты
    const push = (outlet.reach / 640) * (opts.tone >= 0 ? 1 : -0.85) * (opts.weight || 1);
    club.mediaIndex = U.clamp((club.mediaIndex || 20) + push, 5, 99);
    return article;
  }

  /* ---------- освещение события ---------- */

  /**
   * Пресса разбирает то же событие, что попало в «Подачу».
   * type — ключ шаблона, vars — подстановки, importance — вес события.
   */
  function cover(game, club, type, vars = {}, importance = 1, opts = {}) {
    if (!club || !club.isPlayer) return [];
    const tpl = T[type];
    if (!tpl) return [];
    const rng = game._rng;
    const out = [];
    const positive = opts.positive !== false;
    // одно событие — не больше нескольких разборов: иначе колонка превращается в стену копий
    const limit = Math.round(U.clamp(1.5 + importance * 1.4, 2, 5));
    const queue = outletsFor(club).slice();
    for (let i = queue.length - 1; i > 0; i--) { const j = rng.int(0, i); const t = queue[i]; queue[i] = queue[j]; queue[j] = t; }
    for (const outlet of queue) {
      if (out.length >= limit) break;
      if (!rng.chance(interest(outlet, club, importance))) continue;
      const line = pickLine(rng, tpl, outlet.slant);
      if (!line) continue;
      const isMatch = type === 'win' || type === 'loss';
      const a = publish(game, club, outlet, line[0], line[1], {
        vars: Object.assign({ club: club.name }, vars),
        tone: positive ? (outlet.slant === 'critic' ? 0 : 1) : (outlet.slant === 'loyal' ? 0 : -1),
        mark: isMatch && vars.sets ? mark(rng, type === 'win', vars.sets, outlet.slant) : null,
        weight: importance,
      });
      if (a) out.push(a);
    }
    return out;
  }

  /** редакционная колонка: выходит по состоянию клуба, а не по конкретному матчу */
  function column(game, club) {
    if (!club || !club.isPlayer) return null;
    const rng = game._rng;
    const list = outletsFor(club);
    if (!list.length) return null;
    const form = (club.form || []).slice(-5);
    const wins = form.filter((f) => f === 'w').length;
    const themes = [];
    if (form.length >= 3 && wins >= 3) themes.push('hot');
    if (form.length >= 3 && wins <= 1) themes.push('cold');
    if (club.fans) themes.push('fans');
    if (club.balance != null) themes.push('money');
    if (game.window && game.window.open) themes.push('market');
    themes.push('market');
    const theme = rng.pick(themes);
    const pair = rng.pick(COLUMNS[theme]);
    // колонку пишет издание с мнением, а не новостная лента
    const opinionated = list.filter((o) => o.slant !== 'neutral');
    const outlet = rng.pick(opinionated.length ? opinionated : list);
    const tone = theme === 'hot' ? 1 : theme === 'cold' ? -1 : 0;
    return publish(game, club, outlet, pair[0], pair[1], {
      vars: { club: club.name }, tone, column: true, weight: 0.6,
    });
  }

  /** раз в несколько недель пресса высказывается сама по себе */
  function weekly(game, club) {
    if (!club || !club.isPlayer) return;
    const rng = game._rng;
    if (!rng.chance(0.42)) return;
    column(game, club);
  }

  /** настроение прессы: -1…+1 по последним публикациям, с весом охвата */
  function mood(game, clubId) {
    const list = (game.press || []).filter((a) => !clubId || a.clubId === clubId).slice(0, 14);
    if (!list.length) return 0;
    let sum = 0, w = 0;
    list.forEach((a) => {
      const o = BY_ID[a.outlet];
      const weight = o ? 0.4 + o.reach / 520 : 1;
      sum += a.tone * weight; w += weight;
    });
    return U.clamp(sum / Math.max(1, w), -1, 1);
  }

  /** средняя оценка клуба в прессе за последние матчи */
  function avgMark(game, clubId) {
    const marks = (game.press || []).filter((a) => a.mark != null && (!clubId || a.clubId === clubId)).slice(0, 12).map((a) => a.mark);
    if (!marks.length) return null;
    return Math.round((marks.reduce((s, m) => s + m, 0) / marks.length) * 10) / 10;
  }

  function outlet(id) { return BY_ID[id]; }

  S.Press = { OUTLETS, KIND_LABEL, COLUMNISTS, cover, column, weekly, mood, avgMark, outlet, outletsFor, publish };
})(typeof window !== 'undefined' ? window : globalThis);
