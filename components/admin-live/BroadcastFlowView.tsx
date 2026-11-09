"use client";

// [2026-11-09 사장님 「방송 끝나면 자동 분석표 — 지나가던 사람도 이렇구나·이렇게 하면 되겠구나 쉽게」]
//   판매분석 › 방송 › 「방송 흐름」. 맨 위 = 결론(있었던 일·다음 방송에 해 볼 것), 그다음 그래프 → 상품별 → 시간 순서(접힘) → 10분 표(접힘).
//   읽기 전용(/api/admin-live/broadcast-flow). 결론 문장은 서버가 숫자에서 정해진 규칙으로 만든 것(짐작·AI 없음).

import { useEffect, useMemo, useState } from "react";

type Seg = { kind: "intro" | "pick" | "unknown"; label: string; from: number; to: number; minutes: number; viewerStart: number | null; viewerEnd: number | null; viewerMax: number | null; chat: number; orders: number; ordersMine: number; goodsMine: number };
type Prod = { key: string; label: string; code: string; introMinutes: number; pickMinutes: number; qty: number; paidGoods: number; buyers: number; qtyDuring: number; chatMentions: number; viewerDelta: number | null };
type Bin = { from: number; viewerAvg: number | null; viewerMax: number | null; siteAvg: number | null; chat: number; orders: number; paidGoods: number };
type Flow = { hasSamples: boolean; totalMinutes: number; introMinutes: number; pickMinutes: number; unknownMinutes: number; segments: Seg[]; products: Prod[]; bins: Bin[]; findings: string[]; nextSteps: string[] };
type Payload = { ok: boolean; error?: string; broadcast?: { title: string; startedAt: string; endedAt: string; live: boolean }; samplesCount?: number; chart?: Array<{ t: number; v: number | null; s: number }>; flow?: Flow };

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
const hm = (ms: number) => new Date(ms).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" });
const KIND_LABEL = { intro: "소개", pick: "고른 상품 순환", unknown: "확인 안 됨" } as const;

function Chart({ flow, samples }: { flow: Flow; samples: Array<{ t: number; v: number | null; s: number }> }) {
  const W = 760, H = 200, P = 28;
  const start = flow.segments[0]?.from ?? 0;
  const end = flow.segments[flow.segments.length - 1]?.to ?? start + 60_000;
  const x = (t: number) => P + ((t - start) / Math.max(1, end - start)) * (W - P * 2);
  const maxY = Math.max(5, ...samples.map((s) => s.v ?? 0), ...samples.map((s) => s.s), ...flow.bins.map((b) => b.orders));
  const y = (v: number) => H - P - (v / maxY) * (H - P * 2);
  const line = (key: "v" | "s") => samples.filter((s) => s[key] !== null).map((s, i) => `${i ? "L" : "M"}${x(s.t).toFixed(1)},${y(s[key] as number).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="시간에 따른 시청자·사이트 접속·주문">
      {flow.segments.filter((s) => s.kind !== "unknown").map((s, i) => (
        <rect key={i} x={x(s.from)} y={P - 8} width={Math.max(1, x(s.to) - x(s.from))} height={H - P * 2 + 8} fill={s.kind === "intro" ? "var(--color-info-bg, #E8F1FB)" : "var(--color-ok-bg, #E7F5EE)"} />
      ))}
      <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#D9D9D9" />
      {flow.hasSamples ? <path d={line("v")} fill="none" stroke="#111111" strokeWidth={2} /> : null}
      {flow.hasSamples ? <path d={line("s")} fill="none" stroke="#9A9A9A" strokeWidth={1.5} strokeDasharray="4 3" /> : null}
      {flow.bins.map((b, i) => b.orders > 0 ? <rect key={i} x={x(b.from) + 2} y={y(b.orders)} width={Math.max(2, x(b.from + 600_000) - x(b.from) - 4)} height={H - P - y(b.orders)} fill="#D30005" opacity={0.25} /> : null)}
      {[0, 0.25, 0.5, 0.75, 1].map((f) => { const t = start + (end - start) * f; return <text key={f} x={x(t)} y={H - 8} fontSize={11} textAnchor="middle" fill="#707072">{hm(t)}</text>; })}
      <text x={P} y={14} fontSize={11} fill="#707072">최대 {maxY}</text>
    </svg>
  );
}

export default function BroadcastFlowView({ broadcastId }: { broadcastId: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true); setData(null);
    fetch(`/api/admin-live/broadcast-flow?broadcastId=${encodeURIComponent(broadcastId)}`, { cache: "no-store" })
      .then((r) => r.json()).then((j: Payload) => { if (alive) setData(j); })
      .catch((e) => { if (alive) setData({ ok: false, error: String(e) }); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [broadcastId]);

  const flow = data?.flow;
  const sortedSegs = useMemo(() => flow?.segments ?? [], [flow]);
  if (loading) return <p role="status" className="py-8 text-center text-[13px] text-ink-mute">방송 흐름을 계산하는 중… (주문이 많으면 10초쯤 걸려요)</p>;
  if (!data) return null;
  if (!data.ok || !flow) return <p role="alert" className="py-8 text-center text-[13px] text-danger-tx">방송 흐름을 못 만들었어요: {data.error || "알 수 없는 오류"}</p>;

  return (
    <div className="mt-4 grid gap-4">
      {/* 1. 결론 */}
      <section className="rounded-xl border border-line bg-surface p-4">
        <h4 className="text-[16px] font-bold text-ink">이번 방송, 한눈에</h4>
        <ul className="mt-2 grid gap-1.5 text-[14px] leading-relaxed text-ink">
          {flow.findings.map((f, i) => <li key={i}>· {f}</li>)}
        </ul>
        {flow.nextSteps.length ? (
          <div className="mt-3 rounded-lg bg-surface-2 p-3">
            <div className="text-[13px] font-bold text-ink">다음 방송에 해 볼 것</div>
            <ol className="mt-1 grid gap-1 text-[14px] leading-relaxed text-ink">
              {flow.nextSteps.map((f, i) => <li key={i}>{i + 1}. {f}</li>)}
            </ol>
          </div>
        ) : null}
        <p className="mt-2 text-[12px] text-ink-mute">「보여 준 상품」은 사장님이 「소개」를 누른 상품과 골라서 순환한 상품만 셌어요. 전체 순환은 「확인 안 됨」이에요. 금액은 결제완료 상품금액(배송비 빼고)이에요.</p>
      </section>

      {/* 2. 그래프 */}
      <section className="rounded-xl border border-line bg-surface p-4">
        <h4 className="text-[16px] font-bold text-ink">시간 흐름</h4>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-mute">
          {flow.hasSamples ? <><span><span className="mr-1 inline-block h-0.5 w-4 bg-ink align-middle" />유튜브 시청자</span><span><span className="mr-1 inline-block h-0.5 w-4 border-t border-dashed border-ink-mute align-middle" />사이트 접속</span></> : <span>이 방송은 1분 기록이 없던 때라 시청자 선은 없어요</span>}
          <span><span className="mr-1 inline-block h-3 w-3 bg-[#D30005] opacity-25 align-middle" />10분마다 주문 수</span>
          <span><span className="mr-1 inline-block h-3 w-3 bg-info-bg align-middle" />소개</span>
          <span><span className="mr-1 inline-block h-3 w-3 bg-ok-bg align-middle" />고른 상품 순환</span>
        </div>
        <div className="mt-2"><Chart flow={flow} samples={data.chart || []} /></div>
      </section>

      {/* 3. 상품별 */}
      <section className="rounded-xl border border-line bg-surface p-4">
        <h4 className="text-[16px] font-bold text-ink">상품별</h4>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px] tabular-nums">
            <thead><tr className="text-left text-[12px] text-ink-mute">
              <th className="py-1.5 font-normal">상품</th>
              <th className="py-1.5 text-right font-normal">보여 준 시간</th>
              <th className="py-1.5 text-right font-normal">팔린 개수</th>
              <th className="py-1.5 text-right font-normal">결제 금액</th>
              <th className="py-1.5 text-right font-normal">보여 줄 때 팔림</th>
              {flow.hasSamples ? <th className="py-1.5 text-right font-normal">채팅 언급</th> : null}
              {flow.hasSamples ? <th className="py-1.5 text-right font-normal">소개 중 시청자</th> : null}
            </tr></thead>
            <tbody>
              {flow.products.map((p) => (
                <tr key={p.key} className="border-t border-line">
                  <td className="py-1.5 text-ink">{p.label}</td>
                  <td className="py-1.5 text-right">{p.introMinutes || p.pickMinutes ? `${p.introMinutes ? `소개 ${p.introMinutes}분` : ""}${p.introMinutes && p.pickMinutes ? " · " : ""}${p.pickMinutes ? `순환 ${p.pickMinutes}분` : ""}` : <span className="text-ink-mute">안 보여 줌</span>}</td>
                  <td className={`py-1.5 text-right ${p.qty === 0 ? "text-danger-tx" : "text-ink"}`}>{p.qty}개</td>
                  <td className="py-1.5 text-right tabular-nums">{won(p.paidGoods)}</td>
                  <td className="py-1.5 text-right">{p.introMinutes || p.pickMinutes ? `${p.qtyDuring}개` : "-"}</td>
                  {flow.hasSamples ? <td className="py-1.5 text-right">{p.code ? `${p.chatMentions}번` : "-"}</td> : null}
                  {flow.hasSamples ? <td className={`py-1.5 text-right ${p.viewerDelta !== null && p.viewerDelta < 0 ? "text-danger-tx" : p.viewerDelta ? "text-ok-tx" : ""}`}>{p.viewerDelta === null ? "-" : `${p.viewerDelta > 0 ? "+" : ""}${p.viewerDelta}명`}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 4. 시간 순서 */}
      <details className="rounded-xl border border-line bg-surface p-4">
        <summary className="cursor-pointer text-[16px] font-bold text-ink">시간 순서로 보기 <span className="text-[13px] font-normal text-ink-mute">· 구간 {sortedSegs.length}개</span></summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px] tabular-nums">
            <thead><tr className="text-left text-[12px] text-ink-mute"><th className="py-1.5 font-normal">시간</th><th className="py-1.5 font-normal">보여 준 것</th><th className="py-1.5 text-right font-normal">시청자</th><th className="py-1.5 text-right font-normal">채팅</th><th className="py-1.5 text-right font-normal">주문(전체)</th><th className="py-1.5 text-right font-normal">그 상품 팔림</th></tr></thead>
            <tbody>
              {sortedSegs.map((s, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="whitespace-nowrap py-1.5">{hm(s.from)}~{hm(s.to)} <span className="text-[12px] text-ink-mute">{s.minutes}분</span></td>
                  <td className={`py-1.5 ${s.kind === "unknown" ? "text-ink-mute" : "text-ink"}`}><span className="text-[12px] text-ink-mute">{KIND_LABEL[s.kind]}</span> {s.kind === "unknown" ? "" : s.label}</td>
                  <td className="py-1.5 text-right">{s.viewerStart === null ? "-" : `${s.viewerStart}→${s.viewerEnd}명`}</td>
                  <td className="py-1.5 text-right">{flow.hasSamples ? s.chat : "-"}</td>
                  <td className="py-1.5 text-right">{s.orders}건</td>
                  <td className="py-1.5 text-right tabular-nums">{s.kind === "unknown" ? "-" : `${s.ordersMine}개 · ${won(s.goodsMine)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {/* 5. 10분 표 */}
      <details className="rounded-xl border border-line bg-surface p-4">
        <summary className="cursor-pointer text-[16px] font-bold text-ink">10분 단위로 보기</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[520px] text-[13px] tabular-nums">
            <thead><tr className="text-left text-[12px] text-ink-mute"><th className="py-1.5 font-normal">시간</th><th className="py-1.5 text-right font-normal">시청자 평균(최고)</th><th className="py-1.5 text-right font-normal">사이트 접속</th><th className="py-1.5 text-right font-normal">채팅</th><th className="py-1.5 text-right font-normal">주문</th><th className="py-1.5 text-right font-normal">결제 금액</th></tr></thead>
            <tbody>
              {flow.bins.map((b) => (
                <tr key={b.from} className="border-t border-line">
                  <td className="py-1.5">{hm(b.from)}</td>
                  <td className="py-1.5 text-right">{b.viewerAvg === null ? "-" : `${b.viewerAvg}(${b.viewerMax})명`}</td>
                  <td className="py-1.5 text-right">{b.siteAvg === null ? "-" : `${b.siteAvg}명`}</td>
                  <td className="py-1.5 text-right">{flow.hasSamples ? b.chat : "-"}</td>
                  <td className="py-1.5 text-right">{b.orders}건</td>
                  <td className="py-1.5 text-right tabular-nums">{won(b.paidGoods)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
