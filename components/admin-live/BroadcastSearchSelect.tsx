"use client";
import { useEffect, useRef, useState } from "react";

type BroadcastOption = { value: string; label: string };

interface Props {
  options: BroadcastOption[];
  value: string;
  onChange: (value: string) => void;
  todayAlwaysLabel: string;
  hideShopOption?: boolean;
}

export default function BroadcastSearchSelect({ options, value, onChange, todayAlwaysLabel, hideShopOption }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 현재 선택된 라벨
  const currentLabel =
    value === "all" ? "방송: 전체보기"
    : value === "none" ? todayAlwaysLabel
    : options.find((o) => o.value === value)?.label ?? "방송 선택";

  // 외부 클릭 시 닫힘
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // 열릴 때 검색창 포커스
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const filtered = query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  const select = (val: string) => {
    onChange(val);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", flexShrink: 0 }} className="w-full sm:w-[185px]">
      {/* 트리거 */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 w-full items-center justify-between rounded-xl border border-line bg-surface px-3 text-[12px] font-black text-ink outline-none transition hover:border-rose-300 active:scale-[0.98] active:bg-surface-2 duration-75"
      >
        <span className="truncate">{currentLabel}</span>
        <span style={{ marginLeft: 6, color: "#aaa", fontSize: 10, flexShrink: 0 }}>{open ? "▲" : "▼"}</span>
      </button>

      {/* 드롭다운 */}
      {open && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 200,
            width: 240, background: "var(--color-surface)", borderRadius: 12,
            boxShadow: "0 8px 28px rgba(0,0,0,0.13)",
            border: "1px solid #e5e5e5", overflow: "hidden",
          }}
        >
          {/* 검색창 */}
          <div style={{ padding: "10px 10px 6px" }}>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="🔍 방송명 검색"
              style={{
                width: "100%", border: "1px solid #e5e5e5", borderRadius: 8,
                padding: "7px 10px", fontSize: 12, outline: "none",
                background: "var(--color-surface)",
              }}
              onFocus={(e) => { e.target.style.borderColor = "#7B2D43"; e.target.style.background = "#fff"; }}
              onBlur={(e) => { e.target.style.borderColor = "#e5e5e5"; e.target.style.background = "#fafafa"; }}
            />
          </div>

          {/* 목록 */}
          <div style={{ maxHeight: 240, overflowY: "auto" }}>
            {/* 전체보기 고정 */}
            {!query && (
              <button type="button" onClick={() => select("all")}
                style={{
                  width: "100%", textAlign: "left", padding: "9px 14px",
                  fontSize: 12, fontWeight: value === "all" ? 800 : 600,
                  color: value === "all" ? "#7B2D43" : "#333",
                  background: value === "all" ? "#fdf0f3" : "transparent",
                  border: "none", cursor: "pointer", display: "block",
                }}
                onMouseEnter={(e) => { (e.target as HTMLElement).style.background = "#fdf0f3"; }}
                onMouseLeave={(e) => { (e.target as HTMLElement).style.background = value === "all" ? "#fdf0f3" : "transparent"; }}
              >
                전체보기
              </button>
            )}

            {/* 방송 목록 */}
            {filtered.length === 0 ? (
              <div style={{ padding: "12px 14px", fontSize: 12, color: "#bbb", textAlign: "center" }}>
                검색 결과 없음
              </div>
            ) : (
              filtered.map((o) => (
                <button type="button" key={o.value} onClick={() => select(o.value)}
                  style={{
                    width: "100%", textAlign: "left", padding: "9px 14px",
                    fontSize: 12, fontWeight: value === o.value ? 800 : 500,
                    color: value === o.value ? "#7B2D43" : "#333",
                    background: value === o.value ? "#fdf0f3" : "transparent",
                    border: "none", cursor: "pointer", display: "block",
                  }}
                  onMouseEnter={(e) => { (e.target as HTMLElement).style.background = "#fdf0f3"; }}
                  onMouseLeave={(e) => { (e.target as HTMLElement).style.background = value === o.value ? "#fdf0f3" : "transparent"; }}
                >
                  {o.label}
                </button>
              ))
            )}

            {/* 공구·상시 고정 */}
            {!query && !hideShopOption && (
              <button type="button" onClick={() => select("none")}
                style={{
                  width: "100%", textAlign: "left", padding: "9px 14px",
                  fontSize: 12, fontWeight: value === "none" ? 800 : 600,
                  color: value === "none" ? "#7B2D43" : "#555",
                  background: value === "none" ? "#fdf0f3" : "#fafafa",
                  border: "none", borderTop: "1px solid #f0f0f0", cursor: "pointer", display: "block",
                }}
                onMouseEnter={(e) => { (e.target as HTMLElement).style.background = "#fdf0f3"; }}
                onMouseLeave={(e) => { (e.target as HTMLElement).style.background = value === "none" ? "#fdf0f3" : "#fafafa"; }}
              >
                {todayAlwaysLabel}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
