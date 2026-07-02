import { fetch as undiciFetch } from 'undici';
import { CookieJar } from 'tough-cookie';
import { CookieAgent } from 'http-cookie-agent/undici';
import { config } from './config.js';

const BASE = config.tcbBaseUrl;

// Mirror a real mobile browser so the SPA backend treats us like the registered phone.
const UA =
  'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/122.0.0.0 Mobile Safari/537.36';

/**
 * The QR codes encode URLs like:
 *   https://ccis.tcb.go.tz/baletrack/<hex-token>
 * The Angular route `baletrack/:data` feeds <hex-token> into BaleTracker.track(mode, data),
 * which POSTs to `service/baleTracker/track/<mode>/<data>`.
 *   mode 0 = read status (no side effect)
 *   mode 1 = confirm the bale at this device's check point
 * Registration links look like:
 *   https://ccis.tcb.go.tz/baletrack/register/<uuid-token>
 * -> POST service/baleTracker/register/<uuid-token>, which sets the device session cookie.
 */

export function parseBaleData(input) {
  const s = String(input || '').trim();
  // Full register link
  const reg = s.match(/baletrack\/register\/([A-Za-z0-9-]{8,})/i);
  if (reg) return { kind: 'register', token: reg[1] };
  // Full track link
  const track = s.match(/baletrack\/([0-9a-fA-F]{16,})/);
  if (track) return { kind: 'track', data: track[1], url: `${BASE}/baletrack/${track[1]}` };
  // Bare hex token
  if (/^[0-9a-fA-F]{16,}$/.test(s)) return { kind: 'track', data: s, url: `${BASE}/baletrack/${s}` };
  // Bare uuid (assume register token)
  if (/^[0-9a-fA-F-]{30,}$/.test(s)) return { kind: 'register', token: s };
  return { kind: 'unknown', raw: s };
}

export function newJar() {
  return new CookieJar();
}

export function jarFromSerialized(serialized) {
  return CookieJar.deserializeSync(typeof serialized === 'string' ? JSON.parse(serialized) : serialized);
}

export function serializeJar(jar) {
  return JSON.stringify(jar.serializeSync());
}

/** Build a tough-cookie jar from a raw "name=value; name2=value2" cookie string. */
export function jarFromCookieString(cookieString) {
  const jar = new CookieJar();
  const pairs = String(cookieString || '')
    .split(/;\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  for (const pair of pairs) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (!name) continue;
    jar.setCookieSync(`${name}=${value}; Path=/`, BASE);
  }
  return jar;
}

function agentFor(jar) {
  return new CookieAgent({ cookies: { jar } });
}

function xsrfHeader(jar) {
  const cookies = jar.getCookiesSync(BASE);
  const xsrf = cookies.find((c) => c.key === 'XSRF-TOKEN');
  return xsrf ? { 'X-XSRF-TOKEN': xsrf.value } : {};
}

async function apiPost(jar, servicePath) {
  // The Angular client posts an (empty) multipart form body; replicate that shape.
  const res = await undiciFetch(`${BASE}/${servicePath}`, {
    method: 'POST',
    dispatcher: agentFor(jar),
    headers: {
      'User-Agent': UA,
      Accept: 'application/json, text/plain, */*',
      Origin: BASE,
      Referer: `${BASE}/`,
      'X-Requested-With': 'XMLHttpRequest',
      ...xsrfHeader(jar),
    },
    body: new FormData(), // empty form, matches BaleTracker.post(null)
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json, text };
}

/** Prime a jar with the app's XSRF-TOKEN + session cookies by loading the SPA once. */
export async function primeJar(jar) {
  await undiciFetch(`${BASE}/`, {
    method: 'GET',
    dispatcher: agentFor(jar),
    headers: { 'User-Agent': UA, Accept: 'text/html' },
  }).catch(() => {});
}

/** Register this service as a device using a fresh registration token. */
export async function register(token) {
  const jar = newJar();
  await primeJar(jar);
  const res = await apiPost(jar, `service/baleTracker/register/${token}`);
  return { jar, ...res };
}

/** Read a bale's current status. mode 0 = read only. */
export async function readStatus(jar, data) {
  return apiPost(jar, `service/baleTracker/track/0/${data}`);
}

/** Confirm a bale. mode 1 = confirm at this device's check point. */
export async function confirm(jar, data) {
  return apiPost(jar, `service/baleTracker/track/1/${data}`);
}

/**
 * Interpret a track() result. The SPA marks a check point as done when
 * result.checks[result.checkPoint - 1] is truthy.
 */
export function interpret(json) {
  if (!json || typeof json !== 'object') return { valid: false, alreadyDone: false, checkPoint: null };
  const checkPoint = json.checkPoint ?? null;
  const checks = Array.isArray(json.checks) ? json.checks : [];
  const alreadyDone = checkPoint ? Boolean(checks[checkPoint - 1]) : false;
  return { valid: true, alreadyDone, checkPoint, checks, raw: json };
}

export const CHECK_POINTS = ['Ginnery', 'Port'];
