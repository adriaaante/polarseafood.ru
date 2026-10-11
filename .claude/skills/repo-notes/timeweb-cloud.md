# Timeweb Cloud: как запускать проекты (проверено на практике)

Общий опыт для всех репозиториев пользователя. Пример рабочей реализации: репо `adriaaante/detkskaya_odezda`,
папка `deploy/` (`create-server.sh`, `cloud-init.yaml`, `bootstrap.sh`, `caddy/`) и `.github/workflows/deploy.yml`.
Помечено **[гипотеза]** — не проверено руками.

## Доступ и деньги
- Токен: env `ZAJDELADRIAN_TIMEWEB_CLOUD_TOKEN` (общий на аккаунт). Брать на timeweb.cloud → «API и Terraform»
  (НЕ timeweb.hosting). API: `https://api.timeweb.cloud/api/v1`, заголовок `Authorization: Bearer …`.
- Полная спецификация (OpenAPI, ~2,5 МБ): `https://timeweb.cloud/api-docs-data/bundle.json` — поля смотреть там.
- Баланс: `GET /account/finances`. Новый аккаунт = 0 ₽ — сервер не создать, пока пользователь не пополнит.
- Перед любым платным действием: назвать цену/мес и ждать явного «да». Классификатор авто-режима Claude
  сам блокирует создание платных ресурсов и публикацию логов — нужен явный разрешающий ответ пользователя.
- Цены (2026-10): Cloud MSK 50 — preset `4801`, локация `ru-3` (Москва; `ru-1` — это Петербург), 2 vCPU/4 ГБ/50 ГБ,
  1000 ₽/мес; публичный IPv4 — отдельно; автобэкапы ~6 ₽/ГБ. Ubuntu 24.04 = `os_id 99`. Список: `GET /presets/servers`.

## Принятая архитектура (решение пользователя)
- Один VPS «main» (id 9270333, IP 5.42.96.9) под все проекты; отдельного infra-репо НЕТ — серверное в `deploy/` проекта.
- Общий Caddy = caddy-docker-proxy в `/srv/caddy`, docker-сеть `caddy`; каждый проект в `/srv/<проект>/` со своим
  `docker-compose.yml` (labels `caddy: <домен>`, `caddy.reverse_proxy: "{{upstreams <порт>}}"`), `.env`, `data/`.
- Пользователь `deploy` (в группе docker) с SSH-ключом — для деплоя из GitHub Actions.

## Грабли создания сервера
1. **Сервер создаётся БЕЗ публичного IPv4** → cloud-init при создании отрабатывает без сети и бесполезен.
   Рабочий порядок: `POST /servers` (без cloud_init) → дождаться `status=on` → `POST /servers/{id}/ips {"type":"ipv4"}`
   → `PATCH /servers/{id} {"os_id":99,"cloud_init":"…"}` — это переустановка ОС (ДИСК СТИРАЕТСЯ), cloud-init уже с сетью.
2. Переустановка (`PATCH` с `os_id`) — единственный способ перезапустить cloud-init. Факт переустановки:
   `GET /servers/{id}/logs` → событие `reinstall`. Готово через ~1 мин, cloud-init+сборка ещё 5–10 мин.
3. `cloud_init` — обычный текст `#cloud-config`. **Лимит тела запроса ~64 КБ** (100 КБ → HTTP 413, 49 КБ — ок).
   В GET ответе он скрыт (`hidden-by-api-key-policy`).
4. Сложный cloud-config (`users`/`packages`/`write_files`/`bootcmd`) давал сервер, где закрыт даже порт 22, без следов;
   причину не нашли. Работает минимальный: `write_files` (env + архив кода) + 3 строки `runcmd` → `bootstrap.sh`.
5. **Репо приватные — сервер не может `git clone`** («could not read Username»). Код класть в cloud-init архивом
   (`git archive … | xz -9e | base64`, без генерируемых файлов — их собирать в Dockerfile), обновления — из Actions:
   `git archive HEAD | ssh deploy@host "tar xzf - -C /srv/<проект> && docker compose up -d --build"`.
6. API Timeweb через прокси сессии иногда рвёт соединение (`curl: (35) … reset`): `curl --retry 3 --retry-all-errors`.
   POST мог оборваться, но не выполниться — перед повтором проверять состояние (например, есть ли уже IP).

## Внутри сервера
- Docker — из apt Ubuntu (`docker.io docker-compose-v2`, зеркало `mirror.timeweb.ru` быстрое), Docker Hub — через
  `{"registry-mirrors":["https://dockerhub.timeweb.cloud"]}` в `/etc/docker/daemon.json`.
- Нативные npm-модули: готовый бинарник (better-sqlite3) не скачался → в Dockerfile этап сборки с `python3 make g++`
  (multi-stage, итоговый образ остаётся slim).
- Google Fonts и прочие CDN из РФ ненадёжны — шрифты/скрипты отдавать со своего сервера (npm `@fontsource/*`).
- ufw: 22, 80, 443; fail2ban; unattended-upgrades; cron-бэкап БД. Docker публикует порты в обход ufw — публиковать
  только Caddy (80/443).

## HTTPS — главная грабля (только без домена)
- **Let's Encrypt не выдаёт сертификат по HTTP-проверке серверу в РФ:** основная проверка проходит, а многоточечная
  («During secondary validation: … Timeout during connect») — нет, и для http-01, и для tls-alpn-01. MPIC обязателен
  для всех публичных CA, так что другой CA с HTTP-проверкой вряд ли поможет.
- Не сработали: `<ip>.sslip.io` (его нет в Public Suffix List) и сертификат LE на IP (профиль `shortlived`; Caddy ≥2.10
  умеет, но нужен ещё `default_sni` — в Docker Caddy видит IP контейнера, а не внешний).
- Пока нет домена — `http://<ip>` (в compose домен = `http://<ip>`). Для HTTPS: домен + **DNS-01** с DNS вне РФ
  (Cloudflare) и образ Caddy с DNS-плагином **[гипотеза]**. Домен покупает пользователь.

## Диагностика без SSH (из облачной сессии Claude открыты наружу только 80/443)
- SSH и нестандартные порты недоступны. Внешняя доступность: API check-host.net
  (`/check-ping|check-tcp|check-http?host=…` → `/check-result/<id>`, заголовок `Accept: application/json`).
- До старта проекта: `systemd-run --unit=diag python3 -m http.server 80 --directory /run/diag` с логом установки,
  `bootstrap.sh` гасит его перед Caddy. Логи после старта — на отдельном порту, читать временным workflow
  GitHub Actions (`curl` в раннере) + `mcp__github__get_job_logs` (лог готов только после завершения job).
- Секреты GitHub Actions через MCP не задать — их добавляет пользователь (Settings → Secrets → Actions).

## Второй и следующие проекты на том же сервере
- Переустанавливать сервер НЕЛЬЗЯ (сотрёт все проекты). Деплой — только через GitHub Actions по SSH (`deploy@IP`):
  первый запуск = скопировать код в `/srv/<проект>/`, положить `.env`, `docker compose up -d --build`.
- Для этого у проекта СВОЙ ключ (не ключ Пуговки): Claude генерирует пару (в песочнице нет ssh-keygen — python
  `cryptography`, `PrivateFormat.OpenSSH`), публичную половину добавляет в `authorized_keys` deploy разовым воркфлоу
  репо, у которого уже есть SSH-секрет (так сделано для `your_friend`), приватную отдаёт пользователю файлом —
  он кладёт её в секреты своего репо (`<ПРОЕКТ>_DEPLOY_HOST`, `<ПРОЕКТ>_DEPLOY_SSH_KEY`).
- Root-операции от deploy (в группе docker): `docker run --rm --privileged --pid=host -v /:/host alpine chroot /host …`.
- Через прокси сессии `gh api` работает для repo-путей, но secrets/variables/environments/deploy keys — 403.
- Авто-режим Claude отдельно требует явного «да» на добавление домена в аккаунт и на изменения прод-сервера.

## Домены и DNS
- Внешний домен (купленный у Reg.ru и т.п.) — `POST /add-domain/{fqdn}` (бесплатно), Timeweb сам ставит MX/SPF/DMARC
  своей почты. Дальше пользователь меняет NS у регистратора: ns1/ns2.timeweb.ru, ns3/ns4.timeweb.org.
- Записи: `POST /api/v2/domains/{fqdn}/dns-records {"type":"A","value":"…"}`; v1 на корень домена отвечает
  «Bad subdomain name». Поддомен — запрос на fqdn поддомена (`www.example.ru`).
- **Для настоящего домена LE работает** (проверено 2026-10-06, tvoj-drug.ru на 5.42.96.9): caddy-docker-proxy получил
  сертификат по tls-alpn-01 за минуту после переключения DNS, вторичные проверки LE прошли. Не сработали только голый IP
  и sslip.io (см. ниже). Пока DNS не переключён, Caddy копит неудачи с паузами — после переключения сертификат может
  выйти не сразу; перезапуск не понадобился.
- Смена NS у Reg.ru: в реестре .ru появилась через ~1 ч, кэши резолверов — ещё ~30 мин.
