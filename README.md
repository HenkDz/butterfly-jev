# Butterfly — a Jev world experiment

**Same town. Same events. One different memory.**

Butterfly is a public experiment in decision-driven simulation. Twenty-four agents inhabit a tiny town. One courier hears a false bridge-closure rumor. Fork the world, alter only that courier's private memory of the source, and observe whether consequences diverge through traceable actions.

## What this prototype proves

- Private memories are scoped to individual agents.
- A fork changes one agent's state, not the rest of the world.
- Other agents learn only through explicit communication or observation.
- Rules baseline works without external services.
- Live Jev is isolated behind a server endpoint so credentials never enter the browser.

## Run locally

```bash
npm install
npm test
npm run dev
```

Open http://localhost:5173.

## Jev integration

Copy .env.example to .env and configure JEV_API_KEY and JEV_ENDPOINT server-side. The adapter is scaffolding until verified against the current TypeSafe/Jev API contract. Never put the key in a VITE_* variable.

## Experiment

Start in Rules baseline, select Mina, click Fork one memory, then run a decision in both timelines. Timeline A remembers the source as trustworthy; Timeline B remembers them as unreliable. The core invariant is tested: changing one private memory cannot directly mutate another character's knowledge.

## Deployment

The repository includes a Dockerfile suitable for a small Node deployment. Production should add server-side rate limits and a daily Jev budget before enabling public live inference.
