"use client";

import { useRef, useState } from "react";
import { showAdminToast } from "@/lib/adminToast";

export type UploadedProductImage = {
  url: string;
  path: string;
  size?: number;
  contentType?: string;
};

type LiveProductImageUploaderProps = {
  label: string;
  helpText: string;
  kind: "cover" | "detail";
  multiple?: boolean;
  images: UploadedProductImage[];
  onChange: (images: UploadedProductImage[]) => void;
  compact?: boolean;
};

const MAX_WIDTH = 1400;
const MAX_HEIGHT = 1800;
const QUALITY = 0.82;

async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) {
    throw new Error("이미지 파일만 업로드할 수 있습니다.");
  }

  const imageUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("이미지를 읽지 못했습니다."));
      img.src = imageUrl;
    });

    const ratio = Math.min(MAX_WIDTH / image.width, MAX_HEIGHT / image.height, 1);
    const width = Math.max(1, Math.round(image.width * ratio));
    const height = Math.max(1, Math.round(image.height * ratio));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("이미지 압축을 준비하지 못했습니다.");

    ctx.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/webp", QUALITY);
    });

    if (!blob) throw new Error("이미지 압축에 실패했습니다.");

    const name = file.name.replace(/\.[^.]+$/, "") + ".webp";

    return new File([blob], name, {
      type: "image/webp",
      lastModified: Date.now(),
    });
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

async function uploadOne(file: File, kind: "cover" | "detail"): Promise<UploadedProductImage> {
  const compressed = await compressImage(file);

  const formData = new FormData();
  formData.append("file", compressed);
  formData.append("kind", kind);

  const response = await fetch("/api/admin-live/product-images/upload", {
    method: "POST",
    body: formData,
  });

  const result = await response.json();

  if (!response.ok || !result?.ok) {
    throw new Error(result?.message || "이미지 업로드 실패");
  }

  return {
    url: result.url,
    path: result.path,
    size: result.size,
    contentType: result.contentType,
  };
}

async function deleteOne(path: string) {
  const response = await fetch("/api/admin-live/product-images/delete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ path }),
  });

  const result = await response.json();

  if (!response.ok || !result?.ok) {
    throw new Error(result?.message || "이미지 삭제 실패");
  }
}

export default function LiveProductImageUploader({
  label,
  helpText,
  kind,
  multiple = false,
  images,
  onChange,
  compact = true,
}: LiveProductImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  const addFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter((file) => file.type.startsWith("image/"));

    if (!files.length) {
      showAdminToast("이미지 파일만 업로드할 수 있습니다.", "warning");
      return;
    }

    const targetFiles = multiple ? files : files.slice(0, 1);

    setBusy(true);

    try {
      const uploaded: UploadedProductImage[] = [];

      for (const file of targetFiles) {
        uploaded.push(await uploadOne(file, kind));
      }

      onChange(multiple ? [...images, ...uploaded] : uploaded.slice(0, 1));
      showAdminToast("이미지를 업로드했습니다.", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "알 수 없는 오류";
      showAdminToast("이미지 업로드 실패\n\n" + message, "error");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const removeImage = async (target: UploadedProductImage) => {
    setBusy(true);

    try {
      await deleteOne(target.path);
      onChange(images.filter((image) => image.path !== target.path));
      showAdminToast("이미지를 완전 삭제했습니다.", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "알 수 없는 오류";
      showAdminToast("이미지 삭제 실패\n\n" + message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="block">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="block text-[12px] font-black text-slate-600">
          {label}
        </span>
        {images.length ? (
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-700">
            {images.length}장
          </span>
        ) : null}
      </div>

      <div
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (event.dataTransfer.files?.length) {
            addFiles(event.dataTransfer.files);
          }
        }}
        className={[
          "rounded-xl border border-dashed transition",
          compact ? "px-3 py-3" : "px-4 py-5",
          dragging ? "border-blue-400 bg-blue-50" : "border-slate-300 bg-slate-50",
        ].join(" ")}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-base shadow-sm">
            🖼️
          </div>

          <div className="min-w-0 flex-1 text-left">
            <p className="text-[12px] font-black text-slate-700">
              드래그 또는 파일선택
            </p>
            <p className="mt-0.5 truncate text-[10px] font-bold text-slate-500">
              {helpText}
            </p>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple={multiple}
            className="hidden"
            onChange={(event) => {
              if (event.target.files?.length) {
                addFiles(event.target.files);
              }
            }}
          />

          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="shrink-0 rounded-lg bg-white px-3 py-2 text-[11px] font-black text-slate-700 ring-1 ring-slate-200 disabled:cursor-wait disabled:opacity-50"
          >
            {busy ? "처리중" : "선택"}
          </button>
        </div>
      </div>

      {images.length ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {images.map((image) => (
            <div key={image.path} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-1.5">
              <img
                src={image.url}
                alt="상품 이미지"
                className="h-12 w-12 rounded-lg object-cover"
              />
              <div className="min-w-0">
                <p className="max-w-[90px] truncate text-[10px] font-bold text-slate-400">
                  {Math.round((image.size || 0) / 1024)}KB
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => removeImage(image)}
                  className="mt-0.5 rounded-md bg-rose-50 px-2 py-0.5 text-[10px] font-black text-rose-700 disabled:opacity-50"
                >
                  완전삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
