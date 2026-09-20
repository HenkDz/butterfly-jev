import 'dotenv/config';
import express from 'express';
import { handleDecision } from './decision.js';
import { VERSION } from '../src/sim/model.js';
const app = express();
app.use(express.text({ type: 'application/json', limit: '16kb' }));
app.post('/api/decide', async (req, res) => {
  const request = new Request(`http://${req.get('host')}/api/decide`, { method: 'POST', headers: { 'content-type': req.get('content-type') || '' }, body: typeof req.body === 'string' ? req.body : '' });
  const result = await handleDecision(request, { key: process.env.TYPESAFE_API_KEY, model: process.env.TYPESAFE_MODEL, enabled: process.env.JEV_LIVE_ENABLED !== 'false' });
  res.status(result.status).type(result.headers.get('content-type') || 'text/plain').send(await result.text());
});
app.get('/api/health', (_, res) => res.json({ ok: true, version: VERSION, jevConfigured: Boolean(process.env.TYPESAFE_API_KEY) && process.env.JEV_LIVE_ENABLED !== 'false' }));
app.use('/api', (_, res) => res.status(404).send('Unknown API endpoint.'));
app.use(express.static('dist'));
app.use((_req, res) => res.sendFile('index.html', { root: 'dist' }));
app.listen(Number(process.env.PORT || 8787), () => console.log(`Butterfly on :${process.env.PORT || 8787}`));
