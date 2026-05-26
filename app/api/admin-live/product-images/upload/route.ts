import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ADMIN_COOKIE_NAME = "ruru_admin_session";
const BUCKET_NAME = "product-images";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

function assertAdmin(request: NextRequest) {
  const expectedToken = process.env.ADMIN_SESSION_TOKEN;
  const sessionToken = request.cookies.get(ADMIN_COOKIE_NAME)?.value;

  return {
    ok: Boolean(expectedToken && sessionToken === expectedToken),
    hasExpectedToken: Boolean(expectedToken),
    hasSessionCookie: Boolean(sessionToken),
  };
}

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase service role 환경변수가 없습니다.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function safeFileName(name: string) {
  const base = name
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9가-힣_-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50);

  return base || "product-image";
}

async function ensureBucket(supabase: any) {
  const { data, error } = await supabase.storage.getBucket(BUCKET_NAME);

  if (!error && data) return;

  const { error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
    public: true,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    fileSizeLimit: 5 * 1024 * 1024,
  });

  if (createError && !createError.message.toLowerCase().includes("already")) {
    throw new Error(createError.message);
  }
}

export async function POST(request: NextRequest) {
  const adminAuth = assertAdmin(request);

  if (!adminAuth.ok) {
    return jsonError(
      adminAuth.hasExpectedToken
        ? adminAuth.hasSessionCookie
          ? "관리자 로그인 정보가 일치하지 않습니다. /admin-login에서 다시 로그인 후 새로고침해주세요."
          : "관리자 로그인 쿠키가 없습니다. /admin-login에서 다시 로그인 후 새로고침해주세요."
        : "관리자 인증 환경변수가 없습니다. Vercel ADMIN_SESSION_TOKEN을 확인해주세요.",
      401,
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const kind = String(formData.get("kind") || "detail");

    if (!(file instanceof File)) {
      return jsonError("업로드할 파일이 없습니다.");
    }

    if (!file.type.startsWith("image/")) {
      return jsonError("이미지 파일만 업로드할 수 있습니다.");
    }

    if (file.size > 5 * 1024 * 1024) {
      return jsonError("압축 후에도 파일이 5MB를 초과합니다.");
    }

    const supabase = getSupabaseAdmin();
    await ensureBucket(supabase);

    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const random = Math.random().toString(36).slice(2, 10);
    const extension = file.type.includes("webp")
      ? "webp"
      : file.type.includes("png")
        ? "png"
        : "jpg";

    const folder = kind === "cover" ? "cover" : "detail";
    const path = `products/${folder}/${yyyy}/${mm}/${Date.now()}-${random}-${safeFileName(file.name)}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(path, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return jsonError(uploadError.message, 500);
    }

    const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(path);

    return NextResponse.json({
      ok: true,
      bucket: BUCKET_NAME,
      path,
      url: data.publicUrl,
      size: file.size,
      contentType: file.type,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return jsonError(message, 500);
  }
}
