import { youtubeVideoIdFromUrl } from "./liveWatch";
import { parseProductIntro } from "./productIntro";

export type BroadcastVideoRecord = { broadcastId: string; videoId: string; title: string; date: string };
export type BroadcastVideoHistoryItem = BroadcastVideoRecord & { introCount: number };
export type VideoBroadcastRow = { id: string; public_title?: string | null; youtube_live_url?: string | null; started_at?: string | null; created_at?: string | null; is_deleted?: boolean | null };
export const VIDEO_HISTORY_PREFIX = "broadcast_video_v1_";
export const introRecordScope = (key: string) => {
  const match = /^product_intro_v1_([\da-f-]{36})_([\w-]{11})_([a-f0-9]{64})$/i.exec(key);
  return match ? { broadcastId: match[1], videoId: match[2], digest: match[3] } : null;
};
const validDate = (date: unknown): date is string => typeof date === "string" && Number.isFinite(Date.parse(date));

/** Keep original video dates, not the later day someone reconnects the video. */
export function buildBroadcastVideoHistory(broadcasts: VideoBroadcastRow[], archived: BroadcastVideoRecord[], intros: {key: string; value: unknown}[]): BroadcastVideoHistoryItem[] {
  const records = new Map<string, BroadcastVideoRecord>();
  const deleted = new Set(broadcasts.filter(b => b.is_deleted).map(b => b.id));
  const add = (record: BroadcastVideoRecord) => {
    if (!/^[\w-]{11}$/.test(record.videoId) || !/^[\da-f-]{36}$/i.test(record.broadcastId) || !validDate(record.date) || deleted.has(record.broadcastId)) return;
    const previous = records.get(record.videoId);
    if (!previous || Date.parse(record.date) < Date.parse(previous.date)) records.set(record.videoId, {...record, title: typeof record.title === "string" && record.title.trim() ? record.title : "지난 방송"});
  };
  for (const record of archived) add(record);
  for (const row of broadcasts) add({broadcastId: row.id, videoId: youtubeVideoIdFromUrl(row.youtube_live_url), title: row.public_title || "지난 방송", date: row.started_at || row.created_at || ""});
  const counts = new Map<string, Set<string>>();
  for (const row of intros) {
    const scope = introRecordScope(row.key);
    if (!scope || deleted.has(scope.broadcastId)) continue;
    const intro = parseProductIntro(row.value, scope.videoId);
    if (!intro || !Number.isFinite(new Date(intro.capturedAt).getTime())) continue;
    const targets = counts.get(scope.videoId) ?? new Set<string>();
    targets.add(scope.digest); counts.set(scope.videoId, targets);
    if (!records.has(scope.videoId)) {
      const broadcast = broadcasts.find(b => b.id === scope.broadcastId);
      add({broadcastId: scope.broadcastId, videoId: scope.videoId, title: broadcast?.public_title || "저장된 소개영상", date: new Date(intro.capturedAt).toISOString()});
    }
  }
  return [...records.values()].map(r => ({...r, introCount: counts.get(r.videoId)?.size ?? 0})).sort((a,b) => Date.parse(b.date) - Date.parse(a.date) || a.videoId.localeCompare(b.videoId));
}
