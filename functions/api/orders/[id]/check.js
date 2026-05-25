import { sb, json } from '../../../_shared/supabase.js';
import { findIncomingByMemo } from '../../../_shared/ton.js';
import { sendReceipt } from '../../../_shared/email.js';
import { pickEnv } from '../../../_shared/env.js';

// GET /api/orders/:id/check
export async function onRequestGet({ params, env, request }) {
  const cfg = pickEnv(env);
  const id = params.id;
  if (!id) return json({ error: 'id required' }, 400);

  const db = sb(env);
  const rows = await db.select('orders',
    `?id=eq.${id}&select=*,product:product_id(title,file_name),seller:seller_id(username,display_name)`);
  const order = rows[0];
  if (!order) return json({ error: 'order not found' }, 404);

  // Already settled?
  if (order.status === 'paid' || order.status === 'delivered') {
    return respond(order);
  }

  // Expired?
  if (new Date(order.expires_at).getTime() < Date.now()) {
    if (order.status !== 'expired') {
      await db.update('orders', `?id=eq.${order.id}`, { status: 'expired' });
      order.status = 'expired';
    }
    return respond(order);
  }

  // Check blockchain
  let found;
  try {
    found = await findIncomingByMemo(env, cfg.PLATFORM_TON_ADDRESS, order.pay_memo, Number(order.amount_ton), 0.01);
  } catch (err) {
    console.warn('TON check failed:', err.message);
    return respond(order);
  }
  if (!found) return respond(order);

  // Mark as paid + create payout + bump sales_count
  const downloadToken = crypto.randomUUID();
  await db.update('orders', `?id=eq.${order.id}&status=eq.pending`, {
    status: 'paid',
    paid_at: new Date().toISOString(),
    tx_hash: found.hash,
    download_token: downloadToken,
  });

  const feePct = Number(cfg.PLATFORM_FEE_PERCENT || 5);
  const sellerAmount = Number((found.valueTon * (1 - feePct / 100)).toFixed(6));
  const platformFee = Number((found.valueTon - sellerAmount).toFixed(6));

  try {
    await db.insert('payouts', {
      order_id: order.id,
      seller_id: order.seller_id,
      seller_amount: sellerAmount,
      platform_fee: platformFee,
      status: 'pending',
    });
  } catch (err) {
    // race-safe: unique constraint on order_id means only one payout per order
    console.warn('payout insert:', err.message);
  }

  await db.update('products', `?id=eq.${order.product_id}`,
    { sales_count: (await getSalesCount(db, order.product_id)) + 1 });

  // Email receipt (fire-and-forget — don't block response)
  const origin = new URL(request.url).origin;
  const downloadUrl = `${origin}/download/${downloadToken}`;
  try {
    await sendReceipt(env, {
      to: order.buyer_email,
      productTitle: order.product?.title,
      sellerName: order.seller?.display_name || order.seller?.username,
      downloadUrl,
      amountTon: order.amount_ton,
      amountUsd: order.amount_usd,
    });
  } catch (err) { console.warn('email failed:', err.message); }

  // Re-read order to return fresh state
  const fresh = await db.select('orders', `?id=eq.${order.id}&select=*,product:product_id(title,file_name)`);
  return respond(fresh[0] || order);
}

async function getSalesCount(db, productId) {
  const rows = await db.select('products', `?id=eq.${productId}&select=sales_count`);
  return rows[0]?.sales_count || 0;
}

function respond(order) {
  return json({
    order_id: order.id,
    status: order.status,
    pay_address: order.pay_address,
    pay_memo: order.pay_memo,
    amount_ton: order.amount_ton,
    amount_usd: order.amount_usd,
    ton_rate_usd: order.ton_rate_usd,
    expires_at: order.expires_at,
    download_token: order.download_token || null,
    product_title: order.product?.title || null,
  });
}
