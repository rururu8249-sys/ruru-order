'use client';
import {useEffect, useMemo, useState} from 'react';
import {supabase} from './supabase';
import {subscribeLiveEvents} from './liveEvents';
import {parseWidgetHistory, parseWidgetRotation, WIDGET_PRODUCT_HISTORY_SETTING_KEY, widgetRotationSettingKey, type WidgetProductTarget, type WidgetRotationConfig} from './widgetProductLibrary';
import {featuredProducts} from './liveFeaturedProducts';
import {useWidgetRotationIndex} from './useWidgetRotationIndex';
import type {LiveWatchItem} from './liveWatch';

const EMPTY: WidgetRotationConfig = {mode: 'selected', paused: false, targets: []};
export function useLiveFeaturedProducts(broadcastId: string, items: LiveWatchItem[], enabled: boolean, pin: WidgetProductTarget | null) {
  const [state, setState] = useState<{id: string; config: WidgetRotationConfig; history: WidgetProductTarget[]} | null>(null);
  useEffect(() => {
    setState(null);
    if (!broadcastId || !enabled) return;
    let alive = true;
    let revision = 0;
    let scheduled: number | undefined;
    const load = async () => {
      const request = ++revision;
      try {
        const key = widgetRotationSettingKey(broadcastId);
        const {data, error} = await supabase.from('settings').select('key,value').in('key', [key, WIDGET_PRODUCT_HISTORY_SETTING_KEY]);
        if (error) throw error;
        if (alive && request === revision) setState({id: broadcastId,
          config: parseWidgetRotation(data?.find(r => r.key === key)?.value),
          history: parseWidgetHistory(data?.find(r => r.key === WIDGET_PRODUCT_HISTORY_SETTING_KEY)?.value)});
      } catch { if (alive && request === revision) setState(null); }
    };
    const schedule = () => {
      // Invalidate in-flight older settings before the debounce fires.
      revision++;
      window.clearTimeout(scheduled);
      scheduled = window.setTimeout(() => void load(), 200);
    };
    const unsubscribe = subscribeLiveEvents(supabase, {onCatalog: schedule});
    void load();
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 20000);
    const visible = () => { if (!document.hidden) schedule(); };
    document.addEventListener('visibilitychange', visible);
    return () => { alive = false; revision++; unsubscribe(); window.clearTimeout(scheduled); window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [broadcastId, enabled]);
  const valid = state?.id === broadcastId && enabled;
  const config = valid ? state.config : EMPTY;
  const products = useMemo(() => featuredProducts(items, config, valid ? state.history : [], Boolean(valid), pin), [items, config, state, valid, pin?.productId, pin?.detailName]);
  const index = useWidgetRotationIndex(config, products.length, Boolean(pin) && products.length === 1);
  return {products, current: products[index] ?? null};
}
