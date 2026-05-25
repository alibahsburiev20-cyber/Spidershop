// Thin Supabase REST + Auth wrapper that runs in the browser.
// Config is fetched once from /api/config (Pages Function reading env vars).

const cfgRes = await fetch('/api/config');
const cfg = await cfgRes.json();
const URL = cfg.supabase_url;
const KEY = cfg.supabase_anon_key;

if (!URL || !KEY) {
  console.error('Spidershop: SUPABASE_URL / SUPABASE_ANON_KEY missing in Pages env');
}

const TOKEN_KEY = 'sb_session';

function loadSession() {
  try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null'); }
  catch { return null; }
}
function saveSession(s) {
  if (s) localStorage.setItem(TOKEN_KEY, JSON.stringify(s));
  else localStorage.removeItem(TOKEN_KEY);
}

let session = loadSession();

function authHeaders() {
  const h = { apikey: KEY, 'Content-Type': 'application/json' };
  if (session && session.access_token) h.Authorization = `Bearer ${session.access_token}`;
  else h.Authorization = `Bearer ${KEY}`;
  return h;
}

async function request(path, opts = {}) {
  const res = await fetch(`${URL}${path}`, { ...opts, headers: { ...authHeaders(), ...(opts.headers || {}) } });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && (data.error_description || data.message || data.msg || data.error)) || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

// ---------- Auth ----------
export async function signUp(email, password) {
  const data = await request(`/auth/v1/signup`, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (data && data.access_token) {
    session = data;
    saveSession(session);
  }
  return data;
}

export async function signIn(email, password) {
  const data = await request(`/auth/v1/token?grant_type=password`, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  session = data;
  saveSession(session);
  return data;
}

export function signOut() {
  session = null;
  saveSession(null);
}

export function getSession() { return session; }
export function isLoggedIn() { return !!(session && session.access_token); }
export function userId() { return session && session.user && session.user.id; }
export function userEmail() { return session && session.user && session.user.email; }

// ---------- PostgREST ----------
export async function rest(path, opts = {}) {
  const headers = opts.headers || {};
  return request(`/rest/v1${path}`, {
    ...opts,
    headers: {
      Prefer: opts.prefer || 'return=representation',
      ...headers,
    },
  });
}

export async function select(table, query = '') {
  return rest(`/${table}${query}`, { method: 'GET' });
}

export async function insert(table, row) {
  return rest(`/${table}`, { method: 'POST', body: JSON.stringify(row) });
}

export async function update(table, query, patch) {
  return rest(`/${table}${query}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

export async function remove(table, query) {
  return rest(`/${table}${query}`, { method: 'DELETE' });
}

// ---------- Storage ----------
export async function uploadFile(bucket, path, file) {
  const res = await fetch(`${URL}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': file.type || 'application/octet-stream',
      'x-upsert': 'true',
    },
    body: file,
  });
  if (!res.ok) throw new Error(`Upload failed: HTTP ${res.status}`);
  return res.json();
}

export function publicUrl(bucket, path) {
  return `${URL}/storage/v1/object/public/${bucket}/${path}`;
}

// ---------- Helpers ----------
export function fmtUsd(v) {
  return `$${Number(v).toFixed(2)}`;
}
export function fmtTon(v) {
  return `${Number(v).toFixed(3)} TON`;
}
export function fmtDate(d) {
  return new Date(d).toLocaleString();
}
