'use client';
import {useEffect, useState} from 'react';
import type {WidgetRotationConfig} from './widgetProductLibrary';
import {rotationIndex} from './widgetRotationClock';

/** delayMs: 영상이 늦게 보이는 만큼 시계를 늦춤(손님 카드용, 방송 위젯은 0). */
export function useWidgetRotationIndex(config: WidgetRotationConfig, count: number, pinned = false, delayMs = 0) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    // React bails out between five-second boundaries: do not redraw the video/chat on every tick.
    const tick = () => setIndex(pinned ? 0 : rotationIndex(config, count, Date.now() - delayMs));
    tick();
    if (pinned || config.paused || count <= 1) return;
    const timer = window.setInterval(tick, 500);
    return () => window.clearInterval(timer);
  }, [config.startedAt, config.pausedAt, config.paused, count, pinned, delayMs]);
  return pinned || count <= 1 ? 0 : index % count;
}
