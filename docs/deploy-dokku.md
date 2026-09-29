# Деплой на Dokku

Сервер: `89.125.120.7`, SSH на порту **58595** (не 22), приложение `transport`. Образ собирается из `apps/web/Dockerfile`,
миграции применяются автоматически перед переключением трафика (`app.json` →
`scripts.dokku.predeploy`). Если миграция упала, новая версия не запускается, старая
продолжает работать.

## Разовая настройка сервера

Команды выполняются на сервере (`ssh -p 58595 root@89.125.120.7`).

```bash
# приложение
dokku apps:create transport
dokku builder-dockerfile:set transport dockerfile-path apps/web/Dockerfile
dokku git:set transport deploy-branch main
dokku ports:set transport http:80:3000   # nginx на :80 внутри сервера, наружу — через Funnel

# PostgreSQL: плагин ставится один раз на сервер
sudo dokku plugin:install https://github.com/dokku/dokku-postgres.git
dokku postgres:create transport-db
dokku postgres:link transport-db transport     # задаёт DATABASE_URL

# переменные окружения
dokku config:set --no-restart transport \
  SESSION_SECRET="$(openssl rand -hex 32)" \
  TZ=Asia/Dushanbe
# опционально
dokku config:set --no-restart transport \
  ROUTING_URL=https://router.project-osrm.org \
  WALK_ROUTING_URL=https://routing.openstreetmap.de/routed-foot \
  VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:admin@example.com
```

`WALK_ROUTING_URL` — пешеходный OSRM для кнопки «Как дойти до остановки»; без переменной
используется бесплатный сервер FOSSGIS. Ему уходят только координаты начала и остановки,
без данных пассажира.

`GEOCODER_URL` — поиск места по названию при создании остановки; без переменной
используется публичный Nominatim. Ему уходит только строка, которую администратор набрал
в поле поиска, — никаких данных сотрудников. Публичный сервер ограничен одним запросом
в секунду на всех, поэтому для регулярной работы поднимите свой инстанс.

VAPID-ключи генерируются командой `npx web-push generate-vapid-keys`. Публичный ключ
читается в рантайме, пересобирать образ после его смены не нужно.

### Публичный адрес и HTTPS (Tailscale Funnel)

Адрес: **https://transport.tailb8adcc.ts.net**

Сервер стоит за NAT: снаружи открыт только SSH-порт 58595, порты 80/443 недоступны,
поэтому Let's Encrypt и прямой доступ по IP не работают. Сайт публикуется через
Tailscale Funnel: `tailscaled` сам держит исходящее соединение, Tailscale принимает
HTTPS-запросы и проксирует их в nginx Dokku на `127.0.0.1:80`. Сертификат выпускает
и продлевает Tailscale. HTTPS обязателен: геолокация водителя, push и установка PWA
без него не работают.

Настройка (уже выполнена, повторять только при переустановке сервера):

```bash
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up --hostname=transport          # вход по ссылке в аккаунт Tailscale
# в панели login.tailscale.com → DNS: включить MagicDNS и HTTPS Certificates
tailscale funnel --bg 80                   # при первом запуске — ссылка на разрешение Funnel
dokku domains:add transport transport.tailb8adcc.ts.net
```

Настройка Funnel сохраняется и переживает перезагрузку. Проверка и отключение:

```bash
tailscale funnel status
tailscale funnel --https=443 off
```

Если позже появится свой домен, можно перейти на Cloudflare Tunnel: приложение
менять не нужно, только добавить домен через `dokku domains:add`.

### Тестовые данные и первый реальный запуск

Сид (`db:seed`) — фиктивный Худжанд-набор для разработки и демонстрации, не идемпотентен,
запускается вручную и только на пустой базе (`pnpm db:seed` локально). Для очистки уже
посеянных тестовых данных на сервере и для первого реального запуска используются
собственные механизмы Dokku — `postgres:connect` и `run` — а не внешний проброс порта:
проброс через SSH-туннель зависит от сети между вашей машиной и сервером и на некоторых
соединениях нестабилен (рвётся при первом же запросе). Всё ниже выполняется в одной сессии
на сервере (`ssh -p 58595 root@89.125.120.7`).

**1. Очистить тестовые данные** — прямое подключение Dokku к контейнеру Postgres:

```bash
dokku postgres:connect transport-db
```

В открывшемся `psql` — то же самое, что делает `db:reset`:

```sql
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
DROP SCHEMA IF EXISTS drizzle CASCADE;
\q
```

**2. Восстановить схему** — через уже задеплоенный образ (собранный `migrate.mjs` уже
лежит в нём, новый пуш не нужен):

```bash
dokku run transport node packages/db/dist/migrate.mjs
```

**3. Завести настоящего администратора** — через собранный `create-admin.mjs` (появляется
в образе начиная с деплоя, который его добавил). Пароль передаётся временными переменными
окружения, которые сразу же снимаются, чтобы не оседали в конфиге приложения:

```bash
dokku config:set --no-restart transport ADMIN_NAME="Имя Фамилия" ADMIN_PHONE="+992..." ADMIN_PASSWORD="..."
dokku run transport node packages/db/dist/create-admin.mjs
dokku config:unset --no-restart transport ADMIN_NAME ADMIN_PHONE ADMIN_PASSWORD
```

Скрипт откажется, если в базе уже есть пользователи, — поэтому шаг 1 обязателен перед ним
на базе, где уже был сид.

**Суперадминистратор без очистки базы.** Только суперадмин создаёт остальных администраторов
в панели («Администраторы»). Если данные стирать не нужно (например, сид уже на проде), добавьте
`ADMIN_SUPER=1` — скрипт работает на любой базе: находит пользователя с этим телефоном и делает
его суперадмином с новым паролем, а если такого нет — создаёт. Суперадмин один: если им уже
назначен другой телефон, скрипт откажется. Повторный запуск с тем же телефоном сбрасывает пароль
(способ вернуться, если пароль забыт).

```bash
dokku config:set --no-restart transport ADMIN_NAME="Имя Фамилия" ADMIN_PHONE="+992..." ADMIN_PASSWORD="..." ADMIN_SUPER=1
dokku run transport node packages/db/dist/create-admin.mjs
dokku config:unset --no-restart transport ADMIN_NAME ADMIN_PHONE ADMIN_PASSWORD ADMIN_SUPER
```

Демо-администратор из сида (`+992900000001`) остаётся обычным администратором с паролем из
README: заблокируйте его в «Администраторах» сразу после входа суперадмина. Дальше — вход под этим администратором и заполнение реальных
остановок, транспорта, водителей и маршрутов через панель; свой пароль администратор может
сменить сам, в «Настройки» → «Пароль администратора».

## Автодеплой из GitHub

`.github/workflows/deploy.yml` на каждый пуш в `main` запускает typecheck и тесты, затем
пушит код в Dokku. Настройка:

1. Сгенерировать отдельный ключ для деплоя (без пароля):
   ```bash
   ssh-keygen -t ed25519 -f dokku_deploy -N "" -C github-actions
   ```
2. Добавить публичный ключ на сервер:
   ```bash
   cat dokku_deploy.pub | ssh -p 58595 root@89.125.120.7 dokku ssh-keys:add github-actions
   ```
3. В GitHub: Settings → Secrets and variables → Actions → New repository secret,
   имя `DOKKU_SSH_PRIVATE_KEY`, значение — содержимое файла `dokku_deploy`.
4. Удалить локальные файлы ключа.

Ручной запуск: вкладка Actions → Deploy → Run workflow.

## Ручной деплой

```bash
git remote add dokku ssh://dokku@89.125.120.7:58595/transport
git push dokku main
```

## Диагностика

```bash
dokku logs transport -t          # логи приложения
dokku ps:report transport        # состояние контейнеров
dokku config:show transport      # переменные окружения
dokku ps:rebuild transport       # пересобрать без нового пуша
```
