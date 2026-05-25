# Spidershop

Анонимная Gumroad-альтернатива для авторов цифровых товаров. Оплата в TON, без KYC, без бюрократии. 5% комиссия платформы, 95% продавцу.

## Что внутри

- Лендинг, регистрация/вход продавца (Supabase Auth, email+пароль)
- Кабинет продавца: профиль, TON-адрес, username, список товаров, история продаж
- Загрузка цифрового товара (файл + обложка) в Supabase Storage
- Публичная страница товара `/p/{id}` и витрина автора `/u/{username}`
- Покупка за TON: создаётся заказ → QR + адрес + memo → polling блокчейна → выдача одноразовой ссылки на скачивание
- Email-чеки покупателю через Resend (опционально)
- Учёт выплат: для каждого заказа создаётся `payouts` запись (95% продавцу / 5% платформе) — выплаты пока ручные через дашборд админа

## Стек

- Frontend: HTML + CSS + ES-модули, без фреймворков
- Backend: Cloudflare Pages Functions
- DB + Auth + Storage: Supabase (free tier)
- Платежи: TON (tonapi.io как источник истории транзакций)
- Email: Resend (free tier)
- Хостинг: Cloudflare Pages

Стоимость на старте — **$0**.

## Архитектура

```
[Покупатель] ──→ Cloudflare Pages (статика + Pages Functions)
                        │
                        ├─→ Supabase Postgres (profiles, products, orders, payouts)
                        ├─→ Supabase Storage (covers public, products private)
                        ├─→ tonapi.io (history, курс TON/USD)
                        └─→ Resend (email-чеки)
```

## Деплой (полностью)

### 1. Supabase

1. Создать проект на https://supabase.com
2. SQL Editor → выполнить `db/schema.sql`
3. Storage → Create bucket `covers` (Public)
4. Storage → Create bucket `products` (Private)
5. Скопировать `Project URL`, `anon key`, `service_role key`

### 2. Resend (опционально, для email-чеков)

1. Зарегистрироваться на https://resend.com
2. Подтвердить домен или использовать `onboarding@resend.dev` для теста
3. Скопировать API-ключ

### 3. Cloudflare Pages

1. Создать проект → Connect to Git → выбрать этот репо
2. Build settings:
   - Framework preset: `None`
   - Build command: пусто
   - Output directory: `public`
3. Environment variables (Production):
   - `SUPABASE_URL` — из шага 1
   - `SUPABASE_ANON_KEY` — публичный ключ, отдаётся в браузер через `/api/config`
   - `SUPABASE_SERVICE_ROLE_KEY` — секретный, только на сервере
   - `PLATFORM_TON_ADDRESS` = `UQB_y7iS9NCOaRKaSd-ze2voG0qIdDThhT7x3JemIcOqNcZD`
   - `PLATFORM_FEE_PERCENT` = `5`
   - `TONAPI_TOKEN` — опционально, без него работает с rate-limit
   - `RESEND_API_KEY` — опционально
   - `RESEND_FROM` — например `Spidershop <noreply@yourdomain.tld>` или `onboarding@resend.dev`
4. Deploy

Фронт получает конфиг автоматически через Pages Function `/api/config` — никаких `_config.js` править вручную не нужно.

## Локальная разработка

```bash
npm install -g wrangler
wrangler pages dev public --compatibility-date=2024-01-01
```

API-функции из `functions/` подхватываются автоматически.

## Что нужно делать после деплоя

- Регулярно проверять `payouts` со `status='pending'` и отправлять 95% продавцам с твоего TON-кошелька, после чего ставить `status='sent'` и записывать `payout_tx`.
- Автоматизация выплат — отдельный Worker с cron и hot-wallet (есть `PAYOUTS.md` план).

## Дальнейшие фичи

См. `ROADMAP.md`.
