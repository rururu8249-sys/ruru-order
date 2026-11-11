import type { SupabaseClient } from "@supabase/supabase-js";
import { youtubeVideoIdFromUrl } from "./liveWatch";
import { buildBroadcastVideoHistory, VIDEO_HISTORY_PREFIX, type BroadcastVideoRecord, type VideoBroadcastRow } from "./broadcastVideoHistory";

export async function loadBroadcastVideoHistory(sb: SupabaseClient) {
  const broadcasts: VideoBroadcastRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    const result = await sb.from("broadcasts").select("id,public_title,youtube_live_url,started_at,created_at,is_deleted").order("id").range(offset, offset + 999);
    if (result.error) throw new Error("지난 방송을 불러오지 못했어요.");
    broadcasts.push(...result.data);
    if (result.data.length < 1000) break;
  }
  const archived: BroadcastVideoRecord[] = [], intros: {key: string; value: unknown}[] = [];
  for (const prefix of [VIDEO_HISTORY_PREFIX, "product_intro_v1_"]) {
    for (let offset = 0; ; offset += 1000) {
      const result = await sb.from("settings").select("key,value").like("key", prefix.replace(/[\\%_]/g,"\\$&") + "%").order("key").range(offset, offset + 999);
      if (result.error) throw new Error("영상 기록을 불러오지 못했어요.");
      for (const row of result.data) {
        if (prefix === VIDEO_HISTORY_PREFIX) {
          try { const value = typeof row.value === "string" ? JSON.parse(row.value) : row.value; if (value && typeof value === "object") archived.push(value); } catch { /* Ignore an invalid history entry. */ }
        } else intros.push(row);
      }
      if (result.data.length < 1000) break;
    }
  }
  return buildBroadcastVideoHistory(broadcasts, archived, intros);
}

export type ReplaceBroadcastVideoInput = {broadcastId: string; title: string; youtubeUrl: string; expectedUrl: string};
export class VideoHistoryConflict extends Error {}
export async function replaceBroadcastVideo(sb: SupabaseClient, input: ReplaceBroadcastVideoInput) {
  const result = await sb.from("broadcasts").select("*").eq("id", input.broadcastId).maybeSingle();
  if (result.error) throw new Error("현재 방송을 확인하지 못했어요.");
  const current = result.data;
  if (!current || current.is_deleted) throw new Error("방송을 찾을 수 없어요.");
  if (String(current.youtube_live_url || "") !== input.expectedUrl) throw new VideoHistoryConflict("다른 화면에서 영상이 변경됐어요. 페이지를 새로고침한 뒤 다시 선택해 주세요.");
  const previousVideo = youtubeVideoIdFromUrl(current.youtube_live_url);
  if (previousVideo && previousVideo !== youtubeVideoIdFromUrl(input.youtubeUrl)) {
    const record: BroadcastVideoRecord = {broadcastId: input.broadcastId, videoId: previousVideo, title: current.public_title || "지난 방송", date: current.started_at || current.created_at || new Date().toISOString()};
    // Archive BEFORE replacing the only URL. A failed archive leaves the old video selected.
    const saved = await sb.from("settings").upsert({key: `${VIDEO_HISTORY_PREFIX}${input.broadcastId}_${previousVideo}`, value: JSON.stringify(record)}, {onConflict:"key", ignoreDuplicates:true});
    if (saved.error) throw new Error("지난 영상을 보관하지 못해 변경하지 않았어요. 다시 시도해 주세요.");
  }
  let update = sb.from("broadcasts").update({public_title: input.title, youtube_live_url: input.youtubeUrl, youtube_live_enabled: Boolean(input.youtubeUrl)}).eq("id", input.broadcastId);
  update = current.youtube_live_url == null ? update.is("youtube_live_url", null) : update.eq("youtube_live_url", current.youtube_live_url);
  const saved = await update.select("*").maybeSingle();
  if (saved.error) throw new Error("영상 변경을 저장하지 못했어요.");
  if (!saved.data) throw new VideoHistoryConflict("다른 화면에서 영상이 변경됐어요. 페이지를 새로고침한 뒤 다시 선택해 주세요.");
  return saved.data;
}
