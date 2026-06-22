/* Shared fetch with a hard timeout, so a hung/stalled external service can't leave
   the UI spinning forever. Aborts after CONFIG.FETCH_TIMEOUT_MS; throws on timeout
   or non-2xx, which the callers' existing try/catch turns into the error panel. */

import { CONFIG } from './config';

export async function fetchJson(url: string, opts: RequestInit = {}): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CONFIG.FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!res.ok) throw new Error(`http ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}
