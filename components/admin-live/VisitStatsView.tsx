"use client";

// [2026-09-08 리팩터] 접속 기록(날짜별·방송별) 화면을 접속자 위젯(AdminLiveSidebarPresence)에서 분리
//
//   왜: 같은 화면을 (a) 사이드바 접속자 위젯의 팝업 안에서도, (b) 관리자 페이지 안에 직접 박아서도
//       쓸 수 있게 하려고. 표/탭/펼침 마크업과 동작은 원본 그대로 옮겼다(기능 추가·변경 없음).
//
// 안전
//   · 읽기 전용. /api/admin-live/visit-stats GET 만 부른다.
//   · 주문 / 입금 / 정산 / 배송 / 재고 데이터는 건드리지 않는다.
//
// 쓰는 법
//   · 페이지 안에 직접:      <VisitStatsView embedded />            → 제목·요약·새로고침 줄까지 스스로 그리고, 마운트 때 1회 불러온다.
//   · 팝업(모달) 안에서:     const vs = useVisitStats();             → 팝업 헤더가 요약(최근 N일 · 방문자 N명)을 보여줘야 하므로
//                            <VisitStatsView state={vs} />           상태를 바깥이 들고 넘긴다. 이때는 헤더 없이 본문만 그린다(불러오기도 바깥이 호출).

import { Fragment, useCallback, useEffect, useState, type CSSProperties } from "react";

export type VisitPerson = { name: string; visits: number; lastAt: string; live: boolean; ip?: string };

export type VisitStats = {
  ok?: boolean;
  available?: boolean;
  days?: number;
  totals?: { visitors: number; visits: number; capped: boolean } | null;
  daily?: Array<{ date: string; visitors: number; visits: number; live: number; shop: number; names?: VisitPerson[]; namesCapped?: boolean }>;
  broadcasts?: Array<{ broadcastId: string; title: string; visitors: number; visits: number; startedAt: string; names?: VisitPerson[]; namesCapped?: boolean }>;
};

export type VisitStatsTab = "date" | "broadcast";

export type VisitStatsState = {
  stats: VisitStats | null;
  loading: boolean;
  reload: () => Promise<void>;
  tab: VisitStatsTab;
  setTab: (tab: VisitStatsTab) => void;
  openRows: Record<string, boolean>;
  toggleRow: (key: string) => void;
};

// 한국시간으로 "08-29 22:58" — 접속 기록 표에서 마지막 접속 시각을 보여준다.
export function seoulStamp(iso: string) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "-";
  const d = new Date(t + 9 * 60 * 60 * 1000);
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
}

// 팝업 헤더 / 내장 헤더가 똑같이 쓰는 요약 문구 — "최근 30일 · 방문자 99명"
export function visitStatsSummaryText(stats: VisitStats | null) {
  return `최근 ${stats?.days ?? 30}일 · 방문자 ${(stats?.totals?.visitors ?? 0).toLocaleString("ko-KR")}명`;
}

// 접속 기록 상태(데이터 + 탭 + 펼친 줄). 불러오기는 자동으로 하지 않는다 — 호출하는 쪽이 reload() 를 부른다.
//   (팝업은 "접속 기록 보기" 버튼을 눌렀을 때만 불러야 하므로.)
export function useVisitStats(): VisitStatsState {
  const [stats, setStats] = useState<VisitStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<VisitStatsTab>("date");
  // 날짜/방송 줄을 누르면 그날(그 방송에) 누가 왔었는지 펼친다.
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({});
  const toggleRow = useCallback((key: string) => setOpenRows((prev) => ({ ...prev, [key]: !prev[key] })), []);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin-live/visit-stats", { method: "GET", cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as VisitStats | null;
      setStats(payload?.ok ? payload : { ok: false });
    } catch {
      setStats({ ok: false });
    } finally {
      setLoading(false);
    }
  }, []);

  return { stats, loading, reload, tab, setTab, openRows, toggleRow };
}

// [2026-08-29 사장님 지시] 칩(알약)으로 흩뿌려 놓으니 지저분하다 → 엑셀표처럼 정렬한다.
//   날짜/방송 줄 아래에 펼쳐지는 "누가 왔었나" 표
function nameList(people: VisitPerson[] | undefined, capped: boolean | undefined, colSpan: number) {
  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: "0 6px 14px" }}>
        {!people || people.length === 0 ? (
          <div style={{ padding: "12px", borderRadius: "10px", background: "var(--color-surface-2)", fontSize: "11.5px", fontWeight: 700, color: "var(--color-ink-mute)", textAlign: "center" }}>
            이름이 남은 방문자가 없습니다.
          </div>
        ) : (
          <div style={{ border: "1px solid var(--color-line)", borderRadius: "10px", overflow: "hidden", background: "var(--color-surface)" }}>
            <div style={{ maxHeight: "300px", overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: "34px" }} />
                  <col />
                  <col style={{ width: "58px" }} />
                  <col style={{ width: "96px" }} />
                </colgroup>
                <thead>
                  <tr style={{ background: "var(--color-surface-2)" }}>
                    {[
                      { label: "#", align: "center" as const },
                      { label: "닉네임", align: "left" as const },
                      { label: "방문", align: "right" as const },
                      { label: "마지막 접속", align: "right" as const },
                    ].map((h) => (
                      <th
                        key={h.label}
                        style={{
                          position: "sticky", top: 0, zIndex: 1,
                          background: "var(--color-surface-2)",
                          textAlign: h.align, padding: "7px 8px",
                          fontSize: "10.5px", fontWeight: 900, whiteSpace: "nowrap",
                          color: "var(--color-ink-mute)",
                          borderBottom: "1px solid var(--color-line)",
                        }}
                      >{h.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    // [2026-09-07] 같은 IP 가 이 목록에 2명 이상이면 표시(장난 다계정·같은 사람 여러 닉 파악 보조)
                    const ipCount = new Map<string, number>();
                    for (const pp of people) { const v = String(pp.ip || "").trim(); if (v) ipCount.set(v, (ipCount.get(v) || 0) + 1); }
                    return people.map((p, i) => {
                    const ip = String(p.ip || "").trim();
                    const ipDup = ip ? (ipCount.get(ip) || 0) > 1 : false;
                    return (
                    <tr
                      key={`${p.name}-${i}`}
                      style={{ background: i % 2 === 1 ? "var(--color-surface-2)" : "transparent" }}
                      title={`${p.name} · ${p.visits}번 방문 · 마지막 ${seoulStamp(p.lastAt)}${ip ? ` · IP ${ip}` : ""}`}
                    >
                      <td style={{ padding: "6px 8px", textAlign: "center", fontSize: "10.5px", fontWeight: 700, color: "var(--color-ink-mute)", fontVariantNumeric: "tabular-nums" }}>
                        {i + 1}
                      </td>
                      <td style={{ padding: "6px 8px", fontSize: "12px", fontWeight: 800, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <span
                          title={p.live ? "방송 중 접속" : "쇼핑몰 모드 접속"}
                          style={{
                            display: "inline-block", width: "6px", height: "6px", borderRadius: "50%",
                            marginRight: "6px", verticalAlign: "middle",
                            background: p.live ? "var(--color-rose-deep)" : "var(--color-line)",
                          }}
                        />
                        {p.name}
                        {ip ? (
                          <span style={{ display: "block", marginLeft: "12px", fontSize: "9.5px", fontWeight: 700, color: ipDup ? "var(--color-warn-tx)" : "var(--color-ink-mute)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {ipDup ? "⚠ 같은 IP · " : ""}{ip}
                          </span>
                        ) : null}
                      </td>
                      <td style={{ padding: "6px 8px", textAlign: "right", fontSize: "11.5px", fontWeight: 800, color: p.visits > 1 ? "var(--color-ink)" : "var(--color-ink-mute)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                        {p.visits}
                      </td>
                      <td style={{ padding: "6px 8px", textAlign: "right", fontSize: "11.5px", fontWeight: 700, color: "var(--color-ink-soft)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                        {seoulStamp(p.lastAt)}
                      </td>
                    </tr>
                    );
                  });
                  })()}
                </tbody>
              </table>
            </div>
            <div style={{ padding: "7px 9px", borderTop: "1px solid var(--color-line)", background: "var(--color-surface-2)", fontSize: "10px", fontWeight: 700, color: "var(--color-ink-mute)" }}>
              총 {people.length.toLocaleString("ko-KR")}명 · 최근 접속 순 · 빨간 점 = 방송 중 접속
              {capped ? " · 최근 120명까지만" : ""}
            </div>
          </div>
        )}
      </td>
    </tr>
  );
}

type VisitStatsViewProps = {
  /** true 면 페이지 안에 직접 박는 형태 — 제목·요약·새로고침 줄을 스스로 그린다. */
  embedded?: boolean;
  /** 바깥(팝업 헤더)이 같은 stats 를 보여줘야 할 때 useVisitStats() 결과를 넘긴다. 없으면 스스로 들고 마운트 때 1회 불러온다. */
  state?: VisitStatsState;
  /** embedded 일 때 바깥 상자 스타일(높이 제한 등). */
  style?: CSSProperties;
};

export default function VisitStatsView({ embedded = false, state, style }: VisitStatsViewProps) {
  // 바깥이 state 를 넘기면 그걸 쓰고, 아니면 스스로 든다(훅은 조건부로 못 부르므로 항상 만든다).
  const own = useVisitStats();
  const s = state ?? own;
  const usesOwn = !state;
  const ownReload = own.reload;

  // 스스로 드는 경우에만 마운트 때 1회 불러온다.
  useEffect(() => {
    if (usesOwn) void ownReload();
  }, [usesOwn, ownReload]);

  const { stats, loading, tab, setTab, openRows, toggleRow } = s;

  const body = loading ? (
    <div style={{ padding: "44px 18px", textAlign: "center", fontSize: "12.5px", fontWeight: 700, color: "var(--color-ink-mute)" }}>불러오는 중…</div>
  ) : stats?.available === false ? (
    <div style={{ padding: "36px 22px", textAlign: "center", fontSize: "12.5px", fontWeight: 700, color: "var(--color-ink-soft)", lineHeight: 1.9 }}>
      아직 접속 기록을 저장할 준비가 안 되어 있습니다.
      <br />
      <span style={{ color: "var(--color-ink-mute)" }}>
        개발자에게 알려주세요. (visitor_visits 표 없음 — docs/인수인계_관리자설정.md)
      </span>
    </div>
  ) : !stats?.ok ? (
    <div style={{ padding: "40px 18px", textAlign: "center", fontSize: "12.5px", fontWeight: 700, color: "var(--color-ink-mute)" }}>기록을 불러오지 못했습니다.</div>
  ) : (
    <>
      <div style={{ display: "flex", gap: "6px", padding: "10px 16px", borderBottom: "1px solid var(--color-line)" }}>
        {([["date", "날짜별"], ["broadcast", "방송별"]] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            style={{
              border: tab === key ? "none" : "1px solid var(--color-line)",
              borderRadius: "999px", padding: "6px 14px", cursor: "pointer",
              fontSize: "12px", fontWeight: 900, whiteSpace: "nowrap",
              background: tab === key ? "var(--color-rose-deep)" : "var(--color-surface)",
              color: tab === key ? "#fff" : "var(--color-ink-soft)",
            }}
          >{label}</button>
        ))}
      </div>

      {/* [2026-08-30 사장님 지적] "방문자 99명인데 방송중 144명이 무슨 말이냐"
          → 방문자는 '사람 수', 방송중/쇼핑몰은 '방문 횟수'로 단위가 달랐다. 그 차이를 명시한다. */}
      <div style={{ padding: "8px 16px", borderBottom: "1px solid var(--color-line)", background: "var(--color-surface-2)", fontSize: "10.5px", fontWeight: 700, color: "var(--color-ink-mute)", lineHeight: 1.6 }}>
        <b>방문자 = 사람 수</b> · <b>방문 = 들어온 횟수</b> (같은 사람이 30분 넘게 끊겼다 다시 오면 1회 더)
      </div>

      <div style={{ minHeight: 0, flex: 1, overflowY: "auto", padding: "12px 16px 16px" }}>
        {tab === "date" ? (
          (stats.daily || []).length === 0 ? (
            <div style={{ padding: "34px 10px", textAlign: "center", fontSize: "12.5px", fontWeight: 700, color: "var(--color-ink-mute)" }}>아직 쌓인 기록이 없습니다.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["날짜", "방문자", "방송중 방문", "쇼핑몰 방문"].map((h, i) => (
                    <th key={h} style={{ textAlign: i === 0 ? "left" : "right", fontSize: "10.5px", fontWeight: 900, color: "var(--color-ink-mute)", padding: "0 6px 8px", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(stats.daily || []).map((d) => (
                  <Fragment key={d.date}>
                  <tr
                    onClick={() => toggleRow(`d:${d.date}`)}
                    style={{ borderTop: "1px solid var(--color-line)", cursor: "pointer" }}
                    title="누르면 그날 누가 왔었는지 펼쳐집니다"
                  >
                    <td style={{ padding: "9px 6px", fontSize: "12.5px", fontWeight: 800, color: "var(--color-ink)", whiteSpace: "nowrap" }}>
                      <span style={{ marginRight: "5px", fontSize: "10px", color: "var(--color-ink-mute)" }}>{openRows[`d:${d.date}`] ? "▾" : "▸"}</span>
                      {d.date}
                    </td>
                    <td style={{ padding: "9px 6px", textAlign: "right", fontSize: "13.5px", fontWeight: 900, color: "var(--color-rose-deep)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{d.visitors.toLocaleString("ko-KR")}<span style={{ fontSize: "10px", fontWeight: 800, opacity: 0.75 }}>명</span></td>
                    <td style={{ padding: "9px 6px", textAlign: "right", fontSize: "12px", fontWeight: 700, color: "var(--color-ink-soft)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{d.live.toLocaleString("ko-KR")}<span style={{ fontSize: "10px", fontWeight: 800, opacity: 0.7 }}>회</span></td>
                    <td style={{ padding: "9px 6px", textAlign: "right", fontSize: "12px", fontWeight: 700, color: "var(--color-ink-soft)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{d.shop.toLocaleString("ko-KR")}<span style={{ fontSize: "10px", fontWeight: 800, opacity: 0.7 }}>회</span></td>
                  </tr>
                  {openRows[`d:${d.date}`] ? nameList(d.names, d.namesCapped, 4) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )
        ) : (stats.broadcasts || []).length === 0 ? (
          <div style={{ padding: "34px 10px", textAlign: "center", fontSize: "12.5px", fontWeight: 700, color: "var(--color-ink-mute)", lineHeight: 1.8 }}>
            아직 방송별 기록이 없습니다.
            <br /><span style={{ fontSize: "11.5px" }}>방송을 켜둔 동안 들어온 손님부터 쌓입니다.</span>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["방송", "방문자"].map((h, i) => (
                  <th key={h} style={{ textAlign: i === 0 ? "left" : "right", fontSize: "10.5px", fontWeight: 900, color: "var(--color-ink-mute)", padding: "0 6px 8px", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(stats.broadcasts || []).map((b) => (
                <Fragment key={b.broadcastId}>
                <tr
                  onClick={() => toggleRow(`b:${b.broadcastId}`)}
                  style={{ borderTop: "1px solid var(--color-line)", cursor: "pointer" }}
                  title="누르면 그 방송에 누가 왔었는지 펼쳐집니다"
                >
                  <td style={{ padding: "9px 6px" }}>
                    <div style={{ fontSize: "12.5px", fontWeight: 800, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "320px" }}>
                      <span style={{ marginRight: "5px", fontSize: "10px", color: "var(--color-ink-mute)" }}>{openRows[`b:${b.broadcastId}`] ? "▾" : "▸"}</span>
                      {b.title}
                    </div>
                    <div style={{ marginTop: "2px", fontSize: "10.5px", fontWeight: 700, color: "var(--color-ink-mute)" }}>{String(b.startedAt).slice(0, 16).replace("T", " ")}</div>
                  </td>
                  <td style={{ padding: "9px 6px", textAlign: "right", fontSize: "13.5px", fontWeight: 900, color: "var(--color-rose-deep)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{b.visitors.toLocaleString("ko-KR")}명<div style={{ marginTop: "2px", fontSize: "10px", fontWeight: 700, color: "var(--color-ink-mute)" }}>방문 {b.visits.toLocaleString("ko-KR")}회</div></td>
                </tr>
                {openRows[`b:${b.broadcastId}`] ? nameList(b.names, b.namesCapped, 2) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );

  // 팝업 안에서는 감싸는 상자 없이(Fragment) 그대로 내보낸다 —
  //   팝업 상자가 flex column 이라 표 영역(flex:1 / overflowY:auto)이 그 직계 자식이어야 스크롤이 맞는다.
  if (!embedded) return body;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "14px 16px", borderBottom: "1px solid var(--color-line)" }}>
        <span style={{ fontSize: "14px", fontWeight: 900, color: "var(--color-ink)", whiteSpace: "nowrap" }}>📊 접속 기록</span>
        <span style={{ marginLeft: "auto", fontSize: "11px", fontWeight: 800, color: "var(--color-ink-mute)", whiteSpace: "nowrap" }}>
          {visitStatsSummaryText(stats)}
        </span>
        <button
          type="button"
          onClick={() => void s.reload()}
          disabled={loading}
          title="지금 다시 불러오기"
          aria-label="새로고침"
          style={{ border: "1px solid var(--color-line)", borderRadius: "8px", background: "transparent", cursor: loading ? "default" : "pointer", padding: "3px 8px", fontSize: "11px", fontWeight: 900, lineHeight: 1.4, color: "var(--color-ink-mute)" }}
        >↻</button>
      </div>
      {body}
    </div>
  );
}
