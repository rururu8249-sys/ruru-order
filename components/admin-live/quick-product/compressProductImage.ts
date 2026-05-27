type ProductImageKind = "cover" | "detail";

type CompressConfig = {
  maxEdge: number;
  quality: number;
  softMaxBytes: number;
};

const CONFIG_BY_KIND: Record<ProductImageKind, CompressConfig> = {
  cover: {
    maxEdge: 1200,
    quality: 0.84,
    softMaxBytes: 700 * 1024,
  },
  detail: {
    maxEdge: 1400,
    quality: 0.8,
    softMaxBytes: 900 * 1024,
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

export async function compressProductImage(file: File, kind: ProductImageKind) {
  if (typeof window === "undefined") return file;
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
