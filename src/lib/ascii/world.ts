/**
 * Adapted from ascii-sharks by drewdi (MIT, see LICENSE-ascii-sharks).
 * Changes for this site: no headline no-swim zone, click drops food that
 * sharks swarm to, and dragging leaves a lure that sharks chase.
 *
 * Artificial-life sim for the hero: tiny fish schools and the sharks that hunt them.
 *
 * Fish: Reynolds boids (separation / alignment / cohesion) in Couzin-style
 * zones, with a blind spot behind each fish. Alarm spreads from fish to fish
 * through the school (a "wave of agitation"), so a whole school bolts even
 * when only its edge can see the shark. Fleeing fish break sideways around the
 * shark's path, which gives the fountain effect seen in real bait balls.
 *
 * Sharks: Reynolds steering (wander + pursuit + separation) on a
 * follow-the-leader spine. Hunger builds over time and drops when they eat.
 * They prefer fish in sparse spots, since dense schools confuse predators,
 * so stragglers get picked off. Eaten fish come back later as new schools
 * swimming in from the edges, which keeps the population steady.
 */
import { angleDiff, clamp, current, rand, randInt, TAU } from "./math";
import { pickSpecies, SPECIES } from "./species";

export const SHARK_NODES = 20;

export type SharkKind = "classic" | "hammerhead" | "zebra" | "tiger" | "greathammer" | "mako" | "thresher" | "nurse";

/** Which sharks to put in the water; size is relative to the biggest. */
export type SharkSpec = { kind: SharkKind; size: number };

// The landing hero: tiger sharks at different depths. Five on a typical laptop-size window, scaled by
// screen area (a phone gets 3, a 1080p monitor 6, a 1440p monitor 8). The fish already scale on their own.
const SHARK_SIZES = [1, 0.7, 0.84, 0.77, 0.9, 0.64, 0.8, 0.72];
export function sharksFor(width: number, height: number): SharkSpec[] {
  const n = clamp(Math.round(5 * Math.sqrt((width * height) / 1_500_000)), 3, SHARK_SIZES.length);
  return SHARK_SIZES.slice(0, n).map((size) => ({ kind: "tiger", size }));
}

export interface Fish {
  x: number;
  y: number;
  vx: number;
  vy: number;
  species: number;
  /** 0 calm → 1 panicking. Spreads to neighbours. */
  alarm: number;
  alive: boolean;
  respawnAt: number;
  /** Tail-beat phase. */
  phase: number;
  /** Smoothed angular velocity (rad/s); hard turns flash silver. */
  turn: number;
  /** 0.55 far → 1 near. */
  depth: number;
  /** Rotation sense shared by a school when it mills into a bait ball. */
  millDir: 1 | -1;
}

export interface Shark {
  id: number;
  kind: SharkKind;
  length: number;
  /** Spine positions, snout first: [x0, y0, x1, y1, ...]. */
  nodes: Float32Array;
  heading: number;
  speed: number;
  /** Tail-beat phase; drives the body wave in the renderer. */
  phase: number;
  /** Smoothed angular velocity (rad/s); the shark banks its fins into turns. */
  turn: number;
  hunger: number;
  wander: number;
  orbitDir: 1 | -1;
  orbitRadius: number;
  target: Fish | null;
  retargetAt: number;
  /** 0 far / dim → 1 near / bright. */
  depth: number;
  /** easter egg: poked too many times, it lunges at this point until `until` */
  lunge?: { x: number; y: number; back: number; until: number };
}

export interface Food {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Seconds left before it dissolves. */
  life: number;
  seed: number;
}

export interface WorldEvent {
  kind: "eat" | "splash" | "drop";
  x: number;
  y: number;
}

const FISH_SEPARATION_K = 420;
const FISH_ALIGN_K = 1.4;
const FISH_COHESION_K = 1;
const FISH_FLEE_K = 1100;
const BLIND_COS = -0.6; // ~127° either side of the heading is visible

export class World {
  width = 0;
  height = 0;
  time = 0;
  fish: Fish[] = [];
  sharks: Shark[] = [];
  events: WorldEvent[] = [];
  pointer = { x: 0, y: 0, active: false };
  /** Where a drag is right now; sharks chase it while it's active. */
  lure = { x: 0, y: 0, active: false };
  food: Food[] = [];
  /** 0–1. Scales how hard the cursor pushes fish around. */
  interaction = 1;

  /** Fish neighbourhood radius; the spatial hash bucket size matches it. */
  private perception = 60;
  /** Per-species personal space in px (x, y). */
  private sepX: number[] = [];
  private sepY: number[] = [];
  private foreignSep = 40;
  private bucketCols = 0;
  private bucketRows = 0;
  private bucketHead = new Int32Array(0);
  private bucketCount = new Uint16Array(0);
  private bucketNext = new Int32Array(0);
  private lastSpawn = 0;
  private tmp = { x: 0, y: 0 };

  /** fishCount overrides the area-based population (the sidebar wants a single small school). */
  constructor(
    private sharkSpecs?: SharkSpec[],
    private fishCount?: number,
  ) {}

  resize(width: number, height: number, cellW: number, cellH: number) {
    const first = this.width === 0;
    this.width = width;
    this.height = height;
    // Spacing is set in grid cells so every fish lands in its own cell.
    this.sepX = SPECIES.map((sp) => sp.spacing[0] * cellW);
    this.sepY = SPECIES.map((sp) => sp.spacing[1] * cellH);
    this.perception = Math.max(cellH * 3, cellW * 5.5);
    this.foreignSep = cellW * 3;

    if (first || this.fish.length === 0) {
      this.seed();
      return;
    }
    for (const f of this.fish) {
      f.x = clamp(f.x, 0, width);
      f.y = clamp(f.y, 0, height);
    }
  }

  seed() {
    const { width: W, height: H } = this;
    const minSide = Math.min(W, H);
    const baseLength = clamp(minSide * 0.44, 170, 430);
    const specs = this.sharkSpecs ?? sharksFor(W, H);
    const sharkCount = specs.length;

    this.sharks = [];
    for (let i = 0; i < sharkCount; i++) {
      const { kind, size } = specs[i];
      const length = baseLength * size;
      const orbitRadius = minSide * rand(0.28, 0.4);
      const a = (i / sharkCount) * TAU + rand(-0.4, 0.4);
      const orbitDir: 1 | -1 = i % 2 === 0 ? 1 : -1;
      const x = W / 2 + Math.cos(a) * orbitRadius * (W / minSide) * 0.9;
      const y = H / 2 + Math.sin(a) * orbitRadius;
      const heading = a + (orbitDir * Math.PI) / 2;
      const nodes = new Float32Array(SHARK_NODES * 2);
      const seg = length / (SHARK_NODES - 1);
      for (let n = 0; n < SHARK_NODES; n++) {
        nodes[n * 2] = x - Math.cos(heading) * seg * n;
        nodes[n * 2 + 1] = y - Math.sin(heading) * seg * n;
      }
      this.sharks.push({
        id: i + 1,
        kind,
        length,
        nodes,
        heading,
        speed: 30,
        phase: rand(0, TAU),
        turn: 0,
        hunger: rand(0.25, 0.75),
        wander: 0,
        orbitDir,
        orbitRadius,
        target: null,
        retargetAt: 0,
        depth: Math.min(1, size),
      });
    }
    // Smaller (farther) sharks draw first so the big one swims over them.
    this.sharks.sort((a, b) => a.length - b.length);

    const total = this.fishCount ?? clamp(Math.round((W * H) / 4400), 85, 340);
    this.fish = [];
    while (this.fish.length < total) {
      const species = pickSpecies();
      const sp = SPECIES[species];
      const size = Math.min(randInt(sp.schoolSize[0], sp.schoolSize[1]), total - this.fish.length);
      const millDir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
      const cx = rand(W * 0.06, W * 0.94);
      const cy = rand(H * 0.08, H * 0.92);
      // Mostly level headings: fish cruise sideways far more than up or down.
      const dir = (Math.random() < 0.5 ? 0 : Math.PI) + rand(-0.5, 0.5);
      for (let k = 0; k < size; k++) {
        this.fish.push({
          x: cx + rand(-1, 1) * this.sepX[species] * Math.sqrt(size),
          y: cy + rand(-1, 1) * this.sepY[species] * Math.sqrt(size) * 0.6,
          vx: Math.cos(dir) * sp.cruise,
          vy: Math.sin(dir) * sp.cruise,
          species,
          alarm: 0,
          alive: true,
          respawnAt: 0,
          phase: rand(0, TAU),
          turn: 0,
          depth: rand(0.55, 1),
          millDir,
        });
      }
    }
    this.bucketNext = new Int32Array(this.fish.length);
  }

  splash(x: number, y: number) {
    this.events.push({ kind: "splash", x, y });
    const r = 240;
    for (const f of this.fish) {
      if (!f.alive) continue;
      const dx = f.x - x;
      const dy = f.y - y;
      const d = Math.hypot(dx, dy);
      if (d > r || d < 1e-3) continue;
      // Flash expansion: everybody nearby bolts straight out.
      const k = (1 - d / r) * 260;
      f.vx += (dx / d) * k;
      f.vy += (dy / d) * k;
      f.alarm = 1;
    }
  }

  /** Click: a small cloud of food sinks from here, and sharks swarm to it. */
  dropFood(x: number, y: number) {
    this.events.push({ kind: "drop", x, y });
    const n = randInt(7, 11);
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const r = rand(0, 26);
      this.food.push({
        x: x + Math.cos(a) * r,
        y: y + Math.sin(a) * r * 0.6,
        vx: Math.cos(a) * rand(4, 18),
        vy: rand(6, 16),
        life: rand(11, 16),
        seed: randInt(0, 1 << 20),
      });
    }
    if (this.food.length > 60) this.food.splice(0, this.food.length - 60);
    // Nearby fish startle, then come back for the food once it settles.
    for (const f of this.fish) {
      if (!f.alive) continue;
      const d = Math.hypot(f.x - x, f.y - y);
      if (d < 90 && d > 1e-3) {
        f.vx += ((f.x - x) / d) * 90;
        f.vy += ((f.y - y) / d) * 90;
        f.alarm = Math.max(f.alarm, 0.6);
      }
    }
  }

  /** Easter egg (konami): the sharks keep doing what they were doing, just a lot faster. */
  frenzyUntil = 0;
  frenzy(seconds = 10) {
    this.frenzyUntil = this.time + seconds;
  }

  /** The shark whose body is under (x, y), if any. */
  sharkAt(x: number, y: number): Shark | null {
    let best: Shark | null = null;
    let bestD = Infinity;
    for (const sh of this.sharks) {
      const reach = Math.max(26, sh.length * 0.11);
      for (let k = 0; k < SHARK_NODES; k += 2) {
        const d = Math.hypot(sh.nodes[k * 2] - x, sh.nodes[k * 2 + 1] - y);
        if (d < reach && d < bestD) {
          bestD = d;
          best = sh;
        }
      }
    }
    return best;
  }

  /** Easter egg: a shark that's had enough charges at (x, y). */
  lunge(sh: Shark, x: number, y: number) {
    // back off for a beat, then come straight at the pointer
    sh.lunge = { x, y, back: this.time + 0.55, until: this.time + 3.2 };
    this.splash(x, y);
  }

  step(dt: number) {
    this.time += dt;
    this.stepFood(dt);
    this.rebuildHash();
    this.stepFish(dt);
    this.stepSharks(dt);
    this.respawn();
  }

  private stepFood(dt: number) {
    const { food, height: H, time } = this;
    let w = 0;
    for (let i = 0; i < food.length; i++) {
      const p = food[i];
      p.life -= dt;
      if (p.life <= 0 || p.y > H + 10) continue;
      // Sinks slowly and sways a little in the current.
      p.vx *= Math.exp(-dt * 1.6);
      p.vy += (9 - p.vy) * Math.min(1, dt * 0.8);
      p.x += (p.vx + Math.sin(time * 1.3 + p.seed) * 6) * dt;
      p.y += p.vy * dt;
      food[w++] = p;
    }
    food.length = w;
  }

  /** Nearest food pellet to (x, y) within range, or null. */
  private nearestFood(x: number, y: number, range: number) {
    let best: Food | null = null;
    let bd = range * range;
    for (const p of this.food) {
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  private rebuildHash() {
    const size = this.perception;
    const pad = 2;
    this.bucketCols = Math.ceil(this.width / size) + pad * 2;
    this.bucketRows = Math.ceil(this.height / size) + pad * 2;
    const n = this.bucketCols * this.bucketRows;
    if (this.bucketHead.length !== n) {
      this.bucketHead = new Int32Array(n);
      this.bucketCount = new Uint16Array(n);
    }
    this.bucketHead.fill(-1);
    this.bucketCount.fill(0);
    if (this.bucketNext.length !== this.fish.length) {
      this.bucketNext = new Int32Array(this.fish.length);
    }
    for (let i = 0; i < this.fish.length; i++) {
      const f = this.fish[i];
      if (!f.alive) continue;
      const b = this.bucketOf(f.x, f.y);
      this.bucketNext[i] = this.bucketHead[b];
      this.bucketHead[b] = i;
      this.bucketCount[b]++;
    }
  }

  private bucketOf(x: number, y: number) {
    const size = this.perception;
    const c = clamp(Math.floor(x / size) + 2, 0, this.bucketCols - 1);
    const r = clamp(Math.floor(y / size) + 2, 0, this.bucketRows - 1);
    return r * this.bucketCols + c;
  }

  private stepFish(dt: number) {
    const { fish, sharks, pointer, width: W, height: H, time } = this;
    const R = this.perception;
    const R2 = R * R;
    const foreignSep = this.foreignSep;
    const size = this.perception;
    const cols = this.bucketCols;
    const rows = this.bucketRows;
    const head = this.bucketHead;
    const next = this.bucketNext;
    const cur = this.tmp;
    const calmDecay = Math.exp(-dt * 0.7);
    const contagion = Math.min(1, dt * 6);

    for (let i = 0; i < fish.length; i++) {
      const f = fish[i];
      if (!f.alive) continue;
      const sp = SPECIES[f.species];
      // Alarmed fish want more room: the school flashes apart around a
      // shark and closes back up once the threat fades.
      const spread = 1 + 1.8 * f.alarm;
      const sepX = this.sepX[f.species] * spread;
      const sepY = this.sepY[f.species] * spread;

      const speed = Math.hypot(f.vx, f.vy) || 1;
      const hx = f.vx / speed;
      const hy = f.vy / speed;

      let ax = 0;
      let ay = 0;
      let sx = 0;
      let sy = 0;
      let avx = 0;
      let avy = 0;
      let cx = 0;
      let cy = 0;
      let n = 0;
      let neighbourAlarm = 0;

      const bc = clamp(Math.floor(f.x / size) + 2, 0, cols - 1);
      const br = clamp(Math.floor(f.y / size) + 2, 0, rows - 1);
      for (let r = Math.max(0, br - 1); r <= Math.min(rows - 1, br + 1); r++) {
        for (let c = Math.max(0, bc - 1); c <= Math.min(cols - 1, bc + 1); c++) {
          let j = head[r * cols + c];
          while (j !== -1) {
            if (j !== i) {
              const o = fish[j];
              const dx = o.x - f.x;
              const dy = o.y - f.y;
              const d2 = dx * dx + dy * dy;
              if (d2 < R2 && d2 > 1e-6) {
                const d = Math.sqrt(d2);
                // Blind zone directly behind the fish.
                if ((dx * hx + dy * hy) / d > BLIND_COS) {
                  // Elliptical personal space: wide along x, tight along y.
                  const qx = dx / sepX;
                  const qy = dy / sepY;
                  const q2 = qx * qx + qy * qy;
                  if (q2 < 1) {
                    const q = Math.sqrt(q2) || 1e-3;
                    const k = (1 - q) / q;
                    sx -= qx * k;
                    sy -= qy * k;
                  }
                  if (o.species === f.species) {
                    avx += o.vx;
                    avy += o.vy;
                    cx += dx;
                    cy += dy;
                    n++;
                  } else if (d < foreignSep) {
                    // Different species keep their own schools.
                    const k = ((1 - d / foreignSep) / d) * 0.6;
                    sx -= dx * k;
                    sy -= dy * k;
                  }
                  if (o.alarm > neighbourAlarm) neighbourAlarm = o.alarm;
                }
              }
            }
            j = next[j];
          }
        }
      }

      ax += sx * FISH_SEPARATION_K;
      ay += sy * FISH_SEPARATION_K;
      if (n > 0) {
        const alignK = FISH_ALIGN_K * sp.align;
        const cohesionK = FISH_COHESION_K * sp.cohesion * (1 - 0.8 * f.alarm);
        ax += (avx / n - f.vx) * alignK + (cx / n) * cohesionK;
        ay += (avy / n - f.vy) * alignK + (cy / n) * cohesionK;
        if (sp.mill > 0) {
          // Circle the local centre: the school spins into a bait ball.
          const cl = Math.hypot(cx, cy) || 1;
          ax += (-cy / cl) * f.millDir * sp.mill * (1 - f.alarm);
          ay += (cx / cl) * f.millDir * sp.mill * (1 - f.alarm);
        }
      }

      // Predators. Distance is measured to the nearest point along the front
      // half of the shark, so fish also give the flanks a wide berth.
      let fear = 0;
      for (const sh of sharks) {
        const fearR = sh.length * 0.6 + 60;
        let best = Infinity;
        let bx = 0;
        let by = 0;
        for (let k = 0; k <= 12; k += 3) {
          const nx = sh.nodes[k * 2];
          const ny = sh.nodes[k * 2 + 1];
          const d2 = (f.x - nx) ** 2 + (f.y - ny) ** 2;
          if (d2 < best) {
            best = d2;
            bx = nx;
            by = ny;
          }
        }
        const d = Math.sqrt(best);
        if (d >= fearR || d < 1e-3) continue;
        let w = 1 - d / fearR;
        w *= w;
        const awayX = (f.x - bx) / d;
        const awayY = (f.y - by) / d;
        // Fountain effect: break to whichever side of the shark's path you're on.
        const shx = Math.cos(sh.heading);
        const shy = Math.sin(sh.heading);
        const side = shx * (f.y - sh.nodes[1]) - shy * (f.x - sh.nodes[0]) >= 0 ? 1 : -1;
        ax += (awayX * 0.7 - shy * side * 0.9) * FISH_FLEE_K * w;
        ay += (awayY * 0.7 + shx * side * 0.9) * FISH_FLEE_K * w;
        fear = Math.max(fear, Math.sqrt(w));
      }

      if (this.lure.active) {
        const pr = 150;
        const dx = f.x - this.lure.x;
        const dy = f.y - this.lure.y;
        const d = Math.hypot(dx, dy);
        if (d < pr && d > 1e-3) {
          const w = (1 - d / pr) ** 2;
          ax += (dx / d) * FISH_FLEE_K * w;
          ay += (dy / d) * FISH_FLEE_K * w;
          fear = Math.max(fear, Math.sqrt(w));
        }
      }

      // Calm fish drift toward food in the water.
      if (this.food.length && f.alarm < 0.35) {
        const p = this.nearestFood(f.x, f.y, 220);
        if (p) {
          const dx = p.x - f.x;
          const dy = p.y - f.y;
          const d = Math.hypot(dx, dy) || 1;
          ax += (dx / d) * 120 * (1 - f.alarm * 2);
          ay += (dy / d) * 120 * (1 - f.alarm * 2);
        }
      }

      if (pointer.active && this.interaction > 0) {
        const pr = 130 * (0.5 + 0.5 * this.interaction);
        const dx = f.x - pointer.x;
        const dy = f.y - pointer.y;
        const d = Math.hypot(dx, dy);
        if (d < pr && d > 1e-3) {
          const w = (1 - d / pr) ** 2;
          ax += (dx / d) * FISH_FLEE_K * w * this.interaction;
          ay += (dy / d) * FISH_FLEE_K * w * this.interaction;
          fear = Math.max(fear, Math.sqrt(w) * 0.8 * this.interaction);
        }
      }

      // Alarm: direct threat sets it, neighbours pass it along (slightly
      // weaker each hop), and it fades on its own.
      let alarm = Math.max(f.alarm * calmDecay, fear);
      const relayed = neighbourAlarm * 0.86;
      if (relayed > alarm) alarm += (relayed - alarm) * contagion;
      f.alarm = alarm;

      // Soft walls.
      const m = 36;
      if (f.x < m) ax += (m - f.x) * 7;
      else if (f.x > W - m) ax -= (f.x - (W - m)) * 7;
      if (f.y < m) ay += (m - f.y) * 7;
      else if (f.y > H - m) ay -= (f.y - (H - m)) * 7;

      // Ambient current and a little individual restlessness.
      current(f.x, f.y, time, cur);
      ax += cur.x * 0.5 + (Math.random() - 0.5) * sp.jitter;
      ay += cur.y * 0.5 + (Math.random() - 0.5) * sp.jitter;
      // Swim level, except when bolting from danger.
      ay -= f.vy * sp.verticalDrag * (1 - 0.7 * f.alarm);

      // Relax toward a preferred speed that rises with panic.
      const preferred = sp.cruise * (1 + 1.3 * f.alarm);
      ax += (preferred - speed) * hx * 1.6;
      ay += (preferred - speed) * hy * 1.6;

      const before = Math.atan2(f.vy, f.vx);
      f.vx += ax * dt;
      f.vy += ay * dt;
      const maxSpeed = sp.maxSpeed * (1 + 1.8 * f.alarm);
      const s = Math.hypot(f.vx, f.vy);
      if (s > maxSpeed) {
        f.vx *= maxSpeed / s;
        f.vy *= maxSpeed / s;
      } else if (s < sp.minSpeed && s > 1e-3) {
        f.vx *= sp.minSpeed / s;
        f.vy *= sp.minSpeed / s;
      }
      f.turn += (angleDiff(before, Math.atan2(f.vy, f.vx)) / dt - f.turn) * Math.min(1, dt * 8);
      f.phase += dt * (7 + Math.hypot(f.vx, f.vy) * 0.12);
      f.x = clamp(f.x + f.vx * dt, -60, W + 60);
      f.y = clamp(f.y + f.vy * dt, -60, H + 60);
    }
  }

  private stepSharks(dt: number) {
    const { sharks, width: W, height: H, time } = this;
    const minSide = Math.min(W, H);
    const cxW = W / 2;
    const cyW = H / 2;

    for (const sh of sharks) {
      const L = sh.length;
      const nodes = sh.nodes;
      const hx = nodes[0];
      const hy = nodes[1];

      sh.hunger = Math.min(1, sh.hunger + dt * 0.03);

      // Momentum.
      let dx = Math.cos(sh.heading);
      let dy = Math.sin(sh.heading);

      // Wander: a slowly drifting offset on a circle ahead of the snout.
      sh.wander = clamp(sh.wander + (Math.random() - 0.5) * dt * 3.2, -1.1, 1.1);
      dx += Math.cos(sh.heading + sh.wander) * 0.45;
      dy += Math.sin(sh.heading + sh.wander) * 0.45;

      // Hunt.
      if (time >= sh.retargetAt) {
        sh.target = this.findPrey(sh);
        sh.retargetAt = time + 0.45;
      }
      const t = sh.target;
      let hunting = false;
      let closing = 0;
      const lure = this.lure;
      const lureD = lure.active ? Math.hypot(lure.x - hx, lure.y - hy) : Infinity;
      const meal = this.food.length ? this.nearestFood(hx, hy, Math.max(W, H)) : null;
      const lunge = sh.lunge && sh.lunge.until > time ? sh.lunge : null;
      if (lunge) {
        // had enough of being poked: wheel away, then charge the pointer
        const charging = time >= lunge.back;
        const px = this.pointer.active ? this.pointer.x : lunge.x;
        const py = this.pointer.active ? this.pointer.y : lunge.y;
        let tx = px - hx;
        let ty = py - hy;
        if (!charging) {
          tx = -tx;
          ty = -ty;
        }
        const d = Math.hypot(tx, ty) || 1;
        dx += (tx / d) * 9;
        dy += (ty / d) * 9;
        hunting = true;
        closing = charging ? 1 : 0.3;
      } else if (lureD < L * 1.6 + 320) {
        // Drag: chase the wake you leave.
        const tx = lure.x - hx;
        const ty = lure.y - hy;
        const d = lureD || 1;
        dx += (tx / d) * 4.2;
        dy += (ty / d) * 4.2;
        hunting = true;
        closing = clamp(1 - d / (L * 0.9), 0, 1);
      } else if (meal) {
        // Click: everyone swarms the food.
        const tx = meal.x - hx;
        const ty = meal.y - hy;
        const d = Math.hypot(tx, ty) || 1;
        dx += (tx / d) * 4;
        dy += (ty / d) * 4;
        hunting = true;
        closing = clamp(1 - d / (L * 0.9), 0, 1);
      } else if (t && t.alive && sh.hunger > 0.3) {
        // Pursuit: aim at where the fish is about to be.
        const tx = t.x + t.vx * 0.35 - hx;
        const ty = t.y + t.vy * 0.35 - hy;
        const d = Math.hypot(tx, ty) || 1;
        const w = 1.4 + 2.6 * sh.hunger;
        dx += (tx / d) * w;
        dy += (ty / d) * w;
        hunting = true;
        closing = clamp(1 - d / (L * 0.9), 0, 1);
      } else {
        // Patrol: a lazy circuit around the headline.
        const rx = (hx - cxW) / (W / minSide);
        const ry = hy - cyW;
        const r = Math.hypot(rx, ry) || 1;
        const radius = sh.orbitRadius * (1 + 0.15 * Math.sin(time * 0.05 + sh.id));
        const radial = clamp((radius - r) / radius, -1, 1);
        dx += ((-ry / r) * sh.orbitDir + (rx / r) * radial * 0.9) * 0.55;
        dy += ((rx / r) * sh.orbitDir + (ry / r) * radial * 0.9) * 0.55;
      }

      // Give other sharks room.
      for (const other of sharks) {
        if (other === sh) continue;
        for (let k = 0; k < SHARK_NODES; k += 4) {
          const ox = hx - other.nodes[k * 2];
          const oy = hy - other.nodes[k * 2 + 1];
          const d = Math.hypot(ox, oy);
          const range = (L + other.length) * 0.45;
          if (d < range && d > 1e-3) {
            const w = (1 - d / range) * 3;
            dx += (ox / d) * w;
            dy += (oy / d) * w;
          }
        }
      }

      // Turn back once the snout leaves the frame, so bodies dip off-screen
      // now and then but the sharks never wander away for good.
      const over = Math.max(-hx, hx - W, -hy, hy - H);
      if (over > -L * 0.05) {
        const w = clamp((over + L * 0.05) / (L * 0.35), 0, 1) * 3.5;
        const toX = cxW - hx;
        const toY = cyW - hy;
        const d = Math.hypot(toX, toY) || 1;
        dx += (toX / d) * w;
        dy += (toY / d) * w;
      }

      const desired = Math.atan2(dy, dx);
      // Sharks can't pivot on the spot: the turning circle grows with speed.
      const agility = Math.min(hunting ? 1.7 + closing : 0.8, sh.speed / (L * 0.22));
      const maxTurn = agility * dt;
      const turned = clamp(angleDiff(sh.heading, desired), -maxTurn, maxTurn);
      sh.heading += turned;
      sh.turn += (turned / dt - sh.turn) * Math.min(1, dt * 3);

      const cruise = 30 + L * 0.04;
      const frenzied = time < this.frenzyUntil ? 2 : 1;
      const charge = lunge && time >= lunge.back;
      const targetSpeed = charge ? Math.max(520, L * 1.4) : (hunting ? cruise * (1.45 + closing * 1.5) : cruise) * frenzied * (lunge ? 1.8 : 1);
      sh.speed += (targetSpeed - sh.speed) * Math.min(1, dt * (charge ? 4 : 1.1));
      sh.phase += dt * (2 + sh.speed / 24);

      nodes[0] += Math.cos(sh.heading) * sh.speed * dt;
      nodes[1] += Math.sin(sh.heading) * sh.speed * dt;

      // Follow-the-leader spine, with a stiffness limit per joint so the
      // body bends into a C at most and never folds back on itself.
      const seg = L / (SHARK_NODES - 1);
      const maxBend = 0.16;
      let prevAngle = sh.heading + Math.PI;
      for (let k = 1; k < SHARK_NODES; k++) {
        const px = nodes[(k - 1) * 2];
        const py = nodes[(k - 1) * 2 + 1];
        let angle = Math.atan2(nodes[k * 2 + 1] - py, nodes[k * 2] - px);
        angle = prevAngle + clamp(angleDiff(prevAngle, angle), -maxBend, maxBend);
        nodes[k * 2] = px + Math.cos(angle) * seg;
        nodes[k * 2 + 1] = py + Math.sin(angle) * seg;
        prevAngle = angle;
      }

      // Food first: any pellet near the mouth is gone.
      if (this.food.length) {
        const mouthR = L * 0.07 + 12;
        const mx = nodes[0];
        const my = nodes[1];
        for (const p of this.food) {
          if (p.life > 0 && (p.x - mx) ** 2 + (p.y - my) ** 2 < mouthR * mouthR) {
            p.life = 0;
            this.events.push({ kind: "eat", x: p.x, y: p.y });
          }
        }
      }

      // Feed.
      if (sh.hunger > 0.15) {
        const mouthR = L * 0.05 + 8;
        const mx = nodes[0];
        const my = nodes[1];
        for (const f of this.fish) {
          if (!f.alive) continue;
          if ((f.x - mx) ** 2 + (f.y - my) ** 2 < mouthR * mouthR) {
            f.alive = false;
            f.respawnAt = time + rand(3, 8);
            sh.hunger = Math.max(0, sh.hunger - 0.16);
            this.events.push({ kind: "eat", x: f.x, y: f.y });
          }
        }
      }
    }
  }

  /**
   * Pick prey in the shark's forward cone, preferring close fish in sparse
   * buckets (stragglers) over fish buried in a dense school.
   */
  private findPrey(sh: Shark): Fish | null {
    const range = sh.length * 0.9 + 160;
    const hx = sh.nodes[0];
    const hy = sh.nodes[1];
    const fx = Math.cos(sh.heading);
    const fy = Math.sin(sh.heading);
    let best: Fish | null = null;
    let bestScore = Infinity;
    let currentScore = Infinity;

    for (const f of this.fish) {
      if (!f.alive) continue;
      const dx = f.x - hx;
      const dy = f.y - hy;
      const d = Math.hypot(dx, dy);
      if (d > range || d < 1e-3) continue;
      const cos = (dx * fx + dy * fy) / d;
      if (cos < 0.2) continue;
      const crowd = this.bucketCount[this.bucketOf(f.x, f.y)];
      const score = d * (1 + (1 - cos) * 0.8) * (1 + crowd * 0.07);
      if (score < bestScore) {
        bestScore = score;
        best = f;
      }
      if (f === sh.target) currentScore = score;
    }
    // Stick with the current target unless something is clearly better.
    if (sh.target && currentScore < bestScore * 1.3) return sh.target;
    return best;
  }

  private respawn() {
    const { time, width: W, height: H } = this;
    const due: Fish[] = [];
    for (const f of this.fish) if (!f.alive && f.respawnAt <= time) due.push(f);
    if (due.length === 0) return;
    if (due.length < 6 && time - this.lastSpawn < 9) return;
    this.lastSpawn = time;

    // A new school swims in from a random edge.
    const side = randInt(0, 3);
    const along = rand(0.15, 0.85);
    const x = side === 0 ? -20 : side === 1 ? W + 20 : along * W;
    const y = side === 2 ? -20 : side === 3 ? H + 20 : along * H;
    const inward = Math.atan2(H / 2 - y, W / 2 - x) + rand(-0.5, 0.5);
    const species = pickSpecies();
    const sp = SPECIES[species];
    const millDir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
    for (const f of due.slice(0, sp.schoolSize[1])) {
      f.alive = true;
      f.species = species;
      f.alarm = 0;
      f.turn = 0;
      f.millDir = millDir;
      f.x = x + rand(-1, 1) * this.perception;
      f.y = y + rand(-1, 1) * this.perception;
      f.vx = Math.cos(inward) * sp.cruise * 1.4;
      f.vy = Math.sin(inward) * sp.cruise * 1.4;
    }
  }
}
