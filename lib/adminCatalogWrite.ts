// 관리자 카탈로그 쓰기 클라이언트 헬퍼.
//   products / broadcasts / broadcast_products 의 쓰기를 브라우저 anon 대신
//   서버(/api/admin-live/catalog-write, 관리자 인증 + service_role)로 보낸다.
//   반환 형태를 { data, error } 로 supabase 와 동일하게 맞춰, 호출부 최소 변경.
//   ⚠️ 이 3개 테이블 쓰기 전용. 읽기(SELECT)는 기존 anon supabase 그대로 사용.

export type CatalogTable = "products" | "broadcasts" | "broadcast_products";
export type CatalogFilter = { type: "eq" | "in"; col: string; val: unknown };

export type CatalogWritePayload = {
  table: CatalogTable;
  op: "insert" | "update" | "delete" | "upsert";
  values?: unknown;
  filters?: CatalogFilter[];
  select?: string;
  single?: boolean;
  upsertOptions?: Record<string, unknown>;
};

export async function adminCatalogWrite(
  payload: CatalogWritePayload,
): Promise<{ data: any; error: { message: string } | null }> {
  try {
    const res = await fetch("/api/admin-live/catalog-write", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      return { data: null, error: json?.error || { message: `요청 실패(${res.status})` } };
    }
    return { data: json?.data ?? null, error: json?.error ?? null };
  } catch (e: any) {
    return { data: null, error: { message: e?.message || "네트워크 오류" } };
  }
}
