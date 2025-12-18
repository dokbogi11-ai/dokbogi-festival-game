// lib/horseRace.ts
export const HORSES = 5;

// 달리는 시간
export const RACE_MS = 9000;

// 5초 카운트다운(정지)
export const COUNTDOWN_MS = 5000;

// 아이템 비용
export const COST_CHANGE_GRAPH = 20000;
export const COST_SHUFFLE = 30000;

// 내부 타입(숨김)
export type GraphType = "const" | "linear" | "quad" | "log" | "exp";

// ✅ UI에 노출될 “한국어 이름”
export const GRAPH_NAME_KO: Record<GraphType, string> = {
  const: "등속형",
  linear: "가속형",
  quad: "급가속형",
  log: "초반형",
  exp: "후반형",
};

// 전부 양수로만 생성됨
export type GraphParams =
  | { c: number } // const
  | { a: number; b: number } // linear
  | { a: number; b: number; c: number } // quad
  | { a: number; b: number } // log
  | { a: number; k: number; b: number }; // exp

export type HorseSpec = {
  id: number;
  graph: GraphType;
  params: GraphParams;
};

export type RacePhase = "countdown" | "items" | "racing" | "finished";

export type RaceState = {
  raceId: string;
  studentId: string;
  bet: number;
  pick: number;

  createdAt: number;
  countdownEndsAt: number;
  raceStartsAt: number | null;
  raceEndsAt: number | null;

  phase: RacePhase;
  horses: HorseSpec[];

  settled: boolean;
  winner?: number;
};

// ---------- RNG ----------
export function hashSeed(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rBetween(rng: () => number, lo: number, hi: number) {
  return lo + (hi - lo) * rng();
}

export function pickGraph(rng: () => number): GraphType {
  const list: GraphType[] = ["const", "linear", "quad", "log", "exp"];
  return list[Math.floor(rng() * list.length)];
}

// ✅ 속도 체감 확 올린 파라미터(전부 양수)
export function genParams(type: GraphType, rng: () => number): GraphParams {
  if (type === "const") return { c: rBetween(rng, 0.05, 0.09) };

  if (type === "linear")
    return {
      a: rBetween(rng, 0.010, 0.018),
      b: rBetween(rng, 0.05, 0.08),
    };

  if (type === "quad")
    return {
      a: rBetween(rng, 0.0015, 0.0025),
      b: rBetween(rng, 0.010, 0.018),
      c: rBetween(rng, 0.05, 0.08),
    };

  if (type === "log")
    return {
      a: rBetween(rng, 0.08, 0.12),
      b: rBetween(rng, 0.04, 0.07),
    };

  // exp
  return {
    a: rBetween(rng, 0.03, 0.05),
    k: rBetween(rng, 0.9, 1.3),
    b: rBetween(rng, 0.03, 0.05),
  };
}

// ✅ 모든 말 동일 “초기 속도”
export const BASE_SPEED = 2.2;

// ✅ 가속도(>=0)
export function accelAt(h: HorseSpec, t: number) {
  const g = h.graph;
  const p: any = h.params;

  if (g === "const") return Math.max(0, p.c);
  if (g === "linear") return Math.max(0, p.a * t + p.b);
  if (g === "quad") return Math.max(0, p.a * t * t + p.b * t + p.c);
  if (g === "log") return Math.max(0, p.a * Math.log1p(t) + p.b);

  // exp
  return Math.max(0, p.a * Math.exp(p.k * t) + p.b);
}

// ✅ 누적 거리(절대 뒤로 안 감)
export function distanceAt(h: HorseSpec, tSeconds: number) {
  const dt = 0.02;
  const n = Math.max(0, Math.floor(tSeconds / dt));

  let v = BASE_SPEED;
  let x = 0;

  for (let i = 0; i < n; i++) {
    const t = i * dt;
    const a = accelAt(h, t);
    v += a * dt;
    if (v < 0) v = 0;
    x += v * dt;
  }

  const rem = tSeconds - n * dt;
  if (rem > 0) {
    const t = n * dt;
    const a = accelAt(h, t);
    v += a * rem;
    if (v < 0) v = 0;
    x += v * rem;
  }

  return x;
}

export function computeWinner(state: RaceState) {
  const total = RACE_MS / 1000;
  let bestId = 1;
  let bestDist = -Infinity;

  for (const h of state.horses) {
    const d = distanceAt(h, total);
    if (d > bestDist) {
      bestDist = d;
      bestId = h.id;
    }
  }
  return bestId;
}

// ✅ 셔플: “내 말(pick)” 제외하고만 섞기
export function shuffleHorsesExceptPick(state: RaceState, rng: () => number) {
  const pickId = state.pick;

  const bag = state.horses
    .filter((h) => h.id !== pickId)
    .map((h) => ({ graph: h.graph, params: h.params }));

  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }

  let k = 0;
  state.horses = state.horses.map((h) => {
    if (h.id === pickId) return h;
    const next = bag[k++]!;
    return { ...h, ...next };
  });
}
