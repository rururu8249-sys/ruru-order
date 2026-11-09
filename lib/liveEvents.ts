// lib/liveEvents.ts
// [2026-11-09] DB CPU 줄이기 ①단계 — «표가 바뀌면 알려 줘(postgres_changes)» 대신
//   DB 트리거가 보내는 «소식(Broadcast)»을 듣는다(supabase/sql/live_events_broadcast.sql).
//   주제 'ruru-live' · 이벤트 'order'({type, new, old}) / 'catalog'({table, type}).
//   예전 postgres_changes 의 payload 모양({new, old})과 같게 넘겨서 받는 쪽 코드는 그대로 쓴다.
//   소식에는 닉네임·상품명·옵션·수량·상태·주문번호만 있다(전화·주소·이름·금액 없음).
import type { SupabaseClient } from "@supabase/supabase-js";

export const LIVE_EVENTS_TOPIC = "ruru-live";

export type LiveOrderEvent = {
  type: "INSERT" | "UPDATE" | string;
  new: Record<string, unknown>;
  old: Record<string, unknown>;
};

export type LiveCatalogEvent = { table: string; type: string };

export function parseLiveOrderEvent(raw: unknown): LiveOrderEvent | null {
  const p = (raw && typeof raw === "object" ? raw : null) as Record<string, unknown> | null;
  if (!p) return null;
  const type = String(p.type ?? "");
  const n = (p.new && typeof p.new === "object" ? p.new : null) as Record<string, unknown> | null;
  if (!n || (type !== "INSERT" && type !== "UPDATE")) return null;
  const o = (p.old && typeof p.old === "object" ? p.old : {}) as Record<string, unknown>;
  return { type, new: n, old: o };
}

export function subscribeLiveEvents(
  supabase: SupabaseClient,
  handlers: {
    onOrder?: (e: LiveOrderEvent) => void;
    onCatalog?: (e: LiveCatalogEvent) => void;
    /** [2026-11-10] 사이트 채팅 — 이벤트 'chat'(supabase/sql/live_chat.sql). 받은 그대로 넘김(lib/liveChat parseChatMessage 로 읽기) */
    onChat?: (payload: unknown) => void;
  },
): () => void {
  const channel = supabase.channel(LIVE_EVENTS_TOPIC, { config: { broadcast: { self: false }, private: false } });
  if (handlers.onOrder) {
    channel.on("broadcast", { event: "order" }, (msg: { payload?: unknown }) => {
      const e = parseLiveOrderEvent(msg?.payload);
      if (e) handlers.onOrder?.(e);
    });
  }
  if (handlers.onCatalog) {
    channel.on("broadcast", { event: "catalog" }, (msg: { payload?: unknown }) => {
      const p = (msg?.payload && typeof msg.payload === "object" ? msg.payload : {}) as Record<string, unknown>;
      handlers.onCatalog?.({ table: String(p.table ?? ""), type: String(p.type ?? "") });
    });
  }
  if (handlers.onChat) {
    channel.on("broadcast", { event: "chat" }, (msg: { payload?: unknown }) => {
      handlers.onChat?.(msg?.payload);
    });
  }
  channel.subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
