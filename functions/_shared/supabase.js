// Service-role Supabase client used inside Pages Functions.
// Bypasses RLS — never expose this key to the browser.

export function sb(env) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing');

  async function rest(path, opts = {}) {
    const res = await fetch(`${url}/rest/v1${path}`, {
      ...opts,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: opts.prefer || 'return=representation',
        ...(opts.headers || {}),
      },
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const msg = (data && (data.message || data.error || data.msg)) || `HTTP ${res.status}`;
      throw new Error(`Supabase: ${msg}`);
    }
    return data;
  }

  return {
    select: (table, query = '') => rest(`/${table}${query}`),
    insert: (table, row, prefer) => rest(`/${table}`, { method: 'POST', body: JSON.stringify(row), prefer }),
    update: (table, query, patch, prefer) => rest(`/${table}${query}`, { method: 'PATCH', body: JSON.stringify(patch), prefer }),
    remove: (table, query) => rest(`/${table}${query}`, { method: 'DELETE' }),

    async signObjectUrl(bucket, path, expiresIn = 3600) {
      const res = await fetch(`${url}/storage/v1/object/sign/${bucket}/${path}`, {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expiresIn }),
      });
      if (!res.ok) throw new Error(`Storage sign failed: HTTP ${res.status}`);
      const data = await res.json();
      return `${url}/storage/v1${data.signedURL || data.signedUrl}`;
    },
  };
}

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
