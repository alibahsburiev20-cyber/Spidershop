import { sb, json } from '../../_shared/supabase.js';

// GET /api/download/:token
// Returns a signed Supabase Storage URL valid for 1 hour, capped by download_limit.
export async function onRequestGet({ params, env }) {
  const token = params.token;
  if (!token) return json({ error: 'token required' }, 400);

  const db = sb(env);
  const rows = await db.select('orders',
    `?download_token=eq.${token}&select=*,product:product_id(title,file_name,file_path)`);
  const order = rows[0];
  if (!order) return json({ error: 'token not found' }, 404);
  if (order.status !== 'paid' && order.status !== 'delivered') {
    return json({ error: 'order not paid' }, 403);
  }

  const limit = Number(order.download_limit || 5);
  if ((order.download_count || 0) >= limit) {
    return json({ error: 'download limit reached' }, 403);
  }

  const filePath = order.product?.file_path;
  if (!filePath) return json({ error: 'file not available' }, 500);

  let signedUrl;
  try {
    signedUrl = await db.signObjectUrl('products', filePath, 3600);
  } catch (err) {
    return json({ error: 'cannot sign url: ' + err.message }, 500);
  }

  await db.update('orders', `?id=eq.${order.id}`, {
    download_count: (order.download_count || 0) + 1,
    status: 'delivered',
  });

  return json({
    signed_url: signedUrl,
    file_name: order.product?.file_name,
    product_title: order.product?.title,
    download_count: (order.download_count || 0) + 1,
    download_limit: limit,
  });
}
