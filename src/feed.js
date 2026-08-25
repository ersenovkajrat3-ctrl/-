/* Сетка — лента «Подача»: вымышленная соцсеть внутри игры.
   Посты не пишутся вручную: собираются по шаблонам из тех же событий, что уже есть в игре.
   Реакции складываются в индекс медийности, от которого зависят спонсорские предложения. */
(function (global) {
  const S = global.SETKA || (global.SETKA = {});
  const { U } = S;

  const AUTHORS = {
    club:    { key: 'club',    label: 'Клуб · официально', handle: '@club_official', avatar: 'К', kind: 'official' },
    rival:   { key: 'rival',   label: 'Соперник · капитан', handle: '@rival_captain', avatar: 'С', kind: 'rival' },
    fan:     { key: 'fan',     label: 'Болельщик',          handle: '@sektorb_forever', avatar: 'Б', kind: 'fan' },
    insider: { key: 'insider', label: 'Инсайдер лиги',      handle: '@volley_insider', avatar: 'И', kind: 'insider' },
    press:   { key: 'press',   label: 'Волейбол · сводка',  handle: '@setka_daily',    avatar: 'В', kind: 'press' },
  };

  /* шаблоны: {tone} подставляется вариантом по выбранному тону официальных постов */
  const T = {
    win: {
      club: {
        calm: ['Победа {score} дома. Спасибо всем, кто был на трибунах.', 'Три очка в копилку: {score} над «{opp}». Работаем дальше.'],
        bold: ['{score} — и это не предел. «{opp}» уехали ни с чем.', 'Забрали {score}. Зал был громким, команда — злой.'],
        provoc: ['«{opp}» обещали серию. Серия закончилась {score}.', '{score}. Кто там что-то говорил про фаворита?'],
      },
      fan: ['Вот за это и любим! {score} — и приём наконец держали.', 'Первый темп сегодня работал как часы. {score}!'],
      rival: ['Проиграли {score}. Разберёмся и вернёмся.', 'Бывает. В плей-офф поговорим по-другому.'],
      insider: ['{club} набирает ход: победная серия. Спонсоры это замечают.',
        'На матчи клуба {club} снова начали ходить — и это видно по трибунам.'],
    },
    loss: {
      club: {
        calm: ['Поражение {score}. Разбираем ошибки, готовимся к следующему туру.', 'Не наш день: {score}. Спасибо болельщикам за поддержку.'],
        bold: ['{score}. Такой волейбол нас не устраивает — исправим.', 'Проиграли {score}, но команда ещё скажет своё слово.'],
        provoc: ['{score}. Судейские решения в третьем сете оставим без комментариев.', 'Отдали {score}. Дальше будет по-другому, обещаем.'],
      },
      fan: ['Приём в решающем сете — это боль. {score}.', '{score}. Ну сколько можно проваливать концовки?'],
      rival: ['Спасибо за игру. {score} — заслуженно.', '{score} в гостях. Хороший зал, слабая подача у хозяев.'],
      insider: ['Серия поражений у клуба {club} продолжается. В таких случаях обычно ищут виноватого.',
        'В клубе {club} после очередного поражения собирают тренерский штаб.'],
    },
    transferIn: {
      club: {
        calm: ['{player} ({role}) — игрок нашего клуба. Контракт подписан.', 'Усиление: {player}, {role}. Добро пожаловать в клуб.'],
        bold: ['{player} наш! {role}, который решает концовки. Ждём на трибунах.', 'Подписан {player}. Это заявка, а не косметика.'],
        provoc: ['{player} выбрал нас, а не тех, кто тоже звонил. Делайте выводы.', '{player} подписан. Пусть теперь соперники ищут ответ.'],
      },
      fan: ['{player}? Это сильно. Наконец-то {role} нормального уровня.', 'Ну если {player} доедет в форме — сезон другой.'],
      insider: ['Переход: {player} → {club}. Сумма — около {fee}.'],
    },
    transferOut: {
      club: {
        calm: ['{player} покидает клуб. Спасибо за работу и удачи.', '{player} продолжит карьеру в другом клубе. Благодарим.'],
        bold: ['{player} уходит. Освободившиеся деньги пойдут в состав.', 'Расстаёмся с {player} — впереди перестройка.'],
        provoc: ['{player} захотел «нового вызова». Пусть попробует.', '{player} продан. Незаменимых нет.'],
      },
      fan: ['{player} продан? Кем закрывать будем?', 'Жаль, что {player} ушёл, но за {fee} — почему нет.'],
    },
    sponsor: {
      club: {
        calm: ['{brand} — наш новый партнёр. Соглашение на {years}.', '{brand} — новый партнёр клуба.'],
        bold: ['{brand} с нами. Бюджет вырос, амбиции — тоже.', 'Новый партнёр {brand}: это другой уровень планирования.'],
        provoc: ['{brand} выбрали нас. Кто-то в лиге сейчас нервничает.', 'Партнёр уровня {brand} — это другая весовая категория.'],
      },
      insider: ['{club} подписал {brand}. По моим данным — около {money} в месяц.'],
    },
    arena: {
      club: {
        calm: ['Сдан объект: {object}. Ждём вас на домашних матчах.', '{object} — готово. Арена стала лучше.'],
        bold: ['{object} построен. Зал будет громче, а соперникам — сложнее.', 'Открываем {object}. Это только начало.'],
        provoc: ['{object} готов. Теперь пусть кто-нибудь попробует у нас выиграть.', 'Открыли {object}. Ждём тех, кто говорил, что мы «клуб без базы».'],
      },
      fan: ['Новая арена — это, конечно, красиво, а когда приём научимся держать в решающем сете?', 'Наконец-то нормальные трибуны. {object}!'],
    },
    promo: {
      club: { calm: ['Повышение: {division}. Спасибо каждому, кто был рядом.'], bold: ['{division} — взяли! Дальше только выше.'], provoc: ['{division} наша. Тем, кто нас хоронил, — привет.'] },
      press: ['Повышение: {club} → {division}.'],
    },
    releg: {
      club: { calm: ['Сезон закончен вылетом: {division}. Будем возвращаться.'], bold: ['Вылет: {division}. Возвращаемся через год, не иначе.'], provoc: ['{division}. Спасибо всем, кто помогал нам туда попасть.'] },
      fan: ['Вылет. Ну и как это назвать?'],
    },
    euro: {
      club: { calm: ['Клуб получил путёвку: {cup}. Работа продолжается.'], bold: ['{cup}! Клуб выходит в Европу.'], provoc: ['{cup}. Кто там считал нас провинцией?'] },
      press: ['Квалификация: {club} → {cup}.'],
      insider: ['Лицензия арены {club} прошла проверку — путёвка ({cup}) подтверждена.'],
    },
    trophy: {
      club: { calm: ['{trophy} — наш. Спасибо команде и болельщикам.'], bold: ['{trophy}! Мы это заслужили.'], provoc: ['{trophy}. Вопросы ещё есть?'] },
      press: ['{club} выигрывает {trophy}.'],
    },
    rumor: {
      insider: ['Слышал, {club} ведёт переговоры о титульном спонсорстве. Если сложится — жди ребрендинг к следующему сезону.',
        'В {club} присматриваются к легионеру. Слот в заявке всего один — будет выбор.',
        'Говорят, в {club} недовольны концовками сетов. Тренерскому штабу дали время до зимы.'],
      fan: ['Когда уже нормальный диагональный? Сколько можно.', 'На трибунах вчера было прилично. Растём.'],
    },
  };

  function pickTemplate(rng, node, tone) {
    if (!node) return null;
    if (Array.isArray(node)) return rng.pick(node);
    return rng.pick(node[tone] || node.calm);
  }

  function fill(str, vars) {
    return str.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
  }

  /** охват поста: реакции зависят от репутации, медийности, тона и важности события */
  function engagement(rng, club, importance, tone, authorKind) {
    const toneMult = tone === 'provoc' ? 1.35 : tone === 'bold' ? 1.15 : 1;
    const kindMult = { official: 1, fan: 0.55, rival: 0.75, insider: 0.9, press: 0.7 }[authorKind] || 0.8;
    const base = (18 + club.reputation * 2.6 + club.mediaIndex * 3.4) * importance * toneMult * kindMult;
    const likes = Math.round(base * rng.range(0.7, 1.4));
    return { likes, reposts: Math.round(likes * rng.range(0.06, 0.22)) };
  }

  function push(game, post) {
    // один и тот же текст дважды подряд читается как баг, а не как лента
    if (game.feed.slice(0, 8).some((p) => p.text === post.text)) return false;
    game.feed.unshift(post);
    if (game.feed.length > 120) game.feed.pop();
    return true;
  }

  /**
   * Событие ленты. type — ключ шаблона, vars — подстановки, importance — вес события (0.4…2).
   * Возвращает изменение индекса медийности.
   */
  function event(game, club, type, vars = {}, importance = 1, opts = {}) {
    const rng = game._rng;
    const tone = club.isPlayer ? (game.settings.tone || 'calm') : 'calm';
    const tpl = T[type];
    if (!tpl) return 0;
    const authors = opts.authors || Object.keys(tpl);
    let delta = 0;
    const week = game.week;
    for (const a of authors) {
      if (!tpl[a]) continue;
      // не каждое событие комментируют все
      const chance = a === 'club' ? 1 : a === 'insider' ? 0.4 : a === 'press' ? 0.7 : 0.5;
      if (a !== 'club' && !rng.chance(chance * importance)) continue;
      const raw = pickTemplate(rng, tpl[a], tone);
      if (!raw) continue;
      const author = AUTHORS[a];
      const eng = engagement(rng, club, importance, tone, author.kind);
      push(game, {
        id: 'f' + U.id(), week, clubId: club.id, type,
        author: author.key, label: a === 'club' ? club.name + ' · официально' : author.label,
        handle: a === 'club' ? '@' + translit(club.baseName) : author.handle,
        avatar: a === 'club' ? club.name[0] : author.avatar,
        text: fill(raw, vars), likes: eng.likes, reposts: eng.reposts,
        positive: opts.positive !== false,
      });
      if (a === 'club') delta += eng.likes / 100 * (opts.positive === false ? -0.4 : 1) * (tone === 'bold' && opts.positive === false ? 1.6 : 1);
    }
    // те же события разбирает пресса — но своей колонкой и своим тоном
    if (S.Press) S.Press.cover(game, club, type, vars, importance, opts);
    // индекс медийности двигают сами события: тон выбирает размах качелей
    const toneSwing = tone === 'provoc' ? 1.6 : tone === 'bold' ? 1.25 : 1;
    const nudge = (opts.positive === false ? -1.15 : 1) * importance * toneSwing;
    club.mediaIndex = U.clamp(club.mediaIndex + nudge, 5, 99);
    return nudge;
  }

  function translit(s) {
    const map = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya', ' ': '_', '-': '_' };
    return s.toLowerCase().split('').map((c) => (map[c] != null ? map[c] : c)).join('').replace(/[^a-z0-9_]/g, '');
  }

  /** фоновый шум ленты между событиями */
  function idleChatter(game, club) {
    const rng = game._rng;
    if (!rng.chance(0.5)) return;
    event(game, club, 'rumor', { club: club.name }, 0.5, { authors: rng.chance(0.5) ? ['insider'] : ['fan'] });
  }

  /** к чему индекс медийности тянется сам по себе: дивизион и репутация клуба */
  function mediaBaseline(club) {
    return U.clamp(8 + (3 - club.division) * 11 + club.reputation * 0.35, 6, 92);
  }

  S.Feed = { event, idleChatter, AUTHORS, push, translit, engagement, mediaBaseline };
})(typeof window !== 'undefined' ? window : globalThis);
