import { isLoggedIn, userId, insert, uploadFile, select } from '/js/supabase.js';

if (!isLoggedIn()) location.href = '/login.html';

const form = document.getElementById('form');
const alertBox = document.getElementById('alert');
const progress = document.getElementById('progress');
const btn = document.getElementById('submit');

function showAlert(msg, type = 'error') {
  alertBox.className = `alert alert--${type}`;
  alertBox.textContent = msg;
  alertBox.classList.remove('hidden');
}

function safeName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  alertBox.classList.add('hidden');
  btn.disabled = true;
  btn.textContent = 'Загружаем…';
  progress.classList.remove('hidden');

  try {
    // verify profile has username + ton_address
    const profileRows = await select('profiles', `?id=eq.${userId()}&select=username,ton_address`);
    const profile = profileRows[0] || {};
    if (!profile.username || !profile.ton_address) {
      throw new Error('Сначала заполни username и TON-адрес в профиле.');
    }

    const title = document.getElementById('title').value.trim();
    const description = document.getElementById('description').value.trim();
    const price = parseFloat(document.getElementById('price').value);
    const coverInput = document.getElementById('cover');
    const fileInput = document.getElementById('file');
    const file = fileInput.files[0];
    if (!file) throw new Error('Выбери файл товара.');

    let cover_path = null;
    if (coverInput.files[0]) {
      progress.textContent = 'Загружаем обложку…';
      const cf = coverInput.files[0];
      const path = `${userId()}/${Date.now()}_${safeName(cf.name)}`;
      await uploadFile('covers', path, cf);
      cover_path = path;
    }

    progress.textContent = `Загружаем файл (${(file.size / 1024 / 1024).toFixed(1)} МБ)…`;
    const filePath = `${userId()}/${Date.now()}_${safeName(file.name)}`;
    await uploadFile('products', filePath, file);

    progress.textContent = 'Создаём карточку…';
    const product = {
      seller_id: userId(),
      title,
      description: description || null,
      cover_path,
      file_path: filePath,
      file_name: file.name,
      file_size: file.size,
      price_usd: price,
      is_published: true,
    };
    const rows = await insert('products', product);
    const created = Array.isArray(rows) ? rows[0] : rows;
    location.href = `/p/${created.id}`;
  } catch (err) {
    showAlert(err.message);
    btn.disabled = false;
    btn.textContent = 'Опубликовать';
    progress.classList.add('hidden');
  }
});
