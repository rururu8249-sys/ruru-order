// lib/liveAlertBlock.ts
// [2026-11-01 사장님] 방송 알림톡 «계속 제외» 명단 — 한 번 넣으면 해제할 때까지 어느 발송(단골·신청자·전체)에서도 빠진다.
//   순수 함수만(저장은 lib/liveAlertBlockServer). 전화번호는 숫자만 저장, 화면에는 가린 번호만.
import { createHash } from "node:crypto";

export type LiveAlertBlockEntry = {
  phone: string; // 숫자만
  customerId: string;
  name: string;
  nickname: string;
  at: string; // ISO
};

export type LiveAlertBlockView = {
  id: string; // 전화번호 해시(전체 번호 안 보냄)
  customerId: string;
  name: string;
  nickname: string;
  phone: string; // 가린 번호
  at: string;
};

export const LIVE_ALERT_BLOCK_MAX = 5000;

export const blockPhone = (v: unknown) => String(v ?? "").replace(/\D/g, "");
export const isMobilePhone = (p: string) => /^01[016789]\d{7,8}$/.test(p);
export const maskBlockPhone = (p: string) => (p.length >= 8 ? `${p.slice(0, 3)}-****-${p.slice(-4)}` : p);
export const blockEntryId = (phone: string) => createHash("sha256").update(`ruru-alert-block:${phone}`).digest("hex").slice(0, 16);

export function parseLiveAlertBlocks(raw: unknown): LiveAlertBlockEntry[] {
  let value: unknown = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  const items = Array.isArray((value as { items?: unknown })?.items) ? (value as { items: unknown[] }).items : Array.isArray(value) ? (value as unknown[]) : [];
  const seen = new Set<string>();
  const out: LiveAlertBlockEntry[] = [];
  for (const it of items) {
    const row = (it || {}) as Record<string, unknown>;
    const phone = blockPhone(row.phone);
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    out.push({
      phone,
      customerId: String(row.customerId ?? "").slice(0, 80),
      name: String(row.name ?? "").slice(0, 60),
      nickname: String(row.nickname ?? "").slice(0, 60),
      at: String(row.at ?? ""),
    });
  }
  return out.slice(0, LIVE_ALERT_BLOCK_MAX);
}

export function addLiveAlertBlocks(list: LiveAlertBlockEntry[], add: LiveAlertBlockEntry[], now = new Date()): LiveAlertBlockEntry[] {
  const have = new Set(list.map((e) => e.phone));
  const next = [...list];
  for (const e of add) {
    const phone = blockPhone(e.phone);
    if (!phone || have.has(phone)) continue;
    have.add(phone);
    next.unshift({ ...e, phone, at: e.at || now.toISOString() });
  }
  return next.slice(0, LIVE_ALERT_BLOCK_MAX);
}

export function removeLiveAlertBlocks(list: LiveAlertBlockEntry[], ids: string[]): LiveAlertBlockEntry[] {
  const drop = new Set(ids);
  return list.filter((e) => !drop.has(blockEntryId(e.phone)) && !(e.customerId && drop.has(`c:${e.customerId}`)));
}

export function viewLiveAlertBlocks(list: LiveAlertBlockEntry[]): LiveAlertBlockView[] {
  return list.map((e) => ({ id: blockEntryId(e.phone), customerId: e.customerId, name: e.name, nickname: e.nickname, phone: maskBlockPhone(e.phone), at: e.at }));
}

export const blockPhoneSet = (list: LiveAlertBlockEntry[]) => new Set(list.map((e) => e.phone));
