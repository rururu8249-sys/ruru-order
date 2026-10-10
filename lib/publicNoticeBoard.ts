import type { SupabaseClient } from "@supabase/supabase-js";

export type PublicNotice = {
  id: number;
  title: string;
  content: string;
  created_at: string;
  is_pinned?: boolean | null;
  is_visible: boolean;
};

/** Only invoked when a public board is opened, never in order startup/polling. */
export async function loadPublicNotices(client: SupabaseClient): Promise<PublicNotice[]> {
  const result = new Map<number, PublicNotice>();
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await client.from("notices")
      .select("id,title,content,created_at,is_pinned,is_visible")
      .eq("is_visible", true)
      .order("is_pinned", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + 99);
    if (error || !Array.isArray(data)) throw new Error("공지 목록을 불러오지 못했어요.");
    const before = result.size;
    for (const row of data as PublicNotice[]) if (row.is_visible === true) result.set(row.id, row);
    if (data.length < 100) return [...result.values()];
    if (result.size === before) throw new Error("공지 목록을 다시 불러와 주세요.");
  }
}
