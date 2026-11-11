import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { widgetTargetKey, type WidgetProductTarget } from "./widgetProductLibrary";
import { parseProductIntro, type ProductIntroCapture, type ProductIntro } from "./productIntro";
import { introRecordScope } from "./broadcastVideoHistory";

export function productIntroKey(bc: string, videoId: string, target: WidgetProductTarget) {
  const digest = createHash("sha256").update(widgetTargetKey(target)).digest("hex");
  return `product_intro_v1_${bc}_${videoId}_${digest}`;
}
/** Each target has an independent row; concurrent introductions cannot overwrite another product. */
export async function saveProductIntros(sb: SupabaseClient, bc: string, targets: WidgetProductTarget[], capture: ProductIntroCapture, policy: "replace" | "first" = "replace") {
  const recordedAt = new Date().toISOString();
  const inherited = policy === "first" ? await readProductIntroIndex(sb, bc, capture.videoId) : null;
  const targetsOnce = [...new Map(targets.map(t => [widgetTargetKey(t), t])).values()];
  const results = await Promise.allSettled(targetsOnce.map(async target => {
    const key = productIntroKey(bc, capture.videoId, target);
    if (inherited?.has(key)) return "kept";
    const value = JSON.stringify({ ...capture, recordedAt });
    for (let attempt = 0; attempt < 3; attempt++) {
      const current = await sb.from("settings").select("value").eq("key", key).maybeSingle();
      if (current.error) throw new Error("소개영상 위치를 확인하지 못했어요.");
      const previous = parseProductIntro(current.data?.value, capture.videoId);
      // Repeated introductions keep the first point; explicit corrections may replace it.
      if (previous && policy === "first") return "kept";
      // Same capture is idempotent; an older request must not overwrite a newer introduction.
      if (previous && previous.capturedAt >= capture.capturedAt) return "kept";
      if (current.data) {
        let update = sb.from("settings").update({ value, updated_at: recordedAt }).eq("key", key);
        update = current.data.value == null ? update.is("value", null) : update.eq("value", current.data.value);
        const saved = await update.select("key").maybeSingle();
        if (saved.error) throw new Error("소개영상 위치를 저장하지 못했어요.");
        if (saved.data) return "saved";
      } else {
        const saved = await sb.from("settings").insert({ key, value, updated_at: recordedAt });
        if (!saved.error) return "saved";
        if (saved.error.code !== "23505") throw new Error("소개영상 위치를 저장하지 못했어요.");
      }
    }
    throw new Error("소개영상 위치가 변경됐어요. 다시 소개해 주세요.");
  }));
  if (results.some(result => result.status === "rejected")) throw new Error("일부 소개영상 위치를 저장하지 못했어요.");
  return { saved: results.filter(r => r.status === "fulfilled" && r.value === "saved").length, kept: results.filter(r => r.status === "fulfilled" && r.value === "kept").length };
}
export async function readProductIntro(sb: SupabaseClient, bc: string, videoId: string, target: WidgetProductTarget): Promise<ProductIntro | null> {
  return (await readProductIntroIndex(sb, bc, videoId)).get(productIntroKey(bc, videoId, target)) ?? null;
}

/** A timestamp belongs to a video, even when that video is reattached to another
 * sales broadcast. Only the public route's current, visible exact targets are exposed. */
export async function readProductIntroIndex(sb: SupabaseClient, bc: string, videoId: string) {
  const escape = (s: string) => s.replace(/[\\%_]/g, "\\$&");
  const pattern = `${escape("product_intro_v1_")}%${escape(`_${videoId}_`)}%`;
  const records = new Map<string, ProductIntro>();
  for (let offset = 0; ; offset += 1000) {
    const result = await sb.from("settings").select("key,value").like("key", pattern).order("key").range(offset, offset + 999);
    if (result.error) throw new Error("소개영상을 확인하지 못했어요.");
    for (const row of result.data ?? []) {
      const source = introRecordScope(String(row.key));
      if (!source || source.videoId !== videoId) continue;
      const intro = parseProductIntro(row.value, videoId);
      const key = `product_intro_v1_${bc}_${videoId}_${source.digest}`;
      const previous = records.get(key);
      if (intro && (!previous || intro.capturedAt > previous.capturedAt)) records.set(key, intro);
    }
    if ((result.data ?? []).length < 1000) return records;
  }
}

/** Remove every stored point for these products in this video (including copies saved
 * under another sales broadcast that reused the same video), so the next introduction
 * records a fresh point. Only product_intro rows are touched. */
export async function clearProductIntros(sb: SupabaseClient, videoId: string, targets: WidgetProductTarget[]) {
  const escape = (s: string) => s.replace(/[\\%_]/g, "\\$&");
  let removed = 0;
  for (const target of new Map(targets.map(t => [widgetTargetKey(t), t])).values()) {
    const digest = createHash("sha256").update(widgetTargetKey(target)).digest("hex");
    const pattern = `${escape("product_intro_v1_")}%${escape(`_${videoId}_${digest}`)}`;
    const result = await sb.from("settings").delete().like("key", pattern).select("key");
    if (result.error) throw new Error("소개영상 위치를 지우지 못했어요.");
    removed += (result.data ?? []).filter(row => introRecordScope(String(row.key))?.digest === digest).length;
  }
  return removed;
}
