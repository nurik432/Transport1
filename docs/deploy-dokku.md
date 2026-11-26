# Деплой на Dokku

Сервер: `89.125.120.7`, SSH на порту **58595** (не 22), приложение `transport`. Образ собирается из
`apps/web/Dockerfile` на раннере GitHub и публикуется в `ghcr.io/nurik432/transport1`;
Dokku разворачивает готовый образ (`git:from-image`) и сам ничего не собирает. `app.json`
лежит внутри образа. Миграции применяются автоматически перед переключением трафика (`app.json` →
`scripts.dokku.predeploy`). Если миграция упала, новая версия не запускается, старая
продолжает работать.

## Разовая настройка сервера

Команды выполняются на сервере (`ssh -p 58595 root@89.125.120.7`).

```bash
# приложение
dokku apps:create transport
dokku git:set transport deploy-branch main
dokku ports:set transport http:80:3000   # nginx на :80 внутри сервера, наружу — через Cloudflare Tunnel

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

### Напоминания табеля (cron)

`app.json` задаёт Dokku задачу `node scripts/cron-attendance-reminders.mjs` каждые 5 минут.
Она вызывает `POST /api/v1/cron/attendance-reminders`, и водители без отметки получают
push за 30 минут до конца утреннего и вечернего окна. Повторный вызов ничего не дублирует.
Нужны две переменные:

```bash
dokku config:set --no-restart transport   CRON_SECRET="$(openssl rand -hex 24)"   APP_URL=https://transport.farovon.online
```

Если из контейнера задачи публичный адрес недоступен, задайте `CRON_TARGET_URL` (внутренний адрес
веб-процесса). Проверить вручную: `dokku cron:list transport`, затем `dokku cron:run transport <id>`.
Без `CRON_SECRET` эндпоинт отвечает 503 и напоминания не уходят.

VAPID-ключи генерируются командой `npx web-push generate-vapid-keys`. Публичный ключ
читается в рантайме, пересобирать образ после его смены не нужно.

### Публичный адрес и HTTPS

Адрес: **https://transport.farovon.online** (Cloudflare Tunnel). Прежний адрес
`transport.tailb8adcc.ts.net` (Tailscale Funnel) выводится из работы: QR-коды
перепечатываются с новым адресом, старые не нужны.

Сервер стоит за NAT: снаружи открыт только SSH-порт 58595, порты 80/443 недоступны,
поэтому Let's Encrypt и прямой доступ по IP не работают. На сервере работает агент
`cloudflared`, который сам держит исходящее соединение, а Cloudflare принимает
HTTPS-запросы и проксирует их в nginx Dokku на `127.0.0.1:80`. Сертификат выпускает и
продлевает Cloudflare. HTTPS обязателен: геолокация водителя, push и установка
PWA без него не работают.

#### Cloudflare Tunnel (transport.farovon.online)

Домен `farovon.online` куплен в Namecheap, DNS на Cloudflare (nameserver'ы
`alberto.ns.cloudflare.com` и `georgia.ns.cloudflare.com` прописаны в Namecheap →
Domain List → Manage → Nameservers → Custom DNS). Туннель `transport`
(`c2e46284-b57b-446e-b928-b407bc5ec4e2`) управляется из Cloudflare: маршрут
`transport.farovon.online → http://localhost:80` хранится в его конфигурации, на сервере
файлов настроек нет. DNS-запись `transport` — CNAME на
`c2e46284-b57b-446e-b928-b407bc5ec4e2.cfargotunnel.com` с проксированием.

На сервере (один раз):

```bash
# cloudflared из официального репозитория Cloudflare
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" > /etc/apt/sources.list.d/cloudflared.list
apt-get update && apt-get install -y cloudflared
# токен туннеля: cf tunnels token get c2e46284-b57b-446e-b928-b407bc5ec4e2
cloudflared service install <токен>        # systemd-сервис, переживает перезагрузку

dokku domains:add transport transport.farovon.online
dokku config:set transport APP_URL=https://transport.farovon.online
```

Проверка: `systemctl status cloudflared` на сервере, `cf tunnels get <id>` → `"status": "healthy"`.
QR-коды строятся из `APP_URL`: после смены адреса перепечатайте их (Табель → Точки → «Печать QR»).

#### Отключение Tailscale Funnel

Когда `https://transport.farovon.online` открывается и QR перепечатаны:

```bash
tailscale funnel --https=443 off
dokku domains:remove transport transport.tailb8adcc.ts.net
```

Сам Tailscale можно оставить для доступа к серверу по приватной сети или удалить.
Как Funnel был настроен (для истории):

```bash
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up --hostname=transport          # вход по ссылке в аккаунт Tailscale
# в панели login.tailscale.com → DNS: включить MagicDNS и HTTPS Certificates
tailscale funnel --bg 80                   # при первом запуске — ссылка на разрешение Funnel
dokku domains:add transport transport.tailb8adcc.ts.net
```

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
на базе, где уже был сид. Первый администратор становится суперадминистратором: только он
добавляет остальных администраторов в разделе «Администраторы».

Если база заведена раньше, чем появился суперадмин, миграция `0006` назначает им самого
раннего активного администратора (кроме демо-аккаунта сида), — делать ничего не нужно.

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

`.github/workflows/deploy.yml` на каждый пуш в `main` параллельно запускает проверки
(typecheck, lint, тесты, FAQ) и сборку образа. Образ с тегом-хешем коммита уходит в GHCR,
после чего Dokku получает команду `git:from-image` и выкатывает его. Весь деплой занимает
несколько минут; раньше образ собирался на сервере, и одна сборка Next.js шла ~18 минут.

### Переход со сборки на сервере (один раз)

1. Снять путь к Dockerfile: при деплое образа Dokku генерирует свой Dockerfile, и старая
   настройка ломает его (`Invalid dockerfile-path specified`):
   ```bash
   dokku builder-dockerfile:set transport dockerfile-path
   ```
2. Образ собирается под `linux/amd64`; `uname -m` на сервере должен вывести `x86_64`.
3. Пакет `ghcr.io/nurik432/transport1` публичный (наследует видимость репозитория), Dokku
   скачивает его без логина. Секретов в образе нет. Если репозиторий станет закрытым,
   залогиньте Dokku в реестр токеном с правом `read:packages`:
   `dokku registry:login ghcr.io nurik432 <токен>`.

### Ключ для деплоя

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

Ручной запуск: вкладка Actions → Deploy → Run workflow. Запуск с другой ветки проверяет
и собирает образ, но на сервер его не выкатывает.

## Ручной деплой

Выкатить любой уже собранный образ, например чтобы откатиться на прошлый коммит:

```bash
dokku git:from-image transport ghcr.io/nurik432/transport1:<полный хеш коммита>
```

## Диагностика

```bash
dokku logs transport -t          # логи приложения
dokku ps:report transport        # состояние контейнеров
dokku config:show transport      # переменные окружения
dokku ps:rebuild transport       # перезапустить текущий образ без нового деплоя
```
