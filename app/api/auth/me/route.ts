// app/api/auth/me/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { redis } from "@/lib/redis";

const COOKIE_NAME = "dokbogi_session";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json({ user: null });
  }

  try {
    const session = await verifySession(token);

    // dokbogi / display 계정은 DB 안 보고 바로 돌려줌
    if (session.studentId === "dokbogi" || session.studentId === "display") {
      return NextResponse.json({
        user: {
          studentId: session.studentId,
          name: session.name,
          role: session.role,
          points: 0,
        },
      });
    }

    const row = await redis.hgetall<Record<string, any>>(
      `user:${session.studentId}`
    );
    if (!row?.studentId) {
      return NextResponse.json({ user: null });
    }

    const name = String(row.name ?? session.name ?? "");
    const pointsRaw = row.points;

    const points =
      typeof pointsRaw === "number"
        ? pointsRaw
        : Number.isFinite(Number(pointsRaw))
        ? Number(pointsRaw)
        : 0;

    const role = String(row.role ?? session.role) as
      | "player"
      | "manager"
      | "display";

    return NextResponse.json({
      user: {
        studentId: session.studentId,
        name,
        role,
        points,
      },
    });
  } catch {
    return NextResponse.json({ user: null });
  }
}
