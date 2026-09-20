import { createWorld, fork, pending, inputFor, rulesDecision, advance, stats, differences, knowledge, causalChain, clock, actionLabel, MAX_TICKS, VERSION, type World, type Mode, type Snapshot, type Decision, type DecisionInput, type Intervention } from './sim/model.js';
import { TownView } from './town.js';

const icon = (name: string, size = 18): string => {
  const paths: Record<string, string> = {
    play: '<path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none"/>', pause: '<path d="M8 5v14M16 5v14" stroke-width="4"/>',
    step: '<path d="m5 5 10 7-10 7Z"/><path d="M19 5v14"/>', fork: '<path d="M7 4v5c0 6 10 3 10 9v2M7 9v11M14 6l3-3 3 3M17 3v5"/>',
    reset: '<path d="M4 10a8 8 0 1 1 1 7M4 4v6h6"/>', arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>', download: '<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
    plus: '<path d="M5 12h14M12 5v14"/>', minus: '<path d="M5 12h14"/>', focus: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
    spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v1"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>',
    chain: '<path d="m10 13 4-4M8 16l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2 1 2-2a4 4 0 1 1 6 6l-5 5a4 4 0 0 1-6 0"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.spark}</svg>`;
};
const esc = (x: unknown): string => String(x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const logo = '<svg viewBox="0 0 44 44" fill="none" aria-hidden="true"><path d="M21 22C8 1 0 11 9 25c-7 13 8 17 12-3Z" fill="#b7a0ed"/><path d="M23 22C36 1 44 11 35 25c7 13-8 17-12-3Z" fill="#ddc5fa"/><path d="M22 16v16m0-16-5-6m5 6 5-6" stroke="#f2e8ff" stroke-width="1.4"/></svg>';
let history: Snapshot[] = [{ a: createWorld(), b: null }], cursor = 0, selected = 0, branch: 'a' | 'b' = 'a';
let mode: Mode = 'rules', running = false, busy = false, speed = 1, showInfo = true, sessionCalls = 0, lastCall = 0;
let timer: ReturnType<typeof setTimeout> | undefined, jevReady = false, selectedEvent: string | null = null;
let forkInfo: { tick: number; person: string; intervention: Intervention } | null = null;
const current = (): Snapshot => history[cursor];
const activeWorld = (): World => (branch === 'b' ? current().b : current().a) ?? current().a;
const replaying = (): boolean => cursor < history.length - 1;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const duration = (): number => mode === 'jev' ? 1150 : 950 / speed;
const errorMessage = (text: string): void => { $('error-text').textContent = text; $('error').hidden = !text; };

$('root').innerHTML = `
  <header class="topbar"><a class="brand" href="/" aria-label="Butterfly home"><span class="brand-mark">${logo}</span><span>butterfly<span class="brand-sub">A COUNTERFACTUAL SANDBOX</span></span></a>
    <div class="top-actions"><span class="version">EXPERIMENT 001</span><button class="quiet" id="help">${icon('info')}<span>How it works</span></button><span class="vertical-line"></span><label class="engine-control"><span class="status-dot" id="engine-dot"></span><select id="mode" aria-label="Decision engine"><option value="rules">Rules · local</option><option value="jev" disabled>Live Jev · checking</option></select></label></div>
  </header>
  <main>
    <section class="intro"><div><div class="eyebrow"><span class="tiny-line"></span> SMALL CAUSES. VISIBLE CONSEQUENCES.</div><h1>One memory.<br class="mobile-break"> A different world<span class="accent">.</span></h1><p>A false rumor. Twenty-four residents. Change what one person remembers—and watch what follows.</p></div><button class="primary fork-main" id="fork-open">${icon('fork')} Fork a memory <span class="key-hint">F</span></button></section>
    <div id="error" class="error" role="alert" hidden><span id="error-text"></span><button id="error-close" aria-label="Dismiss error">${icon('close')}</button></div>
    <section class="workspace">
      <div class="main-column">
        <div class="scenario"><div class="scenario-icon">${icon('spark', 20)}</div><div><span class="eyebrow">THE NORTH BRIDGE RUMOR</span><p>“The bridge is closed for repairs.” <span class="truth-chip">In reality: open</span></p></div><div class="scenario-end"><span id="run-label">READY TO OBSERVE</span><span class="run-dot" id="run-dot"></span></div></div>
        <div class="metrics" id="metrics"></div>
        <div class="transport"><div class="transport-left"><button class="play" id="play">${icon('play')}<span>Run town</span></button><button class="icon-button" id="step" title="Advance one minute" aria-label="Advance one minute">${icon('step')}</button><button class="icon-button" id="reset" title="Reset experiment" aria-label="Reset experiment">${icon('reset')}</button><span class="vertical-line"></span><div class="speed" role="group" aria-label="Simulation speed"><button data-speed="1" class="active" aria-pressed="true">1×</button><button data-speed="2" aria-pressed="false">2×</button><button data-speed="4" aria-pressed="false">4×</button></div></div><div class="transport-right"><span class="subtle" id="engine-note">Deterministic baseline · no API calls</span><strong id="time">08:00</strong><span class="subtle">/ 10:00</span></div></div>
        <div class="maps" id="maps">
          <article class="map-panel" id="panel-a"><div class="map-header"><div><span class="timeline-marker marker-a">A</span><strong id="title-a">Bramble village</strong><span class="subtle" id="subtitle-a">The original timeline</span></div><div class="map-tools"><button data-zoom="a:-" aria-label="Zoom out timeline A">${icon('minus', 15)}</button><button data-zoom="a:0" aria-label="Reset view timeline A">${icon('focus', 15)}</button><button data-zoom="a:+" aria-label="Zoom in timeline A">${icon('plus', 15)}</button></div></div><canvas id="town-a" tabindex="0" role="img" aria-label="Interactive isometric village A. Drag to pan. Use the resident list to select a person by keyboard."></canvas><div class="map-caption"><span>Drag to explore · Select a resident</span><span id="clock-a">08:00</span></div></article>
          <article class="map-panel" id="panel-b" hidden><div class="map-header"><div><span class="timeline-marker marker-b">B</span><strong>One changed memory</strong><span class="subtle" id="subtitle-b">Alternate timeline</span></div><div class="map-tools"><button data-zoom="b:-" aria-label="Zoom out timeline B">${icon('minus', 15)}</button><button data-zoom="b:0" aria-label="Reset view timeline B">${icon('focus', 15)}</button><button data-zoom="b:+" aria-label="Zoom in timeline B">${icon('plus', 15)}</button></div></div><canvas id="town-b" tabindex="0" role="img" aria-label="Interactive isometric village B. Alternative timeline with one private memory changed."></canvas><div class="map-caption"><span id="intervention-caption">Same physical world. Different memory.</span><span id="clock-b">08:00</span></div></article>
        </div>
        <div class="map-legend"><div class="legend-items"><span><i class="dot unaware"></i> Unaware</span><span><i class="dot concerned"></i> Believes rumor</span><span><i class="dot uncertain"></i> Skeptical</span><span><i class="dot informed"></i> Has evidence</span></div><button id="info-toggle" class="quiet" aria-pressed="true">${icon('eye', 16)} Information trails</button></div>

        <div class="replay"><span id="replay-label">TIMELINE</span><input id="scrubber" type="range" min="0" max="0" value="0" aria-label="Replay recorded timeline"><button id="live-edge" class="quiet" hidden>Return to live ${icon('arrow', 14)}</button><span class="subtle" id="frame-label">0 recorded minutes</span></div>
        <section class="comparison" id="comparison" hidden></section>
        <section class="event-panel"><div class="section-heading"><div><span class="eyebrow">CAUSE → EFFECT</span><h2>What just happened</h2></div><div class="event-heading-right"><span class="subtle" id="feed-label">Timeline A</span><button class="quiet" id="export">${icon('download', 16)} Save run</button></div></div><div id="events" class="events"></div></section>
      </div>
      <aside class="inspector"><div class="inspector-heading"><span class="eyebrow">INSIDE ONE MIND</span><div class="branch-switch" id="branch-switch" hidden><button data-branch="a" class="active">A</button><button data-branch="b">B</button></div></div><div id="mind"></div><div class="resident-section"><div class="section-heading"><h3>Meet the residents</h3><span class="subtle">24</span></div><div class="residents" id="residents"></div></div></aside>
    </section>
    <footer><span>NOT A SCRIPTED STORY. A TRACEABLE EXPERIMENT.</span><span>Rules are rules. Jev decisions are labeled. <a href="https://github.com/HenkDz/butterfly-jev" target="_blank" rel="noopener noreferrer">View source ↗</a> <span class="version">v${VERSION}</span></span></footer>
  </main>
  <dialog id="fork-dialog"><form id="fork-form"><div class="dialog-top"><span class="eyebrow">THE BUTTERFLY EFFECT</span><button class="icon-button" type="button" data-close="fork-dialog" aria-label="Close memory editor">${icon('close')}</button></div><div class="dialog-symbol">${icon('fork', 32)}</div><h2>Change one thing.</h2><p>Clone timeline A at <strong id="fork-time">08:00</strong>. Only the selected resident gets a different memory. Everyone else starts exactly the same.</p><label class="field-label" for="fork-person">WHOSE MEMORY?</label><select id="fork-person"></select><div class="interventions"><label><input type="radio" name="intervention" value="distrust" checked><span><strong>Distrust the source</strong><small>“This person misled me before. I should verify their claims.”</small></span></label><label><input type="radio" name="intervention" value="forget"><span><strong>Forget the rumor</strong><small>Remove the reported bridge closure from this person's memory.</small></span></label><label><input type="radio" name="intervention" value="evidence"><span><strong>Give private evidence</strong><small>This person receives a verified observation of the open bridge.</small></span></label></div><p class="dialog-note">No forced outcomes. Divergence is possible, not guaranteed. A new fork replaces the existing comparison and future frames.</p><button type="submit" class="primary full">${icon('fork')} Create parallel timelines</button></form></dialog>
  <dialog id="help-dialog"><div class="dialog-top"><span class="eyebrow">A SMALL EXPERIMENT, NOT A SOCIETY MODEL</span><button class="icon-button" data-close="help-dialog" aria-label="Close help">${icon('close')}</button></div><h2>Watch a belief travel.</h2><div class="help-step"><b>01</b><p><strong>Run the town.</strong> Residents travel on actual roads. A warning can only reach someone nearby; checking the bridge requires a visit.</p></div><div class="help-step"><b>02</b><p><strong>Fork a memory.</strong> Clone the current world and change one person's private evidence. Both timelines then advance together.</p></div><div class="help-step"><b>03</b><p><strong>Trace the difference.</strong> Click a resident or event. Inspect inputs, actions and information sources. Scrub backward without making new model calls.</p></div><div class="help-note"><strong>Rules vs. Live Jev</strong><p>Rules are a deterministic comparison baseline, not AI. Live Jev chooses bounded actions from each person's private observations. Physics, evidence updates and travel are ordinary code. Identical inputs in paired timelines share a model response to reduce random divergence.</p><p>Model errors pause the run—there is no silent fallback. Live requests are paced, with a 180-call browser-session safeguard. This is not a global spending cap. A full experiment ends after 120 simulated minutes.</p></div><p class="subtle">Keyboard: Space to play/pause · F to fork · Arrow keys to pan a focused map · +/− to zoom.</p></dialog>`;

const selectPerson = (id: number, side: 'a' | 'b'): void => { selected = id; branch = side; selectedEvent = null; render(); };
const towns = { a: new TownView($<HTMLCanvasElement>('town-a'), current().a, id => selectPerson(id, 'a')), b: new TownView($<HTMLCanvasElement>('town-b'), current().a, id => selectPerson(id, 'b')) };
function render(): void {
  const s = current(), w = activeWorld(), a = w.agents[selected], counts = stats(s.a), changed = differences(s.a, s.b);
  if (!s.b) branch = 'a';
  $('panel-b').hidden = !s.b; $('maps').classList.toggle('split', !!s.b); towns.b.setVisible(!!s.b);
  towns.a.update(s.a, selected, showInfo, changed, reducedMotion ? 0 : duration()); towns.b.update(s.b ?? s.a, selected, showInfo, changed, reducedMotion ? 0 : duration());
  $('title-a').textContent = s.b ? 'Original memory' : 'Bramble village';
  $('subtitle-a').textContent = s.b ? 'Control timeline' : 'The original timeline';
  $('clock-a').textContent = $('clock-b').textContent = $('time').textContent = clock(s.a.tick);
  $('run-label').textContent = replaying() ? 'RECORDED REPLAY' : busy ? (mode === 'jev' ? 'JEV IS DECIDING' : 'ADVANCING') : running ? 'OBSERVING THE TOWN' : s.a.tick >= MAX_TICKS ? 'EXPERIMENT COMPLETE' : 'PAUSED · YOUR MOVE';
  $('run-dot').classList.toggle('running', running);
  $('metrics').innerHTML = `<div><span class="metric-label">RESIDENTS</span><strong>24<span>independent minds</span></strong></div><div><span class="metric-label">RUMOR REACH · A</span><strong>${counts.aware}<span>of 24 have heard</span></strong></div><div><span class="metric-label">EVIDENCE · A</span><strong class="green">${counts.informed}<span>know it is open</span></strong></div><div><span class="metric-label">${s.b ? 'DIFFERENT RESIDENTS' : 'CONVERSATIONS'}</span><strong class="lavender">${s.b ? changed.length : counts.contacts}<span>${s.b ? 'between A and B' : 'local exchanges'}</span></strong></div>`;
  $('play').innerHTML = `${icon(running ? 'pause' : 'play')}<span>${running ? 'Pause' : s.a.tick === 0 ? 'Run town' : 'Resume'}</span>`;
  $<HTMLButtonElement>('play').disabled = replaying() || s.a.tick >= MAX_TICKS;
  $<HTMLButtonElement>('step').disabled = busy || running || replaying() || s.a.tick >= MAX_TICKS;
  $<HTMLButtonElement>('reset').disabled = busy;
  $<HTMLButtonElement>('fork-open').disabled = busy;
  $<HTMLSelectElement>('mode').disabled = busy || running;
  $('engine-note').textContent = mode === 'rules' ? 'Deterministic baseline · no API calls' : `Live Jev · ${sessionCalls}/180 session calls`;
  const slider = $<HTMLInputElement>('scrubber'); slider.max = String(history.length - 1); slider.value = String(cursor); slider.disabled = busy;
  $('replay-label').textContent = replaying() ? 'REPLAY' : 'TIMELINE'; $('frame-label').textContent = `${cursor} / ${history.length - 1} recorded minutes`; $('live-edge').hidden = !replaying();
  $('info-toggle').setAttribute('aria-pressed', String(showInfo));
  $('branch-switch').hidden = !s.b;
  document.querySelectorAll<HTMLButtonElement>('[data-branch]').forEach(b => { b.classList.toggle('active', b.dataset.branch === branch); b.setAttribute('aria-pressed', String(b.dataset.branch === branch)); });
  const k = knowledge(a), last = [...w.events].reverse().find(e => e.actor === a.id && e.kind === 'decision');
  const statusName = { unaware: 'Has not heard', concerned: 'Believes the warning', uncertain: 'Skeptical of source', informed: 'Has evidence of opening' }[k];
  const memories = a.memory.map(m => `<button class="memory-item ${m.kind}" data-event="${esc(m.event)}"><span class="memory-kind">${m.kind === 'trust' ? 'SOURCE MEMORY' : m.kind === 'observation' ? 'FIRST-HAND EVIDENCE' : m.kind === 'evidence' ? 'REPORTED EVIDENCE' : 'HEARD, NOT VERIFIED'}</span><span>${esc(m.text)}</span><small>${esc(m.source)} · ${clock(m.tick)} ${icon('arrow', 12)}</small></button>`).join('');
  let decisionHtml = '';
  if (last?.decision) {
    const d = last.decision;
    decisionHtml = `<div class="decision-card"><div class="card-eyebrow"><span>${d.source === 'jev' ? 'JEV DECISION' : 'RULE APPLIED'}</span><span>${clock(last.tick)}</span></div><h4>${esc(actionLabel[d.action])}</h4>${d.source === 'rules' ? `<p>${esc(d.reason)}</p><small>Deterministic rule—not model confidence.</small>` : `<div class="probabilities">${Object.entries(d.probabilities).sort(([, a], [, b]) => (b ?? 0) - (a ?? 0)).map(([key, p]) => `<div><span>${esc(actionLabel[key as keyof typeof actionLabel])}</span><b>${Math.round((p ?? 0) * 100)}%</b><i style="--p:${(p ?? 0) * 100}%"></i></div>`).join('')}</div><small>${esc(d.model ?? 'Jev')} · model distribution, not human psychology</small>`}<details><summary>Exact input supplied ${icon('eye', 13)}</summary><pre>${esc(JSON.stringify(last.input, null, 2))}</pre></details></div>`;
  }
  let chainHtml = '';
  if (selectedEvent) {
    const chain = causalChain(w, selectedEvent);
    chainHtml = `<div class="chain-card"><div class="card-eyebrow"><span>TRACE THIS EVENT</span><button class="quiet" id="chain-close" aria-label="Close causal chain">${icon('close', 13)}</button></div>${chain.map(e => `<div class="chain-item"><span>${clock(e.tick)}</span><p>${esc(e.text)}</p></div>`).join('')}</div>`;
  }
  $('mind').innerHTML = `<div class="person-header"><div class="portrait" style="--person:${a.color}"><span>${esc(a.name[0])}</span><i class="dot ${k}"></i></div><div><h2>${esc(a.name)}</h2><p>${esc(a.role)}<span class="subtle"> · Timeline ${branch.toUpperCase()}</span></p><span class="person-status ${k}">${statusName}</span></div></div><div class="intent"><span class="eyebrow">CURRENT INTENT</span><strong>${icon('arrow', 15)}${esc(actionLabel[a.intent])}</strong><small>${a.deliveries} deliveries · ${a.node % 6 < 3 ? 'West' : 'East'} bank</small></div>${chainHtml}<div class="memory-heading"><h3>Private memories</h3><span>${a.memory.length}</span></div><div class="memories">${memories || '<p class="empty-memory">No bridge information has reached this resident. They are simply going about their day.</p>'}</div>${decisionHtml || '<div class="no-decision"><span class="eyebrow">NOT YET A DECISION</span><p>Run the town. Relevant new information triggers a decision; normal travel runs locally.</p></div>'}`;
  $('residents').innerHTML = w.agents.map(p => `<button data-person="${p.id}" class="resident ${p.id === selected ? 'selected' : ''}" aria-pressed="${p.id === selected}" title="${esc(p.name)} · ${esc(p.role)} · ${knowledge(p)}"><i class="dot ${knowledge(p)}"></i>${esc(p.name)}</button>`).join('');
  $('feed-label').textContent = `Timeline ${branch.toUpperCase()} · ${w.events.length} events`;
  $('events').innerHTML = [...w.events].reverse().filter(e => e.kind !== 'decision').slice(0, 7).map(e => `<button class="event-row ${e.kind}" data-event="${e.id}"><span class="event-icon">${icon(e.kind === 'observation' || e.kind === 'evidence' ? 'check' : e.kind === 'intervention' ? 'fork' : 'arrow', 15)}</span><span class="event-time">${clock(e.tick)}</span><span>${esc(e.text)}</span><span class="event-trace">Trace ${icon('arrow', 12)}</span></button>`).join('');
  $('comparison').hidden = !s.b;
  if (s.b) {
    const other = stats(s.b), series = (side: 'a' | 'b') => history.slice(0, cursor + 1).map((s, i) => `${i / Math.max(1, cursor) * 360},${65 - stats(s[side] ?? s.a).concerned / 24 * 57}`).join(' ');
    $('comparison').innerHTML = `<div class="comparison-copy"><span class="eyebrow">THE COUNTERFACTUAL</span><h3>${changed.length ? `${changed.length} of 24 residents differ.` : 'Still the same world.'}</h3><p>${esc(forkInfo?.person)}'s memory changed at ${clock(forkInfo?.tick ?? 0)}. Everything after that follows from recorded decisions and local events.</p><div class="compare-numbers"><span><b>${counts.concerned}</b> concerned in A</span><span><b>${other.concerned}</b> concerned in B</span><span><b>${other.deliveries - counts.deliveries > 0 ? '+' : ''}${other.deliveries - counts.deliveries}</b> deliveries in B vs A</span></div></div><div class="chart"><div><span class="subtle">Residents who believe the rumor</span><span><i class="dot chart-a"></i>A <i class="dot chart-b"></i>B</span></div><svg viewBox="0 0 370 85" role="img" aria-label="Recorded number of concerned residents in timeline A and B"><path d="M0 8H360M0 36H360M0 65H360" stroke="#ffffff10" fill="none"/><polyline points="${series('a')}" fill="none" stroke="#c1a2f2" stroke-width="2.4"/><polyline points="${series('b')}" fill="none" stroke="#edb46b" stroke-width="2.4"/><text x="0" y="81">08:00</text><text x="329" y="81">${clock(s.a.tick)}</text></svg></div>`;
  }
}
async function decideLive(input: DecisionInput): Promise<Decision> {
  if (sessionCalls >= 180) throw new Error('This browser session reached its 180-call safeguard. Continue exploring recorded frames or use the rules baseline.');
  await new Promise(resolve => setTimeout(resolve, Math.max(0, 1100 - (performance.now() - lastCall))));
  lastCall = performance.now(); sessionCalls++;
  const r = await fetch('/api/decide', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(18000) });
  if (!r.ok) { const message = await r.text(); throw new Error(message.length < 300 ? message : `Live Jev returned HTTP ${r.status}.`); }
  const d: Decision = await r.json();
  if (d.source !== 'jev' || !input.allowedActions.includes(d.action)) throw new Error('The server returned an invalid action. No world changes were applied.');
  return d;
}
async function step(): Promise<void> {
  if (busy || replaying() || current().a.tick >= MAX_TICKS) { running = false; render(); return; }
  busy = true; render();
  try {
    const s = current(), cache = new Map<string, Promise<Decision>>();
    const plans = async (w: World) => {
      const result = [];
      for (const a of pending(w)) {
        const input = inputFor(w, a), key = JSON.stringify(input);
        if (!cache.has(key)) cache.set(key, mode === 'rules' ? Promise.resolve(rulesDecision(w, a)) : decideLive(input));
        result.push({ id: a.id, input, decision: await cache.get(key)! });
      }
      return result;
    };
    const pa = await plans(s.a), pb = s.b ? await plans(s.b) : null;
    history.push({ a: advance(s.a, pa), b: s.b && pb ? advance(s.b, pb) : null }); cursor++;
    selectedEvent = null;
  } catch (error) { running = false; errorMessage(`Paused: ${error instanceof Error ? error.message : 'Decision failed.'} No silent switch to rules.`); }
  finally { busy = false; if (current().a.tick >= MAX_TICKS) running = false; render(); if (running) timer = setTimeout(() => void step(), duration() + 40); }
}
function pause(): void { running = false; clearTimeout(timer); render(); }
function toggle(): void { if (running) pause(); else if (!busy && !replaying() && current().a.tick < MAX_TICKS) { running = true; errorMessage(''); void step(); } }
function reset(): void { pause(); history = [{ a: createWorld(), b: null }]; cursor = 0; selected = 0; branch = 'a'; forkInfo = null; selectedEvent = null; errorMessage(''); render(); }
function openFork(): void {
  if (busy) return;
  pause(); $('fork-time').textContent = clock(current().a.tick);
  $('fork-person').innerHTML = current().a.agents.map(a => `<option value="${a.id}" ${a.id === selected ? 'selected' : ''}>${esc(a.name)} · ${esc(a.role)}</option>`).join('');
  $<HTMLDialogElement>('fork-dialog').showModal();
}
$('play').onclick = toggle; $('step').onclick = () => void step();
$('reset').onclick = () => { if (history.length < 2 || confirm('Start a new experiment? Save the current run first to keep its record.')) reset(); };
$('fork-open').onclick = openFork; $('help').onclick = () => { pause(); $<HTMLDialogElement>('help-dialog').showModal(); };
$('error-close').onclick = () => errorMessage('');
$('info-toggle').onclick = () => { showInfo = !showInfo; render(); };
$('live-edge').onclick = () => { cursor = history.length - 1; selectedEvent = null; render(); };
// Save the slider value before pause/render rewrites it.
$('scrubber').oninput = (e: Event) => { const value = Number((e.target as HTMLInputElement).value); running = false; clearTimeout(timer); cursor = value; selectedEvent = null; render(); };
$('mode').onchange = () => {
  const select = $<HTMLSelectElement>('mode'), next = select.value as Mode;
  if (current().a.tick > 0 && !confirm('Changing engine starts a fresh experiment. Continue?')) { select.value = mode; return; }
  mode = next; reset();
};
$('fork-form').onsubmit = e => {
  e.preventDefault(); const id = Number($<HTMLSelectElement>('fork-person').value);
  const intervention = new FormData($<HTMLFormElement>('fork-form')).get('intervention') as Intervention;
  const a = current().a;
  history = history.slice(0, cursor + 1).map(s => ({ a: s.a, b: null }));
  history[cursor] = { a, b: fork(a, id, intervention) };
  forkInfo = { tick: a.tick, person: a.agents[id].name, intervention }; selected = id; branch = 'b'; selectedEvent = null;
  $<HTMLDialogElement>('fork-dialog').close(); render();
};
$('export').onclick = () => {
  const blob = new Blob([JSON.stringify({ version: VERSION, mode, fork: forkInfo, snapshots: history }, null, 2)], { type: 'application/json' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `butterfly-${mode}-${current().a.tick}min.json`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
};
document.addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!b) return;
  if (b.dataset.close) $<HTMLDialogElement>(b.dataset.close).close();
  if (b.dataset.person) selectPerson(Number(b.dataset.person), branch);
  if (b.dataset.branch) { branch = b.dataset.branch as 'a' | 'b'; selectedEvent = null; render(); }
  if (b.dataset.event) { const ev = activeWorld().events.find(x => x.id === b.dataset.event); selectedEvent = b.dataset.event; if (ev?.actor !== null && ev?.actor !== undefined) selected = ev.actor; render(); }
  if (b.id === 'chain-close') { selectedEvent = null; render(); }
  if (b.dataset.zoom) { const [side, op] = b.dataset.zoom.split(':'); const town = towns[side as 'a' | 'b']; if (op === '0') town.resetView(); else town.zoomBy(op === '+' ? .2 : -.2); }
  if (b.dataset.speed) { speed = Number(b.dataset.speed); document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach(x => { x.classList.toggle('active', x === b); x.setAttribute('aria-pressed', String(x === b)); }); render(); }
});
document.addEventListener('keydown', e => {
  if ((e.target as HTMLElement).matches('input, select, textarea, button, canvas') || document.querySelector('dialog[open]')) return;
  if (e.code === 'Space') { e.preventDefault(); toggle(); }
  if (e.key.toLowerCase() === 'f') openFork();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
render();
void fetch('/api/health', { signal: AbortSignal.timeout(6000) }).then(async r => {
  if (!r.ok) throw new Error('Unavailable'); const h = await r.json(); jevReady = h.jevConfigured === true;
}).catch(() => { jevReady = false; }).finally(() => {
  const o = $<HTMLSelectElement>('mode').options[1]; o.disabled = !jevReady; o.textContent = jevReady ? 'Live Jev · connected' : 'Live Jev · not configured';
  $('engine-dot').classList.toggle('connected', jevReady);
});
