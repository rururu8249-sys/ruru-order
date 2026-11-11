'use client';
import {useEffect, useState} from 'react';
import type {WidgetRotationConfig} from './widgetProductLibrary';
import {rotationIndex} from './widgetRotationClock';

export function useWidgetRotationIndex(config: WidgetRotationConfig, count: number, pinned = false) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    // React bails out between five-second boundaries: do not redraw the video/chat on every tick.
    const tick = () => setIndex(pinned ? 0 : rotationIndex(config, count));
    tick();
    if (pinned || config.paused || count <= 1) return;
    const timer = window.setInterval(tick, 500);
    return () => window.clearInterval(timer);
  }, [config.startedAt, config.pausedAt, config.paused, count, pinned]);
  return pinned || count <= 1 ? 0 : index % count;
}
