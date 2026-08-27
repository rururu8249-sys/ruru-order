import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { mergeBrandGroupProduct } from "@/lib/brandGroupMerge";
import importData from "./2page-data.json";

export const maxDuration = 300;

const BUCKET = "product-images";
const GROUP_NAMES: Record<string, string> = {
  BB: "버버리",
  DR: "디올",
  MC: "몽클레어",
  OTHER: "기타브랜드",
};

type ImportProduct = {
  code: string;
  groupKey: string;
  detailName: string;
  color: string;
  sizes: string[];
  price: number;
  category: string;
  imageFile: string;
};

type ImportImage = { mime: string; sha256: string; base64: string };
type Row = Record<string, unknown>;

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase 관리자 환경변수가 없습니다.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function parseNote(value: unknown): Row {
  if (!value) return {};
  if (typeof value === "object") return value as Row;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" ? parsed as Row : {};
  } catch {
    return {};
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function detailCode(name: string) {
  const matched = name.trim().match(/^([A-Z]+)\([^)]*\)-([^\s]+)/i);
  return matched ? `${matched[1].toUpperCase()}-${matched[2].toUpperCase()}` : "";
}

function arraysEqual(a: unknown, b: string[]) {
  return Array.isArray(a) && a.map(String).join("\u0000") === b.join("\u0000");
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function POST(request: NextRequest) {
  const session = await verifyAdminSessionFromRequest(request);
  if (!session) return jsonError("관리자 로그인이 필요합니다.", 401);

  const products = importData.products as ImportProduct[];
  const images = importData.images as Record<string, ImportImage>;
  if (products.length !== 39 || products.some((product) => product.code === "MC-51M")) {
    return jsonError("검수 완료 데이터가 아니어서 등록을 중단했습니다.", 500);
  }

  const supabase = getSupabaseAdmin();
  const groupNames = Object.values(GROUP_NAMES);
  const { data: rowsData, error: readError } = await supabase
    .from("products")
    .select("id, product_name, price, stock, color_options, size_options, detail_image_urls, product_note, status, in_shop")
    .in("product_name", groupNames)
    .neq("status", "삭제");
  if (readError) return jsonError(`기존 상품 확인 실패: ${readError.message}`, 500);

  const rows = (rowsData || []) as Row[];
  const missing = groupNames.filter((name) => !rows.some((row) => String(row.product_name) === name));
  if (missing.length > 0) return jsonError(`기존 대표상품을 찾지 못했습니다: ${missing.join(", ")}`, 500);

  const collisions: string[] = [];
  for (const product of products) {
    const name = GROUP_NAMES[product.groupKey];
    const row = rows.find((item) => String(item.product_name) === name)!;
    const pricing = record(parseNote(row.product_note).option_pricing);
    const existingCodes = new Set(Object.keys(pricing).map(detailCode).filter(Boolean));
    if (pricing[product.detailName] !== undefined || existingCodes.has(product.code.toUpperCase())) {
      collisions.push(product.code);
    }
  }
  if (collisions.length > 0) {
    return jsonError(`이미 등록된 코드가 있어 전체 등록을 중단했습니다: ${collisions.join(", ")}`, 409);
  }

  const uploadedPaths: string[] = [];
  const uploadedUrls = new Map<string, string>();
  const updated: Array<{ id: string; name: string; backup: Row }> = [];

  try {
    for (const [index, [fileName, image]] of Object.entries(images).entries()) {
      const extension = image.mime.includes("png") ? "png" : "jpg";
      const safeBase = fileName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-");
      const path = `products/detail/2026/08/${Date.now()}-${index}-${safeBase}.${extension}`;
      const bytes = Buffer.from(image.base64, "base64");
      const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
        contentType: image.mime,
        upsert: false,
      });
      if (error) throw new Error(`${fileName}: 사진 업로드 실패 (${error.message})`);
      uploadedPaths.push(path);
      uploadedUrls.set(fileName, supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
    }

    const importBatch = `${importData.batchId}-${new Date().toISOString()}`;
    const plans: Array<{
      id: string;
      name: string;
      values: Row;
      backup: Row;
      products: ImportProduct[];
      expected: { details: number; photos: number; variants: number };
    }> = [];

    for (const [groupKey, name] of Object.entries(GROUP_NAMES)) {
      const row = rows.find((item) => String(item.product_name) === name)!;
      const incomingProducts = products.filter((product) => product.groupKey === groupKey);
      const parentPrice = Number(row.price);
      const pricing: Record<string, number> = {};
      const photoSets: Record<string, string[]> = {};
      const detailPhotos: Record<string, string> = {};
      const categories: Record<string, string> = {};
      const detailOptions: Record<string, unknown> = {};
      const variants: Array<{ color: string; size: string; stock: number }> = [];

      for (const product of incomingProducts) {
        const url = uploadedUrls.get(product.imageFile);
        if (!url) throw new Error(`${product.code}: 업로드 사진 URL이 없습니다.`);
        pricing[product.detailName] = product.price - parentPrice;
        photoSets[product.detailName] = [url];
        detailPhotos[product.detailName] = url;
        categories[product.detailName] = product.category;
        detailOptions[product.detailName] = {
          colors: [product.color],
          sizes: product.sizes,
          variants: product.sizes.map((size) => ({ color: product.color, size })),
        };
        for (const size of product.sizes) {
          variants.push({ color: `${product.detailName} / ${product.color}`, size, stock: 0 });
        }
      }

      const incoming = {
        product_name: name,
        price: Math.min(...incomingProducts.map((product) => product.price)),
        stock: 0,
        detail_image_urls: incomingProducts.map((product) => uploadedUrls.get(product.imageFile)!),
        product_note: JSON.stringify({
          stock_management_enabled: false,
          stock_variants: variants,
          option_pricing: pricing,
          detail_photos: detailPhotos,
          detail_photo_sets: photoSets,
          brand_group: {
            enabled: true,
            detail_categories: categories,
            detail_options: detailOptions,
          },
        }),
      };
      const merged = mergeBrandGroupProduct(row, incoming, importBatch);
      plans.push({
        id: String(row.id),
        name,
        values: merged.values,
        backup: {
          price: row.price,
          stock: row.stock,
          color_options: row.color_options,
          size_options: row.size_options,
          detail_image_urls: row.detail_image_urls,
          product_note: row.product_note,
        },
        products: incomingProducts,
        expected: {
          details: merged.finalDetails.length,
          photos: merged.finalPhotoCount,
          variants: merged.finalVariantCount,
        },
      });
    }

    for (const plan of plans) {
      const { error } = await supabase.from("products").update(plan.values).eq("id", plan.id);
      if (error) throw new Error(`${plan.name}: 저장 실패 (${error.message})`);
      updated.push({ id: plan.id, name: plan.name, backup: plan.backup });
    }

    const { data: verifiedData, error: verifyError } = await supabase
      .from("products")
      .select("id, product_name, price, product_note")
      .in("id", plans.map((plan) => plan.id));
    if (verifyError) throw new Error(`저장 결과 확인 실패 (${verifyError.message})`);

    const summary: Record<string, unknown> = {};
    for (const plan of plans) {
      const row = (verifiedData as Row[]).find((item) => String(item.id) === plan.id);
      if (!row) throw new Error(`${plan.name}: 저장 결과가 없습니다.`);
      const note = parseNote(row.product_note);
      const pricing = record(note.option_pricing);
      const photoSets = record(note.detail_photo_sets);
      const group = record(note.brand_group);
      const options = record(group.detail_options);
      const variants = Array.isArray(note.stock_variants) ? note.stock_variants : [];
      const photoCount = Object.values(photoSets).reduce<number>((sum, value) => sum + (Array.isArray(value) ? value.length : 0), 0);
      if (Object.keys(pricing).length !== plan.expected.details) throw new Error(`${plan.name}: 세부상품 개수 불일치`);
      if (photoCount !== plan.expected.photos) throw new Error(`${plan.name}: 사진 개수 불일치`);
      if (variants.length !== plan.expected.variants) throw new Error(`${plan.name}: 옵션 조합 개수 불일치`);
      for (const product of plan.products) {
        const option = record(options[product.detailName]);
        const absolutePrice = Number(row.price) + Number(pricing[product.detailName]);
        if (absolutePrice !== product.price) throw new Error(`${product.code}: 가격 불일치`);
        if (!arraysEqual(option.colors, [product.color])) throw new Error(`${product.code}: 색상 불일치`);
        if (!arraysEqual(option.sizes, product.sizes)) throw new Error(`${product.code}: 사이즈 불일치`);
        if (!Array.isArray(photoSets[product.detailName]) || (photoSets[product.detailName] as unknown[]).length !== 1) {
          throw new Error(`${product.code}: 사진 불일치`);
        }
      }
      summary[plan.name] = {
        added: plan.products.length,
        details: plan.expected.details,
        photos: plan.expected.photos,
        variants: plan.expected.variants,
      };
    }

    return NextResponse.json({
      ok: true,
      batchId: importBatch,
      added: products.length,
      skipped: ["MC-51M"],
      productIds: plans.map((plan) => plan.id),
      summary,
    });
  } catch (error) {
    for (const item of updated.reverse()) {
      await supabase.from("products").update(item.backup).eq("id", item.id);
    }
    if (uploadedPaths.length > 0) await supabase.storage.from(BUCKET).remove(uploadedPaths);
    const message = error instanceof Error ? error.message : String(error);
    return jsonError(`전체 롤백 완료: ${message}`, 500);
  }
}
