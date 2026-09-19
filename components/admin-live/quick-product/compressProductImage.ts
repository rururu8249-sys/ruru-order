import { squarePlacement, SQUARE_TARGET_PX } from "@/lib/imageSquare";

type ProductImageKind = "cover" | "detail";

type CompressConfig = {
  maxEdge: number;
  quality: number;
  softMaxBytes: number;
};

const CONFIG_BY_KIND: Record<ProductImageKind, CompressConfig> = {
  cover: {
    // [2026-09-20] 실무 표준(스마트스토어 등) 대표이미지 1000×1000 에 맞춘다
    maxEdge: SQUARE_TARGET_PX,
    quality: 0.72,
    softMaxBytes: 300 * 1024,
  },
  detail: {
    maxEdge: 1100,
    quality: 0.7,
    softMaxBytes: 500 * 1024,
  },
};

function makeWebpName(fileName: string) {
  const base = fileName.replace(/\.[^.]+$/, "") || "product-image";
  return `${base}.webp`;
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("이미지를 읽지 못했습니다."));
    };

    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        reject(new Error("이미지 압축에 실패했습니다."));
      },
      type,
      quality,
    );
  });
}

// [2026-08-13] 아이폰 원본 사진(HEIC/HEIF) 판별.
//   브라우저가 HEIC를 못 읽어 압축이 실패 → 원본이 그대로 서버로 가고
//   Supabase 저장소(jpeg/png/webp만 허용)가 거부하던 문제("mime type image/heic is not supported").
//   일부 환경은 file.type이 빈 값이라 확장자도 함께 본다.
export function isHeicLikeImage(file: File) {
  const type = String(file.type || "").toLowerCase();
  const name = String(file.name || "").toLowerCase();
  return type.includes("heic") || type.includes("heif") || /\.(heic|heif)$/.test(name);
}

// [2026-08-16] 아이폰 HEIC 변환 — 디코더 2개를 순서대로 시도한다.
//   1순위 heic-to: libheif 1.22 기반. iPhone 15/16, iOS 18+, 10bit HDR 사진까지 처리.
//   2순위 heic2any: 옛 libheif. 최신 아이폰 파일에서 실패하는 알려진 버그가 있으나
//     (github alexcorvi/heic2any #61 #63) 옛 파일에는 잘 동작하므로 폴백으로만 남긴다.
//   둘 다 실패하면 각각의 실제 원인을 합쳐서 던진다(진단용).
function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const message = (error as Record<string, unknown>).message;
    if (message) return String(message);
    try {
      return JSON.stringify(error).slice(0, 150);
    } catch {
      return "알 수 없는 오류";
    }
  }
  return String(error ?? "알 수 없는 오류");
}

function toJpegFile(blob: Blob, originalName: string): File {
  const base = String(originalName || "product-image").replace(/\.[^.]+$/, "") || "product-image";
  return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
}

// UMD/ESM 혼재 패키지에서 함수를 찾아낸다(번들러마다 default 위치가 다름).
function pickFunction(mod: any, name?: string): any {
  const candidates = [
    name ? mod?.[name] : null,
    name ? mod?.default?.[name] : null,
    mod?.default,
    mod?.default?.default,
    mod,
  ];
  return candidates.find((candidate) => typeof candidate === "function") || null;
}

async function convertHeicToJpeg(file: File): Promise<File> {
  const failures: string[] = [];

  try {
    // heic-to/next: Next.js/webpack에서 워커가 정상 동작하는 전용 진입점
    const mod: any = await import("heic-to/next");
    const heicTo = pickFunction(mod, "heicTo");
    if (typeof heicTo === "function") {
      const blob: Blob = await heicTo({ blob: file, type: "image/jpeg", quality: 0.9 });
      if (blob && blob.size > 0) return toJpegFile(blob, file.name);
      failures.push("heic-to: 빈 결과");
    } else {
      failures.push("heic-to: 함수 없음");
    }
  } catch (error) {
    failures.push("heic-to: " + describeError(error));
  }

  try {
    const mod: any = await import("heic2any");
    const heic2any = pickFunction(mod);
    if (typeof heic2any === "function") {
      const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
      const blob: Blob = Array.isArray(converted) ? converted[0] : converted;
      if (blob && blob.size > 0) return toJpegFile(blob, file.name);
      failures.push("heic2any: 빈 결과");
    } else {
      failures.push("heic2any: 함수 없음");
    }
  } catch (error) {
    failures.push("heic2any: " + describeError(error));
  }

  throw new Error(failures.join(" / ") || "변환기 없음");
}


export async function compressProductImage(file: File, kind: ProductImageKind) {
  if (typeof window === "undefined") return file;

  // 아이폰 HEIC/HEIF → JPEG 변환 후 아래 기존 압축(webp) 경로를 그대로 태운다.
  if (isHeicLikeImage(file)) {
    try {
      file = await convertHeicToJpeg(file);
    } catch (cause) {
      // 변환 실패 시 원본을 올려봐야 저장소가 거부한다 → 명확한 한국어 에러로 중단.
      //   실제 원인을 뒤에 붙여 다음 장애 때 바로 진단 가능하게 한다.
      const detail = describeError(cause);
      console.error("[HEIC 변환 실패]", cause);
      throw new Error(
        "아이폰 사진(HEIC)을 변환하지 못했습니다. 사진을 JPEG로 저장해 다시 올려주세요." + (detail ? `\n(원인: ${detail.slice(0, 200)})` : ""),
      );
    }
  }

  if (!file.type.startsWith("image/")) return file;

  const config = CONFIG_BY_KIND[kind] || CONFIG_BY_KIND.detail;

  // [2026-09-20] 대표사진은 «정사각형 보장»이 목적이라, 이미 webp 라도 그냥 통과시키지 않는다(비율을 알 수 없으므로).
  if (kind !== "cover" && file.type === "image/webp" && file.size <= config.softMaxBytes) {
    return file;
  }

  try {
    const image = await loadImage(file);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;

    if (!width || !height) return file;

    const canvas = document.createElement("canvas");
    const context = (() => {
      const ctx = canvas.getContext("2d");
      return ctx;
    })();
    if (!context) return file;

    if (kind === "cover") {
      // [2026-09-20 사장님 요청] 대표사진은 **1:1 정사각형**으로 통일한다.
      //   찌그러뜨리거나 잘라내지 않고, 사진 전체를 비율 그대로 넣고 남는 자리에 «흰 여백»을 넣는다.
      //   → 방송 위젯·손님 상품목록의 사진칸이 상품마다 달라 보이던 문제가 근본적으로 사라진다.
      //   계산 규칙은 lib/imageSquare.ts (테스트 scripts/test-image-square.mjs) 참고.
      const place = squarePlacement(width, height, config.maxEdge);
      if (!place) return file;
      canvas.width = place.size;
      canvas.height = place.size;
      context.fillStyle = "#FFFFFF"; // 실무 표준 배경색
      context.fillRect(0, 0, place.size, place.size);
      context.drawImage(image, place.dx, place.dy, place.dw, place.dh);
    } else {
      // 상세사진은 세로로 긴 «상세컷»이 많다 → 정사각형으로 만들면 흰 여백만 잔뜩 생긴다. 비율 그대로 둔다.
      const scale = Math.min(1, config.maxEdge / Math.max(width, height));
      const nextWidth = Math.max(1, Math.round(width * scale));
      const nextHeight = Math.max(1, Math.round(height * scale));
      canvas.width = nextWidth;
      canvas.height = nextHeight;
      context.drawImage(image, 0, 0, nextWidth, nextHeight);
    }

    const blob = await canvasToBlob(canvas, "image/webp", config.quality);
    const optimizedFile = new File([blob], makeWebpName(file.name), {
      type: "image/webp",
      lastModified: Date.now(),
    });

    // 대표사진은 크기와 상관없이 «정사각형으로 바꾼 것»을 써야 한다(그게 목적).
    if (kind === "cover") return optimizedFile;

    if (optimizedFile.size < file.size || file.size > config.softMaxBytes) {
      return optimizedFile;
    }

    return file;
  } catch {
    return file;
  }
}

export function getProductImageOptimizeGuide(kind: ProductImageKind) {
  const config = CONFIG_BY_KIND[kind] || CONFIG_BY_KIND.detail;

  return {
    outputType: "image/webp",
    maxEdge: config.maxEdge,
    quality: config.quality,
    softMaxBytes: config.softMaxBytes,
  };
}
