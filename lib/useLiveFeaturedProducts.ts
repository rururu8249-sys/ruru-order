'use client';
import {useEffect, useMemo, useState} from 'react';
import {supabase} from './supabase';
import {subscribeLiveEvents} from './liveEvents';
import {parseWidgetRotation, type WidgetProductTarget, type WidgetRotationConfig} from './widgetProductLibrary';
import {featuredFromTargets} from './liveFeaturedProducts';
import {useWidgetRotationIndex} from './useWidgetRotationIndex';
import type {LiveWatchItem} from './liveWatch';

/**
 * [2026-11-12 사장님 「소개 카드가 지맘대로 바뀌고 위젯이랑 다르게 나옴」]
 * 예전엔 손님 화면이 자기 상품 목록으로 순환을 따로 계산해 목록 길이가 위젯과 달라 다른 상품을 보였다.
 * 이제 서버(/api/live-watch/featured)가 위젯과 같은 함수로 만든 목록을 받아 같은 시계로 고른다.
 */
type State = {id: string; config: WidgetRotationConfig; targets: WidgetProductTarget[]; pinned: boolean; siteCardOff: boolean};
const EMPTY: WidgetRotationConfig = {mode: 'all', paused: false, targets: []};

/** 방송 PC 인코더(OBS)가 유튜브로 보내기까지 걸리는 시간 — 유튜브 값에 안 잡히는 부분이라 고정으로 더함. */
export const ENCODER_EXTRA_MS = 1000;
/** 유튜브 ingestionTime(초) → 영상이 실제보다 늦게 보이는 시간(ms). 라이브가 아니거나 이상한 값이면 null. */
export function streamDelayFromIngestion(ingestion: unknown, nowMs: number): number | null {
  if (typeof ingestion !== 'number' || !Number.isFinite(ingestion) || ingestion < 1e9) return null;
  const raw = nowMs - ingestion * 1000;
  if (raw < -5000 || raw > 60000) return 0; // 다시보기·시계 어긋남: 늦춤 없음
  return Math.max(0, Math.round(raw + ENCODER_EXTRA_MS));
}

export function useLiveFeaturedProducts(broadcastId: string, items: LiveWatchItem[], enabled: boolean, delayMs = 0) {
  const [state, setState] = useState<State | null>(null);
  useEffect(() => {
    setState(null);
    if (!broadcastId || !enabled) return;
    let alive = true;
    let revision = 0;
    let scheduled: number | undefined;
    let follow: number | undefined;
    const load = async (fresh = false) => {
      const request = ++revision;
      try {
        // fresh: 상품 바뀜 소식 뒤 — 중간 캐시(CDN)를 거치지 않고 서버가 새로 읽은 값을 받음
        const q = fresh ? `&fresh=1&r=${Date.now()}` : '';
        const res = await fetch(`/api/live-watch/featured?bc=${encodeURIComponent(broadcastId)}${q}`, {cache: 'no-store'});
        const j = await res.json();
        if (!res.ok || !j?.ok) throw new Error('featured');
        if (!alive || request !== revision) return;
        setState({id: broadcastId, config: j.enabled ? parseWidgetRotation(j.config) : EMPTY,
          targets: j.enabled && Array.isArray(j.targets) ? j.targets : [], pinned: j.pinned === true, siteCardOff: j.siteCardOff === true});
      } catch { if (alive && request === revision) setState(null); /* 틀린 상품을 남기지 않게 카드를 비움 */ }
    };
    const schedule = () => {
      revision++;
      window.clearTimeout(scheduled);
      window.clearTimeout(follow);
      // 손님마다 0.2~0.6초 흩어서 바로 묻고, 1.5초 뒤 한 번 더(소식이 저장보다 먼저 온 경우 대비)
      scheduled = window.setTimeout(() => void load(true), 200 + Math.floor(Math.random() * 400));
      follow = window.setTimeout(() => void load(true), 1500 + Math.floor(Math.random() * 400));
    };
    const unsubscribe = subscribeLiveEvents(supabase, {onCatalog: schedule});
    void load();
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 20000);
    const visible = () => { if (!document.hidden) schedule(); };
    document.addEventListener('visibilitychange', visible);
    return () => { alive = false; revision++; unsubscribe(); window.clearTimeout(scheduled); window.clearTimeout(follow); window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [broadcastId, enabled]);
  const valid = Boolean(state && state.id === broadcastId && enabled);
  const config = valid && state ? state.config : EMPTY;
  const targets = useMemo(() => (valid && state ? state.targets : []), [valid, state]);
  const mapped = useMemo(() => featuredFromTargets(items, targets), [items, targets]);
  const products = useMemo(() => mapped.filter((p): p is LiveWatchItem => Boolean(p)), [mapped]);
  const index = useWidgetRotationIndex(config, targets.length, Boolean(valid && state?.pinned), delayMs);
  return {products, current: mapped[index] ?? null, siteCardOff: Boolean(valid && state?.siteCardOff)};
}
