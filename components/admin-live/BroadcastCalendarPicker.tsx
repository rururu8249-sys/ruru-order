"use client";
import { useEffect, useMemo, useRef, useState } from "react";

export type BroadcastCalendarItem = {
  id: string;
  dateKey: string; // "YYYY-MM-DD" (KST 기준, 부모에서 변환해서 전달)
  label: string;
};

interface Props {
  items: BroadcastCalendarItem[];
  value: string; // 선택된 방송 id 또는 "all"
  onPick: (broadcastId: string) => void; // 방송 선택(부모가 scope=broadcast로 맞춤)
}

const ROSE = "#7B2D43";
const ROSE_LINE = "#E3D3D9";
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export default function BroadcastCalendarPicker({ items, value, onPick }: Props) {
  const [open, setOpen] = useState(false);
  const [dayPick, setDayPick] = useState<string>(""); // 하루에 방송 여러개일 때 고르는 중인 날짜키
  const wrapRef = useRef<HTMLDivElement>(null);

  // 날짜키 -> 그 날 방송들
  const byDate = useMemo(() => {
    const map = new Map<string, BroadcastCalendarItem[]>();
    for (const it of items) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(it.dateKey)) continue;
      const arr = map.get(it.dateKey) || [];
      arr.push(it);
      map.set(it.dateKey, arr);
    }
    return map;
  }, [items]);

  // 처음 보여줄 달: 선택된 방송이 있으면 그 달, 없으면 가장 최근 방송 달, 그것도 없으면 이번 달
  const initialMonth = useMemo(() => {
    const selected = items.find((it) => it.id === value);
    const base =
      selected?.dateKey ||
      [...byDate.keys()].sort().reverse()[0] ||
      `${new Date().getFullYear()}-${pad2(new Date().getMonth() + 1)}-01`;
    const [y, m] = base.split("-").map(Number);
    return { year: y, month: m };
  }, [items, value, byDate]);

  const [view, setView] = useState(initialMonth);

  // 팝업 열 때마다 기준 달을 다시 맞춘다
  useEffect(() => {
    if (open) {
      setView(initialMonth);
      setDayPick("");
    }
  }, [open, initialMonth]);

  // 외부 클릭 닫힘
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setDayPick("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const currentLabel =
    value === "all"
      ? "방송 전체"
      : items.find((it) => it.id === value)?.label || "날짜로 방송 고르기";

  const firstWeekday = new Date(view.year, view.month - 1, 1).getDay();
  const daysInMonth = new Date(view.year, view.month, 0).getDate();

  const moveMonth = (delta: number) => {
    setDayPick("");
    setView((prev) => {
      const d = new Date(prev.year, prev.month - 1 + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() + 1 };
    });
  };

  const pick = (broadcastId: string) => {
    onPick(broadcastId);
    setOpen(false);
    setDayPick("");
  };

  const handleDayClick = (dateKey: string) => {
    const list = byDate.get(dateKey) || [];
    if (list.length === 0) return;
    if (list.length === 1) {
      pick(list[0].id);
    } else {
      setDayPick(dateKey); // 여러 개면 아래에서 고르기
    }
  };

  const dayPickList = dayPick ? byDate.get(dayPick) || [] : [];

  return (
    <div ref={wrapRef} style={{ position: "relative", flexShrink: 0 }} className="w-full sm:w-[200px]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-[12px] font-black text-slate-700 outline-none transition hover:border-rose-300 active:scale-[0.98] duration-75"
      >
        <span className="flex items-center gap-1 truncate">
          <span style={{ color: ROSE }}>📅</span>
          <span className="truncate">{currentLabel}</span>
        </span>
        <span style={{ marginLeft: 6, color: "#aaa", fontSize: 10, flexShrink: 0 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 200,
            width: 300, background: "#fff", borderRadius: 12,
            boxShadow: "0 8px 28px rgba(0,0,0,0.16)", border: "1px solid #e5e5e5",
            padding: 12,
          }}
        >
          {/* 헤더: 달 이동 + 전체 방송 */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <button type="button" onClick={() => moveMonth(-1)}
              style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${ROSE_LINE}`, background: "#fff", color: ROSE, cursor: "pointer", fontWeight: 900 }}>‹</button>
            <span style={{ fontSize: 13, fontWeight: 800, color: ROSE }}>{view.year}년 {view.month}월</span>
            <button type="button" onClick={() => moveMonth(1)}
              style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${ROSE_LINE}`, background: "#fff", color: ROSE, cursor: "pointer", fontWeight: 900 }}>›</button>
          </div>

          <button type="button" onClick={() => pick("all")}
            style={{
              width: "100%", marginBottom: 10, padding: "7px 0", borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: "pointer",
              border: value === "all" ? `1px solid ${ROSE}` : `1px solid ${ROSE_LINE}`,
              background: value === "all" ? ROSE : "#fff",
              color: value === "all" ? "#fff" : ROSE,
            }}>
            전체 방송 보기
          </button>

          {/* 요일 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginBottom: 4 }}>
            {WEEKDAYS.map((w, i) => (
              <div key={w} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: i === 0 ? "#C0392B" : i === 6 ? "#185FA5" : "#999" }}>{w}</div>
            ))}
          </div>

          {/* 날짜 그리드 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
            {Array.from({ length: firstWeekday }).map((_, i) => <div key={`b${i}`} />)}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
              const dateKey = `${view.year}-${pad2(view.month)}-${pad2(d)}`;
              const list = byDate.get(dateKey) || [];
              const has = list.length > 0;
              const selectedHere = has && list.some((it) => it.id === value);
              return (
                <button key={dateKey} type="button" disabled={!has} onClick={() => handleDayClick(dateKey)}
                  style={{
                    position: "relative", height: 34, borderRadius: 8, fontSize: 12,
                    border: "none", cursor: has ? "pointer" : "default",
                    background: selectedHere ? ROSE : has ? "#F9F0F2" : "transparent",
                    color: selectedHere ? "#fff" : has ? ROSE : "#ccc",
                    fontWeight: has ? 800 : 500,
                  }}
                  title={has ? list.map((it) => it.label).join(", ") : ""}
                >
                  {d}
                  {has && !selectedHere && (
                    <span style={{ position: "absolute", bottom: 4, left: "50%", transform: "translateX(-50%)", width: 4, height: 4, borderRadius: "50%", background: ROSE }} />
                  )}
                  {has && list.length > 1 && (
                    <span style={{ position: "absolute", top: 2, right: 3, fontSize: 9, fontWeight: 800, color: selectedHere ? "#fff" : ROSE }}>{list.length}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* 하루에 방송 여러 개일 때 고르기 */}
          {dayPickList.length > 1 && (
            <div style={{ marginTop: 10, borderTop: "1px solid #f0e5e9", paddingTop: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#999", marginBottom: 6 }}>이 날 방송 선택</div>
              {dayPickList.map((it) => (
                <button key={it.id} type="button" onClick={() => pick(it.id)}
                  style={{ width: "100%", textAlign: "left", padding: "8px 10px", marginBottom: 4, borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", border: `1px solid ${ROSE_LINE}`, background: it.id === value ? ROSE : "#fff", color: it.id === value ? "#fff" : ROSE }}>
                  {it.label}
                </button>
              ))}
            </div>
          )}

          {byDate.size === 0 && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#bbb", textAlign: "center" }}>등록된 방송이 없습니다</div>
          )}
        </div>
      )}
    </div>
  );
}
