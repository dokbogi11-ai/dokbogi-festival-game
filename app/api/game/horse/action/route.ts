// app/api/game/horse/action/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { redis } from "@/lib/redis";
import { verifySession, COOKIE_NAME } from "@/lib/auth";

type RaceState = {
  raceId: string;
  userId?: string;
  pick: number;
  bet: number;
  raceEndsAt: number;
  items?: { type: string; at: number }[];
};

type UserCtx =
  | { ok: true; userId: string; userKey: string; points: number }
  | { ok: false; error: string; status: number };

// ───────────────── 유저 컨텍스트 ─────────────────

async function getUserContext(): Promise<UserCtx> {
  const cookieStore = cookies() as any;
  const cookie = cookieStore.get(COOKIE_NAME) as any;
  const token: string = cookie?.value ?? "";

  if (!token) {
    return { ok: false, error: "로그인이 필요합니다.", status: 401 };
  }

  const session: any = await (verifySession as any)(token).catch(() => null);
  if (!session) {
    return { ok: false, error: "세션이 유효하지 않습니다.", status: 401 };
  }

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

// ───────────────── 아이템 사용 엔드포인트 ─────────────────

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
    const type = String(body?.type ?? "");
    const cost = Number(body?.cost ?? 0);

    if (!raceId) {
      return NextResponse.json(
        { ok: false, error: "raceId가 필요합니다." },
        { status: 400 }
      );
    }

    if (!type) {
      return NextResponse.json(
        { ok: false, error: "아이템 타입이 필요합니다." },
        { status: 400 }
      );
    }

    if (!Number.isFinite(cost) || cost <= 0) {
      return NextResponse.json(
        { ok: false, error: "아이템 비용이 잘못되었습니다." },
        { status: 400 }
      );
    }

    const raceKey = `horse:race:${raceId}`;

    // redis.get 결과를 any로 받아서 타입스크립트 입을 막음
    const raw: any = await redis.get(raceKey);

    if (!raw) {
      return NextResponse.json(
        { ok: false, error: "경기 상태를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // ✅ JSON.parse에 확실히 string을 넣도록 처리
    const state = (typeof raw === "string"
      ? JSON.parse(raw)
      : JSON.parse(String(raw))) as RaceState;

    // 경기 주인 확인 (있으면)
    if (state.userId && state.userId !== userId) {
      return NextResponse.json(
        { ok: false, error: "자신의 경기에서만 아이템을 사용할 수 있습니다." },
        { status: 403 }
      );
    }

    const now = Date.now();
    if (now >= state.raceEndsAt) {
      return NextResponse.json(
        { ok: false, error: "경기가 이미 종료되었습니다." },
        { status: 400 }
      );
    }

    // 포인트 차감
    const newPoints = currentPoints - cost;
    if (newPoints < 0) {
      return NextResponse.json(
        { ok: false, error: "포인트가 부족합니다." },
        { status: 400 }
      );
    }

    await redis.hset(userKey, { points: String(newPoints) });

    // 경기 상태에 아이템 내역 추가
    const newState: RaceState = {
      ...state,
      items: [...(state.items ?? []), { type, at: now }],
    };

    await redis.set(raceKey, JSON.stringify(newState), { ex: 60 * 10 });

    return NextResponse.json({
      ok: true,
      used: type,
      points: newPoints,
    });
  } catch (err) {
    console.error("[horse/action] error", err);
    return NextResponse.json(
      { ok: false, error: "아이템 적용에 실패했습니다." },
      { status: 500 }
    );
  }
}
