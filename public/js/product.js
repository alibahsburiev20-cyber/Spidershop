import { select, publicUrl, fmtUsd } from '/js/supabase.js';

const root = document.getElementById('root');
const alertBox = document.getElementById('alert');

function showAlert(msg, type = 'error') {
  alertBox.className = `alert alert--${type}`;
  alertBox.textContent = msg;
  alertBox.classList.remove('hidden');
}
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function getId() {
  const m = location.pathname.match(/\/p\/([0-9a-f-]{36})/i);
  return m ? m[1] : new URLSearchParams(location.search).get('id');
}

(async () => {
  const id = getId();
  if (!id) {
    root.innerHTML = '<div class="alert alert--error">Не указан ID товара.</div>';
    return;
  }
  let rows;
  try {
    rows = await select('products', `?id=eq.${id}&select=*,seller:seller_id(username,display_name,avatar_url)`);
  } catch (err) {
    root.innerHTML = `<div class="alert alert--error">Ошибка: ${escapeHtml(err.message)}</div>`;
    return;
  }
  const product = rows[0];
  if (!product) {
    root.innerHTML = '<div class="alert alert--error">Товар не найден или скрыт продавцом.</div>';
    return;
  }

  const cover = product.cover_path ? publicUrl('covers', product.cover_path)
    : null;
  const sellerName = product.seller?.display_name || product.seller?.username || 'аноним';
  const sellerLink = product.seller?.username ? `/u/${product.seller.username}` : '#';
  const isFree = Number(product.price_usd) === 0;

  root.innerHTML = `
    <div class="product-detail">
      <div>
        ${cover
          ? `<img class="product-detail__cover" src="${escapeHtml(cover)}" alt="">`
          : `<div class="product-detail__cover product-card__cover--placeholder">📦</div>`}
        <h1>${escapeHtml(product.title)}</h1>
        <p class="muted">от <a href="${sellerLink}">${escapeHtml(sellerName)}</a> · ${product.sales_count} продаж</p>
        <div style="white-space:pre-wrap;margin-top:14px">${escapeHtml(product.description || '')}</div>
      </div>
      <div class="product-detail__sidebar">
        <div class="product-detail__price">${isFree ? 'Бесплатно' : fmtUsd(product.price_usd)}</div>
        ${!isFree ? '<p class="muted">Оплата в TON по текущему курсу</p>' : ''}
        <form id="buyForm">
          <div class="form-row">
            <label>Email для чека ${isFree ? '' : '(на этот адрес придёт ссылка после оплаты)'}</label>
            <input type="email" id="email" required>
          </div>
          <button type="submit" class="btn btn--primary btn--block btn--lg" id="buyBtn">
            ${isFree ? 'Получить бесплатно' : 'Оплатить в TON'}
          </button>
        </form>
        <p class="muted center mt-2" style="font-size:12px">
          После оплаты получишь одноразовую ссылку. Лимит — 5 скачиваний.
        </p>
      </div>
    </div>
  `;

  document.getElementById('buyForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('buyBtn');
    btn.disabled = true;
    btn.textContent = 'Создаём заказ…';
    try {
      const res = await fetch('/api/orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: product.id,
          buyer_email: document.getElementById('email').value.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (data.free && data.download_token) {
        location.href = `/download/${data.download_token}`;
      } else {
        location.href = `/pay/${data.order_id}`;
      }
    } catch (err) {
      showAlert(err.message);
      btn.disabled = false;
      btn.textContent = isFree ? 'Получить бесплатно' : 'Оплатить в TON';
    }
  });
})();
