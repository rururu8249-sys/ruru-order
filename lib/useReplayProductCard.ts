'use client';
import {useEffect, useMemo, useRef, useState, type RefObject} from 'react';
import type {LiveWatchItem} from './liveWatch';
import type {ProductIntro} from './productIntro';
import {loadProductIntroCatalog} from './productIntroCatalogClient';
import {replayGroupIndex, replayProductTimeline} from './replayProductCard';

const EMPTY: LiveWatchItem[] = [];
export function useReplayProductCard({iframe, broadcastId, videoId, playerKey, paused, enabled, items}: {
  iframe: RefObject<HTMLIFrameElement | null>; broadcastId: string; videoId: string;
  playerKey: number; paused: boolean; enabled: boolean; items: LiveWatchItem[];
}) {
  const scope = `${broadcastId}:${videoId}:${playerKey}`;
  const catalogScope = `${broadcastId}:${videoId}`;
  const [catalog, setCatalog] = useState<{scope: string; entries: Map<string, ProductIntro>} | null>(null);
  const timeline = useMemo(() => replayProductTimeline(catalog?.scope === catalogScope ? catalog.entries : new Map(), items, videoId), [catalog, catalogScope, items, videoId]);
  const sample = useRef<{scope: string; seconds: number | null; live: boolean | null; state: number} | null>(null);
  const [selection, setSelection] = useState<{scope: string; replay: boolean; index: number} | null>(null);
  const publish = useRef(() => {});
  publish.current = () => {
    const p = sample.current?.scope === scope ? sample.current : null;
    const replay = p?.live === false || (p?.live == null && paused);
    const index = enabled && replay && p && [1, 2, 3].includes(p.state) ? replayGroupIndex(timeline, p.seconds) : -1;
    setSelection(previous => previous?.scope === scope && previous.replay === replay && previous.index === index ? previous : {scope, replay, index});
  };
  useEffect(() => { publish.current(); }, [timeline, scope, enabled, paused]);

  useEffect(() => {
    if (!enabled || !broadcastId || !videoId) return;
    let alive = true, revision = 0;
    const load = async () => {
      const request = ++revision;
      try {
        const entries = await loadProductIntroCatalog(broadcastId, videoId);
        if (alive && request === revision) setCatalog({scope: catalogScope, entries});
      } catch { if (alive && request === revision) setCatalog(null); }
    };
    void load();
    const visible = () => {
      if (!document.hidden && (sample.current?.live === false || (sample.current?.live == null && paused))) void load();
    };
    const timer = window.setInterval(visible, 60000);
    document.addEventListener('visibilitychange', visible);
    return () => { alive = false; revision++; window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [catalogScope, broadcastId, videoId, enabled, paused]);

  useEffect(() => {
    sample.current = null;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== 'https://www.youtube.com' || event.source !== iframe.current?.contentWindow) return;
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (!['infoDelivery', 'initialDelivery'].includes(data?.event) || !data.info) return;
        const info = data.info;
        if (info.videoData?.video_id && info.videoData.video_id !== videoId) return;
        const p = sample.current ?? {scope, seconds: null, live: null, state: -1};
        if (typeof info.currentTime === 'number' && Number.isFinite(info.currentTime) && info.currentTime >= 0) p.seconds = info.currentTime;
        if (typeof info.playerState === 'number') p.state = info.playerState;
        if (typeof info.videoData?.isLive === 'boolean') p.live = info.videoData.isLive;
        sample.current = p;
        publish.current();
      } catch { /* Ignore unrelated packets. Never advance the card using wall-clock time. */ }
    };
    window.addEventListener('message', onMessage);
    return () => { sample.current = null; window.removeEventListener('message', onMessage); };
  }, [iframe, scope, videoId]);
  const valid = selection?.scope === scope;
  const replay = valid ? selection.replay : paused;
  const products = enabled && valid && replay ? timeline[selection.index]?.products ?? EMPTY : EMPTY;
  return {replay, products, current: products[0] ?? null};
}
