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

export function useLiveFeaturedProducts(broadcastId: string, items: LiveWatchItem[], enabled: boolean) {
  const [state, setState] = useState<State | null>(null);
  useEffect(() => {
    setState(null);
    if (!broadcastId || !enabled) return;
    let alive = true;
    let revision = 0;
    let scheduled: number | undefined;
    const load = async () => {
      const request = ++revision;
      try {
        const res = await fetch(`/api/live-watch/featured?bc=${encodeURIComponent(broadcastId)}`, {cache: 'no-store'});
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
      scheduled = window.setTimeout(() => void load(), 300);
    };
    const unsubscribe = subscribeLiveEvents(supabase, {onCatalog: schedule});
    void load();
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 20000);
    const visible = () => { if (!document.hidden) schedule(); };
    document.addEventListener('visibilitychange', visible);
    return () => { alive = false; revision++; unsubscribe(); window.clearTimeout(scheduled); window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [broadcastId, enabled]);
  const valid = Boolean(state && state.id === broadcastId && enabled);
  const config = valid && state ? state.config : EMPTY;
  const targets = useMemo(() => (valid && state ? state.targets : []), [valid, state]);
  const mapped = useMemo(() => featuredFromTargets(items, targets), [items, targets]);
  const products = useMemo(() => mapped.filter((p): p is LiveWatchItem => Boolean(p)), [mapped]);
  const index = useWidgetRotationIndex(config, targets.length, Boolean(valid && state?.pinned));
  return {products, current: mapped[index] ?? null, siteCardOff: Boolean(valid && state?.siteCardOff)};
}
