import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type ProductNote = {
  name_suggestion_enabled?: boolean;
  suggestion_keywords?: string[];
};

type ProductRow = Record<string, unknown>;

function pickString(row: ProductRow, keys: string[], fallback = "") {
  for (const key of keys) {
    const value = row[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return fallback;
}

function parseProductNote(raw: unknown): ProductNote | null {
  if (!raw) return null;

  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as ProductNote;
  }

  if (typeof raw !== "string") return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as ProductNote;
    }
  } catch {
    return null;
  }

  return null;
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, "").toLowerCase();
}

function uniqueStrings(values: string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q")?.trim() || "";
  const normalizedQuery = normalizeText(query);

  if (normalizedQuery.length < 1) {
    return NextResponse.json({ suggestions: [] });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ suggestions: [] });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await supabase.from("products").select("*").limit(500);

  if (error || !Array.isArray(data)) {
    return NextResponse.json({ suggestions: [] });
  }

  const suggestions = data
    .map((product) => {
      const row = product as ProductRow;
      const productNote = parseProductNote(row.product_note ?? row.productNote ?? row.note);

      if (productNote?.name_suggestion_enabled === false) {
        return null;
      }

      const name = pickString(row, ["product_name", "name", "title", "item_name"]);
      if (!name) return null;

      const keywords = Array.isArray(productNote?.suggestion_keywords)
        ? uniqueStrings(productNote.suggestion_keywords.map((keyword) => String(keyword || "")))
        : [];

      const searchTargets = uniqueStrings([name, ...keywords]);
      const matched = searchTargets.some((target) => normalizeText(target).includes(normalizedQuery));

      if (!matched) return null;

      const startsWithScore = normalizeText(name).startsWith(normalizedQuery) ? 0 : 1;

      return {
        name,
        keywords,
        score: startsWithScore,
      };
    })
    .filter((item): item is { name: string; keywords: string[]; score: number } => Boolean(item))
    .sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      return a.name.localeCompare(b.name, "ko-KR");
    })
    .slice(0, 8)
    .map(({ name, keywords }) => ({ name, keywords }));

  return NextResponse.json({ suggestions });
}
