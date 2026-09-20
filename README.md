# Butterfly

**One memory. A different world.**

A browser-based counterfactual experiment: 24 residents live in an isometric village. One courier hears an incorrect report that North Bridge is closed. Clone the world, change one resident's private memory, and trace the consequences through physical actions and local communication.

Production: https://butterflyjev.netlify.app/

## Version 2

This replaces the original static debug prototype with an actual running simulation:

- Canvas-rendered isometric village with roads, buildings, gardens, two bridge crossings, and animated residents.
- Play, pause, single-step, speed controls, pan/zoom, and keyboard-accessible resident selection.
- Physical movement along a road graph. Inspecting the bridge requires reaching it; detouring uses the southern crossing.
- Local conversations that transmit tagged rumor or evidence to one nearby resident, with causal event ancestry.
- Synchronized control/alternative timelines. Interventions change one private memory, not the world or a preselected outcome.
- Per-timeline memory/decision inspector, exact decision inputs, model probabilities, and a traceable event feed.
- Recorded timeline scrubbing without inference, comparison metrics, and JSON run export.
- Responsive desktop/mobile layouts, explicit errors, and no silent model-to-rules fallback.

## Try it

Start with **Rules · local** and click **Fork a memory** before running the town. Choose Mina and **Distrust the source**, then press **Run town**. Both worlds advance from the same physical state. Select a resident in A or B, click an event to trace its ancestry, and scrub the recorded timeline to replay changes.

Other interventions remove the rumor or give one resident private verified evidence. A new fork replaces the old comparison and future frames. An experiment lasts 120 simulated minutes. Normal movement runs locally; relevant information triggers bounded decisions.

## Local development

Use Node.js 22 or newer.

```sh
npm install
npm test
npm run dev
```

Vite serves the local rules-based experience at http://localhost:5173. To include Netlify Functions and environment injection:

```sh
npx netlify-cli login
npx netlify-cli link
npm run dev:netlify
```

For a standalone Node host, `npm run build` followed by `npm run server` serves the app on port 8787 (or `PORT`). The Dockerfile is an alternative deployment configuration; Netlify uses `netlify.toml`, not Docker.

## Live Jev

Configure `TYPESAFE_API_KEY` as a **server/function-only** environment variable in the correct Netlify project. Never prefix it with `VITE_`, include it in source, or share it in a run export.

- `TYPESAFE_MODEL`: optional, defaults to `jev-latest`.
- `JEV_LIVE_ENABLED=false`: disables public live inference.
- `/api/health`: version and key-configuration status, never the key.
- `/api/decide`: validated single-resident state mapped to a typed Choice request to `https://api.typesafe.ai/v1/systemone`.

After configuration, select **Live Jev** in the engine selector. Health indicates key presence, not proof that the key has credit or model access. API/network errors pause the simulation. There is no silent scripted fallback.

## What is—and is not—AI

**Rules mode is a deterministic baseline, not AI.** Its displayed explanations describe explicit rules, not invented model reasoning. It does not display fabricated confidence scores.

In **Live Jev**, the model chooses a bounded next action using only that resident's private memories, task and visible nearby people. Ordinary code still controls physics, permitted actions, observations, memory bookkeeping and consequences. Displayed probabilities are the actual model response, not a validated prediction of human behavior. This is an experiment/game, not a scientific model of a real society.

Paired identical inputs share one model response within a tick to reduce irrelevant stochastic divergence. Fixed per-resident decision slots avoid a hidden scheduling confound: more pending decisions in B must not delay an unrelated person in A. Runs record decisions and state snapshots; scrubbing does not call Jev again. Export is supported; importing external runs is not implemented.

The rumor deliberately concerns a **present closure**, not a future closure: observing the bridge open now would not refute a claim that it will close tonight.

## Safety and limits

The function validates input sizes/actions, caps bodies at 16 KB, checks Origin when supplied, uses server-owned criteria, times out upstream requests, rejects malformed outputs, and never returns secrets or raw upstream error bodies.

Netlify applies a per-IP/domain rate limit of 60 requests per minute. The UI also spaces calls and stops after 180 calls per browser session. **Neither is a global spending cap; a browser-session limit can be reset.** Public live inference still needs a provider-level spending limit, stronger abuse controls or a shared durable budget before broad promotion. Set `JEV_LIVE_ENABLED=false` to leave the rules demo available without inference spending.

## Tests and deployment

`npm test` compiles the pure engine/API helper and runs 25 native Node tests. They cover deterministic controls, private-memory isolation, valid movement, local information flow, physical bridge inspections, causal ancestry, bounded state, input validation, and mocked upstream successes/failures. Mocked API tests do not prove a real API key works.

`npm run build` type-checks the frontend and Netlify functions, then builds Vite assets. Netlify runs both tests and build before publishing `dist` and the functions. GitHub CI runs the same checks. There is no database, account system, multiplayer, or background agent process; each browser owns its current experiment.

The renderer was also exercised in Chromium at desktop and mobile widths for playback, forking, replay, and layout overflow.
