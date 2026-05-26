"use client";

const PRODUCT_IMAGE_BUCKET = "product-images";

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function isAlreadyUsableUrl(value: string) {
  return (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("data:") ||
    value.startsWith("blob:") ||
    value.startsWith("/")
  );
}

export function resolveProductImageUrl(value: unknown) {
  const raw = cleanText(value);

  if (!raw) return "";

  if (isAlreadyUsableUrl(raw)) {
    return raw;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const cleanPath = raw.replace(/^\/+/, "");

  if (!supabaseUrl) {
    return cleanPath;
  }

  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${PRODUCT_IMAGE_BUCKET}/${cleanPath}`;
}
