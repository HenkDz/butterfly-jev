import type { Config } from '@netlify/functions';
import { handleDecision } from '../../server/decision.js';
export default async (req: Request) => handleDecision(req, {
  key: Netlify.env.get('TYPESAFE_API_KEY'),
  model: Netlify.env.get('TYPESAFE_MODEL') || 'jev-latest',
  enabled: Netlify.env.get('JEV_LIVE_ENABLED') !== 'false',
});
export const config: Config = {
  path: '/api/decide',
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
