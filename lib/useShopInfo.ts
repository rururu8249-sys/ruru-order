"use client";

// lib/useShopInfo.ts
// [2026-09-08] 상점 정보(문의 방식·페이스터·표시용 계좌)를 화면에서 읽는 훅.
//   · 페이지당 한 번만 불러와서(캐시) 여러 컴포넌트가 나눠 쓴다.
//   · 읽기는 손님 주문서(app/order/page.tsx)와 같은 방식(anon 키로 settings SELECT).
//   · 못 읽으면 기본값(예전 하드코딩값) — 손님 화면이 비거나 깨지지 않는다.
//   · 쓰기는 여기서 안 한다. 설정 탭 → /api/admin-live/shop-info.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { parseShopInfo, SHOP_INFO_DEFAULTS, SHOP_INFO_KEYS, type ShopInfo } from "@/lib/shopInfo";

let cache: ShopInfo | null = null;
let inflight: Promise<ShopInfo> | null = null;
const listeners = new Set<(info: ShopInfo) => void>();

function notify(info: ShopInfo) {
  listeners.forEach((fn) => {
    try {
      fn(info);
    } catch {
      /* 화면 하나가 실패해도 나머지는 계속 */
    }
  });
}

/** 상점 정보 읽기. force=true 면 캐시를 버리고 다시 읽는다(설정 저장 직후). */
export async function loadShopInfo(force = false): Promise<ShopInfo> {
  if (!force) {
    if (cache) return cache;
    if (inflight) return inflight;
  }
  const run = (async () => {
    try {
      const { data, error } = await supabase
        .from("settings")
        .select("key,value")
        .in("key", [...SHOP_INFO_KEYS]);
      if (error) return cache || SHOP_INFO_DEFAULTS;
      const next = parseShopInfo((data || []) as Array<{ key: string; value: unknown }>);
      cache = next;
      notify(next);
      return next;
    } catch {
      return cache || SHOP_INFO_DEFAULTS;
    } finally {
      inflight = null;
    }
  })();
  inflight = run;
  return run;
}

/** 지금 캐시에 있는 값(없으면 기본값). 훅을 못 쓰는 일반 함수(복사 문구 등)에서 쓴다. */
export function getShopInfoSnapshot(): ShopInfo {
  return cache || SHOP_INFO_DEFAULTS;
}

/** 설정 저장 후 호출 — 열려 있는 화면(사이드바 등)이 새 값으로 바뀐다 */
export async function refreshShopInfo(): Promise<ShopInfo> {
  return loadShopInfo(true);
}

export function useShopInfo(): ShopInfo {
  const [info, setInfo] = useState<ShopInfo>(() => cache || SHOP_INFO_DEFAULTS);

  useEffect(() => {
    let alive = true;
    const onChange = (next: ShopInfo) => {
      if (alive) setInfo(next);
    };
    listeners.add(onChange);
    loadShopInfo().then(onChange);
    return () => {
      alive = false;
      listeners.delete(onChange);
    };
  }, []);

  return info;
}
