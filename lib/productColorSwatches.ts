/** Display metadata only. Keys are existing option labels, never inventory identifiers generated here. */
export type ColorSwatchMap = Record<string, string | null>;
const unsafeKeys = new Set(['__proto__', 'constructor', 'prototype']);
const absentLabels = new Set(['', '없음', '없슴', '무', '-', 'none', 'n/a', 'na']);

function record(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
}

export function normalizeSwatchMap(raw: unknown): ColorSwatchMap {
  const entries: Array<[string, string | null]> = [];
  for (const [label, value] of Object.entries(record(raw))) {
    if (!label.trim() || unsafeKeys.has(label)) continue;
    if (value === null) { entries.push([label, null]); continue; }
    if (typeof value !== 'string' || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value)) continue;
    const hex = value.length === 4 ? `#${[...value.slice(1)].map(c => c + c).join('')}` : value;
    entries.push([label, hex.toUpperCase()]);
  }
  return Object.fromEntries(entries);
}

export function retainColorSwatches(raw: unknown, labels: string[]): ColorSwatchMap {
  const valid = normalizeSwatchMap(raw);
  return Object.fromEntries(labels.filter(label => !absentLabels.has(label.trim().toLowerCase()) && Object.hasOwn(valid, label)).map(label => [label, valid[label]]));
}

export function readProductColorSwatches(raw: unknown, detailName?: string): ColorSwatchMap {
  let parsed = raw;
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw); } catch { return {}; }
  }
  const note = record(parsed);
  const details = record(note.detail_color_swatches);
  if (detailName && Object.hasOwn(details, detailName)) return normalizeSwatchMap(details[detailName]);
  return normalizeSwatchMap(note.color_swatches);
}

/** x/y are normalized coordinates inside the image, not CSS pixels. Transparent samples are ambiguous. */
export function sampleColorPixel(data: Uint8ClampedArray, width: number, height: number, x: number, y: number): string | null {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || data.length !== width * height * 4) return null;
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= 1 || y >= 1) return null;
  const i = (Math.floor(y * height) * width + Math.floor(x * width)) * 4;
  if (data[i + 3] !== 255) return null;
  return `#${[data[i], data[i + 1], data[i + 2]].map(channel => channel.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}
