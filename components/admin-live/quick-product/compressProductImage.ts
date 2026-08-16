type ProductImageKind = "cover" | "detail";

type CompressConfig = {
  maxEdge: number;
  quality: number;
  softMaxBytes: number;
};

const CONFIG_BY_KIND: Record<ProductImageKind, CompressConfig> = {
  cover: {
    maxEdge: 900,
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

async function convertHeicToJpeg(file: File): Promise<File> {
  // heic2any는 무거워서(약 1MB) HEIC를 만났을 때만 동적 로드한다.
  const heic2any = (await import("heic2any")).default;
  const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
  const blob = Array.isArray(converted) ? converted[0] : converted;
  const base = String(file.name || "product-image").replace(/\.[^.]+$/, "") || "product-image";
  return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
}

export async function compressProductImage(file: File, kind: ProductImageKind) {
  if (typeof window === "undefined") return file;

  // 아이폰 HEIC/HEIF → JPEG 변환 후 아래 기존 압축(webp) 경로를 그대로 태운다.
  if (isHeicLikeImage(file)) {
    try {
      file = await convertHeicToJpeg(file);
    } catch {
      // 변환 실패 시 원본을 올려봐야 저장소가 거부한다 → 명확한 한국어 에러로 중단.
      throw new Error("아이폰 사진(HEIC)을 변환하지 못했습니다. 사진을 JPEG로 저장해 다시 올려주세요.");
    }
  }

  if (!file.type.startsWith("image/")) return file;

  const config = CONFIG_BY_KIND[kind] || CONFIG_BY_KIND.detail;

  if (file.type === "image/webp" && file.size <= config.softMaxBytes) {
    return file;
  }

  try {
    const image = await loadImage(file);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;

    if (!width || !height) return file;

    const scale = Math.min(1, config.maxEdge / Math.max(width, height));
    const nextWidth = Math.max(1, Math.round(width * scale));
    const nextHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = nextWidth;
    canvas.height = nextHeight;

    const context = canvas.getContext("2d");

    if (!context) return file;

    context.drawImage(image, 0, 0, nextWidth, nextHeight);

    const blob = await canvasToBlob(canvas, "image/webp", config.quality);
    const optimizedFile = new File([blob], makeWebpName(file.name), {
      type: "image/webp",
      lastModified: Date.now(),
    });

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
