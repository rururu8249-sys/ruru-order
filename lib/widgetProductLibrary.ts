export const WIDGET_PRODUCT_HISTORY_SETTING_KEY = "widget_product_history_v2";

export type WidgetProductTarget = {
  productId: string;
  detailName: string;
};

export type WidgetHistoryEntry = WidgetProductTarget & {
  label: string;
  count: number;
  lastAt: number;
};

export type WidgetRotationConfig = {
  mode: "all" | "selected";
  paused: boolean;
  targets: WidgetProductTarget[];
};

export type WidgetHistorySort = "recent" | "frequent" | "name";

export type WidgetLibraryRequest =
  | { action: "merge"; entries: WidgetHistoryEntry[] }
  | { action: "record"; target: WidgetProductTarget; label: string }
  | { action: "remove"; target: WidgetProductTarget }
  | { action: "saveRotation"; broadcastId: string; rotation: WidgetRotationConfig };

const DEFAULT_ROTATION: WidgetRotationConfig = { mode: "all", paused: false, targets: [] };

function objectValue(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function normalizeWidgetTarget(value: unknown): WidgetProductTarget | null {
  const row = objectValue(value);
  if (!row) return null;
  const productId = String(row.productId ?? "").trim();
  if (!productId || !/^\d+$/.test(productId)) return null;
  return {
    productId,
    detailName: String(row.detailName ?? "").trim().slice(0, 200),
  };
}

export function widgetTargetKey(target: WidgetProductTarget): string {
  return `${String(target.productId).trim()}|${String(target.detailName || "").trim()}`;
}

export function selectableWidgetTargets<T extends WidgetProductTarget & { available: boolean; inBroadcast: boolean }>(
  items: T[],
): WidgetProductTarget[] {
  const unique = new Map<string, WidgetProductTarget>();
  for (const item of items) {
    if (!item.available || !item.inBroadcast) continue;
    const target = normalizeWidgetTarget(item);
    if (target) unique.set(widgetTargetKey(target), target);
  }
  return [...unique.values()];
}

export function widgetRotationDraftChanged(
  savedInput: WidgetRotationConfig,
  draftMode: WidgetRotationConfig["mode"],
  selectedKeys: ReadonlySet<string>,
): boolean {
  const saved = parseWidgetRotation(savedInput);
  if (saved.mode !== draftMode) return true;
  if (draftMode === "all") return false;
  const savedKeys = new Set(saved.targets.map(widgetTargetKey));
  if (savedKeys.size !== selectedKeys.size) return true;
  for (const key of savedKeys) if (!selectedKeys.has(key)) return true;
  return false;
}

function normalizeHistoryEntry(value: unknown): WidgetHistoryEntry | null {
  const row = objectValue(value);
  const target = normalizeWidgetTarget(row);
  if (!row || !target) return null;
  const count = Math.max(1, Math.floor(Number(row.count) || 1));
  const lastAt = Math.max(0, Math.floor(Number(row.lastAt) || 0));
  const label = String(row.label ?? "").trim().slice(0, 200) || target.detailName || "상품";
  return { ...target, label, count, lastAt };
}

export function parseWidgetHistory(value: unknown): WidgetHistoryEntry[] {
  const parsed = parseJson(value);
  if (!Array.isArray(parsed)) return [];
  const deduped = new Map<string, WidgetHistoryEntry>();
  for (const raw of parsed) {
    const entry = normalizeHistoryEntry(raw);
    if (!entry) continue;
    const key = widgetTargetKey(entry);
    const current = deduped.get(key);
    if (!current) {
      deduped.set(key, entry);
      continue;
    }
    deduped.set(key, {
      ...current,
      label: entry.lastAt >= current.lastAt && entry.label ? entry.label : current.label,
      count: Math.max(current.count, entry.count),
      lastAt: Math.max(current.lastAt, entry.lastAt),
    });
  }
  return [...deduped.values()].sort((a, b) => b.lastAt - a.lastAt || b.count - a.count || a.label.localeCompare(b.label, "ko"));
}

export function mergeWidgetHistory(serverEntries: unknown, importedEntries: unknown): WidgetHistoryEntry[] {
  const server = parseWidgetHistory(serverEntries);
  const imported = parseWidgetHistory(importedEntries);
  const merged = new Map(server.map((entry) => [widgetTargetKey(entry), entry]));
  for (const entry of imported) {
    const key = widgetTargetKey(entry);
    const current = merged.get(key);
    if (!current) {
      merged.set(key, entry);
      continue;
    }
    merged.set(key, {
      ...current,
      label: entry.lastAt >= current.lastAt && entry.label ? entry.label : current.label,
      count: Math.max(current.count, entry.count),
      lastAt: Math.max(current.lastAt, entry.lastAt),
    });
  }
  return parseWidgetHistory([...merged.values()]);
}

export function recordWidgetHistory(
  entries: unknown,
  input: WidgetProductTarget & { label: string },
  now = Date.now(),
): WidgetHistoryEntry[] {
  const target = normalizeWidgetTarget(input);
  if (!target) return parseWidgetHistory(entries);
  const list = parseWidgetHistory(entries);
  const key = widgetTargetKey(target);
  const label = String(input.label || "").trim().slice(0, 200) || target.detailName || "상품";
  const current = list.find((entry) => widgetTargetKey(entry) === key);
  const next = list.filter((entry) => widgetTargetKey(entry) !== key);
  next.push({ ...target, label, count: (current?.count || 0) + 1, lastAt: Math.max(0, Math.floor(now)) });
  return parseWidgetHistory(next);
}

export function removeWidgetHistory(entries: unknown, targetInput: WidgetProductTarget): WidgetHistoryEntry[] {
  const target = normalizeWidgetTarget(targetInput);
  if (!target) return parseWidgetHistory(entries);
  const key = widgetTargetKey(target);
  return parseWidgetHistory(entries).filter((entry) => widgetTargetKey(entry) !== key);
}

function normalizeLibrarySearch(value: string): string {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/[\s\-_./·()[\]{}]+/g, "");
}

export function filterAndSortWidgetHistory<T extends WidgetHistoryEntry>(
  entries: T[],
  search: string,
  sort: WidgetHistorySort,
): T[] {
  const query = normalizeLibrarySearch(search);
  const filtered = [...entries].filter((entry) => {
    if (!query) return true;
    return normalizeLibrarySearch(`${entry.label} ${entry.detailName} ${entry.productId}`).includes(query);
  });
  if (sort === "frequent") {
    return filtered.sort((a, b) => b.count - a.count || b.lastAt - a.lastAt || a.label.localeCompare(b.label, "ko"));
  }
  if (sort === "name") {
    return filtered.sort((a, b) => a.label.localeCompare(b.label, "ko") || b.lastAt - a.lastAt);
  }
  return filtered.sort((a, b) => b.lastAt - a.lastAt || b.count - a.count || a.label.localeCompare(b.label, "ko"));
}

export function visibleWidgetHistory<T>(entries: T[], expanded: boolean, compactLimit = 4): T[] {
  if (expanded) return entries;
  return entries.slice(0, Math.max(1, Math.floor(compactLimit) || 4));
}

function normalizeTargets(value: unknown): WidgetProductTarget[] {
  if (!Array.isArray(value)) return [];
  const unique = new Map<string, WidgetProductTarget>();
  for (const raw of value) {
    const target = normalizeWidgetTarget(raw);
    if (target) unique.set(widgetTargetKey(target), target);
  }
  return [...unique.values()];
}

export function parseWidgetRotation(value: unknown): WidgetRotationConfig {
  const parsed = objectValue(parseJson(value));
  if (!parsed) return { ...DEFAULT_ROTATION, targets: [] };
  const mode = parsed.mode === "selected" ? "selected" : "all";
  return {
    mode,
    paused: parsed.paused === true,
    targets: mode === "selected" ? normalizeTargets(parsed.targets) : [],
  };
}

export function widgetRotationSettingKey(broadcastId: string): string {
  return `widget_rotation_${String(broadcastId || "").trim()}`;
}

export function selectWidgetRotationItems<T>(
  items: T[],
  configInput: WidgetRotationConfig,
  targetOf: (item: T) => WidgetProductTarget,
  isAvailable: (item: T) => boolean = () => true,
): T[] {
  const config = parseWidgetRotation(configInput);
  const availableItems = items.filter(isAvailable);
  if (config.mode === "all") return availableItems;

  const byTarget = new Map<string, T>();
  for (const item of availableItems) {
    const target = normalizeWidgetTarget(targetOf(item));
    if (target) byTarget.set(widgetTargetKey(target), item);
  }
  return config.targets.flatMap((target) => {
    const item = byTarget.get(widgetTargetKey(target));
    return item === undefined ? [] : [item];
  });
}

export function widgetRotationShouldAdvance(
  configInput: WidgetRotationConfig,
  hasManualPin: boolean,
  itemCount: number,
): boolean {
  const config = parseWidgetRotation(configInput);
  return !hasManualPin && !config.paused && itemCount > 1;
}

export function parseWidgetLibraryRequest(value: unknown): WidgetLibraryRequest | null {
  const body = objectValue(value);
  if (!body) return null;
  const action = String(body.action || "");
  if (action === "merge") {
    return { action, entries: parseWidgetHistory(body.entries) };
  }
  if (action === "record") {
    const target = normalizeWidgetTarget(body.target);
    if (!target) return null;
    const label = String(body.label || "").trim().slice(0, 200) || target.detailName || "상품";
    return { action, target, label };
  }
  if (action === "remove") {
    const target = normalizeWidgetTarget(body.target);
    return target ? { action, target } : null;
  }
  if (action === "saveRotation") {
    const broadcastId = String(body.broadcastId || "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(broadcastId)) return null;
    return { action, broadcastId, rotation: parseWidgetRotation(body.rotation) };
  }
  return null;
}
