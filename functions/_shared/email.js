// Resend integration. Silently no-ops if RESEND_API_KEY isn't set.

export async function sendReceipt(env, { to, productTitle, sellerName, downloadUrl, amountTon, amountUsd }) {
  if (!env.RESEND_API_KEY || !to) return { skipped: true };

  const from = env.RESEND_FROM || 'Spidershop <onboarding@resend.dev>';
  const subject = `Покупка: ${productTitle}`;
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#fff;color:#111">
      <h2 style="margin:0 0 10px">Спасибо за покупку!</h2>
      <p style="color:#555">Ты только что купил <b>${escapeHtml(productTitle)}</b> у автора <b>${escapeHtml(sellerName || 'Spidershop')}</b>.</p>
      <p>Сумма: <b>${Number(amountTon).toFixed(3)} TON</b> (≈ $${Number(amountUsd).toFixed(2)})</p>
      <p style="margin:24px 0">
        <a href="${downloadUrl}" style="display:inline-block;background:#5b8def;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">Скачать файл</a>
      </p>
      <p style="color:#888;font-size:12px">Ссылка работает 1 час и допускает до 5 скачиваний.<br>Если ссылка не открывается — снова перейди по ней, мы выдадим новую.</p>
      <hr style="margin:24px 0;border:0;border-top:1px solid #eee">
      <p style="color:#aaa;font-size:11px">Spidershop · анонимная площадка для авторов</p>
    </div>
  `;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) {
    const t = await res.text();
    console.warn('Resend failed:', res.status, t);
    return { error: t };
  }
  return { ok: true };
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
