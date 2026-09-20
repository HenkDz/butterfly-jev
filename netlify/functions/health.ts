import type { Config } from '@netlify/functions';
import { VERSION } from '../../src/sim/model.js';
export default async () => Response.json({ ok: true, version: VERSION, jevConfigured: Boolean(Netlify.env.get('TYPESAFE_API_KEY')) && Netlify.env.get('JEV_LIVE_ENABLED') !== 'false' }, { headers: { 'cache-control': 'no-store' } });
export const config: Config = { path: '/api/health' };
