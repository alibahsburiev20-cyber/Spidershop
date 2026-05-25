import { fmtTon, fmtUsd } from '/js/supabase.js';

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
  const m = location.pathname.match(/\/pay\/([0-9a-f-]{36})/i);
  return m ? m[1] : new URLSearchParams(location.search).get('id');
}

let pollTimer = null;
let countdownTimer = null;

async function checkOrder(orderId) {
  try {
    const res = await fetch(`/api/orders/${orderId}/check`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    if (data.status === 'paid' && data.download_token) {
      clearInterval(pollTimer);
      clearInterval(countdownTimer);
      location.href = `/download/${data.download_token}`;
    } else if (data.status === 'expired') {
      clearInterval(pollTimer);
      clearInterval(countdownTimer);
      const statusEl = document.getElementById('status');
      if (statusEl) statusEl.innerHTML = '<span class="badge badge--expired">Время истекло. Создай заказ заново.</span>';
    }
    return data;
  } catch (err) {
    console.warn('check failed', err);
  }
}

(async () => {
  const orderId = getId();
  if (!orderId) {
    showAlert('Не указан ID заказа.');
    return;
  }
  let initial;
  try {
    const res = await fetch(`/api/orders/${orderId}/check`);
    initial = await res.json();
    if (!res.ok) throw new Error(initial.error || `HTTP ${res.status}`);
  } catch (err) {
    root.innerHTML = `<div class="alert alert--error">${escapeHtml(err.message)}</div>`;
    return;
  }

  if (initial.status === 'paid' && initial.download_token) {
    location.href = `/download/${initial.download_token}`;
    return;
  }

  const tonLink = `ton://transfer/${initial.pay_address}?amount=${Math.round(Number(initial.amount_ton) * 1e9)}&text=${encodeURIComponent(initial.pay_memo)}`;

  root.innerHTML = `
    <div class="pay-box">
      <h2>Оплата заказа</h2>
      <p class="muted">${escapeHtml(initial.product_title || '')}</p>

      <div style="font-size:28px;font-weight:700;color:var(--accent);margin:10px 0">
        ${fmtTon(initial.amount_ton)}
      </div>
      <p class="muted">≈ ${fmtUsd(initial.amount_usd)}</p>

      <canvas id="qr" class="pay-box__qr"></canvas>

      <p class="muted">Отсканируй или открой в Tonkeeper:</p>
      <a href="${escapeHtml(tonLink)}" class="btn btn--primary btn--block">Открыть в кошельке</a>

      <div class="mt-3">
        <div class="muted" style="text-align:left;font-size:12px">Адрес платформы</div>
        <div class="pay-box__field">
          <code id="addr">${escapeHtml(initial.pay_address)}</code>
          <button class="btn btn--sm" data-copy="addr">Копировать</button>
        </div>

        <div class="muted" style="text-align:left;font-size:12px">Комментарий (memo)</div>
        <div class="pay-box__field">
          <code id="memo">${escapeHtml(initial.pay_memo)}</code>
          <button class="btn btn--sm" data-copy="memo">Копировать</button>
        </div>

        <div class="muted" style="text-align:left;font-size:12px">Сумма</div>
        <div class="pay-box__field">
          <code id="amt">${Number(initial.amount_ton).toFixed(6)}</code>
          <button class="btn btn--sm" data-copy="amt">Копировать</button>
        </div>
      </div>

      <div class="pay-box__timer" id="timer"></div>
      <div class="pay-box__status mt-2" id="status">
        <span class="badge badge--pending">Ожидаем оплату…</span>
      </div>
      <p class="muted mt-2" style="font-size:12px">
        Важно: указывай memo в комментарии перевода, иначе мы не сможем найти твою оплату.
      </p>
    </div>
  `;

  // copy buttons
  document.querySelectorAll('[data-copy]').forEach(btn => btn.addEventListener('click', async () => {
    const txt = document.getElementById(btn.dataset.copy).textContent;
    try { await navigator.clipboard.writeText(txt); btn.textContent = '✓'; setTimeout(() => btn.textContent = 'Копировать', 1500); }
    catch { /* ignore */ }
  }));

  // QR
  if (window.QRCode) {
    window.QRCode.toCanvas(document.getElementById('qr'), tonLink, { width: 220, margin: 1, color: { dark: '#000', light: '#fff' } });
  }

  // countdown
  const expiresAt = new Date(initial.expires_at).getTime();
  function tick() {
    const left = Math.max(0, expiresAt - Date.now());
    const m = Math.floor(left / 60000);
    const s = Math.floor((left % 60000) / 1000);
    document.getElementById('timer').textContent = left
      ? `Осталось ${m}:${String(s).padStart(2, '0')}`
      : 'Время истекло';
  }
  tick();
  countdownTimer = setInterval(tick, 1000);

  // poll
  pollTimer = setInterval(() => checkOrder(orderId), 5000);
})();
