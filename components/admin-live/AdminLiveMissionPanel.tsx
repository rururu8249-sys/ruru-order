"use client";

// 미션 게이지(공동목표) 관리자 패널 — 1단계: 목표/보상 설정 + 진행률 조회 + OBS 위젯주소.
//   - 설정은 /api/admin-live/mission(POST), 진행률은 GET. settings 키만 다룸.
//   - "구매자 전원 지급"(돈)은 2단계라 여기엔 없음(읽기/설정 전용).
import { useCallback, useEffect, useRef, useState } from "react";
import { useBulkPointGrant } from "./useBulkPointGrant";
import { MISSION_PAYOUT_MEMO } from "@/lib/mission";

type GoalType = "count" | "amount";
type Progress = {
  active: boolean;
  goalType: GoalType;
  goal: number;
  reward: number;
  title: string;
  current: number;
  pct: number;
  broadcastTitle: string;
};

const won = (n: number) => n.toLocaleString("ko-KR");
const whenText = (s: string) => {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
};
// "2026.06.19(금) 01:14" 형태(룰렛 이벤트 목록과 동일).
const whenFull = (s: string) => {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "";
  const date = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).format(d);
  const time = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return `${date} ${time}`;
};
// KST 기준 yyyy-mm-dd (기간 필터 비교용)
const kstKey = (s: string) => {
  const d = new Date(s);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
};
type Buyer = { phone: string; nickname: string; amount: number; when: string };
// 폼 현재값 스냅샷(저장값과 비교해 "변경됨" 판단용)
const snapOf = (a: boolean, gt: string, gv: string, ra: string, t: string) => JSON.stringify({ a, gt, gv: gv.trim(), ra: ra.trim(), t: t.trim() });

export default function AdminLiveMissionPanel() {
  const [active, setActive] = useState(false);
  const [goalType, setGoalType] = useState<GoalType>("count");
  const [goalValue, setGoalValue] = useState("");
  const [rewardAmount, setRewardAmount] = useState("");
  const [title, setTitle] = useState("");
  const [prog, setProg] = useState<Progress | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [savedSnap, setSavedSnap] = useState<string | null>(null);
  const initRef = useRef(false);
  // load() 콜백(빈 deps) 안에서 "현재 폼/저장값"을 읽기 위한 ref(스테일 클로저 회피).
  const liveRef = useRef({ active, goalType, goalValue, rewardAmount, title });
  liveRef.current = { active, goalType, goalValue, rewardAmount, title };
  const savedSnapRef = useRef<string | null>(savedSnap);
  savedSnapRef.current = savedSnap;

  const widgetUrl =
    (typeof window !== "undefined" ? window.location.origin : "https://ruru-order.vercel.app") +
    "/event-mission/live";

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin-live/mission", { cache: "no-store" });
      const j = (await res.json()) as Progress & { ok: boolean };
      if (j.ok) {
        setProg(j);
        const gt = j.goalType === "amount" ? "amount" : "count";
        const gv = j.goal ? String(j.goal) : "";
        const ra = j.reward ? String(j.reward) : "";
        const tt = j.title || "";
        const serverSnap = snapOf(j.active, gt, gv, ra, tt);
        const applyServer = () => {
          setActive(j.active);
          setGoalType(gt);
          setGoalValue(gv);
          setRewardAmount(ra);
          setTitle(tt);
          setSavedSnap(serverSnap);
        };
        if (!initRef.current) {
          initRef.current = true;
          applyServer();
        } else {
          // 편집 중이 아닐 때(폼이 저장값과 동일 = clean)만 서버 최신값을 폼에 반영.
          //   → 이벤트 종료/외부 변경이 체크박스에 바로 반영(스테일 "켜짐" 방지),
          //     편집 중(dirty)이면 덮어쓰지 않음(저장 전 체크 풀림 방지 — 기존 보호 유지).
          const cur = snapOf(
            liveRef.current.active,
            liveRef.current.goalType,
            liveRef.current.goalValue,
            liveRef.current.rewardAmount,
            liveRef.current.title
          );
          if (cur === savedSnapRef.current) applyServer();
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  // 팝업용: 최근 60일 미션 지급 기록(기간 칩으로 클라이언트 필터).
  const loadHistAll = useCallback(async () => {
    try {
      const res = await fetch("/api/admin-live/mission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "payout_history", range: "recent" }),
      });
      const j = await res.json();
      if (j.ok) setHistAll(Array.isArray(j.payouts) ? j.payouts : []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
    loadHistAll();
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, [load, loadHistAll]);

  const save = async () => {
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin-live/mission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active, goalType, goalValue, rewardAmount, title }),
      });
      const j = await res.json();
      setMsg(j.ok ? "저장됐어요. 위젯에 바로 반영됩니다." : `저장 실패: ${j.message || ""}`);
      if (j.ok) {
        setSavedSnap(snapOf(active, goalType, goalValue, rewardAmount, title));
        load();
      }
    } catch (e) {
      setMsg("저장 실패: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  };

  // ── 2단계: 구매자 전원 지급 ──
  const { running: paying, grant } = useBulkPointGrant();
  const [payout, setPayout] = useState<{ count: number; reward: number; total: number; alreadyPaidCount: number; broadcastTitle: string; allowDup: boolean; buyers: Buyer[] } | null>(null);
  const [allowDup, setAllowDup] = useState(false); // 중복 지급 허용(이미 받은 사람도 다시)
  const [payMsg, setPayMsg] = useState("");
  const [executing, setExecuting] = useState(false);
  const [ending, setEnding] = useState(false);
  const [result, setResult] = useState<{ successList: { nickname: string; amount: number }[]; failed: { label: string; reason: string }[]; reward: number } | null>(null);
  const [histAll, setHistAll] = useState<{ nickname: string; amount: number; when: string }[]>([]); // 최근 60일 지급(기간필터 목록용)
  const [histPeriod, setHistPeriod] = useState<"today" | "week" | "month" | "date">("today");
  const [histDate, setHistDate] = useState(""); // 날짜선택 yyyy-mm-dd(KST)

  const openPayout = async () => {
    setPayMsg("");
    try {
      const res = await fetch("/api/admin-live/mission", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "payout_preview", allowDup }) });
      const j = await res.json();
      if (!j.ok) { setPayMsg(j.message || "조회 실패"); return; }
      setPayout({ count: j.count, reward: j.reward, total: j.total, alreadyPaidCount: j.alreadyPaidCount || 0, broadcastTitle: j.broadcastTitle || "", allowDup: !!j.allowDup, buyers: Array.isArray(j.buyers) ? j.buyers : [] });
    } catch (e) {
      setPayMsg("조회 실패: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const doPayout = async () => {
    if (executing || paying) return; // 더블클릭/중복실행 방지
    setExecuting(true);
    try {
      const res = await fetch("/api/admin-live/mission", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "payout_confirm", allowDup }) });
      const j = await res.json();
      if (!j.ok) { setPayout(null); setPayMsg(j.message || (j.already ? "이미 지급됨" : "지급 실패")); return; }
      const targets = (j.buyers || []).map((x: { phone: string; nickname?: string }) => ({ phone: x.phone, label: x.nickname || x.phone }));
      // adminMemo는 ledger에 기록되어 "이 방송에서 이미 받은 사람" 식별(중복방지)에 쓰임 → 상수로 단일화(드리프트 방지).
      const r = await grant(targets, { amount: j.reward, reason: j.title || "미션 목표 달성 - 구매자 전원 지급", adminMemo: MISSION_PAYOUT_MEMO, customerVisible: true });
      if (r.success === 0) {
        // 전부 실패 → 가드 해제(재시도 가능)
        await fetch("/api/admin-live/mission", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "payout_reset" }) });
      }
      const failedLabels = new Set(r.failed.map((f) => f.label));
      const attempted = (j.buyers || []) as Buyer[];
      const successList = attempted.filter((b) => !failedLabels.has(b.nickname || b.phone)).map((b) => ({ nickname: b.nickname, amount: b.amount }));
      setPayout(null);
      setPayMsg("");
      setResult({ successList, failed: r.failed, reward: j.reward });
      load();
      loadHistAll();
    } catch (e) {
      setPayout(null);
      setPayMsg("지급 실패: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setExecuting(false);
    }
  };

  // 이벤트 종료: 미션 끄기(active=false 저장 → 위젯 숨김) + 지급 버튼 열림
  const endEvent = async () => {
    if (ending) return;
    if (!window.confirm("이벤트를 종료할까요?\n\n· 방송 위젯이 꺼집니다(숨김)\n· '구매자 전원 지급' 버튼이 열립니다\n(지급은 방송이 켜져 있는 동안 해주세요)")) return;
    setEnding(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin-live/mission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: false, goalType, goalValue, rewardAmount, title }),
      });
      const j = await res.json();
      if (j.ok) {
        setActive(false);
        setSavedSnap(snapOf(false, goalType, goalValue, rewardAmount, title));
        setMsg("이벤트 종료됨 — 위젯 숨김, 지급 버튼이 열렸어요.");
        load();
      } else {
        setMsg("종료 실패: " + (j.message || ""));
      }
    } catch (e) {
      setMsg("종료 실패: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setEnding(false);
    }
  };
  // 지급은 이벤트 종료(미션 OFF = 서버 저장값 기준) 후에만 열림
  const payoutUnlocked = !!prog && !prog.active;

  const goal = Number(String(goalValue).replace(/[^0-9.]/g, "")) || 0;
  const dirty = savedSnap !== null && savedSnap !== snapOf(active, goalType, goalValue, rewardAmount, title);
  const pct = prog ? prog.pct : 0;
  const current = prog ? prog.current : 0;
  const unit = goalType === "amount" ? "원" : "개";

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "9px 12px",
    borderRadius: 10,
    border: "1.5px solid var(--color-rose-line)",
    fontSize: 14,
    outline: "none",
  };
  const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: "var(--color-ink-soft)", marginBottom: 5, display: "block" };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "4px 2px" }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: "var(--color-rose-deep)", marginBottom: 4 }}>◆ 미션 게이지 (공동목표)</div>
      <div style={{ fontSize: 13, color: "var(--color-ink-soft)", marginBottom: 16 }}>
        방송 중 목표(누적 판매/매출)를 정하면 OBS 위젯에 진행 막대가 뜹니다. “구매자 전원 지급”은 다음 단계에서 추가돼요.
      </div>

      {/* 진행률 — 미션 켜진(진행 중) 동안만 표시. 종료되면 막대 숨기고 아래 "지급 내역"만 남김.
          새 이벤트를 켜면 카운트가 0부터 다시 시작(이벤트 시작 시각 기준). */}
      {prog && prog.active ? (
        <div style={{ background: "var(--color-rose-soft)", borderRadius: 14, padding: "14px 16px", marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: "var(--color-rose-deep)", fontWeight: 700 }}>
            현재 진행{prog.broadcastTitle ? ` · ${prog.broadcastTitle}` : " · (방송 OFF)"}
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "var(--color-rose-deep)", marginTop: 3 }}>
            {won(current)}
            {unit} <span style={{ color: "var(--color-ink-mute)", fontSize: 15 }}>/ 목표 {won(goal)}{unit} ({pct}%)</span>
          </div>
          <div style={{ marginTop: 8, height: 14, background: "var(--color-surface)", borderRadius: 7, overflow: "hidden", border: "1px solid var(--color-rose-line)" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: pct >= 100 ? "var(--color-ok-tx)" : "var(--color-rose-deep)", borderRadius: 7, transition: "width .5s" }} />
          </div>
        </div>
      ) : (
        <div style={{ background: "var(--color-rose-soft)", borderRadius: 14, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "var(--color-rose-deep)", fontWeight: 700 }}>
          미션 꺼짐 — 진행 막대는 미션을 켜면 0부터 표시돼요.
        </div>
      )}

      {/* 설정 */}
      <div style={{ display: "grid", gap: 14 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} style={{ width: 20, height: 20 }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: active ? "var(--color-ok-tx)" : "var(--color-ink-mute)" }}>
            {active ? "미션 켜짐 (위젯 표시)" : "미션 꺼짐 (위젯 숨김)"}
          </span>
        </label>

        <div>
          <span style={labelStyle}>목표 종류</span>
          <div style={{ display: "flex", gap: 8 }}>
            {(["count", "amount"] as GoalType[]).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGoalType(g)}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: 10,
                  border: goalType === g ? "2px solid var(--color-rose-deep)" : "1.5px solid var(--color-rose-line)",
                  background: goalType === g ? "var(--color-rose-deep)" : "var(--color-surface)",
                  color: goalType === g ? "#fff" : "var(--color-rose-deep)",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                {g === "count" ? "누적 판매 개수" : "매출 금액(원)"}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <span style={labelStyle}>목표 {goalType === "amount" ? "금액(원)" : "개수"}</span>
            <input style={inputStyle} inputMode="numeric" value={goalValue ? won(Number(goalValue)) : ""} onChange={(e) => setGoalValue(e.target.value.replace(/[^0-9]/g, ""))} placeholder={goalType === "amount" ? "예: 5,000,000" : "예: 100"} />
          </div>
          <div>
            <span style={labelStyle}>구매자 1인당 포인트</span>
            <input style={inputStyle} inputMode="numeric" value={rewardAmount ? won(Number(rewardAmount)) : ""} onChange={(e) => setRewardAmount(e.target.value.replace(/[^0-9]/g, ""))} placeholder="예: 1,000" />
          </div>
        </div>

        <div>
          <span style={labelStyle}>제목(선택)</span>
          <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 오늘의 공동목표" maxLength={80} />
        </div>

        {dirty ? <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-danger-tx)" }}>● 변경됨 — 저장해야 적용돼요</div> : null}
        <button
          type="button"
          onClick={save}
          disabled={saving}
          style={{ padding: "12px", borderRadius: 12, border: dirty ? "2px solid var(--color-danger-tx)" : "none", background: "var(--color-rose-deep)", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer", opacity: saving ? 0.6 : 1 }}
        >
          {saving ? "저장 중…" : dirty ? "변경사항 저장하기" : "저장"}
        </button>
        {msg ? <div style={{ fontSize: 13, color: msg.includes("실패") ? "var(--color-danger-tx)" : "var(--color-ok-tx)", fontWeight: 700 }}>{msg}</div> : null}
      </div>

      {/* 2단계: 구매자 전원 지급 */}
      <div style={{ marginTop: 18, borderTop: "1px solid var(--color-rose-line)", paddingTop: 14 }}>
        <span style={labelStyle}>목표 달성 시 — 구매자 전원 포인트 지급</span>
        <div style={{ fontSize: 12, color: "var(--color-ink-mute)", marginBottom: 8 }}>현재 방송의 <b>결제완료 구매자 전원</b>에게 1인당 포인트를 한 번에 지급해요. 기본은 <b>같은 사람 1회만</b>(이미 받은 사람 자동 제외). 아래 <b>중복 허용</b>을 켜면 이미 받은 사람도 다시 지급돼요.</div>

        {prog?.active ? (
          <button
            type="button"
            onClick={endEvent}
            disabled={ending}
            style={{ width: "100%", padding: "11px", borderRadius: 12, border: "2px solid var(--color-danger-tx)", background: "var(--color-surface)", color: "var(--color-danger-tx)", fontWeight: 800, fontSize: 14, cursor: "pointer", marginBottom: 8, opacity: ending ? 0.6 : 1 }}
          >
            {ending ? "종료 중…" : "🛑 이벤트 종료 (위젯 끄고 지급 열기)"}
          </button>
        ) : null}

        <button
          type="button"
          onClick={openPayout}
          disabled={paying || !payoutUnlocked}
          style={{
            width: "100%",
            padding: "12px",
            borderRadius: 12,
            border: "2px solid " + (payoutUnlocked ? "var(--color-ok-tx)" : "var(--color-rose-line)"),
            background: payoutUnlocked ? "var(--color-surface)" : "var(--color-surface-2)",
            color: payoutUnlocked ? "var(--color-ok-tx)" : "var(--color-ink-mute)",
            fontWeight: 800,
            fontSize: 15,
            cursor: payoutUnlocked ? "pointer" : "not-allowed",
            opacity: paying ? 0.6 : 1,
          }}
        >
          🎁 구매자 전원에게 지급하기
        </button>
        {!payoutUnlocked ? (
          <div style={{ fontSize: 12, color: "var(--color-ink-mute)", marginTop: 6 }}>※ 위 “🛑 이벤트 종료”를 누르면 지급 버튼이 열려요.</div>
        ) : null}

        {/* 중복 지급 허용 토글 (기본 OFF=같은 사람 1회만 / ON=이미 받은 사람도 다시 지급) */}
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, cursor: "pointer" }}>
          <input type="checkbox" checked={allowDup} onChange={(e) => setAllowDup(e.target.checked)} style={{ width: 17, height: 17 }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: allowDup ? "var(--color-danger-tx)" : "var(--color-ink-soft)" }}>
            중복 지급 허용 — 이미 받은 사람도 다시 지급 {allowDup ? "(켜짐 ⚠️ 한 번 더 줌)" : "(꺼짐 = 같은 사람 1회만)"}
          </span>
        </label>

        {payMsg ? <div style={{ fontSize: 13, marginTop: 8, fontWeight: 700, color: payMsg.includes("실패") && !payMsg.includes("성공") ? "var(--color-danger-tx)" : "var(--color-ok-tx)" }}>{payMsg}</div> : null}
      </div>

      {/* 지급 내역 — 룰렛/인형뽑기 "이벤트 목록"과 동일한 인라인 목록(.row/.note/.badge/.seclabel + 기간 칩). */}
      <div style={{ marginTop: 18, borderTop: "1px solid var(--bd)", paddingTop: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <span className="seclabel" style={{ margin: 0 }}>🎯 미션 지급 내역 <span className="note">지난 기록</span></span>
          {([["today", "오늘"], ["week", "이번주"], ["month", "이번달"], ["date", "날짜선택"]] as const).map(([key, label]) => (
            <span
              key={key}
              className="badge"
              style={{ cursor: "pointer", padding: "4px 10px", border: "1px solid var(--bd)", background: histPeriod === key ? "var(--rose)" : "var(--color-surface)", color: histPeriod === key ? "#fff" : "var(--mut)" }}
              onClick={() => setHistPeriod(key)}
            >
              {label}
            </span>
          ))}
          {histPeriod === "date" ? (
            <input type="date" className="ipt" style={{ height: 26 }} value={histDate} onChange={(e) => setHistDate(e.target.value)} />
          ) : null}
          <span style={{ marginLeft: "auto" }}>
            <button className="btn" style={{ height: 26, padding: "0 8px" }} onClick={loadHistAll}>새로고침</button>
          </span>
        </div>
        {(() => {
          const today = kstKey(new Date().toISOString());
          const weekAgo = kstKey(new Date(Date.now() - 6 * 86400000).toISOString());
          const filtered = histAll.filter((h) => {
            const k = kstKey(h.when);
            if (!k) return false;
            if (histPeriod === "today") return k === today;
            if (histPeriod === "month") return k.slice(0, 7) === today.slice(0, 7);
            if (histPeriod === "date") return histDate ? k === histDate : true;
            return k >= weekAgo && k <= today; // 이번주 = 최근 7일
          });
          if (filtered.length === 0) {
            return <div className="note" style={{ textAlign: "center", padding: "20px 0" }}>해당 기간 지급 기록이 없습니다.</div>;
          }
          const total = filtered.reduce((s, x) => s + x.amount, 0);
          return (
            <>
              {filtered.map((h, i) => (
                <div key={`${h.when}-${i}`} className="row">
                  <span className="note" style={{ width: 120, flexShrink: 0 }}>{whenFull(h.when)}</span>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>🎯 미션 · 당첨 <b>{h.nickname}</b> · 포인트 {won(h.amount)}P</span>
                  <span className="badge b-ok" style={{ flexShrink: 0 }}>지급완료</span>
                </div>
              ))}
              <div className="note" style={{ textAlign: "right", marginTop: 4 }}>총 {won(filtered.length)}명 · {won(total)}P</div>
            </>
          );
        })()}
      </div>

      {/* OBS 위젯 주소 */}
      <div style={{ marginTop: 20, borderTop: "1px solid var(--color-rose-line)", paddingTop: 14 }}>
        <span style={labelStyle}>OBS 방송 위젯주소 (브라우저 소스)</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input style={{ ...inputStyle, background: "var(--color-surface)" }} readOnly value={widgetUrl} />
          <button
            type="button"
            onClick={() => { void navigator.clipboard?.writeText(widgetUrl); setMsg("위젯주소 복사됨"); }}
            style={{ padding: "9px 16px", borderRadius: 10, border: "none", background: "var(--color-rose-deep)", color: "#fff", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
          >
            복사
          </button>
        </div>
        <div style={{ fontSize: 12, color: "var(--color-ink-mute)", marginTop: 6 }}>OBS에서 브라우저 소스로 추가 · 배경 투명 · 미션 꺼져 있으면 아무것도 안 보여요. (디자인 미리보기: 주소 끝에 <b>?preview=1</b>)</div>
      </div>

      {payout ? (
        <div style={{ position: "fixed", inset: 0, zIndex: 140, background: "rgba(2,6,23,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={(e) => { if (e.target === e.currentTarget) setPayout(null); }}>
          <div style={{ width: "min(500px,94vw)", maxHeight: "88vh", display: "flex", flexDirection: "column", background: "var(--color-surface)", borderRadius: 16, padding: 20 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--color-rose-deep)", flexShrink: 0 }}>구매자 전원 포인트 지급 — 최종 확인</div>
            {payout.count === 0 ? (
              <div style={{ marginTop: 12, fontSize: 14, color: "var(--color-danger-tx)", fontWeight: 700, lineHeight: 1.6 }}>이미 이 방송 구매자 전원에게 지급됐어요.<br />같은 사람은 중복 지급되지 않습니다{payout.alreadyPaidCount > 0 ? ` (이미 ${payout.alreadyPaidCount}명 지급됨)` : ""}.</div>
            ) : (
              <>
                <div style={{ marginTop: 8, fontSize: 13, color: "var(--color-ink-soft)", flexShrink: 0 }}>
                  {payout.broadcastTitle ? `${payout.broadcastTitle} · ` : ""}아래 <b style={{ color: "var(--color-rose-deep)" }}>{payout.count}명</b>{payout.allowDup ? "(전원)" : "(신규)"}에게 1인당 <b style={{ color: "var(--color-rose-deep)" }}>{won(payout.reward)}P</b> 지급
                  {payout.alreadyPaidCount > 0 ? (
                    payout.allowDup
                      ? <span style={{ color: "var(--color-danger-tx)", fontWeight: 700 }}> · ⚠️ 이미 받은 {payout.alreadyPaidCount}명도 또 지급(중복)</span>
                      : <span style={{ color: "var(--color-ink-mute)" }}> · 이미 {payout.alreadyPaidCount}명은 지급됨(제외)</span>
                  ) : null}
                </div>
                <div style={{ marginTop: 10, flex: 1, minHeight: 0, overflowY: "auto", border: "1px solid var(--color-surface-3)", borderRadius: 10 }}>
                  {payout.buyers.length === 0 ? (
                    <div style={{ padding: "16px", textAlign: "center", color: "var(--color-ink-mute)", fontSize: 13 }}>지급 대상(결제완료 구매자)이 없어요.</div>
                  ) : (
                    payout.buyers.map((b, i) => (
                      <div key={`${b.phone}-${i}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 11px", borderBottom: "1px solid var(--color-surface-2)", fontSize: 13 }}>
                        <span style={{ color: "var(--color-ink-mute)", width: 22, flexShrink: 0 }}>{i + 1}</span>
                        <span style={{ flex: 1, minWidth: 0, fontWeight: 700, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.nickname}</span>
                        <span style={{ color: "var(--color-ok-tx)", fontWeight: 700, flexShrink: 0 }}>{won(b.amount)}원</span>
                        <span style={{ color: "var(--color-ink-mute)", flexShrink: 0, fontSize: 12 }}>{whenText(b.when)}</span>
                      </div>
                    ))
                  )}
                </div>
                <div style={{ marginTop: 10, fontSize: 15, fontWeight: 800, color: "var(--color-rose-deep)", flexShrink: 0 }}>
                  총 {payout.count}명 · 총 지급 <span style={{ color: "var(--color-ok-tx)" }}>{won(payout.total)}P</span>
                </div>
              </>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 16, flexShrink: 0 }}>
              <button type="button" onClick={() => setPayout(null)} style={{ flex: 1, padding: "11px", borderRadius: 10, border: "1.5px solid var(--color-rose-line)", background: "var(--color-surface)", color: "var(--color-ink-soft)", fontWeight: 700, cursor: "pointer" }}>취소</button>
              {payout.count > 0 && payout.reward > 0 ? (
                <button type="button" onClick={doPayout} disabled={paying || executing} style={{ flex: 1, padding: "11px", borderRadius: 10, border: "none", background: "var(--color-ok-tx)", color: "#fff", fontWeight: 800, cursor: "pointer", opacity: paying || executing ? 0.6 : 1 }}>{paying || executing ? "지급 중…" : `${won(payout.total)}P 지급 실행`}</button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {result ? (
        <div style={{ position: "fixed", inset: 0, zIndex: 141, background: "rgba(2,6,23,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={(e) => { if (e.target === e.currentTarget) setResult(null); }}>
          <div style={{ width: "min(500px,94vw)", maxHeight: "88vh", display: "flex", flexDirection: "column", background: "var(--color-surface)", borderRadius: 16, padding: 20 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--color-ok-tx)", flexShrink: 0 }}>지급 완료 — 지급 명단</div>
            <div style={{ marginTop: 6, fontSize: 14, fontWeight: 700, color: "var(--color-ink)", flexShrink: 0 }}>
              성공 <b style={{ color: "var(--color-ok-tx)" }}>{result.successList.length}명</b>
              {result.failed.length ? <> · 실패 <b style={{ color: "var(--color-danger-tx)" }}>{result.failed.length}명</b></> : null}
              {" "}· 총 지급 <b style={{ color: "var(--color-ok-tx)" }}>{won(result.successList.length * result.reward)}P</b>
            </div>
            <div style={{ marginTop: 10, flex: 1, minHeight: 0, overflowY: "auto", border: "1px solid var(--color-surface-3)", borderRadius: 10 }}>
              {result.successList.map((b, i) => (
                <div key={`s-${i}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 11px", borderBottom: "1px solid var(--color-surface-2)", fontSize: 13 }}>
                  <span style={{ color: "var(--color-ok-tx)", flexShrink: 0, width: 16 }}>✓</span>
                  <span style={{ flex: 1, minWidth: 0, fontWeight: 700, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.nickname}</span>
                  <span style={{ color: "var(--color-ok-tx)", fontWeight: 800, flexShrink: 0 }}>+{won(result.reward)}P</span>
                </div>
              ))}
              {result.failed.map((f, i) => (
                <div key={`f-${i}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 11px", borderBottom: "1px solid var(--color-surface-2)", fontSize: 13, background: "var(--color-danger-bg)" }}>
                  <span style={{ color: "var(--color-danger-tx)", flexShrink: 0, width: 16 }}>✕</span>
                  <span style={{ flex: 1, minWidth: 0, fontWeight: 700, color: "var(--color-danger-tx)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.label}</span>
                  <span style={{ color: "var(--color-ink-mute)", flexShrink: 0, fontSize: 11, maxWidth: 170, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.reason}</span>
                </div>
              ))}
            </div>
            {result.failed.length ? <div style={{ marginTop: 8, fontSize: 12, color: "var(--color-danger-tx)", flexShrink: 0 }}>실패자는 고객·이슈 메뉴에서 수동 지급해 주세요.</div> : null}
            <button type="button" onClick={() => setResult(null)} style={{ marginTop: 14, padding: "11px", borderRadius: 10, border: "none", background: "var(--color-rose-deep)", color: "#fff", fontWeight: 800, cursor: "pointer", flexShrink: 0 }}>닫기</button>
          </div>
        </div>
      ) : null}

    </div>
  );
}
