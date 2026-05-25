import {
  isLoggedIn, signOut, userId, select, update, remove,
  publicUrl, fmtUsd, fmtTon, fmtDate
} from '/js/supabase.js';

if (!isLoggedIn()) location.href = '/login.html';

const alertBox = document.getElementById('alert');
function showAlert(msg, type = 'error') {
  alertBox.className = `alert alert--${type}`;
  alertBox.textContent = msg;
  alertBox.classList.remove('hidden');
  setTimeout(() => alertBox.classList.add('hidden'), 4000);
}

document.getElementById('logout').addEventListener('click', e => {
  e.preventDefault();
  signOut();
  location.href = '/';
});

// ---------- profile ----------
let profile = null;
async function loadProfile() {
  const rows = await select('profiles', `?id=eq.${userId()}&select=*`);
  profile = rows[0] || {};
  document.getElementById('username').value = profile.username || '';
  document.getElementById('display_name').value = profile.display_name || '';
  document.getElementById('ton_address').value = profile.ton_address || '';
  document.getElementById('bio').value = profile.bio || '';
  const link = document.getElementById('viewStore');
  link.href = profile.username ? `/u/${profile.username}` : '#';
}

document.getElementById('profileForm').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    await update('profiles', `?id=eq.${userId()}`, {
      username: document.getElementById('username').value.trim().toLowerCase(),
      display_name: document.getElementById('display_name').value.trim() || null,
      ton_address: document.getElementById('ton_address').value.trim() || null,
      bio: document.getElementById('bio').value.trim() || null,
    });
    await loadProfile();
    showAlert('Профиль сохранён', 'success');
  } catch (err) {
    showAlert(err.message);
  }
});

// ---------- products ----------
async function loadProducts() {
  const items = await select('products', `?seller_id=eq.${userId()}&order=created_at.desc`);
  const box = document.getElementById('productsList');
  if (!items.length) {
    box.innerHTML = '<p class="muted">У вас пока нет товаров. <a href="/new-product.html">Создать первый</a>.</p>';
    return;
  }
  box.innerHTML = `
    <table class="table">
      <thead><tr><th>Товар</th><th>Цена</th><th>Продаж</th><th>Статус</th><th></th></tr></thead>
      <tbody>
        ${items.map(p => `
          <tr>
            <td>
              <a href="/p/${p.id}" target="_blank">${escapeHtml(p.title)}</a>
              <div class="muted" style="font-size:12px">${escapeHtml(p.file_name || '')}</div>
            </td>
            <td>${fmtUsd(p.price_usd)}</td>
            <td>${p.sales_count}</td>
            <td>${p.is_published ? '<span class="badge badge--paid">опубликован</span>' : '<span class="badge badge--expired">скрыт</span>'}</td>
            <td>
              <button class="btn btn--sm" data-toggle="${p.id}" data-pub="${p.is_published}">${p.is_published ? 'Скрыть' : 'Опубликовать'}</button>
              <button class="btn btn--sm btn--danger" data-delete="${p.id}">Удалить</button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>
  `;
  box.querySelectorAll('[data-toggle]').forEach(btn => btn.addEventListener('click', async () => {
    try {
      await update('products', `?id=eq.${btn.dataset.toggle}`, { is_published: btn.dataset.pub !== 'true' });
      await loadProducts();
    } catch (err) { showAlert(err.message); }
  }));
  box.querySelectorAll('[data-delete]').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('Удалить товар? Это действие необратимо.')) return;
    try {
      await remove('products', `?id=eq.${btn.dataset.delete}`);
      await loadProducts();
    } catch (err) { showAlert(err.message); }
  }));
}

// ---------- orders ----------
async function loadOrders() {
  const items = await select('orders',
    `?seller_id=eq.${userId()}&order=created_at.desc&limit=50&select=*,product:product_id(title)`);
  const box = document.getElementById('ordersList');
  if (!items.length) {
    box.innerHTML = '<p class="muted">Продаж пока не было.</p>';
    return;
  }
  box.innerHTML = `
    <table class="table">
      <thead><tr><th>Дата</th><th>Товар</th><th>Сумма</th><th>Покупатель</th><th>Статус</th></tr></thead>
      <tbody>
        ${items.map(o => `
          <tr>
            <td>${fmtDate(o.created_at)}</td>
            <td>${escapeHtml(o.product?.title || '—')}</td>
            <td>${fmtTon(o.amount_ton)}<br><span class="muted" style="font-size:12px">${fmtUsd(o.amount_usd)}</span></td>
            <td>${escapeHtml(o.buyer_email || '—')}</td>
            <td>${badgeStatus(o.status)}</td>
          </tr>`).join('')}
      </tbody>
    </table>
  `;
}

// ---------- payouts ----------
async function loadPayouts() {
  const items = await select('payouts', `?seller_id=eq.${userId()}&order=created_at.desc&limit=50`);
  const box = document.getElementById('payoutsList');
  if (!items.length) {
    box.innerHTML = '<p class="muted">Выплат пока не было.</p>';
    return;
  }
  box.innerHTML = `
    <table class="table">
      <thead><tr><th>Дата</th><th>К выплате (95%)</th><th>Комиссия (5%)</th><th>Статус</th><th>TX</th></tr></thead>
      <tbody>
        ${items.map(p => `
          <tr>
            <td>${fmtDate(p.created_at)}</td>
            <td>${fmtTon(p.seller_amount)}</td>
            <td class="muted">${fmtTon(p.platform_fee)}</td>
            <td>${badgeStatus(p.status)}</td>
            <td>${p.payout_tx ? `<a href="https://tonviewer.com/transaction/${p.payout_tx}" target="_blank">${p.payout_tx.slice(0, 10)}…</a>` : '—'}</td>
          </tr>`).join('')}
      </tbody>
    </table>
  `;
}

// ---------- helpers ----------
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function badgeStatus(s) {
  return `<span class="badge badge--${s}">${s}</span>`;
}

// ---------- boot ----------
(async () => {
  try {
    await loadProfile();
    await loadProducts();
    await loadOrders();
    await loadPayouts();
  } catch (err) {
    showAlert(err.message);
  }
})();
