# Platform Operations

## Платёжный кошелёк

Все оплаты идут на единый адрес платформы:

```
UQB_y7iS9NCOaRKaSd-ze2voG0qIdDThhT7x3JemIcOqNcZD
```

Транзакции идентифицируются по `memo` (text comment в TON) формата `sp-XXXXXX`. Этот memo генерируется при создании заказа и привязан к нему 1:1.

## Комиссия

5% автоматически удерживается при создании записи `payouts`. Структура каждой оплаты:

- `seller_amount` = 95% от суммы заказа в TON
- `platform_fee` = 5%

## Выплаты продавцам (manual flow)

1. Открыть админку `/admin.html` (доступ — по `is_admin = true` в profiles)
2. Увидеть список `payouts.status = 'pending'`
3. Для каждой записи:
   - Отправить `seller_amount` TON на `profiles.ton_address` продавца со своего кошелька
   - Скопировать хэш транзакции
   - Нажать «Mark as paid», вставить хэш
4. Запись переходит в `status='sent'`, `payout_tx` сохраняется

## Будущее: автовыплаты

Отдельный Cloudflare Worker с cron-триггером раз в час:

- Читает `payouts` WHERE `status='pending'`
- Использует `@ton/ton` + мнемонику hot-wallet'а из `WALLET_MNEMONIC` env
- Отправляет TX → пишет хэш в `payout_tx` → `status='sent'`

Hot-wallet НЕ должен хранить больше суммы выплат за сутки. Холодный кошелёк пополняет hot-wallet вручную.

## Безопасность

- `SUPABASE_SERVICE_ROLE_KEY` живёт ТОЛЬКО в Cloudflare Pages env, никогда во фронте
- RLS включён на всех таблицах: продавец видит только свои товары/заказы/выплаты
- Service-role используется только в `functions/api/*` для операций, требующих обхода RLS (запись `paid_at`, выдача download_token)
- Скачивание защищено `download_token` (UUID), лимит — 5 скачиваний на заказ

## Мониторинг

- `tonapi.io` без токена даёт ~1 RPS — для MVP хватает
- При росте: купить тариф или поднять свой LiteServer

## Email

- Resend free tier: 3000 писем/мес, 100/день
- При отсутствии `RESEND_API_KEY` email-чеки молча пропускаются (заказ всё равно доставляется через download-ссылку на экране)
