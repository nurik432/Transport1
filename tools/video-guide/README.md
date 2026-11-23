# Видеоинструкции для администратора

Скрипт сам проходит по админке на демо-данных, записывает экран, озвучивает
шаги русским голосом и собирает MP4 1920×1080 со вшитыми субтитрами.
Рядом с каждым роликом кладётся `.srt`.

| Файл | Тема |
|---|---|
| `01-overview` | Меню и дашборд |
| `02-stops` | Остановки |
| `03-vehicles-drivers` | Транспорт и водители |
| `04-routes` | Маршруты и расписание |
| `05-passengers` | Пассажиры и постоянные рейсы |
| `06-trips` | Создание рейсов и назначение машин |
| `07-live` | Мониторинг |
| `08-analytics` | Аналитика и прогноз |
| `09-messages-settings` | Уведомления, настройки, администраторы |
| `10-attendance` | Табель, графики работы, точки QR |

## Что нужно

- Docker с контейнером БД проекта (порт 5434, см. `docker-compose.yml`);
- Python-пакет `edge-tts` (`pip install edge-tts`). Текст фраз уходит в
  сервис синтеза речи Microsoft, личных данных в нём нет;
- Microsoft Edge (запись идёт через него, браузеры Playwright не нужны).

## Как перезаписать

Записывать только на отдельной демо-базе: сценарии создают остановки,
водителей и пассажиров, а подготовка сцены переводит рейсы в «В пути».
Скрипты отказываются работать, если в имени базы нет `demo`.

```sh
# один раз
docker exec transport1-db psql -U transport -d postgres -c "create database transport_demo;"
cd tools/video-guide && npm install && cp .env.example .env

# production-сборка на демо-базе, порт 3100 (конфигурация transport-web-demo в .claude/launch.json)
DATABASE_URL=postgres://transport:transport@localhost:5434/transport_demo pnpm --filter web build
DATABASE_URL=postgres://transport:transport@localhost:5434/transport_demo pnpm --filter web start --port 3100

# каждый раз
npm run reset-demo      # чистые демо-данные
npm run dry             # быстрый прогон без звука: проверяет, что кнопки на месте
npm run reset-demo
npm run record          # все ролики → out/; можно выборочно: npm run record -- 04 07
```

После правок интерфейса сначала запускайте `npm run dry`: он за пару минут
покажет, какой шаг какого сценария больше не находит свою кнопку.

## Как устроено

- `scenarios/*.mjs` — сценарии: фраза диктора и действия, которые идут, пока
  она звучит. Текст субтитра совпадает с озвучкой.
- `lib/director.mjs` — запись: кадры через CDP screencast, курсор, подсветка.
- `lib/overlay.js` — курсор, вспышка клика, субтитры и титры поверх страницы.
- `lib/stage.mjs` — «живая» сцена: три рейса в пути (по маршруту, с
  отклонением, без GPS) и рейс без назначения; водители шлют точки раз в 15 с.
- `lib/tts.mjs` — озвучка `edge-tts` с кэшем в `cache/tts`.
- `lib/assemble.mjs` — сборка MP4 (H.264 + AAC) и SRT через `ffmpeg-static`.
- `explore.mjs` — снимок aria-дерева страниц в `explore/`, помогает писать
  новые сценарии: `node --env-file=.env explore.mjs /admin/routes /admin/trips`.

Голос и темп: `VG_VOICE` (по умолчанию `ru-RU-SvetlanaNeural`, мужской —
`ru-RU-DmitryNeural`), `VG_RATE` (по умолчанию `+8%`).
