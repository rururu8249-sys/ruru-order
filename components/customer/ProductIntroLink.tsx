"use client";
import { useEffect, useState } from "react";
import { parseProductIntro, type ProductIntro } from "@/lib/productIntro";

/** Lives beside the price in the existing option sheet. No link for unrecorded products. */
export function ProductIntroLink({ broadcastId, videoId, productId, detailName, onWatch }: {
  broadcastId: string; videoId: string; productId: string; detailName: string; onWatch: (intro: ProductIntro) => void;
}) {
  const [loaded, setLoaded] = useState<{ key: string; intro: ProductIntro } | null>(null);
  const key = JSON.stringify([broadcastId, videoId, productId, detailName]);
  useEffect(() => {
    const controller = new AbortController();
    setLoaded(null);
    const params = new URLSearchParams({ bc: broadcastId, video: videoId, product: productId, detail: detailName });
    void fetch(`/api/live-chat/product-intro?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(r => r.ok ? r.json() : null).then(data => {
        const intro = parseProductIntro(data?.intro, videoId);
        if (intro && !controller.signal.aborted) setLoaded({ key, intro });
      }).catch(() => {});
    return () => controller.abort();
  }, [key, broadcastId, videoId, productId, detailName]);
  if (!loaded || loaded.key !== key) return null;
  return <button type="button" onClick={() => onWatch(loaded.intro)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%", minHeight: 44, padding: "8px 16px", border: 0, borderBottom: "1px solid #E5E5E5", background: "#F5F5F5", color: "#111111", fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer" }}><span>소개영상 보기</span><span aria-hidden="true">›</span></button>;
}
