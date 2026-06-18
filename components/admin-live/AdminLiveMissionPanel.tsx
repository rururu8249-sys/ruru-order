"use client";

// 미션 게이지(공동목표) 관리자 패널 — 1단계: 목표/보상 설정 + 진행률 조회 + OBS 위젯주소.
//   - 설정은 /api/admin-live/mission(POST), 진행률은 GET. settings 키만 다룸.
//   - "구매자 전원 지급"(돈)은 2단계라 여기엔 없음(읽기/설정 전용).
import { useCallback, useEffect, useRef, useState } from "react";
import { useBulkPointGrant } from "./useBulkPointGrant";

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

  const widgetUrl =
    (typeof window !== "undefined" ? window.location.origin : "https://ruru-order.vercel.app") +
    "/event-mission/live";

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin-live/mission", { cache: "no-store" });
      const j = (await res.json()) as Progress & { ok: boolean };
      if (j.ok) {
        setProg(j);
        // 입력칸은 처음 1회만 채움 — 폴링이 편집 중인 값을 덮어쓰지 않게(저장 전 체크 풀림 방지)
        if (!initRef.current) {
          initRef.current = true;
          const gt = j.goalType === "amount" ? "amount" : "count";
          const gv = j.goal ? String(j.goal) : "";
          const ra = j.reward ? String(j.reward) : "";
          const tt = j.title || "";
          setActive(j.active);
          setGoalType(gt);
          setGoalValue(gv);
          setRewardAmount(ra);
          setTitle(tt);
          setSavedSnap(snapOf(j.active, gt, gv, ra, tt));
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, [load]);

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
  const [payout, setPayout] = useState<{ count: number; reward: number; total: number; alreadyPaid: boolean; broadcastTitle: string; buyers: Buyer[] } | null>(null);
  const [payMsg, setPayMsg] = useState("");
  const [executing, setExecuting] = useState(false);
  const [ending, setEnding] = useState(false);
  const [result, setResult] = useState<{ successList: { nickname: string; amount: number }[]; failed: { label: string; reason: string }[]; reward: number } | null>(null);

  const openPayout = async () => {
    setPayMsg("");
    try {
      const res = await fetch("/api/admin-live/mission", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "payout_preview" }) });
      const j = await res.json();
      if (!j.ok) { setPayMsg(j.message || "조회 실패"); return; }
      setPayout({ count: j.count, reward: j.reward, total: j.total, alreadyPaid: j.alreadyPaid, broadcastTitle: j.broadcastTitle || "", buyers: Array.isArray(j.buyers) ? j.buyers : [] });
    } catch (e) {
      setPayMsg("조회 실패: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const doPayout = async () => {
    if (executing || paying) return; // 더블클릭/중복실행 방지
    setExecuting(true);
    try {
      const res = await fetch("/api/admin-live/mission", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "payout_confirm" }) });
      const j = await res.json();
      if (!j.ok) { setPayout(null); setPayMsg(j.message || (j.already ? "이미 지급됨" : "지급 실패")); return; }
      const targets = (j.buyers || []).map((x: { phone: string; nickname?: string }) => ({ phone: x.phone, label: x.nickname || x.phone }));
      const r = await grant(targets, { amount: j.reward, reason: j.title || "미션 목표 달성 - 구매자 전원 지급", adminMemo: "미션 게이지 공동목표 달성 일괄지급", customerVisible: true });
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
    border: "1.5px solid #D9C5CC",
    fontSize: 14,
    outline: "none",
  };
  const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: "#7B2D43", marginBottom: 5, display: "block" };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "4px 2px" }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: "#7B2D43", marginBottom: 4 }}>◆ 미션 게이지 (공동목표)</div>
      <div style={{ fontSize: 13, color: "#888", marginBottom: 16 }}>
        방송 중 목표(누적 판매/매출)를 정하면 OBS 위젯에 진행 막대가 뜹니다. “구매자 전원 지급”은 다음 단계에서 추가돼요.
      </div>

      {/* 진행률 */}
      <div style={{ background: "#F5E6EB", borderRadius: 14, padding: "14px 16px", marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: "#7B2D43", fontWeight: 700 }}>
          현재 진행 {prog?.broadcastTitle ? `· ${prog.broadcastTitle}` : "· (방송 OFF)"}
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#7B2D43", marginTop: 3 }}>
          {won(current)}
          {unit} <span style={{ color: "#B68", fontSize: 15 }}>/ 목표 {won(goal)}{unit} ({pct}%)</span>
        </div>
        <div style={{ marginTop: 8, height: 14, background: "#fff", borderRadius: 7, overflow: "hidden", border: "1px solid #E3CDD5" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: pct >= 100 ? "#0F6E56" : "#D4537E", borderRadius: 7, transition: "width .5s" }} />
        </div>
      </div>

      {/* 설정 */}
      <div style={{ display: "grid", gap: 14 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} style={{ width: 20, height: 20 }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: active ? "#0F6E56" : "#999" }}>
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
                  border: goalType === g ? "2px solid #7B2D43" : "1.5px solid #D9C5CC",
                  background: goalType === g ? "#7B2D43" : "#fff",
                  color: goalType === g ? "#fff" : "#7B2D43",
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
            <input style={inputStyle} inputMode="numeric" value={goalValue} onChange={(e) => setGoalValue(e.target.value)} placeholder={goalType === "amount" ? "예: 5000000" : "예: 100"} />
          </div>
          <div>
            <span style={labelStyle}>구매자 1인당 포인트</span>
            <input style={inputStyle} inputMode="numeric" value={rewardAmount} onChange={(e) => setRewardAmount(e.target.value)} placeholder="예: 1000" />
          </div>
        </div>

        <div>
          <span style={labelStyle}>제목(선택)</span>
          <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 오늘의 공동목표" maxLength={80} />
        </div>

        {dirty ? <div style={{ fontSize: 13, fontWeight: 700, color: "#C0392B" }}>● 변경됨 — 저장해야 적용돼요</div> : null}
        <button
          type="button"
          onClick={save}
          disabled={saving}
          style={{ padding: "12px", borderRadius: 12, border: dirty ? "2px solid #C0392B" : "none", background: "#7B2D43", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer", opacity: saving ? 0.6 : 1 }}
        >
          {saving ? "저장 중…" : dirty ? "변경사항 저장하기" : "저장"}
        </button>
        {msg ? <div style={{ fontSize: 13, color: msg.includes("실패") ? "#C0392B" : "#0F6E56", fontWeight: 700 }}>{msg}</div> : null}
      </div>

      {/* 2단계: 구매자 전원 지급 */}
      <div style={{ marginTop: 18, borderTop: "1px solid #E3CDD5", paddingTop: 14 }}>
        <span style={labelStyle}>목표 달성 시 — 구매자 전원 포인트 지급</span>
        <div style={{ fontSize: 12, color: "#999", marginBottom: 8 }}>현재 방송의 <b>결제완료 구매자 전원</b>에게 1인당 포인트를 한 번에 지급해요. 같은 방송은 한 번만 지급(중복 방지).</div>

        {prog?.active ? (
          <button
            type="button"
            onClick={endEvent}
            disabled={ending}
            style={{ width: "100%", padding: "11px", borderRadius: 12, border: "2px solid #C0392B", background: "#fff", color: "#C0392B", fontWeight: 800, fontSize: 14, cursor: "pointer", marginBottom: 8, opacity: ending ? 0.6 : 1 }}
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
            border: "2px solid " + (payoutUnlocked ? "#0F6E56" : "#D9C5CC"),
            background: payoutUnlocked ? "#fff" : "#F1EFE8",
            color: payoutUnlocked ? "#0F6E56" : "#aaa",
            fontWeight: 800,
            fontSize: 15,
            cursor: payoutUnlocked ? "pointer" : "not-allowed",
            opacity: paying ? 0.6 : 1,
          }}
        >
          🎁 구매자 전원에게 지급하기
        </button>
        {!payoutUnlocked ? (
          <div style={{ fontSize: 12, color: "#B68", marginTop: 6 }}>※ 위 “🛑 이벤트 종료”를 누르면 지급 버튼이 열려요.</div>
        ) : null}
        {payMsg ? <div style={{ fontSize: 13, marginTop: 8, fontWeight: 700, color: payMsg.includes("실패") && !payMsg.includes("성공") ? "#C0392B" : "#0F6E56" }}>{payMsg}</div> : null}
      </div>

      {/* OBS 위젯 주소 */}
      <div style={{ marginTop: 20, borderTop: "1px solid #E3CDD5", paddingTop: 14 }}>
        <span style={labelStyle}>OBS 방송 위젯주소 (브라우저 소스)</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input style={{ ...inputStyle, background: "#FafAfA" }} readOnly value={widgetUrl} />
          <button
            type="button"
            onClick={() => { void navigator.clipboard?.writeText(widgetUrl); setMsg("위젯주소 복사됨"); }}
            style={{ padding: "9px 16px", borderRadius: 10, border: "none", background: "#7B2D43", color: "#fff", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
          >
            복사
          </button>
        </div>
        <div style={{ fontSize: 12, color: "#999", marginTop: 6 }}>OBS에서 브라우저 소스로 추가 · 배경 투명 · 미션 꺼져 있으면 아무것도 안 보여요. (디자인 미리보기: 주소 끝에 <b>?preview=1</b>)</div>
      </div>

      {payout ? (
        <div style={{ position: "fixed", inset: 0, zIndex: 140, background: "rgba(2,6,23,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={(e) => { if (e.target === e.currentTarget) setPayout(null); }}>
          <div style={{ width: "min(500px,94vw)", maxHeight: "88vh", display: "flex", flexDirection: "column", background: "#fff", borderRadius: 16, padding: 20 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#7B2D43", flexShrink: 0 }}>구매자 전원 포인트 지급 — 최종 확인</div>
            {payout.alreadyPaid ? (
              <div style={{ marginTop: 12, fontSize: 14, color: "#C0392B", fontWeight: 700, lineHeight: 1.6 }}>이미 이 방송 미션 지급이 완료됐어요.<br />중복 지급되지 않습니다.</div>
            ) : (
              <>
                <div style={{ marginTop: 8, fontSize: 13, color: "#888", flexShrink: 0 }}>
                  {payout.broadcastTitle ? `${payout.broadcastTitle} · ` : ""}아래 <b style={{ color: "#7B2D43" }}>{payout.count}명</b>에게 1인당 <b style={{ color: "#7B2D43" }}>{won(payout.reward)}P</b> 지급
                </div>
                <div style={{ marginTop: 10, flex: 1, minHeight: 0, overflowY: "auto", border: "1px solid #eee", borderRadius: 10 }}>
                  {payout.buyers.length === 0 ? (
                    <div style={{ padding: "16px", textAlign: "center", color: "#999", fontSize: 13 }}>지급 대상(결제완료 구매자)이 없어요.</div>
                  ) : (
                    payout.buyers.map((b, i) => (
                      <div key={`${b.phone}-${i}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 11px", borderBottom: "1px solid #f4f4f4", fontSize: 13 }}>
                        <span style={{ color: "#bbb", width: 22, flexShrink: 0 }}>{i + 1}</span>
                        <span style={{ flex: 1, minWidth: 0, fontWeight: 700, color: "#333", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.nickname}</span>
                        <span style={{ color: "#0F6E56", fontWeight: 700, flexShrink: 0 }}>{won(b.amount)}원</span>
                        <span style={{ color: "#aaa", flexShrink: 0, fontSize: 12 }}>{whenText(b.when)}</span>
                      </div>
                    ))
                  )}
                </div>
                <div style={{ marginTop: 10, fontSize: 15, fontWeight: 800, color: "#7B2D43", flexShrink: 0 }}>
                  총 {payout.count}명 · 총 지급 <span style={{ color: "#0F6E56" }}>{won(payout.total)}P</span>
                </div>
              </>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 16, flexShrink: 0 }}>
              <button type="button" onClick={() => setPayout(null)} style={{ flex: 1, padding: "11px", borderRadius: 10, border: "1.5px solid #D9C5CC", background: "#fff", color: "#777", fontWeight: 700, cursor: "pointer" }}>취소</button>
              {!payout.alreadyPaid && payout.count > 0 && payout.reward > 0 ? (
                <button type="button" onClick={doPayout} disabled={paying || executing} style={{ flex: 1, padding: "11px", borderRadius: 10, border: "none", background: "#0F6E56", color: "#fff", fontWeight: 800, cursor: "pointer", opacity: paying || executing ? 0.6 : 1 }}>{paying || executing ? "지급 중…" : `${won(payout.total)}P 지급 실행`}</button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {result ? (
        <div style={{ position: "fixed", inset: 0, zIndex: 141, background: "rgba(2,6,23,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={(e) => { if (e.target === e.currentTarget) setResult(null); }}>
          <div style={{ width: "min(500px,94vw)", maxHeight: "88vh", display: "flex", flexDirection: "column", background: "#fff", borderRadius: 16, padding: 20 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#0F6E56", flexShrink: 0 }}>지급 완료 — 지급 명단</div>
            <div style={{ marginTop: 6, fontSize: 14, fontWeight: 700, color: "#333", flexShrink: 0 }}>
              성공 <b style={{ color: "#0F6E56" }}>{result.successList.length}명</b>
              {result.failed.length ? <> · 실패 <b style={{ color: "#C0392B" }}>{result.failed.length}명</b></> : null}
              {" "}· 총 지급 <b style={{ color: "#0F6E56" }}>{won(result.successList.length * result.reward)}P</b>
            </div>
            <div style={{ marginTop: 10, flex: 1, minHeight: 0, overflowY: "auto", border: "1px solid #eee", borderRadius: 10 }}>
              {result.successList.map((b, i) => (
                <div key={`s-${i}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 11px", borderBottom: "1px solid #f4f4f4", fontSize: 13 }}>
                  <span style={{ color: "#0F6E56", flexShrink: 0, width: 16 }}>✓</span>
                  <span style={{ flex: 1, minWidth: 0, fontWeight: 700, color: "#333", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.nickname}</span>
                  <span style={{ color: "#0F6E56", fontWeight: 800, flexShrink: 0 }}>+{won(result.reward)}P</span>
                </div>
              ))}
              {result.failed.map((f, i) => (
                <div key={`f-${i}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 11px", borderBottom: "1px solid #f4f4f4", fontSize: 13, background: "#fdf0ef" }}>
                  <span style={{ color: "#C0392B", flexShrink: 0, width: 16 }}>✕</span>
                  <span style={{ flex: 1, minWidth: 0, fontWeight: 700, color: "#C0392B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.label}</span>
                  <span style={{ color: "#aaa", flexShrink: 0, fontSize: 11, maxWidth: 170, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.reason}</span>
                </div>
              ))}
            </div>
            {result.failed.length ? <div style={{ marginTop: 8, fontSize: 12, color: "#C0392B", flexShrink: 0 }}>실패자는 고객·이슈 메뉴에서 수동 지급해 주세요.</div> : null}
            <button type="button" onClick={() => setResult(null)} style={{ marginTop: 14, padding: "11px", borderRadius: 10, border: "none", background: "#7B2D43", color: "#fff", fontWeight: 800, cursor: "pointer", flexShrink: 0 }}>닫기</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
