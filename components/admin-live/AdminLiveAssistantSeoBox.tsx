"use client";

// [2026-10-22 AI 비서 6단계] 유튜브 SEO — 방송 고르기 → 「만들기」 → 제목 3개·설명란(챕터 포함)·태그, 각각 「복사」.
//   읽기 전용(방송 상품·「소개」 기록으로 계산). 유튜브에 올리는 건 사장님이 복사해서 직접.
//   DESIGN-ADMIN: 주버튼 1개(「만들기」) · 보조 36 · 이모지 없음 · 설명 한 줄.

import { useEffect, useState } from "react";

type Bc = { id: string; title: string; startedAt: string; endedAt: string | null; status: string };
type Seo = {
  via: string;
  broadcast: { id: string; title: string; dateLabel: string; youtubeUrl: string };
  productCount: number;
  chapters: { seconds: number; label: string }[];
  chaptersText: string;
  titles: string[];
  description: string;
  tags: string[];
};

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
function dateLabel(iso: string): string {
  const d = new Date(Date.parse(iso) + 9 * 3600 * 1000);
  if (!Number.isFinite(d.getTime())) return "";
  return `${d.getUTCMonth() + 1}.${String(d.getUTCDate()).padStart(2, "0")}(${WEEK[d.getUTCDay()]})`;
}

export default function AdminLiveAssistantSeoBox() {
  const [list, setList] = useState<Bc[]>([]);
  const [selected, setSelected] = useState("");
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [seo, setSeo] = useState<Seo | null>(null);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    void fetch("/api/admin-live/assistant-seo", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d?.ok) { setList(d.broadcasts || []); if (d.broadcasts?.[0]) setSelected(d.broadcasts[0].id); } })
      .catch(() => setError("방송 목록을 못 불러왔어요. 잠시 뒤 다시 열어 주세요."));
  }, []);

  async function make() {
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    setSeo(null);
    try {
      const q = new URLSearchParams({ broadcastId: selected, extra });
      const res = await fetch(`/api/admin-live/assistant-seo?${q.toString()}`, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) { setError(data?.message || "만들지 못했어요. 잠시 뒤 다시 눌러 주세요."); return; }
      setSeo(data);
    } catch {
      setError("연결이 끊겼어요. 잠시 뒤 다시 눌러 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(key: string, value: string) {
    try { await navigator.clipboard.writeText(value); setCopied(key); setTimeout(() => setCopied(""), 1500); } catch { setError("복사하지 못했어요. 글자를 길게 눌러 복사해 주세요."); }
  }

  const CopyBtn = ({ k, v }: { k: string; v: string }) => (
    <button type="button" onClick={() => void copy(k, v)} className="h-9 shrink-0 rounded-lg border border-line bg-surface px-3 text-[13px] font-semibold text-ink transition hover:bg-surface-2">
      {copied === k ? "복사됨" : "복사"}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <label className="block text-[13px] font-semibold text-ink">방송</label>
        <select value={selected} onChange={(e) => setSelected(e.target.value)} aria-label="방송 고르기"
          className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-[14px] text-ink outline-none focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-ink">
          {list.length === 0 ? <option value="">불러오는 중</option> : null}
          {list.map((b) => <option key={b.id} value={b.id}>{dateLabel(b.startedAt)} {b.title}{b.status === "on" || b.status === "ON" ? " · 방송 중" : ""}</option>)}
        </select>
        <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="강조할 말(선택) 예: 프라다 반값, 오늘만 무료배송" aria-label="강조할 말"
          className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-[16px] text-ink outline-none placeholder:text-ink-mute focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-ink md:text-[14px]" />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] text-ink-mute">그 방송에 담은 상품과 「소개」 기록으로 만들어요.</span>
          <button type="button" onClick={() => void make()} disabled={busy || !selected}
            className="h-10 shrink-0 rounded-lg bg-ink px-4 text-[14px] font-bold text-white transition disabled:opacity-40">
            {busy ? "만드는 중" : "만들기"}
          </button>
        </div>
        {error ? <p className="text-[13px] font-semibold text-danger-tx">{error}</p> : null}
      </div>

      {seo ? (
        <div className="space-y-3">
          <p className="text-[12px] text-ink-mute">{seo.broadcast.dateLabel} · 상품 {seo.productCount}개 · 챕터 {seo.chapters.length}개{seo.via === "rule" ? " · AI 없이 기본 문구" : ""}</p>

          <section className="space-y-1.5">
            <h3 className="text-[14px] font-bold text-ink">제목</h3>
            {seo.titles.map((t, i) => (
              <div key={i} className="flex items-start gap-2 rounded-xl border border-line bg-surface p-3">
                <p className="min-w-0 flex-1 break-words text-[14px] text-ink">{t}</p>
                <CopyBtn k={`t${i}`} v={t} />
              </div>
            ))}
          </section>

          <section className="space-y-1.5">
            <div className="flex items-center justify-between">
              <h3 className="text-[14px] font-bold text-ink">설명란</h3>
              <CopyBtn k="desc" v={seo.description} />
            </div>
            <pre className="whitespace-pre-wrap break-words rounded-xl border border-line bg-surface p-3 font-sans text-[13px] leading-relaxed text-ink">{seo.description}</pre>
            {seo.chapters.length > 0 && seo.chapters.length < 3 ? <p className="text-[12px] text-ink-mute">챕터는 「소개」를 3번 이상 눌러야 유튜브에 표시돼요.</p> : null}
          </section>

          <section className="space-y-1.5">
            <div className="flex items-center justify-between">
              <h3 className="text-[14px] font-bold text-ink">태그 <span className="font-semibold text-ink-mute tabular-nums">{seo.tags.length}</span></h3>
              <CopyBtn k="tags" v={seo.tags.join(", ")} />
            </div>
            <p className="rounded-xl border border-line bg-surface p-3 text-[13px] text-ink">{seo.tags.join(", ")}</p>
          </section>
        </div>
      ) : null}
    </div>
  );
}
