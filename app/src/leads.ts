/* Lead capture. Local-safe: if VITE_LEAD_ENDPOINT is set (a serverless function,
   Netlify/Cloudflare/etc.), POST there; otherwise just log to the console so the
   app runs fully locally with nothing to stand up yet. Never throws. */

import { CONFIG } from './config';

export interface Lead {
  type: 'quote' | 'interest';
  address?: string;
  county?: string | null;
  areaSqft?: number;
  tier?: string;
  price?: number;
  cadence?: string;
  contact?: string;
}

/** Send a lead. Returns true only if it was actually accepted by the endpoint.
 *  `keepalive` lets the POST outlive the page when the SMS app takes over. */
export async function captureLead(lead: Lead): Promise<boolean> {
  const endpoint = import.meta.env.VITE_LEAD_ENDPOINT as string | undefined;
  const payload = { ...lead, business: CONFIG.BUSINESS_NAME, at: new Date().toISOString() };
  if (!endpoint) {
    console.info('[lead — set VITE_LEAD_ENDPOINT to capture this]', payload);
    return false;
  }
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    });
    return res.ok;
  } catch {
    return false;
  }
}
