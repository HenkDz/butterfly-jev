/** Deterministic physical world. Only the decision adapter may use a model. */
export const ACTIONS = ['continue_work', 'inspect_bridge', 'share_warning', 'share_evidence', 'take_detour', 'wait'] as const;
export type Action = typeof ACTIONS[number];
export type Mode = 'rules' | 'jev';
export type Memory = { id: string; kind: 'trust' | 'rumor' | 'observation' | 'evidence'; text: string; source: string; tick: number; event: string; reliable?: boolean; closed?: boolean };
export type Agent = { id: number; name: string; role: string; color: string; node: number; goal: number; home: number; intent: Action; memory: Memory[]; told: string[]; revision: number; evaluated: number; reviewAt: number; deliveries: number; detour: boolean; cause: string | null };
export type TownEvent = { id: string; tick: number; kind: 'world' | 'rumor' | 'decision' | 'warning' | 'evidence' | 'observation' | 'arrival' | 'intervention'; actor: number | null; target?: number; text: string; parents: string[]; from?: number; to?: number; input?: DecisionInput; decision?: Decision };
export type World = { tick: number; seed: number; bridgeClosed: boolean; agents: Agent[]; events: TownEvent[]; contacts: number; inspections: number };
export type Decision = { action: Action; source: Mode; probabilities: Partial<Record<Action, number>>; confidence?: number; model?: string; reason?: string; inputTokens?: number };
export type DecisionInput = { person: { name: string; role: string }; memories: string[]; situation: string; nearby: string[]; allowedActions: Action[] };
export type Intervention = 'distrust' | 'forget' | 'evidence';
export type Snapshot = { a: World; b: World | null };
export const VERSION = '2.0.0';
export const MAX_TICKS = 120;
export const X = [85, 240, 390, 570, 720, 875];
export const Y = [145, 275, 405, 535];
export const NODES = Y.flatMap((y, r) => X.map((x, c) => ({ x, y, id: r * 6 + c })));
export const NORTH = [2, 3];
export const actionLabel: Record<Action, string> = { continue_work: 'Continue deliveries', inspect_bridge: 'Check the bridge', share_warning: 'Pass on the warning', share_evidence: 'Share the evidence', take_detour: 'Take the long way', wait: 'Wait for evidence' };
const names = ['Mina', 'Omar', 'Lina', 'Yacine', 'Sara', 'Nadir', 'Aya', 'Rami', 'Ines', 'Sami', 'Leila', 'Idris', 'Nora', 'Adam', 'Yara', 'Malik', 'Amira', 'Ilyes', 'Salma', 'Karim', 'Hana', 'Ziad', 'Sofia', 'Anis'];
const roles = ['Courier', 'Baker', 'Teacher', 'Mechanic', 'Nurse', 'Grocer', 'Gardener', 'Student'];
const colors = ['#b9a2f9', '#eeb986', '#cfad87', '#83b6b0', '#e6d7ac', '#cc9396', '#a2bd85', '#b1bfcf'];
const jobs = [12, 5, 18, 7, 23, 0, 16, 9, 21, 4, 14, 19, 11, 2, 17, 6, 20, 3, 15, 8, 22, 1, 13, 10];
const clone = <T>(value: T): T => structuredClone(value);
function event(w: World, data: Omit<TownEvent, 'id' | 'tick'>): TownEvent {
  const e: TownEvent = { ...data, id: `e${w.events.length}`, tick: w.tick };
  w.events.push(e);
  return e;
}
function remember(a: Agent, m: Memory): void {
  // Keep trust and first-hand observation; repeated hearsay is not corroboration.
  a.memory = a.memory.filter(x => x.kind !== m.kind || (m.kind === 'trust' && x.source !== m.source));
  a.memory.push(m);
  a.revision++;
}
export function createWorld(seed = 7): World {
  const agents = names.map((name, id): Agent => ({ id, name, role: roles[id % 8], color: colors[id % 8], node: id, home: id, goal: jobs[id], intent: 'continue_work', memory: [], told: [], revision: 0, evaluated: 0, reviewAt: 0, deliveries: 0, detour: false, cause: null }));
  // Start the courier and two neighbors in the west-side market, not in a grid.
  agents[0].node = 7; agents[0].goal = 10;
  const w: World = { tick: 0, seed, bridgeClosed: false, agents, events: [], contacts: 0, inspections: 0 };
  event(w, { kind: 'world', actor: null, text: 'North Bridge is open. Only a visit can establish that for a resident.', parents: [] });
  const e = event(w, { kind: 'rumor', actor: 0, text: 'Mina hears a tip: “North Bridge is closed for repairs.”', parents: [] });
  agents[0].memory = [
    { id: 'source-trust', kind: 'trust', reliable: true, source: 'the tipster', tick: 0, event: e.id, text: 'The tipster gave me accurate route information last time.' },
    { id: 'bridge-rumor', kind: 'rumor', closed: true, source: 'the tipster', tick: 0, event: e.id, text: 'The tipster says North Bridge is closed for repairs.' },
  ];
  agents[0].revision = 1;
  return w;
}
export function knowledge(a: Agent): 'unaware' | 'concerned' | 'uncertain' | 'informed' {
  if (a.memory.some(m => (m.kind === 'observation' || m.kind === 'evidence') && m.closed === false)) return 'informed';
  if (!a.memory.some(m => m.kind === 'rumor')) return 'unaware';
  return a.memory.some(m => m.kind === 'trust' && m.reliable === false) ? 'uncertain' : 'concerned';
}
export function neighbors(node: number, avoidNorth = false): number[] {
  const r = Math.floor(node / 6), c = node % 6;
  const list: number[] = [];
  if (r > 0) list.push(node - 6);
  if (r < 3) list.push(node + 6);
  if (c > 0 && (c !== 3 || r === 3 || (r === 0 && !avoidNorth))) list.push(node - 1);
  if (c < 5 && (c !== 2 || r === 3 || (r === 0 && !avoidNorth))) list.push(node + 1);
  return list;
}
export function route(from: number, to: number, avoidNorth = false): number[] {
  const queue: number[][] = [[from]], seen = new Set([from]);
  for (const p of queue) {
    const n = p[p.length - 1];
    if (n === to) return p;
    for (const next of neighbors(n, avoidNorth)) if (!seen.has(next)) { seen.add(next); queue.push([...p, next]); }
  }
  return [from];
}
export function nearby(w: World, a: Agent): Agent[] {
  const p = NODES[a.node];
  return w.agents.filter(b => b.id !== a.id && Math.hypot(NODES[b.node].x - p.x, NODES[b.node].y - p.y) <= 158)
    .sort((b, c) => Math.abs(b.node - a.node) - Math.abs(c.node - a.node) || b.id - c.id);
}
function availableContacts(w: World, a: Agent, kind: string): Agent[] {
  // Uses the speaker's own communication history, never a neighbor's private mind.
  return nearby(w, a).filter(b => !a.told.includes(`${kind}:${b.id}`));
}
export function inputFor(w: World, a: Agent): DecisionInput {
  const k = knowledge(a);
  const allowedActions: Action[] = ['continue_work', 'wait'];
  if (k === 'concerned' || k === 'uncertain') {
    allowedActions.push('inspect_bridge', 'take_detour');
    if (availableContacts(w, a, 'warning').length) allowedActions.push('share_warning');
  }
  if (k === 'informed' && availableContacts(w, a, 'evidence').length) allowedActions.push('share_evidence');
  return {
    person: { name: a.name, role: a.role },
    memories: a.memory.map(m => `${m.kind}: ${m.text}`),
    situation: `It is ${clock(w.tick)}. I am on the ${a.node % 6 < 3 ? 'west' : 'east'} bank at junction ${a.node}. My current task is to deliver to junction ${a.goal}. I have made ${a.deliveries} deliveries. My last activity was ${actionLabel[a.intent]}. I have already shared information ${a.told.length} times.`,
    nearby: nearby(w, a).map(b => `${b.name}, ${b.role}`),
    allowedActions,
  };
}
export function rulesDecision(w: World, a: Agent): Decision {
  const allowed = inputFor(w, a).allowedActions, k = knowledge(a);
  let action: Action = 'continue_work';
  let reason = 'No unverified information requires a response; continue the delivery.';
  if (k === 'informed' && allowed.includes('share_evidence')) { action = 'share_evidence'; reason = 'Evidence contradicts the rumor, and someone nearby has not heard it from me.'; }
  else if (k === 'uncertain') { action = 'inspect_bridge'; reason = 'The remembered source is unreliable. Verify before spreading the claim.'; }
  else if (k === 'concerned') {
    if (allowed.includes('share_warning') && a.told.filter(t => t.startsWith('warning')).length < 2) { action = 'share_warning'; reason = 'An unrefuted warning seems relevant to a nearby resident.'; }
    else if (a.id % 3 === 0 && !a.detour) { action = 'take_detour'; reason = 'Avoid the reported closure while completing the delivery.'; }
    else { action = 'inspect_bridge'; reason = 'The warning has been shared; check it against direct evidence.'; }
  }
  return { action, source: 'rules', probabilities: {}, reason };
}
export function pending(w: World): Agent[] {
  // Fixed slots are independent of other minds: extra pending agents in B must
  // not delay an unrelated resident in A. Network pacing changes wall time only.
  return w.agents.filter(a => a.id % 6 === w.tick % 6 && knowledge(a) !== 'unaware' && a.intent !== 'inspect_bridge' && (a.revision !== a.evaluated || w.tick >= a.reviewAt));
}
export type Planned = { id: number; input: DecisionInput; decision: Decision };
/** Decisions are computed against the same pre-tick state before any are applied. */
export function advance(w: World, planned: Planned[]): World {
  if (w.tick >= MAX_TICKS) return clone(w);
  for (const p of planned) {
    const a = w.agents[p.id];
    if (!a || !ACTIONS.includes(p.decision.action) || !inputFor(w, a).allowedActions.includes(p.decision.action)) throw new Error('Action is not permitted in this state.');
    if (JSON.stringify(inputFor(w, a)) !== JSON.stringify(p.input)) throw new Error('Stale decision input.');
  }
  const n = clone(w); n.tick++;
  const stationary = new Set<number>();
  for (const p of planned) {
    const a = n.agents[p.id], old = w.agents[p.id], d = p.decision;
    const decisionEvent = event(n, { kind: 'decision', actor: a.id, text: `${a.name} decides to ${actionLabel[d.action].toLowerCase()}.`, parents: [...new Set(old.memory.map(m => m.event))], input: clone(p.input), decision: clone(d) });
    a.cause = decisionEvent.id; a.intent = d.action; a.evaluated = old.revision; a.reviewAt = n.tick + 5;
    if (d.action === 'inspect_bridge') a.goal = a.node % 6 < 3 ? 2 : 3;
    if (d.action === 'take_detour') { a.detour = true; a.goal = jobs[(a.id + a.deliveries) % 24]; }
    if (d.action === 'continue_work') { a.detour = false; a.goal = jobs[(a.id + a.deliveries) % 24]; }
    if (d.action === 'wait') stationary.add(a.id);
    if (d.action === 'share_warning' || d.action === 'share_evidence') {
      stationary.add(a.id);
      const kind = d.action === 'share_warning' ? 'warning' : 'evidence';
      const target = availableContacts(w, old, kind)[0];
      if (!target) continue;
      const receiver = n.agents[target.id];
      const text = kind === 'warning' ? `${a.name} warns ${receiver.name} that North Bridge may be closed.` : `${a.name} tells ${receiver.name} the bridge was verified open.`;
      const e = event(n, { kind, actor: a.id, target: receiver.id, text, parents: [decisionEvent.id], from: old.node, to: target.node });
      remember(receiver, { id: `heard-${kind}`, kind: kind === 'warning' ? 'rumor' : 'evidence', text: kind === 'warning' ? `${a.name} warned me North Bridge may be closed. This is hearsay, not my observation.` : `${a.name} reports evidence that North Bridge is open. I did not inspect it myself.`, source: a.name, tick: n.tick, event: e.id, closed: kind === 'warning' });
      a.told.push(`${kind}:${receiver.id}`); n.contacts++;
    }
  }
  for (const a of n.agents) {
    if (stationary.has(a.id)) continue;
    if (a.intent === 'share_warning' || a.intent === 'share_evidence' || (a.intent === 'wait' && n.tick >= a.reviewAt)) a.intent = 'continue_work';
    if (a.intent === 'wait' && n.tick < a.reviewAt) continue;
    const path = route(a.node, a.goal, a.detour || n.bridgeClosed);
    if (path.length > 1) a.node = path[1];
    if (a.node !== a.goal) continue;
    if (a.intent === 'inspect_bridge') {
      const e = event(n, { kind: 'observation', actor: a.id, text: `${a.name} reaches North Bridge and sees it is ${n.bridgeClosed ? 'closed' : 'open'}.`, parents: a.cause ? [a.cause] : [] });
      remember(a, { id: 'bridge-observation', kind: 'observation', source: 'first-hand observation', text: `I visited North Bridge at ${clock(n.tick)} and saw it ${n.bridgeClosed ? 'closed' : 'open'}.`, closed: n.bridgeClosed, tick: n.tick, event: e.id });
      a.intent = 'continue_work'; a.detour = false; a.goal = jobs[(a.id + a.deliveries) % 24]; n.inspections++;
    } else {
      a.deliveries++;
      // Stateless keyed schedule keeps unrelated agents identical across forks.
      a.goal = (jobs[(a.id + a.deliveries) % 24] + w.seed % 3) % 24;
      if (a.goal === a.node) a.goal = (a.goal + 7) % 24;
      if (a.id === 0 || a.detour) event(n, { kind: 'arrival', actor: a.id, text: `${a.name} completes delivery ${a.deliveries}${a.detour ? ' using the longer route' : ''}.`, parents: a.cause ? [a.cause] : [] });
    }
  }
  return n;
}
export function stepRules(w: World): World {
  return advance(w, pending(w).map(a => ({ id: a.id, input: inputFor(w, a), decision: rulesDecision(w, a) })));
}
export function fork(w: World, agentId: number, intervention: Intervention): World {
  const n = clone(w), a = n.agents[agentId];
  if (!a) throw new Error('Unknown resident.');
  const e = event(n, { kind: 'intervention', actor: agentId, text: intervention === 'distrust' ? `${a.name} now remembers the rumor source as unreliable.` : intervention === 'forget' ? `${a.name} no longer remembers the rumor.` : `${a.name} receives a private, verified observation of the bridge.`, parents: [] });
  if (intervention === 'distrust') {
    const trust = a.memory.find(m => m.kind === 'trust');
    const m: Memory = { id: 'source-trust', kind: 'trust', source: trust?.source ?? a.memory.find(m => m.kind === 'rumor')?.source ?? 'the tipster', text: 'The source of the bridge warning misled me last time. I should verify their claims.', tick: n.tick, event: e.id, reliable: false };
    a.memory = [...a.memory.filter(x => x.kind !== 'trust'), m];
  } else if (intervention === 'forget') a.memory = a.memory.filter(m => m.kind !== 'rumor');
  else a.memory = [...a.memory.filter(m => m.kind !== 'observation'), { id: 'private-evidence', kind: 'observation', source: 'private evidence intervention', text: `I have a verified observation that North Bridge is ${w.bridgeClosed ? 'closed' : 'open'} at ${clock(w.tick)}.`, tick: w.tick, event: e.id, closed: w.bridgeClosed }];
  // Revision is cache invalidation, not an injected belief/action/position change.
  a.revision++;
  return n;
}
export function stats(w: World) {
  return { aware: w.agents.filter(a => knowledge(a) !== 'unaware').length, concerned: w.agents.filter(a => knowledge(a) === 'concerned').length, informed: w.agents.filter(a => knowledge(a) === 'informed').length, deliveries: w.agents.reduce((n, a) => n + a.deliveries, 0), contacts: w.contacts, detours: w.agents.filter(a => a.detour).length };
}
export function differences(a: World, b: World | null): number[] {
  if (!b) return [];
  const signature = (p: Agent) => JSON.stringify([p.node, p.goal, p.intent, p.deliveries, p.detour, knowledge(p), p.memory.filter(m => m.kind !== 'trust').map(m => [m.kind, m.source, m.text])]);
  return a.agents.filter((p, i) => signature(p) !== signature(b.agents[i])).map(p => p.id);
}
export function causalChain(w: World, id: string): TownEvent[] {
  const seen = new Set<string>();
  const visit = (key: string): void => { if (seen.has(key)) return; seen.add(key); const e = w.events.find(x => x.id === key); e?.parents.forEach(visit); };
  visit(id);
  return w.events.filter(e => seen.has(e.id));
}
export function clock(tick: number): string { return `${String(8 + Math.floor(tick / 60)).padStart(2, '0')}:${String(tick % 60).padStart(2, '0')}`; }
