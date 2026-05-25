import { sb, json } from '../../_shared/supabase.js';
import { tonUsdRate, generateMemo } from '../../_shared/ton.js';
import { pickEnv } from '../../_shared/env.js';

// POST /api/orders/create
// body: { product_id, buyer_email }
export async function onRequestPost({ request, env }) {
  const cfg = pickEnv(env);
  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid JSON' }, 400); }

  const { product_id, buyer_email } = body || {};
  if (!product_id) return json({ error: 'product_id is required' }, 400);
  if (!buyer_email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(buyer_email)) {
    return json({ error: 'valid buyer_email required' }, 400);
  }

  const db = sb(env);

  // 1. Load product (bypass RLS via service role)
  const prodRows = await db.select('products',
    `?id=eq.${product_id}&is_published=eq.true&select=*,seller:seller_id(username,ton_address)`);
  const product = prodRows[0];
  if (!product) return json({ error: 'product not found or unpublished' }, 404);

  // 2. Free product fast-path
  if (Number(product.price_usd) === 0) {
    const downloadToken = crypto.randomUUID();
    const memo = generateMemo();
    const rows = await db.insert('orders', {
      product_id: product.id,
      seller_id: product.seller_id,
      buyer_email,
      amount_usd: 0,
      amount_ton: 0,
      ton_rate_usd: 0,
      pay_address: cfg.PLATFORM_TON_ADDRESS,
      pay_memo: memo,
      status: 'paid',
      download_token: downloadToken,
      paid_at: new Date().toISOString(),
    });
    const created = Array.isArray(rows) ? rows[0] : rows;
    await db.update('products', `?id=eq.${product.id}`, { sales_count: (product.sales_count || 0) + 1 });
    return json({ free: true, order_id: created.id, download_token: downloadToken });
  }

  // 3. Paid: compute TON amount
  let rate;
  try { rate = await tonUsdRate(env); }
  catch (err) { return json({ error: 'Cannot fetch TON/USD rate: ' + err.message }, 502); }

  const amountTon = Number((Number(product.price_usd) / rate).toFixed(6));
  if (amountTon <= 0) return json({ error: 'computed amount is zero' }, 400);

  // Unique memo (retry a couple of times on collision)
  let memo = generateMemo();
  for (let i = 0; i < 3; i++) {
    const existing = await db.select('orders', `?pay_memo=eq.${memo}&select=id`);
    if (!existing.length) break;
    memo = generateMemo();
  }

  const rows = await db.insert('orders', {
    product_id: product.id,
    seller_id: product.seller_id,
    buyer_email,
    amount_usd: product.price_usd,
    amount_ton: amountTon,
    ton_rate_usd: rate,
    pay_address: cfg.PLATFORM_TON_ADDRESS,
    pay_memo: memo,
    status: 'pending',
  });
  const order = Array.isArray(rows) ? rows[0] : rows;

  return json({
    order_id: order.id,
    pay_address: order.pay_address,
    pay_memo: order.pay_memo,
    amount_ton: order.amount_ton,
    amount_usd: order.amount_usd,
    ton_rate_usd: order.ton_rate_usd,
    expires_at: order.expires_at,
  });
}
