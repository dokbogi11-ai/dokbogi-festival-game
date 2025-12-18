"use client";

import { useEffect, useState } from "react";

type Row = {
  rank: number;
  studentId: string;
  name: string;
  points: number;
};

function nf(n: number) {
  try { return new Intl.NumberFormat("ko-KR").format(n); } catch { return String(n); }
}

export default function DisplayPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const res = await fetch("/api/display/ranking?limit=20", { cache: "no-store" });
    const data = await res.json();
    setRows(data.ranking ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, []);

  const top1 = rows[0];
  const top2 = rows[1];
  const top3 = rows[2];
  const rest = rows.slice(3);

  return (
    <div className="min-h-screen bg-neutral-950 text-white relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-45">
        <div className="absolute -top-40 -left-40 h-[720px] w-[720px] rounded-full bg-emerald-500 blur-[160px]" />
        <div className="absolute -bottom-56 -right-56 h-[820px] w-[820px] rounded-full bg-emerald-900 blur-[180px]" />
      </div>

      <div className="relative h-screen w-screen px-10 py-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-3xl bg-gradient-to-br from-emerald-300 via-emerald-400 to-emerald-600 shadow-[0_0_36px_rgba(34,197,94,0.28)] grid place-items-center font-black text-black text-2xl">
              독
            </div>
            <div>
              <div className="text-sm text-white/60 tracking-widest">BUGIL Academic Arts Festival</div>
              <div className="text-4xl font-black tracking-tight">
                <span className="text-emerald-300">실시간</span> 랭킹
              </div>
            </div>
          </div>

          <div className="text-right">
            <div className="text-sm text-white/60">{loading ? "불러오는 중입니다…" : "자동 갱신 중"}</div>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-3 gap-6">
          <div className="rounded-3xl border border-emerald-400/25 bg-emerald-400/10 p-7 shadow-[0_0_50px_rgba(34,197,94,0.18)]">
            <div className="text-sm text-white/65">1위</div>
            <div className="mt-2 text-5xl font-black">{top1 ? (top1.name || top1.studentId) : "—"}</div>
            <div className="mt-2 text-xl text-white/75">{top1 ? top1.studentId : ""}</div>
            <div className="mt-6 text-6xl font-black text-emerald-300">{top1 ? nf(top1.points) : "0"}</div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-7 backdrop-blur-xl">
            <div className="text-sm text-white/65">2위</div>
            <div className="mt-2 text-4xl font-black">{top2 ? (top2.name || top2.studentId) : "—"}</div>
            <div className="mt-2 text-lg text-white/70">{top2 ? top2.studentId : ""}</div>
            <div className="mt-6 text-5xl font-black text-emerald-200">{top2 ? nf(top2.points) : "0"}</div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-7 backdrop-blur-xl">
            <div className="text-sm text-white/65">3위</div>
            <div className="mt-2 text-4xl font-black">{top3 ? (top3.name || top3.studentId) : "—"}</div>
            <div className="mt-2 text-lg text-white/70">{top3 ? top3.studentId : ""}</div>
            <div className="mt-6 text-5xl font-black text-emerald-200">{top3 ? nf(top3.points) : "0"}</div>
          </div>
        </div>

        <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl overflow-hidden">
          <div className="grid grid-cols-[140px_1fr_220px] px-8 py-4 border-b border-white/10 text-white/70">
            <div>순위</div>
            <div>참가자</div>
            <div className="text-right">포인트</div>
          </div>

          <div className="divide-y divide-white/5">
            {rest.map((r) => (
              <div key={r.studentId} className="grid grid-cols-[140px_1fr_220px] px-8 py-5 hover:bg-white/5 transition">
                <div className="text-2xl font-black text-white/85">{r.rank}위</div>
                <div>
                  <div className="text-2xl font-extrabold">{r.name || r.studentId}</div>
                  <div className="text-sm text-white/60 mt-1">{r.studentId}</div>
                </div>
                <div className="text-right text-3xl font-black text-emerald-200">{nf(r.points)}</div>
              </div>
            ))}

            {!loading && rows.length === 0 && (
              <div className="px-8 py-12 text-center text-white/60">
                표시할 데이터가 없습니다.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
