"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BotCandidate } from "@/lib/liveChatBot";
import { CHAT_PRODUCT_LIMIT, searchChatProductGroups } from "@/lib/liveChatProductCommand";
import { widgetTargetKey } from "@/lib/widgetProductLibrary";
import { ChatProductThumb } from "./ChatProductThumb";
import { resolveOperatorCodes, buildBatchAnnouncement } from "@/lib/liveOperatorBatch";

export function ChatProductPicker({ broadcastId, query, busy, onApply, onClose }: {
  broadcastId: string; query: string; busy: boolean;
  onApply: (items: BotCandidate[], mode: "replace" | "append", replaceIntro: boolean) => void; onClose: () => void;
}) {
  const [items, setItems] = useState<BotCandidate[]>([]);
  const [status, setStatus] = useState("상품을 불러오는 중…");
  const [attempt, setAttempt] = useState(0);
  const [preview, setPreview] = useState<BotCandidate | null>(null);
  const [replaceIntro, setReplaceIntro] = useState(false);
  const [copyHint, setCopyHint] = useState("");
  const [active, setActive] = useState(0);
  const [chosen, setChosen] = useState<string[]>([]);
  const [excluded, setExcluded] = useState<{ query: string; keys: string[] }>({ query: "", keys: [] });
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    setItems([]); setChosen([]); setStatus("상품을 불러오는 중…");
    const kid = localStorage.getItem("ruru_kakao_id") || "";
    void fetch(`/api/live-chat/products?${new URLSearchParams({ bc: broadcastId, kakao_id: kid })}`, { cache: "no-store", signal: controller.signal })
      .then(r => r.json()).then(j => {
        if (controller.signal.aborted) return;
        if (!j.ok) throw new Error(j.message);
        setItems(j.items); setStatus("");
      }).catch(e => { if (!controller.signal.aborted) setStatus(e.message || "상품을 불러오지 못했어요."); });
    return () => controller.abort();
  }, [broadcastId, attempt]);
  const groups = useMemo(() => searchChatProductGroups(query, items), [items, query]);
  const codeParts = query.trim().split(/[\s,，;；]+/).filter(Boolean);
  const batchMode = codeParts.length > 1 && codeParts.every(code => /^[a-z]{1,8}-?\d{2,6}[a-z]?$/i.test(code));
  const batch = useMemo(() => batchMode ? resolveOperatorCodes(query, items) : null, [batchMode, query, items]);
  const multi = groups.length > 1;
  const filtered = useMemo(() => batch ? batch.matched : [...new Map(groups.filter(g => !multi || g.term).flatMap(g => g.items).map(p => [widgetTargetKey(p), p])).values()], [groups, multi, batch]);
  // Reconcile automatic matches with the CURRENT query, so typing BB-307 cannot retain BB-30.
  // Only explicit checkbox choices survive a different search.
  const autoKeys = batch ? batch.matched.filter(p => !p.soldOut).map(widgetTargetKey) : multi ? groups.filter(g => g.term && g.items.length === 1 && !g.items[0].soldOut).map(g => widgetTargetKey(g.items[0])) : [];
  const excludedKeys = excluded.query === query ? excluded.keys : [];
  const selectedKeys = [...new Set([...chosen, ...autoKeys.filter(key => !excludedKeys.includes(key))])].slice(0, CHAT_PRODUCT_LIMIT);
  const selected = selectedKeys.flatMap(key => items.filter(p => widgetTargetKey(p) === key));
  useEffect(() => setActive(0), [query, items]);
  useEffect(() => { box.current?.querySelector(`[data-product-index="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active]);
  const toggle = useCallback((p: BotCandidate) => {
    if (busy || p.soldOut) return;
    const key = widgetTargetKey(p);
    if (selectedKeys.includes(key)) {
      setChosen(prev => prev.filter(k => k !== key));
      setExcluded(prev => ({ query, keys: [...(prev.query === query ? prev.keys : []), key] }));
    } else if (selectedKeys.length < CHAT_PRODUCT_LIMIT) {
      setChosen(prev => [...prev, key]);
      setExcluded(prev => ({ query, keys: (prev.query === query ? prev.keys : []).filter(k => k !== key) }));
    }
  }, [busy, query, selectedKeys]);
  const unresolved = batch ? [] : multi ? groups.filter(g => !g.term || !g.items.some(p => selectedKeys.includes(widgetTargetKey(p)))) : [];
  const missing = batch ? batch.invalid : groups.filter(g => g.term && !g.items.length).map(g => g.term);
  const ambiguous = batch?.ambiguous ?? [];
  const canApply = !busy && !status && selected.length > 0 && !unresolved.length && !missing.length && !ambiguous.length && !selected.some(p => p.soldOut);
  const announcement = selected.length ? buildBatchAnnouncement(selected) : "";
  // Capture the composer keys before its ordinary chat/emoji Enter handler.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!(e.target instanceof HTMLElement) || !e.target.hasAttribute("data-live-chat-input") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.isComposing || e.keyCode === 229) { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); } return; }
      if (!["ArrowUp", "ArrowDown", "Enter", "Escape"].includes(e.key)) return;
      e.preventDefault(); e.stopPropagation();
      if (busy) return;
      if (e.key === "Escape") onClose();
      else if (e.key === "Enter") { if (!e.repeat && filtered[active]) toggle(filtered[active]); }
      else setActive(i => Math.max(0, Math.min(filtered.length - 1, i + (e.key === "ArrowUp" ? -1 : 1))));
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [filtered, active, busy, toggle, onClose]);
  return <section aria-label="방송 상품 선택" style={{ color: "#fff", background: "#202020", border: "1px solid #555", borderRadius: 12, marginBottom: 8, overflow: "hidden" }}>
    <div style={{ padding: "4px 12px", display: "flex", alignItems: "center", gap: 8 }}><strong style={{ flex: 1, fontSize: 14 }}>소개할 상품 선택 · {selected.length}/{CHAT_PRODUCT_LIMIT}</strong><button type="button" disabled={busy} aria-label="상품 선택 닫기" onClick={onClose} style={{ background: "none", border: 0, color: "#fff", minWidth: 44, minHeight: 44 }}>✕</button></div>
    <div style={{ padding: "0 12px 8px", color: "#bbb", fontSize: 12 }}>채팅창에 /HR-11 HR-12 HR-13 또는 /HR-11,HR-12 입력 · 코드가 정확히 일치할 때만 자동 선택</div>
    {selected.length > 0 && <div aria-label="선택한 상품" data-live-scroll="1" style={{ display: "flex", gap: 6, overflowX: "auto", padding: "0 12px 8px" }}>{selected.map(p => <button type="button" key={widgetTargetKey(p)} disabled={busy} aria-label={`${p.texts[0]} 선택 해제`} onClick={() => toggle(p)} style={{ flexShrink: 0, minHeight: 44, borderRadius: 8, border: "1px solid #6785a9", background: "#2d4059", color: "#fff", padding: "4px 10px", fontSize: 12 }}>{p.texts[0]} ×</button>)}</div>}
    {status ? <div role="status" style={{ padding: 12 }}>{status}{!status.includes("중") && <button type="button" onClick={() => setAttempt(n => n + 1)}>다시 시도</button>}</div> : null}
    {!status && (missing.length > 0 || ambiguous.length > 0 || unresolved.length > 0) && <div role="status" style={{ padding: "4px 12px 8px", color: "#ffd794", fontSize: 12 }}>{missing.length ? `못 찾은 코드: ${missing.join(", ")}` : ambiguous.length ? `중복 상품번호: ${ambiguous.join(", ")} · 직접 확인해 주세요` : `상품을 선택해 주세요: ${unresolved.map(g => g.term || "쉼표 뒤 상품명").join(", ")}`}</div>}
    {selected.length === CHAT_PRODUCT_LIMIT && <div style={{ padding: "4px 12px", color: "#ffd794", fontSize: 12 }}>한 번에 {CHAT_PRODUCT_LIMIT}개까지 선택할 수 있어요.</div>}
    <div ref={box} data-live-scroll="1" role="listbox" aria-multiselectable="true" aria-label="방송 상품" style={{ maxHeight: "min(240px, 26dvh)", overflowY: "auto", overscrollBehavior: "contain" }}>
      {filtered.map((p, i) => {
        const checked = selectedKeys.includes(widgetTargetKey(p));
        return <div key={widgetTargetKey(p)} data-product-index={i} style={{ display: "flex", alignItems: "center", minHeight: 64, borderTop: "1px solid #333", background: active === i ? "#344052" : checked ? "#273344" : "transparent" }}>
          <button type="button" aria-label={`${p.texts[0]} 사진 크게 보기`} onPointerDown={e => e.preventDefault()} onClick={() => setPreview(p)} style={{ flexShrink: 0, border: 0, background: "transparent", padding: "8px 4px 8px 10px", cursor: "zoom-in" }}><ChatProductThumb src={p.imageUrl} name={p.texts[0]} size={56} placeholder /></button>
          <button type="button" role="option" aria-label={p.line} aria-selected={checked} disabled={busy || p.soldOut || (!checked && selected.length >= CHAT_PRODUCT_LIMIT)} onPointerDown={e => e.preventDefault()} onClick={() => toggle(p)} onFocus={() => setActive(i)} style={{ flex: 1, display: "flex", alignItems: "center", gap: 9, textAlign: "left", padding: "8px", minHeight: 64, border: 0, background: "transparent", color: p.soldOut ? "#999" : "#fff", cursor: "pointer", fontSize: 13, lineHeight: 1.5 }}><span aria-hidden="true" style={{ fontSize: 20 }}>{checked ? "☑" : "☐"}</span><span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{p.line}{p.soldOut ? " · 품절" : ""}</span></button>
        </div>;
      })}
      {!status && !filtered.length && <div style={{ padding: 12 }}>일치하는 방송 상품이 없어요.</div>}
    </div>
    {preview && <div role="dialog" aria-modal="true" aria-label="원본 상품사진 확대" style={{ padding: 12, borderTop: "1px solid #555", background: "#111", display: "grid", gap: 8 }}><button type="button" onClick={() => setPreview(null)} style={{ justifySelf: "end", background: "#444", color: "#fff", border: 0, borderRadius: 8, padding: 8 }}>사진 닫기 ✕</button>{preview.imageUrl ? <img src={preview.imageUrl} alt={preview.texts[0] || preview.line} style={{ width: "100%", maxHeight: "40dvh", objectFit: "contain", background: "#fff" }} /> : <span>등록된 사진이 없어요.</span>}<strong>{preview.line}</strong></div>}
    <div style={{ padding: 10, borderTop: "1px solid #444" }}>
      {announcement && <div aria-label="자동 생성 상품 안내문" style={{ background: "#303030", borderRadius: 8, padding: 10, fontSize: 12, whiteSpace: "pre-wrap", lineHeight: 1.5, marginBottom: 8 }}>{announcement}<button type="button" onClick={() => void navigator.clipboard.writeText(announcement).then(() => setCopyHint("안내문 복사 완료")).catch(() => setCopyHint("복사에 실패했어요"))} style={{ display: "block", marginTop: 8, minHeight: 36, borderRadius: 8, border: 0, padding: "0 12px", background: "#fff", color: "#111", fontWeight: 700 }}>안내문 복사</button>{copyHint ? <small role="status">{copyHint}</small> : null}</div>}
      <label style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 8, fontSize: 12 }}><input type="checkbox" checked={replaceIntro} onChange={e => setReplaceIntro(e.target.checked)} />기존 소개영상 위치도 현재 장면으로 바꾸기</label>
      <div style={{ display: "flex", gap: 8 }}>
        {([['replace', '상품 소개 · 위젯 적용'], ['append', '기존 순환에 추가']] as const).map(([mode, label]) => <button key={mode} type="button" data-product-apply={mode} disabled={!canApply} onClick={() => { if (canApply) onApply(selected, mode, mode === "replace" && replaceIntro); }} style={{ flex: 1, minHeight: 44, border: "1px solid #666", borderRadius: 8, padding: "6px 8px", background: mode === "replace" ? "#fff" : "#303030", color: mode === "replace" ? "#111" : "#fff", opacity: canApply ? 1 : 0.45, fontSize: 12, fontWeight: 700 }}>{busy ? "적용 중…" : label}</button>)}
      </div>
      <div style={{ color: "#aaa", fontSize: 11, marginTop: 6 }}>선택 상품이 유튜브 위젯과 사이트 상품 카드에 함께 표시돼요.</div>
      <div style={{ color: "#aaa", fontSize: 11, marginTop: 6 }}>영상 위치는 처음 등록 시 자동 기록됩니다. 체크하면 기존 위치를 현재 재생 지점으로 변경합니다.</div>
    </div>
  </section>;
}
