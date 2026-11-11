import { parseWidgetRotation, type WidgetRotationConfig } from './widgetProductLibrary';

export const WIDGET_ROTATION_INTERVAL_MS = 5000;

/** Server-owned clock, shared by the broadcast overlay and customer card. */
export function transitionRotation(previous: unknown, next: WidgetRotationConfig, now = Date.now()): WidgetRotationConfig {
  const before = parseWidgetRotation(previous);
  const after = parseWidgetRotation(next);
  const changed = before.mode !== after.mode || JSON.stringify(before.targets) !== JSON.stringify(after.targets);
  let startedAt = changed ? now : before.startedAt ?? 0;
  if (!changed && before.paused && !after.paused) {
    startedAt = before.pausedAt == null ? now : startedAt + now - before.pausedAt;
  }
  return { mode: after.mode, paused: after.paused, targets: after.targets, startedAt,
    ...(after.paused ? { pausedAt: !changed && before.paused ? before.pausedAt ?? startedAt : now } : {}) };
}

export function rotationIndex(config: WidgetRotationConfig, count: number, now = Date.now()): number {
  if (count <= 1) return 0;
  const time = config.paused ? config.pausedAt ?? config.startedAt ?? 0 : now;
  return Math.floor(Math.max(0, time - (config.startedAt ?? 0)) / WIDGET_ROTATION_INTERVAL_MS) % count;
}
