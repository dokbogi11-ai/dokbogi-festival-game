// app/api/game/horse/finish/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { redis } from "@/lib/redis";
import { verifySession, COOKIE_NAME } from "@/lib/auth";

// ───────────────── 타입(루즈하게) ─────────────────

type RaceState = {
  raceId: string;
  userId?: string;
  pick: number;        // 내가 고른 말 번호
  bet: number;         // 베팅 금액
  raceEndsAt: number;  // 경주 종료 시각(ms)
  winner?: number | null;

  // 정산 후 채워지는 값들
  settled?: boolean;
  delta?: number;
  afterPoints?: number | null;
};

type UserCtx =
  | { ok: true; userId: string; userKey: string; points: number }
  | { ok: false; error: string; status: number };

// ───────────────── 공통 유저 컨텍스트 ─────────────────

async function getUserContext(): Promise<UserCtx> {
  // cookies() 타입 때문에 any 캐스팅해서 에러 제거
  const cookieStore = cookies() as any;
  const cookie = cookieStore.get(COOKIE_NAME) as any;
  const token: string = cookie?.value ?? "";

  if (!token) {
    return { ok: false, error: "로그인이 필요합니다.", status: 401 };
  }

  // verifySession 타입도 any로 느슨하게
  const session: any = await (verifySession as any)(token).catch(() => null);
  if (!session) {
    return { ok: false, error: "세션이 유효하지 않습니다.", status: 401 };
  }

  // 프로젝트마다 구조가 다를 수 있으니 안전하게 여러 케이스 체크
  const userId: string =
    session.user?.id ??
    session.user?.studentId ??
    session.studentId ??
    session.id;

  if (!userId) {
    return {
      ok: false,
      error: "사용자 정보를 찾을 수 없습니다.",
      status: 401,
    };
  }

  const userKey = `user:${userId}`;

  // hgetall 결과도 any로 캐스팅
  const rawUser = (await redis.hgetall(userKey)) as any;
  const points = Number(rawUser?.points ?? 0);

  if (!Number.isFinite(points)) {
    return {
      ok: false,
      error: "포인트 정보가 잘못되었습니다.",
      status: 500,
    };
  }

  return { ok: true, userId, userKey, points };
}

// ───────────────── 정산 엔드포인트 ─────────────────

export async function POST(req: Request) {
  try {
    const ctx = await getUserContext();

    if (!ctx.ok) {
      return NextResponse.json(
        { ok: false, error: ctx.error },
        { status: ctx.status }
      );
    }

    const { userId, userKey, points: currentPoints } = ctx;

    const body: any = await req.json().catch(() => null);
    const raceId = String(body?.raceId ?? "");

    if (!raceId) {
      return NextResponse.json(
        { ok: false, error: "raceId가 필요합니다." },
        { status: 400 }
      );
    }

    const raceKey = `horse:race:${raceId}`;
    const raw = (await redis.get(raceKey)) as string | null;

    if (!raw) {
      return NextResponse.json(
        { ok: false, error: "경기를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // 여기서 RaceState로 캐스팅 → 아래에서 raceEndsAt, settled 등 정상 인식됨
    const state = JSON.parse(raw) as RaceState;

    // 경기 주인 확인 (있으면)
    if (state.userId && state.userId !== userId) {
      return NextResponse.json(
        { ok: false, error: "자신의 경기만 정산할 수 있습니다." },
        { status: 403 }
      );
    }

    const now = Date.now();

    // 아직 안 끝났으면 정산 불가
    if (now < state.raceEndsAt) {
      return NextResponse.json(
        { ok: false, error: "경기가 아직 종료되지 않았습니다." },
        { status: 400 }
      );
    }

    // 이미 정산된 경기라면 저장된 값 그대로 반환
    if (state.settled && typeof state.afterPoints === "number") {
      return NextResponse.json({
        ok: true,
        settled: true,
        winner: state.winner,
        delta: state.delta ?? 0,
        points: state.afterPoints,
      });
    }

    // ── 승패 및 배당 계산 ──
    const bet = Number(state.bet ?? 0);
    const pick = Number(state.pick ?? 0);

    // winner가 저장 안 되어 있으면 랜덤으로라도 하나 찍음 (최소 한 마리는 승자)
    let winner = Number(state.winner ?? NaN);
    if (!Number.isFinite(winner) || winner < 1 || winner > 5) {
      winner = Math.floor(Math.random() * 5) + 1; // 1~5
    }

    const win = pick === winner;
    // 이기면 +bet, 지면 -bet (배당 2배 = 원금+이익 기준이면 bet*2 쓰면 됨. 너가 쓰던 쪽으로 맞춰도 됨)
    const delta = win ? bet : -bet;
    const newPoints = currentPoints + delta;

    // ── 포인트 / 경기 상태 저장 ──
    await redis.hset(userKey, { points: String(newPoints) });

    const newState: RaceState = {
      ...state,
      winner,
      settled: true,
      delta,
      afterPoints: newPoints,
    };

    await redis.set(raceKey, JSON.stringify(newState), { ex: 60 * 10 });

    return NextResponse.json({
      ok: true,
      settled: true,
      win,
      winner,
      delta,
      points: newPoints,
    });
  } catch (err) {
    console.error("[horse/finish] error", err);
    return NextResponse.json(
      { ok: false, error: "정산에 실패했습니다." },
      { status: 500 }
    );
  }
}
