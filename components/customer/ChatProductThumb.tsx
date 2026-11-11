"use client";
import { useState } from "react";

/** Display only; the enclosing chat row retains the existing product-open action. */
export function ChatProductThumb({ src, name, size = "2.25em", placeholder = false }: { src?: string; name: string; size?: number | string; placeholder?: boolean }) {
  const [failed, setFailed] = useState("");
  const show = Boolean(src && failed !== src);
  if (!show && !placeholder) return null;
  const style = { display: "inline-block", width: size, height: size, flexShrink: 0, borderRadius: 6, verticalAlign: "middle", margin: "0 4px", background: "#fff" };
  return show ? <img src={src} alt={name} width={typeof size === "number" ? size : undefined} height={typeof size === "number" ? size : undefined} loading="lazy" onError={() => setFailed(src || "")} style={{ ...style, objectFit: "contain" }} /> : <span aria-label="상품 사진 없음" style={{ ...style, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#777", fontSize: 11 }}>사진 없음</span>;
}
