import { NODES, neighbors, knowledge, route, type World, type Agent, type TownEvent } from './sim/model.js';
export const INK = { unaware: '#94a6a1', concerned: '#edb46b', uncertain: '#c3a2f5', informed: '#72d9bd' };
type Point = { x: number; y: number };
const project = (x: number, y: number, z = 0): Point => ({ x: (x - y) * .72 + 435, y: (x + y) * .36 + 24 - z });
const plots = [
  [145, 198, 'POST OFFICE', 0], [300, 198, 'BAKERY', 1], [635, 198, 'CLINIC', 2], [790, 198, 'WORKSHOP', 3],
  [145, 328, 'TOWN HALL', 3], [300, 328, 'MARKET', 4], [635, 328, 'LIBRARY', 0], [790, 328, 'SCHOOL', 1],
  [145, 458, 'GARDENS', 5], [300, 458, 'HOMES', 2], [635, 458, 'GROCER', 4], [790, 458, 'HOMES', 2],
] as const;
export class TownView {
  private ctx: CanvasRenderingContext2D;
  private world: World;
  private previous: World;
  private updated = 0;
  private duration = 800;
  private frame = 0;
  private lastFrame = 0;
  private selected = 0;
  private hover: number | null = null;
  private info = true;
  private changed = new Set<number>();
  private zoom = 1;
  private pan = { x: 0, y: 0 };
  private scale = 1;
  private offset = { x: 0, y: 0 };
  private hit: { id: number; x: number; y: number }[] = [];
  private drag: { x: number; y: number; px: number; py: number; moved: boolean } | null = null;
  private observer: ResizeObserver;
  private visible = true;
  constructor(private canvas: HTMLCanvasElement, w: World, private select: (id: number) => void) {
    this.ctx = canvas.getContext('2d')!; this.world = w; this.previous = w;
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(canvas);
    canvas.addEventListener('pointerdown', this.down);
    canvas.addEventListener('pointermove', this.move);
    canvas.addEventListener('pointerup', this.up);
    canvas.addEventListener('pointercancel', this.cancel);
    canvas.addEventListener('pointerleave', () => { this.hover = null; });
    canvas.addEventListener('keydown', this.key);
    this.resize(); this.frame = requestAnimationFrame(this.draw);
  }
  update(w: World, selected: number, info: boolean, changed: number[], duration: number): void {
    if (w !== this.world) { this.previous = w.tick === this.world.tick + 1 ? this.world : w; this.world = w; this.updated = performance.now(); }
    this.selected = selected; this.info = info; this.changed = new Set(changed); this.duration = duration;
  }
  setVisible(value: boolean): void { this.visible = value; }
  zoomBy(delta: number): void { this.zoom = Math.max(.75, Math.min(2.1, this.zoom + delta)); }
  resetView(): void { this.zoom = 1; this.pan = { x: 0, y: 0 }; }
  destroy(): void { cancelAnimationFrame(this.frame); this.observer.disconnect(); }
  private resize(): void {
    const rect = this.canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr)); this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
  }
  private down = (e: PointerEvent): void => { this.drag = { x: e.clientX, y: e.clientY, px: this.pan.x, py: this.pan.y, moved: false }; this.canvas.setPointerCapture(e.pointerId); };
  private move = (e: PointerEvent): void => {
    if (this.drag) {
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      if (Math.hypot(dx, dy) > 5) this.drag.moved = true;
      if (this.drag.moved) this.pan = { x: this.drag.px + dx, y: this.drag.py + dy };
    } else { this.hover = this.at(e); this.canvas.style.cursor = this.hover === null ? 'grab' : 'pointer'; }
  };
  private cancel = (): void => { this.drag = null; };
  private up = (e: PointerEvent): void => { if (this.drag && !this.drag.moved) { const id = this.at(e); if (id !== null) this.select(id); } this.drag = null; };
  private at(e: PointerEvent): number | null {
    const r = this.canvas.getBoundingClientRect(), x = (e.clientX - r.left - this.offset.x) / this.scale, y = (e.clientY - r.top - this.offset.y) / this.scale;
    const closest = this.hit.map(h => ({ id: h.id, d: Math.hypot(h.x - x, h.y - y) })).sort((a, b) => a.d - b.d)[0];
    return closest?.d < 23 ? closest.id : null;
  }
  private key = (e: KeyboardEvent): void => {
    if (e.key === '+' || e.key === '=') this.zoomBy(.15);
    else if (e.key === '-') this.zoomBy(-.15);
    else if (e.key === 'ArrowLeft') this.pan.x += 25;
    else if (e.key === 'ArrowRight') this.pan.x -= 25;
    else if (e.key === 'ArrowUp') this.pan.y += 25;
    else if (e.key === 'ArrowDown') this.pan.y -= 25;
    else if (e.key === 'Escape') this.resetView(); else return;
    e.preventDefault();
  };
  private poly(points: Point[], fill: string, stroke?: string): void {
    const c = this.ctx; c.beginPath(); points.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.closePath(); c.fillStyle = fill; c.fill();
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1; c.stroke(); }
  }
  private ground(x: number, y: number, w: number, h: number, color: string): void { this.poly([project(x, y), project(x + w, y), project(x + w, y + h), project(x, y + h)], color); }
  private line(a: Point, b: Point, color: string, width = 1): void { const c = this.ctx; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.strokeStyle = color; c.lineWidth = width; c.stroke(); }
  private circle(p: Point, r: number, color: string): void { const c = this.ctx; c.beginPath(); c.arc(p.x, p.y, r, 0, Math.PI * 2); c.fillStyle = color; c.fill(); }
  private label(text: string, p: Point, color = '#c0cfc2', size = 9): void { const c = this.ctx; c.font = `500 ${size}px ui-monospace, monospace`; c.textAlign = 'center'; c.fillStyle = color; c.fillText(text, p.x, p.y); }
  private building(x: number, y: number, title: string, variant: number): void {
    const c = this.ctx, w = title === 'HOMES' ? 56 : 74, d = 53, h = variant === 3 ? 45 : 32;
    this.ground(x - 9, y - 9, w + 24, d + 22, '#8d947756');
    const p = [project(x, y), project(x + w, y), project(x + w, y + d), project(x, y + d)];
    const top = p.map(q => ({ x: q.x, y: q.y - h }));
    this.poly([p[1], p[2], top[2], top[1]], '#9c9d87', '#748271');
    this.poly([p[2], p[3], top[3], top[2]], '#c4c2a5', '#879780');
    const roof = ['#83959c', '#b88971', '#909989', '#a6a397', '#d0b182'][variant % 5];
    this.poly(top, roof, '#ddcfab80');
    // Roof ridges and small chimneys make the building silhouettes distinct.
    for (let i = 12; i < w; i += 14) this.line(project(x + i, y, h), project(x + i, y + d, h), '#ffffff18');
    const chimney = project(x + w - 14, y + 10, h);
    c.fillStyle = '#697c72'; c.fillRect(chimney.x - 2, chimney.y - 11, 6, 12);
    for (let i = 13; i < w - 5; i += 17) {
      const a = project(x + i, y + d, 18), b = project(x + i + 8, y + d, 18);
      this.poly([a, b, { x: b.x, y: b.y + 9 }, { x: a.x, y: a.y + 9 }], '#f6d799', '#465e5266');
    }
    const door = project(x + w * .48, y + d, 13), door2 = project(x + w * .48 + 10, y + d, 13);
    this.poly([door, door2, { x: door2.x, y: door2.y + 13 }, { x: door.x, y: door.y + 13 }], '#4c6058');
    if (variant === 4) {
      this.poly([project(x, y + d, 17), project(x + w, y + d, 17), project(x + w, y + d + 13, 12), project(x, y + d + 13, 12)], '#b88870');
      for (let i = 0; i < w; i += 16) this.poly([project(x + i, y + d, 17), project(x + i + 8, y + d, 17), project(x + i + 8, y + d + 13, 12), project(x + i, y + d + 13, 12)], '#e0c5a0');
    }
    this.label(title, project(x + w / 2, y + d + 25), '#d1d4bf', 8);
  }
  private tree(x: number, y: number, size: number): void {
    const c = this.ctx, p = project(x, y);
    c.fillStyle = '#162b2970'; c.beginPath(); c.ellipse(p.x + 7, p.y + 2, size * .8, size * .4, 0, 0, Math.PI * 2); c.fill();
    this.line(p, { x: p.x, y: p.y - size }, '#a5a187', 3);
    this.circle({ x: p.x, y: p.y - size - 5 }, size, '#3d6655');
    this.circle({ x: p.x - size * .23, y: p.y - size - 8 }, size * .8, '#5e8464');
    this.circle({ x: p.x - size * .34, y: p.y - size - 11 }, size * .5, '#759469');
  }
  private terrain(time: number): void {
    const c = this.ctx;
    const board = [project(30, 60), project(930, 60), project(930, 606), project(30, 606)];
    const lower = board.map(p => ({ x: p.x, y: p.y + 22 }));
    c.shadowColor = '#00000055'; c.shadowBlur = 40; c.shadowOffsetY = 22;
    this.poly(lower, '#162922'); c.shadowBlur = 0; c.shadowOffsetY = 0;
    this.poly([board[1], board[2], lower[2], lower[1]], '#263e35');
    this.poly([board[2], board[3], lower[3], lower[2]], '#355043');
    this.poly(board, '#45614e', '#6e836035');
    // River with two physically valid crossing points.
    this.ground(432, 60, 96, 546, '#285e68');
    this.ground(424, 60, 8, 546, '#a4a584'); this.ground(528, 60, 8, 546, '#8f9d7a');
    for (let i = 0; i < 24; i++) {
      const y = 75 + ((i * 29 + time * .004) % 511), x = 452 + i % 3 * 19;
      this.line(project(x, y), project(x + 8, y + 24), '#9bdad529', 1.2);
    }
    // Every road is an edge of the same graph used by the movement engine.
    for (const n of NODES) for (const id of neighbors(n.id)) if (id > n.id) {
      if ((n.id === 2 && id === 3) || (n.id === 20 && id === 21)) continue;
      const b = NODES[id]; this.line(project(n.x, n.y), project(b.x, b.y), '#839180', 12);
      this.line(project(n.x, n.y), project(b.x, b.y), '#a1a49066', 8);
    }
    for (const y of [145, 535]) {
      this.ground(392, y - 15, 179, 30, '#b1a17e');
      for (let x = 397; x < 571; x += 11) this.line(project(x, y - 15), project(x, y + 15), '#7f755f', 1.3);
      this.line(project(393, y - 15, 8), project(571, y - 15, 8), '#d9c496', 2);
      this.line(project(393, y + 15, 8), project(571, y + 15, 8), '#a08d68', 2);
    }
    // Small gardens, seats, and street lamps populate the blocks.
    for (let i = 0; i < 24; i++) {
      const n = NODES[i], p = project(n.x - 16, n.y - 12);
      this.line(p, { x: p.x, y: p.y - 18 }, '#303f35', 1.5); this.circle({ x: p.x, y: p.y - 18 }, 2.2, '#e5d7a3');
    }
    for (const [x, y, name, variant] of plots) {
      if (name === 'GARDENS') {
        this.ground(x, y, 78, 52, '#719074');
        for (let i = 0; i < 5; i++) this.ground(x + 6 + i * 14, y + 6, 7, 38, i % 2 ? '#d7b787' : '#92ae7d');
        this.label(name, project(x + 38, y + 77), '#d1d4bf', 8);
      } else this.building(x, y, name, variant);
    }
    const trees: [number, number, number][] = [];
    for (let i = 0; i < 18; i++) trees.push([53 + i * 50, 87 + i % 2 * 10, 10 + i % 3]);
    for (let i = 0; i < 18; i++) trees.push([50 + i * 50, 580 + i % 2 * 9, 10 + i % 4]);
    for (let i = 0; i < 9; i++) { trees.push([52, 175 + i * 43, 12]); trees.push([908, 164 + i * 43, 10]); }
    trees.filter(([x]) => x < 420 || x > 540).sort((a, b) => a[0] + a[1] - b[0] - b[1]).forEach(t => this.tree(...t));
    this.label('WEST BANK', project(204, 105), '#c2d0ad80', 10);
    this.label('EAST BANK', project(750, 105), '#c2d0ad80', 10);
    const bridge = project(480, 145, 37);
    this.pill(`NORTH BRIDGE · ${this.world.bridgeClosed ? 'CLOSED' : 'OPEN'}`, bridge, '#b5e9d0', '#183a34eb');
    this.label('SOUTH CROSSING', project(480, 576), '#adbdb199', 8);
  }
  private pill(text: string, p: Point, color: string, bg: string): void {
    const c = this.ctx; c.font = '500 9px ui-monospace, monospace'; const width = c.measureText(text).width + 18;
    c.fillStyle = bg; c.beginPath(); c.roundRect(p.x - width / 2, p.y - 15, width, 23, 5); c.fill(); this.label(text, p, color, 9);
  }
  private agentPosition(a: Agent, fraction: number): Point {
    const old = this.previous.agents[a.id], from = NODES[old.node], to = NODES[a.node];
    return project(from.x + (to.x - from.x) * fraction + (a.id % 3 - 1) * 11, from.y + (to.y - from.y) * fraction + (Math.floor(a.id / 3) % 3 - 1) * 9);
  }
  private person(a: Agent, p: Point, time: number, moving: boolean): void {
    const c = this.ctx, k = knowledge(a), selected = a.id === this.selected, color = this.info ? INK[k] : a.color;
    c.fillStyle = '#16291e90'; c.beginPath(); c.ellipse(p.x + 2, p.y + 2, 9, 4, 0, 0, Math.PI * 2); c.fill();
    if (selected || this.changed.has(a.id)) {
      c.beginPath(); c.ellipse(p.x, p.y + 1, selected ? 16 : 12, selected ? 7 : 5, 0, 0, Math.PI * 2);
      c.strokeStyle = selected ? '#e9dcff' : '#c4a5f4'; c.lineWidth = selected ? 2 : 1; c.stroke();
    }
    const bob = moving ? Math.sin(time / 85 + a.id) * 1.1 : 0;
    this.line({ x: p.x - 3, y: p.y - 6 }, { x: p.x - 3 - bob, y: p.y }, '#243d35', 3);
    this.line({ x: p.x + 3, y: p.y - 6 }, { x: p.x + 3 + bob, y: p.y }, '#243d35', 3);
    c.fillStyle = a.color; c.beginPath(); c.roundRect(p.x - 5, p.y - 15 + bob, 10, 11, 3); c.fill();
    this.circle({ x: p.x, y: p.y - 19 + bob }, 4.3, '#e5c3a0');
    c.fillStyle = '#38443b'; c.fillRect(p.x - 4, p.y - 23 + bob, 8, 3);
    if (k !== 'unaware') { this.circle({ x: p.x + 9, y: p.y - 26 }, 6, color); this.label(k === 'informed' ? '✓' : k === 'uncertain' ? '?' : '!', { x: p.x + 9, y: p.y - 23 }, '#172b24', 9); }
    if (selected) this.pill(a.name.toUpperCase(), { x: p.x, y: p.y - 40 }, '#eee8fc', '#252437ed');
    this.hit.push({ id: a.id, x: p.x, y: p.y - 12 });
  }
  private communication(e: TownEvent, time: number): void {
    if (e.from === undefined || e.to === undefined) return;
    const a = NODES[e.from], b = NODES[e.to], p = project(a.x, a.y, 22), q = project(b.x, b.y, 22), c = this.ctx;
    const color = e.kind === 'warning' ? '#ffc77f' : '#89f2cd';
    c.beginPath(); c.moveTo(p.x, p.y); c.quadraticCurveTo((p.x + q.x) / 2, Math.min(p.y, q.y) - 42, q.x, q.y);
    c.strokeStyle = color; c.lineWidth = 1.7; c.setLineDash([4, 5]); c.lineDashOffset = -time / 65; c.stroke(); c.setLineDash([]);
    this.circle(q, 3, color);
  }
  private draw = (time: number): void => {
    this.frame = requestAnimationFrame(this.draw);
    if (!this.visible || document.hidden || time - this.lastFrame < 30) return;
    this.lastFrame = time;
    const c = this.ctx, rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = this.canvas.width / rect.width;
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, rect.width, rect.height);
    this.scale = Math.min(rect.width / 1100, rect.height / 640) * this.zoom;
    this.offset = { x: (rect.width - 1100 * this.scale) / 2 + this.pan.x, y: (rect.height - 640 * this.scale) / 2 + this.pan.y + 4 };
    c.translate(this.offset.x, this.offset.y); c.scale(this.scale, this.scale);
    this.terrain(time);
    const selected = this.world.agents[this.selected];
    if (selected) {
      const p = route(selected.node, selected.goal, selected.detour || this.world.bridgeClosed);
      c.setLineDash([5, 6]);
      for (let i = 1; i < p.length; i++) this.line(project(NODES[p[i - 1]].x, NODES[p[i - 1]].y), project(NODES[p[i]].x, NODES[p[i]].y), '#d1b9ffb0', 2);
      c.setLineDash([]);
    }
    this.hit = [];
    const f = Math.max(0, Math.min(1, (time - this.updated) / Math.max(1, this.duration)));
    const fraction = f * f * (3 - 2 * f);
    this.world.agents.map(a => ({ a, p: this.agentPosition(a, fraction) })).sort((a, b) => a.p.y - b.p.y)
      .forEach(({ a, p }) => this.person(a, p, time, f < 1 && this.previous.agents[a.id].node !== a.node));
    if (this.info) this.world.events.filter(e => this.world.tick - e.tick < 2 && (e.kind === 'warning' || e.kind === 'evidence')).forEach(e => this.communication(e, time));
    if (this.hover !== null && this.hover !== this.selected) {
      const a = this.world.agents[this.hover]; this.pill(`${a.name} · ${a.role}`, { ...this.agentPosition(a, fraction), y: this.agentPosition(a, fraction).y - 38 }, '#f5eedb', '#1a292af5');
    }
  };
}
