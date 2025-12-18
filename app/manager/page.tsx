"use client";

import { useEffect, useMemo, useState } from "react";

type UserRow = {
  studentId: string;
  name: string;
  role: "player" | "manager" | "display";
  points: number;
};

function nf(n: number) {
  try { return new Intl.NumberFormat("ko-KR").format(n); } catch { return String(n); }
}

export default function ManagerPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const [editId, setEditId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");

  async function load() {
    setMsg(null);
    setLoading(true);
    try {
      const res = await fetch("/api/manager/users", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data?.error ?? "목록을 불러올 수 없습니다.");
        setUsers([]);
        return;
      }
      setUsers(data.users ?? []);
    } catch (e: any) {
      setMsg(String(e?.message ?? e));
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return users;
    return users.filter(u =>
      u.studentId.includes(t) ||
      u.name.toLowerCase().includes(t) ||
      u.role.toLowerCase().includes(t)
    );
  }, [users, q]);

  async function setPoints(studentId: string, value: number) {
    setMsg(null);
    const res = await fetch("/api/manager/points", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, mode: "set", value }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data?.error ?? "포인트 변경에 실패했습니다.");
      return;
    }
    await load();
  }

  async function addPoints(studentId: string, delta: number) {
    setMsg(null);
    const res = await fetch("/api/manager/points", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, mode: "delta", value: delta }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data?.error ?? "포인트 변경에 실패했습니다.");
      return;
    }
    await load();
  }

  async function removeUser(studentId: string) {
    setMsg(null);
    const ok = window.confirm(`${studentId} 계정을 삭제하시겠습니까?`);
    if (!ok) return;

    const res = await fetch("/api/manager/users/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data?.error ?? "삭제에 실패했습니다.");
      return;
    }
    await load();
  }

  function openEdit(u: UserRow) {
    setEditId(u.studentId);
    setEditValue(String(u.points));
  }

  async function applyEdit() {
    if (!editId) return;
    const n = Number(editValue);
    if (!Number.isFinite(n)) {
      setMsg("포인트 값이 올바르지 않습니다.");
      return;
    }
    await setPoints(editId, n);
    setEditId(null);
    setEditValue("");
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto max-w-6xl px-8 py-10">
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-emerald-300 via-emerald-400 to-emerald-600 shadow-[0_0_28px_rgba(34,197,94,0.28)] grid place-items-center font-black text-black">
              독
            </div>
            <div>
              <div className="text-xs text-white/60">MANAGER</div>
              <div className="text-2xl font-black tracking-tight">
                <span className="text-emerald-300">독보기</span> 운영 콘솔
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="검색 (학번 / 이름 / 역할)"
              className="w-[380px] rounded-2xl bg-neutral-900/70 border border-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-400/60"
            />
            <button
              onClick={load}
              className="rounded-2xl px-5 py-3 font-bold border border-white/10 bg-white/5 hover:bg-white/10"
            >
              새로고침
            </button>
          </div>
        </div>

        {msg && (
          <div className="mt-6 rounded-2xl border border-white/10 bg-black/40 p-4 text-sm text-white/85">
            {msg}
          </div>
        )}

        <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-[0_12px_60px_rgba(0,0,0,0.60)] overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
            <div className="text-sm text-white/70">
              {loading ? "불러오는 중입니다…" : `총 ${filtered.length}명`}
            </div>

            {editId && (
              <div className="flex items-center gap-2">
                <div className="text-sm text-white/70">포인트 설정:</div>
                <input
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="w-40 rounded-xl bg-neutral-900/70 border border-white/10 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-400/60"
                />
                <button
                  onClick={applyEdit}
                  className="rounded-xl px-4 py-2 font-bold bg-gradient-to-r from-emerald-300 via-emerald-400 to-emerald-600 text-black"
                >
                  적용
                </button>
                <button
                  onClick={() => { setEditId(null); setEditValue(""); }}
                  className="rounded-xl px-4 py-2 font-bold border border-white/10 bg-white/5 hover:bg-white/10"
                >
                  취소
                </button>
              </div>
            )}
          </div>

          <table className="w-full text-sm">
            <thead className="text-white/70">
              <tr className="border-b border-white/10">
                <th className="text-left px-6 py-3">학번</th>
                <th className="text-left px-6 py-3">이름</th>
                <th className="text-left px-6 py-3">역할</th>
                <th className="text-right px-6 py-3">포인트</th>
                <th className="text-right px-6 py-3">작업</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((u) => (
                <tr key={u.studentId} className="border-b border-white/5 hover:bg-white/5 transition">
                  <td className="px-6 py-4 font-semibold">{u.studentId}</td>
                  <td className="px-6 py-4">{u.name}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-emerald-200">
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-extrabold text-emerald-200">{nf(u.points)}</td>
                  <td className="px-6 py-4">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => openEdit(u)}
                        className="rounded-xl px-3 py-2 font-bold border border-white/10 bg-white/5 hover:bg-white/10"
                      >
                        설정
                      </button>
                      <button
                        onClick={() => addPoints(u.studentId, 1000)}
                        className="rounded-xl px-3 py-2 font-bold border border-emerald-400/20 bg-emerald-400/10 hover:bg-emerald-400/15 text-emerald-200"
                      >
                        +1000
                      </button>
                      <button
                        onClick={() => addPoints(u.studentId, -1000)}
                        className="rounded-xl px-3 py-2 font-bold border border-white/10 bg-black/40 hover:bg-white/5 text-white/80"
                      >
                        -1000
                      </button>
                      <button
                        onClick={() => removeUser(u.studentId)}
                        className="rounded-xl px-3 py-2 font-bold border border-red-500/20 bg-red-500/10 hover:bg-red-500/15 text-red-200"
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-white/60">
                    표시할 데이터가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
