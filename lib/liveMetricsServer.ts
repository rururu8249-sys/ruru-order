// lib/liveMetricsServer.ts
// [2026-11-09] 방송 중 1분 기록기(서버). cron 이 1분마다 부른다.
//   방송 OFF 면 유튜브를 아예 안 부름. 켜져 있으면 1분에 videos.list 1번(1점)만 — 채팅 읽기는 11/27 없앰.
//   절대 throw 로 cron 을 죽이지 않음.
import { getServiceClient, readSetting, writeSetting, readRefreshToken, getAccessToken, extractVideoId } from "@/lib/youtube";
import { parseWidgetRotation, widgetRotationSettingKey } from "@/lib/widgetProductLibrary";
import { appendSample, liveMetricsKey, minuteIso, parseSamples, rotationStateOf, type LiveSample } from "@/lib/liveMetrics";

type TickResult = { ok: boolean; skipped?: boolean; reason?: string; broadcastId?: string; sample?: LiveSample };

export const LIVE_VIEWERS_NOW_KEY = "live_viewers_now";

export async function recordLiveMetricsTick(nowMs = Date.now()): Promise<TickResult> {
  try {
    const sb = getServiceClient();
    const { data: bc } = await sb
      .from("broadcasts")
      .select("id,youtube_live_url,started_at,status")
      .eq("status", "ON")
      .neq("is_deleted", true)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!bc) return { ok: true, skipped: true, reason: "방송 OFF" };
    const broadcastId = String((bc as Record<string, unknown>).id);
    const key = liveMetricsKey(broadcastId);
    const t = minuteIso(nowMs);

    const list = parseSamples(await readSetting(sb, key));
    if (list.length && list[list.length - 1].t === t) return { ok: true, skipped: true, reason: "이번 1분 이미 기록", broadcastId };

    // 1) 사이트 지금 접속(최근 2분 신호, 관리자 화면 제외)
    let site = 0;
    try {
      const { count } = await sb
        .from("visitor_presence")
        .select("id", { count: "exact", head: true })
        .gte("last_seen_at", new Date(nowMs - 120_000).toISOString())
        .neq("page_type", "admin");
      site = Number(count) || 0;
    } catch { /* 0 */ }

    // 2) 위젯 순환 상태
    let rot: LiveSample["r"] = null;
    try {
      const raw = await readSetting(sb, widgetRotationSettingKey(broadcastId));
      rot = rotationStateOf(raw ? parseWidgetRotation(raw) : { mode: "all", paused: false, targets: [] });
    } catch { /* null */ }

    // 3) 유튜브 시청자·좋아요(채팅 세기는 없앰)
    let viewers: number | null = null;
    let likes: number | null = null;
    const chat = 0;
    const codes: Record<string, number> = {};
    try {
      const videoId = extractVideoId(String((bc as Record<string, unknown>).youtube_live_url || ""));
      const refreshToken = videoId ? await readRefreshToken(sb) : "";
      if (videoId && refreshToken) {
        const accessToken = await getAccessToken(refreshToken);
        const vr = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails,statistics&id=${encodeURIComponent(videoId)}`, { headers: { Authorization: `Bearer ${accessToken}` } });
        const vj: any = await vr.json().catch(() => ({}));
        const item = vj?.items?.[0];
        const lsd = item?.liveStreamingDetails || {};
        if (lsd.concurrentViewers != null && Number.isFinite(Number(lsd.concurrentViewers))) viewers = Number(lsd.concurrentViewers);
        if (item?.statistics?.likeCount != null && Number.isFinite(Number(item.statistics.likeCount))) likes = Number(item.statistics.likeCount);
        // [2026-11-27] 채팅 읽기(1분마다 5점)는 없앰(사장님 「없애」 — 한도 절약). 영상 정보(1점)만 남김:
        //   «지금 실제 라이브인지»(가상 손님 라이브/다시보기 구분)를 이걸로만 알 수 있어서.
      }
    } catch { /* 유튜브 실패해도 사이트·순환은 기록 */ }

    const sample: LiveSample = { t, v: viewers, l: likes, s: site, c: chat, k: codes, r: rot };
    await writeSetting(sb, key, JSON.stringify(appendSample(list, sample)));
    // [2026-11-10] 손님 방송 화면 왼쪽 위 「LIVE 시청자수」용 — 지금 숫자 한 줄(작게, 손님이 30초마다 읽음)
    try { await writeSetting(sb, LIVE_VIEWERS_NOW_KEY, JSON.stringify({ bc: broadcastId, v: viewers, s: site, t: new Date(nowMs).toISOString() })); } catch { /* 무시 */ }
    return { ok: true, broadcastId, sample };
  } catch (e) {
    return { ok: false, reason: String((e as Error)?.message ?? e) };
  }
}
