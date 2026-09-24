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

### Тестовые данные

Сид не идемпотентен, его запускают вручную и только на пустой базе. В production-образе
нет pnpm/tsx, поэтому сид запускается с локальной машины через SSH-туннель к базе:

```bash
dokku postgres:expose transport-db 15432       # на сервере, временно
ssh -p 58595 -N -L 15432:127.0.0.1:15432 root@89.125.120.7   # локально, в отдельном окне
DATABASE_URL=postgres://postgres:<пароль>@127.0.0.1:15432/transport_db pnpm db:seed
dokku postgres:unexpose transport-db           # на сервере, сразу после
```

Пароль и имя базы показывает `dokku postgres:info transport-db`.

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
