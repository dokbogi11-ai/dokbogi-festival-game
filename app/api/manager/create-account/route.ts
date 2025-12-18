import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { COOKIE_NAME, verifySession, UserRole } from "@/lib/auth";
import { redis } from "@/lib/redis";

type Body = {
  studentId: string;
  name: string;
  password: string;
  role: "manager" | "display";
};

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const session = await verifySession(token);
  if (session.role !== "manager") {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  const body = (await req.json()) as Partial<Body>;
  const studentId = String(body.studentId ?? "").trim();
  const name = String(body.name ?? "").trim();
  const password = String(body.password ?? "").trim();
  const role = body.role as UserRole;

  if (!/^\d{5}$/.test(studentId)) {
    return NextResponse.json({ error: "학번 형식이 올바르지 않습니다." }, { status: 400 });
  }
  if (!name || !password) {
    return NextResponse.json({ error: "이름과 비밀번호를 입력해 주세요." }, { status: 400 });
  }
  if (role !== "manager" && role !== "display") {
    return NextResponse.json({ error: "역할이 올바르지 않습니다." }, { status: 400 });
  }

  const key = `user:${studentId}`;
  const exists = await redis.exists(key);
  if (exists) {
    return NextResponse.json({ error: "이미 존재하는 계정입니다." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await redis.hset(key, {
    studentId,
    name,
    passwordHash,
    role,
    points: 0,
    createdAt: Date.now(),
  });

  await redis.sadd("users:all", studentId);

  return NextResponse.json({ ok: true });
}
