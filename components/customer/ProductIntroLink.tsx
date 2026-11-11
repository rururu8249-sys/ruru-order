"use client";
import { useEffect, useState } from "react";
import type { ProductIntro } from "@/lib/productIntro";
import { loadProductIntroCatalog, peekProductIntro } from "@/lib/productIntroCatalogClient";

/** Lives beside the price in the existing option sheet. No link for unrecorded products. */
export function ProductIntroLink({ broadcastId, videoId, productId, detailName, onWatch }: {
  broadcastId: string; videoId: string; productId: string; detailName: string; onWatch: (intro: ProductIntro) => void;
}) {
  const [loaded, setLoaded] = useState<{ key: string; intro: ProductIntro | null; failed: boolean } | null>(null);
  const [retry, setRetry] = useState(0);
  const key = JSON.stringify([broadcastId, videoId, productId, detailName]);
  useEffect(() => {
    let canceled = false;
    setLoaded(null);
    void loadProductIntroCatalog(broadcastId, videoId, {productId, detailName}).then(items => {
      if (!canceled) setLoaded({key, intro: items.get(JSON.stringify([productId, detailName])) ?? null, failed: false});
    }).catch(() => {
      const cached = peekProductIntro(broadcastId, videoId, {productId, detailName});
      if (!canceled) setLoaded({key, intro: cached ?? null, failed: cached === undefined});
    });
    return () => { canceled = true; };
  }, [key, broadcastId, videoId, productId, detailName, retry]);
  const cached = peekProductIntro(broadcastId, videoId, {productId, detailName});
  const current = loaded?.key === key ? loaded : cached !== undefined ? {key, intro: cached, failed: false} : null;
  const loading = !current;
  if (current && !current.intro && !current.failed) return null;
  return <button
    type="button"
    aria-label="이 상품 소개영상 보기"
    aria-busy={loading}
    disabled={loading}
    onClick={() => current?.intro ? onWatch(current.intro) : setRetry(value => value + 1)}
    className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 active:brightness-95"
    style={{ display: "flex", alignItems: "center", gap: 10, width: "calc(100% - 32px)", minHeight: 56, margin: "8px 16px 4px", padding: "8px 12px", border: "1px solid #E8C65B", borderRadius: 12, background: "#FFF3C4", color: "#171717", fontFamily: "inherit", textAlign: "left", cursor: "pointer" }}
  >
    <span aria-hidden="true" style={{ display: "grid", placeItems: "center", flexShrink: 0, width: 34, height: 25, borderRadius: 7, background: "#FF0000", color: "#FFFFFF" }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
    </span>
    <span style={{ flex: 1, minWidth: 0 }}>
      <span style={{ display: "block", fontSize: 15, fontWeight: 800, lineHeight: 1.4, wordBreak: "keep-all" }}>이 상품 소개영상 보기</span>
      <span style={{ display: "block", marginTop: 2, fontSize: 11.5, fontWeight: 500, lineHeight: 1.4, color: "#615022", wordBreak: "keep-all" }}>{loading ? "방송영상 확인 중…" : current?.failed ? "확인하지 못했어요. 눌러서 다시 확인" : "이 상품 설명하는 장면부터 재생돼요"}</span>
    </span>
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="m9 5 7 7-7 7" /></svg>
  </button>;
}
