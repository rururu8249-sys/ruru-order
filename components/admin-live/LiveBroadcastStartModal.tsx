"use client";

// components/admin-live/LiveBroadcastStartModal.tsx
// [2026-09-08 4단계-B] 방송 시작 확인창 — 여기서 이번 방송 미션 게이지까지 한 번에 켠다.
//   · 예전: showAdminConfirm 글자 확인창 + 미션은 이벤트 › 미션 탭에서 따로 켜야 해서 잘 안 쓰게 됨
//   · 미션 저장은 부모(AdminLiveDashboard.startBroadcast)가 방송을 켠 "다음"에 /api/admin-live/mission 으로 한다
//     (미션 앵커 = 현재 ON 방송이라 순서가 중요). 이 파일은 입력만 받는다 — 돈/포인트 로직 없음.
//   · 마지막 미션 값은 localStorage 에 기억(편의). 실제 기준값은 서버 settings.

import { useEffect, useState } from "react";

export type MissionGoalType = "count" | "amount";

export type MissionStartInput = {
  goalType: MissionGoalType;
  goalValue: number;
  rewardAmount: number;
  title: string;
};

export type BroadcastStartConfirmInput = {
  /** null 이면 이번 방송은 미션 없음 */
  mission: MissionStartInput | null;
};

type Props = {
  open: boolean;
  broadcastTitle: string;
  saving: boolean;
  onCancel: () => void;
  onConfirm: (input: BroadcastStartConfirmInput) => void | Promise<void>;
};

const LAST_KEY = "ruru_mission_last";

function digits(v: string) {
  return v.replace(/[^0-9]/g, "");
}
function withComma(v: string) {
  const d = digits(v);
  return d ? Number(d).toLocaleString("ko-KR") : "";
}

export default function LiveBroadcastStartModal({ open, broadcastTitle, saving, onCancel, onConfirm }: Props) {
  const [missionOn, setMissionOn] = useState(false);
  const [goalType, setGoalType] = useState<MissionGoalType>("amount");
  const [goalValue, setGoalValue] = useState("");
  const [rewardAmount, setRewardAmount] = useState("");
  const [missionTitle, setMissionTitle] = useState("");
  const [error, setError] = useState("");

  // 열릴 때마다 마지막 값 불러오기(다음 틱 — 서버 렌더와 안 어긋나게)
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      setError("");
      try {
        const raw = window.localStorage.getItem(LAST_KEY);
        if (!raw) return;
        const j = JSON.parse(raw) as Partial<MissionStartInput> & { on?: boolean };
        if (j.goalType === "count" || j.goalType === "amount") setGoalType(j.goalType);
        if (typeof j.goalValue === "number" && j.goalValue > 0) setGoalValue(String(j.goalValue));
        if (typeof j.rewardAmount === "number" && j.rewardAmount >= 0) setRewardAmount(String(j.rewardAmount));
        if (typeof j.title === "string") setMissionTitle(j.title);
        if (typeof j.on === "boolean") setMissionOn(j.on);
      } catch {
        /* 기억된 값 없음 */
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (!open) return null;

  const goalNum = Number(digits(goalValue)) || 0;
  const rewardNum = Number(digits(rewardAmount)) || 0;
  const unit = goalType === "amount" ? "원" : "개";

  const confirm = async () => {
    setError("");
    let mission: MissionStartInput | null = null;
    if (missionOn) {
      if (goalNum <= 0) {
        setError(goalType === "amount" ? "목표 매출 금액을 적어 주세요." : "목표 판매 개수를 적어 주세요.");
        return;
      }
      mission = { goalType, goalValue: goalNum, rewardAmount: rewardNum, title: missionTitle.trim() };
    }
    try {
      window.localStorage.setItem(
        LAST_KEY,
        JSON.stringify({ on: missionOn, goalType, goalValue: goalNum, rewardAmount: rewardNum, title: missionTitle.trim() }),
      );
    } catch {
      /* 무시 */
    }
    await onConfirm({ mission });
  };

  const segBtn = (activeSeg: boolean) =>
    `flex-1 rounded-xl border px-3 py-2 text-sm font-black transition ${
      activeSeg ? "border-rose-deep bg-rose-deep text-white" : "border-line bg-surface text-ink-soft hover:bg-surface-2"
    }`;
  const inputClass =
    "h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm font-black text-ink outline-none transition focus:border-rose-deep focus:ring-4 focus:ring-rose-soft";

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-[var(--color-ink-soft)]/45 px-3 py-5">
      <div className="w-full max-w-lg rounded-2xl border border-white/80 bg-surface p-5 shadow-2xl">
        <div className="text-xs font-black tracking-[0.2em] text-rose-deep">START BROADCAST</div>
        <h2 className="mt-1 text-2xl font-black tracking-[-0.04em] text-ink">방송을 시작할까요?</h2>
        <div className="mt-3 rounded-2xl border border-line bg-surface-2 px-4 py-3 text-sm font-bold text-ink">
          <div className="text-[11px] font-black text-ink-mute">방송 제목</div>
          <div className="mt-0.5 text-base font-black text-ink">{broadcastTitle || "제목 없음"}</div>
          <div className="mt-2 text-xs font-bold leading-5 text-ink-soft">
            지금부터 들어오는 주문이 이 방송으로 묶입니다. 켜져 있던 방송이 있으면 자동으로 종료됩니다.
          </div>
        </div>

        {/* 미션 게이지 */}
        <div className="mt-3 rounded-2xl border border-line bg-surface p-4">
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span>
              <span className="text-sm font-black text-ink">🎯 이번 방송 미션 게이지</span>
              <span className="mt-0.5 block text-xs font-bold text-ink-mute">
                방송 화면에 목표 막대가 뜨고, 방송 종료 때 달성 여부와 지급 버튼이 나옵니다.
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={missionOn}
              onClick={() => setMissionOn((v) => !v)}
              className={`shrink-0 rounded-full px-4 py-2 text-xs font-black transition ${
                missionOn ? "bg-rose-deep text-white" : "border border-line bg-surface text-ink-soft"
              }`}
            >
              {missionOn ? "켜짐" : "꺼짐"}
            </button>
          </label>

          {missionOn ? (
            <div className="mt-3 grid gap-3">
              <div className="flex gap-2">
                <button type="button" className={segBtn(goalType === "amount")} onClick={() => setGoalType("amount")}>
                  매출 금액
                </button>
                <button type="button" className={segBtn(goalType === "count")} onClick={() => setGoalType("count")}>
                  판매 개수
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-black text-ink-soft">목표 ({unit})</span>
                  <input
                    value={withComma(goalValue)}
                    onChange={(e) => setGoalValue(digits(e.target.value))}
                    inputMode="numeric"
                    placeholder={goalType === "amount" ? "예: 3,000,000" : "예: 100"}
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-black text-ink-soft">달성 시 구매자 1인당 포인트</span>
                  <input
                    value={withComma(rewardAmount)}
                    onChange={(e) => setRewardAmount(digits(e.target.value))}
                    inputMode="numeric"
                    placeholder="예: 2,000 (0 = 포인트 대신 선물)"
                    className={inputClass}
                  />
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-black text-ink-soft">미션 이름 (방송 화면에 표시, 비워도 됨)</span>
                <input
                  value={missionTitle}
                  onChange={(e) => setMissionTitle(e.target.value.slice(0, 40))}
                  placeholder="예: 오늘 300만원 달성하면 전원 2,000P"
                  className={inputClass}
                />
              </label>
              <div className="text-[11px] font-bold leading-5 text-ink-mute">
                결제완료된 주문만 셉니다. 방송 화면 위젯 주소는 이벤트 › 미션 탭에 있습니다.
              </div>
            </div>
          ) : null}
        </div>

        {error ? <div className="mt-3 text-sm font-black text-danger-tx">{error}</div> : null}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-black text-ink hover:bg-surface-2 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={saving}
            className="rounded-2xl bg-rose-deep px-5 py-3 text-sm font-black text-white shadow-sm transition hover:opacity-90 disabled:cursor-wait disabled:opacity-50"
          >
            {saving ? "시작 중..." : missionOn ? "▶ 방송 시작 · 미션 켜기" : "▶ 방송 시작"}
          </button>
        </div>
      </div>
    </div>
  );
}
