# CLAUDE.md

> Keep this file short and stable. It is loaded into context every session,
> so a growing file costs tokens on every run. Change history belongs in
> CHANGELOG.md and in git, not here.

## Project
Корпоративный транспорт: пассажир (PWA), водитель (PWA), админ-панель, единая БД и аналитика загрузки маршрутов. Город данных — Худжанд, интерфейс на русском.

## Commands
- install: `pnpm install`
- dev: `pnpm dev` (Next.js на http://localhost:3000)
- build: `pnpm build`
- test: `pnpm test` (Vitest в packages/domain)
- typecheck: `pnpm typecheck`; lint: `pnpm lint`
- db: `pnpm db:up` (Postgres в Docker, порт **5433**), `db:migrate`, `db:seed`, `db:reset`
- docker: `pnpm docker:up` — весь стек (БД + веб) в Docker, порт **3000**; миграции применяются автоматически, `docker:seed`/`docker:reset` — вручную

## Architecture
- `apps/web` — Next.js 16 App Router. Зоны: `(passenger)` → `/app`, `(driver)` → `/driver`, `(admin)` → `/admin`, REST в `app/api/v1`.
- `packages/domain` — чистая бизнес-логика без фреймворков (ETA, загрузка, статусы, сигналы) + unit-тесты. Фреймворки сюда не импортировать.
- `packages/db` — схема Drizzle, миграции, seed; `src/routing.ts` — построение пути по дорогам (OSRM, `ROUTING_URL`).
- `apps/web/src/lib/live.ts` — приём GPS-позиций, живое время прибытия, сигналы мониторинга; `lib/push.ts` — web push (VAPID).
- `apps/web/src/app/api/v1` — REST: позиции водителя, подписка на push, живое состояние рейса.
- `docs/01-analysis.md` — согласованные требования, модель данных и решения по конфликтам. Правила бизнес-логики брать оттуда.

## Conventions
- Next 16: `params`/`searchParams` — это Promise (`await`); middleware называется `proxy.ts`.
- Вместимость рейса берётся из транспорта (`vehicles.capacity`), не из маршрута.
- Маршрут = одно направление (`to_work` / `from_work`); утро и вечер — две записи с общим `name`.
- Время остановки = отправление рейса + `route_stops.offset_min`. Расписание — в `route_schedules`.
- Загрузка = `max(спрос пассажиров, факт водителя)`; пороги статусов — в таблице `settings`.
- Часовой пояс данных — `Asia/Dushanbe`; использовать хелперы из `@transport/domain/time`, а не `new Date()` напрямую.
- UI-тексты на русском. Никаких эмодзи вместо иконок.
- Координаты пишутся только при статусе рейса `in_progress`; вне рейса водитель не отслеживается.
- Время прибытия: GPS → отметки водителя → расписание. Абсолютное время считает сервер, клиент его только форматирует.
- Уведомления отправлять через `notify()` — она пишет в приложение и шлёт push одновременно.
- Форма маршрута версионируется: остановки, смещения и геометрия лежат в `route_versions` / `route_stops.version_id`, рейс закреплён за версией через `trips.route_version_id`. Читать форму завершённого рейса только по его версии, текущую форму — по `routes.current_version_id`. Новая версия создаётся только при изменении формы.
- Геометрия хранится в `route_versions.path` и `route_stops.road_distance_m`. Запрашивать её у маршрутизатора только при изменении маршрута или по кнопке, никогда при отрисовке страницы. Карты и расчёты берут `path`, при его отсутствии — прямые линии между остановками.
