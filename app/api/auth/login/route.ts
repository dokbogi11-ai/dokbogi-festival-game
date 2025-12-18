import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { redis } from "@/lib/redis";
import { COOKIE_NAME, sessionCookieOptions, signSession, UserRole } from "@/lib/auth";

type Body = {
  studentId: string;
  password: string;
  role?: UserRole;
};

const MASTER_ACCOUNTS = {
  dokbogi: {
    password: "admin",
    role: "manager" as const,
    name: "독보기 관리자",
  },
  display: {
    password: "display",
    role: "display" as const,
    name: "전광판",
  },
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<Body>;
    const studentId = String(body.studentId ?? "").trim();
    const password = String(body.password ?? "").trim();
    const desiredRole = (body.role ?? "player") as UserRole;

    if (!studentId || !password) {
      return NextResponse.json({ error: "아이디와 비밀번호를 입력해 주세요." }, { status: 400 });
    }

    if (studentId in MASTER_ACCOUNTS) {
      const master = MASTER_ACCOUNTS[studentId as keyof typeof MASTER_ACCOUNTS];

      if (password !== master.password) {
        return NextResponse.json(
          { error: "아이디 또는 비밀번호가 올바르지 않습니다." },
          { status: 401 }
        );
      }

      if (desiredRole !== master.role) {
        return NextResponse.json(
          { error: "선택하신 역할로는 로그인하실 수 없습니다." },
          { status: 403 }
        );
      }

      const token = await signSession({
        studentId,
        name: master.name,
        role: master.role,
      });

      const res = NextResponse.json({ ok: true, role: master.role, name: master.name });
      res.cookies.set(COOKIE_NAME, token, sessionCookieOptions());
      return res;
    }

    if (!/^\d{5}$/.test(studentId)) {
      return NextResponse.json({ error: "학번 형식이 올바르지 않습니다." }, { status: 400 });
    }

    const user = await redis.hgetall<Record<string, any>>(`user:${studentId}`);
    if (!user?.passwordHash) {
      return NextResponse.json({ error: "학번 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
    }

    const ok = await bcrypt.compare(password, String(user.passwordHash));
    if (!ok) {
      return NextResponse.json({ error: "학번 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
    }

    const role = (String(user.role) as UserRole) || "player";
    const name = String(user.name ?? "");

    if (!name) {
      return NextResponse.json({ error: "가입 정보에 이름이 없습니다." }, { status: 400 });
    }

    if (desiredRole !== role) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    const token = await signSession({ studentId, name, role });

    const res = NextResponse.json({ ok: true, role, name });
    res.cookies.set(COOKIE_NAME, token, sessionCookieOptions());
    return res;
  } catch (e: any) {
    return NextResponse.json(
      { error: `서버 오류: ${String(e?.message ?? e)}` },
      { status: 500 }
    );
  }
}
