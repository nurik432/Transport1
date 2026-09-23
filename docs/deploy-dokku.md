# Деплой на Dokku

Сервер: `89.125.120.7`, приложение `transport`. Образ собирается из `apps/web/Dockerfile`,
миграции применяются автоматически перед переключением трафика (`app.json` →
`scripts.dokku.predeploy`). Если миграция упала, новая версия не запускается, старая
продолжает работать.

## Разовая настройка сервера

Команды выполняются на сервере (`ssh root@89.125.120.7`).

```bash
# приложение
dokku apps:create transport
dokku builder-dockerfile:set transport dockerfile-path apps/web/Dockerfile
dokku git:set transport deploy-branch main
dokku ports:set transport http:80:3000

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
  VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:admin@example.com
```

VAPID-ключи генерируются командой `npx web-push generate-vapid-keys`. Публичный ключ
читается в рантайме, пересобирать образ после его смены не нужно.

### Домен и HTTPS

Push-уведомления и установка PWA работают только по HTTPS.

```bash
dokku domains:set transport transport.example.com
sudo dokku plugin:install https://github.com/dokku/dokku-letsencrypt.git
dokku letsencrypt:set transport email admin@example.com
dokku letsencrypt:enable transport
dokku letsencrypt:cron-job --add
```

### Тестовые данные

Сид не идемпотентен, его запускают вручную и только на пустой базе. В production-образе
нет pnpm/tsx, поэтому сид запускается с локальной машины через SSH-туннель к базе:

```bash
dokku postgres:expose transport-db 15432       # на сервере, временно
DATABASE_URL=postgres://postgres:<пароль>@89.125.120.7:15432/transport_db pnpm db:seed
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
   cat dokku_deploy.pub | ssh root@89.125.120.7 dokku ssh-keys:add github-actions
   ```
3. В GitHub: Settings → Secrets and variables → Actions → New repository secret,
   имя `DOKKU_SSH_PRIVATE_KEY`, значение — содержимое файла `dokku_deploy`.
4. Удалить локальные файлы ключа.

Ручной запуск: вкладка Actions → Deploy → Run workflow.

## Ручной деплой

```bash
git remote add dokku dokku@89.125.120.7:transport
git push dokku main
```

## Диагностика

```bash
dokku logs transport -t          # логи приложения
dokku ps:report transport        # состояние контейнеров
dokku config:show transport      # переменные окружения
dokku ps:rebuild transport       # пересобрать без нового пуша
```
