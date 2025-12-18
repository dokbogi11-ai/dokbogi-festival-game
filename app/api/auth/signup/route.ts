import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { redis } from "@/lib/redis";

type Body = { studentId: string; password: string; name: string };

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<Body>;
  const studentId = (body.studentId ?? "").trim();
  const password = (body.password ?? "").trim();
  const name = (body.name ?? "").trim();

  if (!/^\d{5}$/.test(studentId)) {
    return NextResponse.json({ error: "학번은 5자리 숫자여야 합니다. (예: 10101)" }, { status: 400 });
  }
  if (name.length < 1 || name.length > 10) {
    return NextResponse.json({ error: "이름은 1~10자로 입력해 주세요." }, { status: 400 });
  }
  if (password.length < 4) {
    return NextResponse.json({ error: "비밀번호는 4자리 이상으로 입력해 주세요." }, { status: 400 });
  }

  const key = `user:${studentId}`;
  const exists = await redis.exists(key);
  if (exists) {
    return NextResponse.json({ error: "이미 가입된 학번입니다." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await redis.hset(key, {
    studentId,
    name,
    passwordHash,
    points: 10000,
    role: "player",
    createdAt: Date.now(),
  });

  await redis.sadd("users:all", studentId); // ✅ 유저 목록 인덱스
  await redis.zadd("ranking:points", { score: 10000, member: studentId });

  return NextResponse.json({ ok: true });
}
