# ai-pomidorka.vercel.app — исходники сайта

Сайт-портфолио Жени Аверкиевой. Статика без сборки: одна страница `index.html`,
рядом папки `images/` и `videos/`.

## Структура

| Путь | Что внутри |
|---|---|
| `index.html` | вся страница: разметка, стили и скрипт в одном файле |
| `videos/reel-NN.mp4` | полные ролики, открываются по клику в лайтбоксе |
| `videos/reel-NN-preview.mp4` | 6-секундные превью без звука, играют при наведении |
| `images/reel-NN.jpg` | обложки роликов |

## Как добавить ещё ролик

1. Положите файлы в `videos/` и обложку в `images/`.
2. В `index.html` найдите блок `video:` внутри переменной `data` и допишите объект:

```js
{title:"Название", code:"REEL 04", dur:"0:45",
 poster:"images/reel-04.jpg", preview:"videos/reel-04-preview.mp4", video:"videos/reel-04.mp4"}
```

Поля `preview` и `poster` необязательные: без них карточка покажет градиентную
заглушку, а превью при наведении возьмётся из основного файла.

## Как готовились ролики

Исходники с телефона (720p, ~3000 кб/с) пережаты под веб:

```sh
# полный ролик
ffmpeg -i IN.MOV -vf scale=-2:960 -c:v libx264 -preset slow -crf 33 \
  -pix_fmt yuv420p -c:a aac -b:a 96k -movflags +faststart videos/reel-NN.mp4

# превью для наведения (6 секунд, без звука)
ffmpeg -ss 10 -i IN.MOV -t 6 -vf scale=-2:480 -c:v libx264 -preset slow -crf 32 \
  -pix_fmt yuv420p -an -movflags +faststart videos/reel-NN-preview.mp4

# обложка
ffmpeg -ss 10 -i IN.MOV -frames:v 1 -vf scale=-2:960 -q:v 4 images/reel-NN.jpg
```

`-movflags +faststart` обязателен: без него браузер ждёт загрузки всего файла.

## Деплой

Проект на Vercel называется `ai-pomidorka` и сейчас **не подключён к git** —
он был залит файлами вручную. Чтобы каждый push сам обновлял сайт, подключите
репозиторий: Vercel → проект `ai-pomidorka` → Settings → Git → Connect Git
Repository, Root Directory = `site`.

## Чего здесь не хватает

Фотографии, которые уже стоят на живом сайте (`images/about-portrait.jpg`,
`whatsapp-qr.png`, `ai-*.jpg`, `studio-portrait.jpg`, `family-shoot.jpg`,
`portrait-closeup.jpg`), в репозиторий положить не удалось: скачать их с
продакшена из рабочего окружения нельзя. Их нужно добавить в `images/` до
деплоя из git, иначе они пропадут. Если файла нет, карточка не ломается —
вместо фото показывается градиентная заглушка.
