// app/api/game/horse/settle/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { redis } from "@/lib/redis";
import { verifySession, COOKIE_NAME } from "@/lib/auth";

type UserPointsCtx =
  | { ok: true; userKey: string; points: number }
  | { ok: false; status: number; error: string };

async function getUserIdFromCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value ?? "";
  if (!token) return null;

  try {
    const session: any = await verifySession(token);
    const studentId = String(session?.studentId ?? "");
    if (!studentId) return null;
    return studentId;
  } catch {
    return null;
  }
}

// 세션(쿠키) 기준으로 유저 찾고 포인트 읽기
async function getUserPointsCtx(): Promise<UserPointsCtx> {
  try {
    const userId = await getUserIdFromCookie();
    if (!userId) {
      return {
        ok: false,
        status: 401,
        error: "로그인이 필요합니다.",
      };
    }

    const userKey = `user:${userId}`;
    const rawUser = (await redis.hgetall(userKey)) as any;
    const pts = Number(rawUser?.points ?? 0);

    if (!Number.isFinite(pts)) {
      return {
        ok: false,
        status: 500,
        error: "포인트 정보가 잘못되었습니다.",
      };
    }

    return { ok: true, userKey, points: pts };
  } catch (err) {
    console.error("[horse/settle] getUserPointsCtx error", err);
    return {
      ok: false,
      status: 500,
      error: "사용자 정보를 불러오는 중 오류가 발생했습니다.",
    };
  }
}

export async function POST(req: Request) {
  try {
    const body: any = await req.json().catch(() => null);

    const delta = Number(body?.delta ?? NaN);
    if (!Number.isFinite(delta) || delta === 0) {
      return NextResponse.json(
        { ok: false, error: "유효하지 않은 포인트 변경 값입니다." },
        { status: 400 }
      );
    }

    const ctx = await getUserPointsCtx();
    if (!ctx.ok) {
      return NextResponse.json(
        { ok: false, error: ctx.error },
        { status: ctx.status }
      );
    }

    const { userKey, points } = ctx;
    const newPoints = points + delta;

    await redis.hset(userKey, { points: String(newPoints) });

    return NextResponse.json({ ok: true, points: newPoints });
  } catch (err) {
    console.error("[horse/settle] POST error", err);
    return NextResponse.json(
      { ok: false, error: "포인트 정산에 실패했습니다." },
      { status: 500 }
    );
  }
}
