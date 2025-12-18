import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.max(5, Math.min(50, Number(url.searchParams.get("limit") ?? 20)));

  const items = await redis.zrange<any[]>("ranking:points", 0, limit - 1, {
    rev: true,
    withScores: true,
  });

  // items: [member, score, member, score, ...]
  const rows: Array<{ rank: number; studentId: string; name: string; points: number }> = [];
  for (let i = 0; i < items.length; i += 2) {
    const studentId = String(items[i]);
    const points = Number(items[i + 1]);

    const u = await redis.hgetall<Record<string, any>>(`user:${studentId}`);
    const name = String(u?.name ?? "");

    rows.push({
      rank: rows.length + 1,
      studentId,
      name,
      points: Number.isFinite(points) ? points : 0,
    });
  }

  return NextResponse.json({ ranking: rows });
}
