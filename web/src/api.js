const base = '';

async function req(path, opts = {}) {
  const res = await fetch(base + path, {
    headers: opts.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {},
    ...opts,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) throw Object.assign(new Error((data && data.error) || res.statusText), { status: res.status, data });
  return data;
}

export const api = {
  getConfig: () => req('/api/config'),
  login: (password) => req('/api/login', { method: 'POST', body: JSON.stringify({ password }) }),

  listDevices: () => req('/api/devices'),
  registerDevice: (link, label) =>
    req('/api/devices/register', { method: 'POST', body: JSON.stringify({ link, label }) }),
  importDevice: (cookies, label) =>
    req('/api/devices/import', { method: 'POST', body: JSON.stringify({ cookies, label }) }),
  verifyDevice: (id, sample) =>
    req(`/api/devices/${id}/verify`, { method: 'POST', body: JSON.stringify({ sample }) }),
  deleteDevice: (id) => req(`/api/devices/${id}`, { method: 'DELETE' }),

  listJobs: () => req('/api/jobs'),
  getJob: (id) => req(`/api/jobs/${id}`),
  deleteJob: (id) => req(`/api/jobs/${id}`, { method: 'DELETE' }),
  uploadJob: (files, name) => {
    const fd = new FormData();
    if (name) fd.append('name', name);
    for (const f of files) fd.append('file', f);
    return req('/api/jobs/upload', { method: 'POST', body: fd });
  },
  createJob: (urls, name, source) =>
    req('/api/jobs', { method: 'POST', body: JSON.stringify({ urls, name, source }) }),
  addBales: (id, urls) => req(`/api/jobs/${id}/bales`, { method: 'POST', body: JSON.stringify({ urls }) }),
  runJob: (id, deviceId, mode) =>
    req(`/api/jobs/${id}/run`, { method: 'POST', body: JSON.stringify({ deviceId, mode }) }),
};
