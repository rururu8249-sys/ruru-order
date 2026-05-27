"use client";

import { useMemo, useRef, useState } from "react";
import { showAdminToast } from "@/lib/adminToast";
import { resolveProductImageUrl } from "./productImageUrl";
import { compressProductImage } from "./compressProductImage";

type ImageValue = string | string[] | null;

type QuickProductImageDropzoneProps = {
  label: string;
  description?: string;
  value?: ImageValue;
  maxFiles?: number;
  multiple?: boolean;
  uploadKind?: "cover" | "detail";
  onChange?: (nextValue: string | string[] | null) => void;
  onUploaded?: (payload: UploadPayload) => void;
};

type UploadPayload = Record<string, unknown>;

function normalizeImages(value: ImageValue) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }

  return [];
}

function pickPayloadString(payload: UploadPayload, keys: string[]) {
  for (const key of keys) {
    const value = payload[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function getImageUrlFromPayload(payload: UploadPayload) {
  return pickPayloadString(payload, [
    "url",
    "publicUrl",
    "public_url",
    "imageUrl",
    "image_url",
    "downloadUrl",
    "download_url",
    "src",
    "path",
  ]);
}

function isPreviewable(src: string) {
  return (
    src.startsWith("http://") ||
    src.startsWith("https://") ||
    src.startsWith("data:") ||
    src.startsWith("blob:") ||
    src.startsWith("/")
  );
}

function callUnknownHandler(handler: unknown, value: unknown) {
  if (typeof handler === "function") {
    (handler as (nextValue: unknown) => void)(value);
  }
}

export default function QuickProductImageDropzone({
  label,
  description,
  value = null,
  maxFiles = 1,
  multiple = false,
  uploadKind = "cover",
  onChange,
  onUploaded,
}: QuickProductImageDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const images = useMemo(() => normalizeImages(value), [value]);
  const isMultiple = multiple || maxFiles > 1;
  const slotCount = Math.max(1, maxFiles);

  const emitChange = (nextImages: string[]) => {
    if (isMultiple) {
      callUnknownHandler(onChange, nextImages);
    } else {
      callUnknownHandler(onChange, nextImages[0] || null);
    }
  };

  const uploadFile = async (file: File) => {
    const optimizedFile = await compressProductImage(file, uploadKind);
    const formData = new FormData();
    formData.append("file", optimizedFile);
    formData.append("kind", uploadKind);
    formData.append("type", uploadKind);
    formData.append("imageType", uploadKind);
    formData.append("slot", uploadKind);

    const response = await fetch("/api/admin-live/product-images/upload", {
      method: "POST",
      body: formData,
      credentials: "include",
    });

    const payload = (await response.json().catch(() => ({}))) as UploadPayload;

    if (!response.ok || payload.ok === false) {
      const message =
        pickPayloadString(payload, ["message", "error"]) ||
        `이미지 업로드 실패 (${response.status})`;

      throw new Error(message);
    }

    const uploadedUrl = getImageUrlFromPayload(payload);

    if (!uploadedUrl) {
      throw new Error("업로드 결과 URL을 찾지 못했습니다.");
    }

    callUnknownHandler(onUploaded, payload);

    return uploadedUrl;
  };

  const handleFiles = async (fileList: FileList | File[]) => {
    const pickedFiles = Array.from(fileList)
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, isMultiple ? slotCount : 1);

    if (pickedFiles.length === 0) {
      showAdminToast("이미지 파일만 등록할 수 있습니다.", "error");
      return;
    }

    if (images.length >= slotCount) {
      showAdminToast(`이미지는 최대 ${slotCount}장까지 등록할 수 있습니다.`, "error");
      return;
    }

    const allowedFiles = pickedFiles.slice(0, Math.max(0, slotCount - images.length));

    if (allowedFiles.length === 0) {
      showAdminToast(`이미지는 최대 ${slotCount}장까지 등록할 수 있습니다.`, "error");
      return;
    }

    setUploading(true);

    try {
      const uploaded = [];

      for (const file of allowedFiles) {
        uploaded.push(await uploadFile(file));
      }

      const nextImages = isMultiple
        ? [...images, ...uploaded].slice(0, slotCount)
        : uploaded.slice(0, 1);

      emitChange(nextImages);
      showAdminToast("이미지 업로드 완료", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "이미지 업로드 실패";
      showAdminToast("이미지 업로드 실패\n\n" + message, "error");
    } finally {
      setUploading(false);
      setIsDragging(false);

      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };

  const removeImage = (index: number) => {
    const nextImages = images.filter((_, imageIndex) => imageIndex !== index);
    emitChange(nextImages);
  };

  const openFilePicker = () => {
    inputRef.current?.click();
  };

  const slots = Array.from({ length: slotCount }, (_, index) => images[index] || "");

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3.5">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-black text-slate-950">{label}</h3>
          {description ? (
            <p className="mt-1 text-[11px] font-bold text-slate-500">{description}</p>
          ) : null}
        </div>

        <div className="shrink-0 text-[10px] font-black text-slate-400">
          {images.length}/{slotCount}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={isMultiple}
        className="hidden"
        onChange={(event) => {
          if (event.target.files) {
            void handleFiles(event.target.files);
          }
        }}
      />

      <div
        role="button"
        tabIndex={0}
        onClick={openFilePicker}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openFilePicker();
          }
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setIsDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          void handleFiles(event.dataTransfer.files);
        }}
        className={[
          "rounded-2xl border border-dashed p-2 transition",
          isDragging
            ? "border-blue-400 bg-blue-50"
            : "border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-blue-50/40",
        ].join(" ")}
      >
        {isMultiple ? (
          <div className="grid grid-cols-5 gap-2">
            {slots.map((src, index) => (
              <div
                key={index}
                className="group relative aspect-square overflow-hidden rounded-xl bg-white ring-1 ring-slate-200"
              >
                {src && isPreviewable(resolveProductImageUrl(src)) ? (
                  <img
                    src={resolveProductImageUrl(src)}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : src ? (
                  <div className="flex h-full w-full items-center justify-center p-2 text-center text-[10px] font-black text-slate-500">
                    등록됨
                  </div>
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-slate-400">
                    <span className="text-lg">{index === images.length ? "+" : "□"}</span>
                    <span className="text-[10px] font-black">
                      {index === images.length ? "추가" : "사진 없음"}
                    </span>
                  </div>
                )}

                {src ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      removeImage(index);
                    }}
                    className="absolute right-1 top-1 hidden rounded-full bg-slate-950/70 px-1.5 py-0.5 text-[10px] font-black text-white group-hover:block"
                  >
                    ×
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="relative aspect-square overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
            {images[0] && isPreviewable(resolveProductImageUrl(images[0])) ? (
              <img
                src={resolveProductImageUrl(images[0])}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : images[0] ? (
              <div className="flex h-full w-full items-center justify-center p-3 text-center text-xs font-black text-slate-500">
                대표사진 등록됨
              </div>
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-slate-400">
                <span className="text-3xl">📷</span>
                <span className="text-xs font-black">대표사진 없음</span>
                <span className="text-[10px] font-bold">클릭 또는 드래그앤드롭</span>
              </div>
            )}

            {images[0] ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  removeImage(0);
                }}
                className="absolute right-2 top-2 rounded-full bg-slate-950/70 px-2 py-1 text-[11px] font-black text-white"
              >
                삭제
              </button>
            ) : null}
          </div>
        )}

        <div className="mt-2 text-center text-[10px] font-bold text-slate-400">
          {uploading ? "업로드 중..." : "클릭 또는 드래그앤드롭으로 등록"}
        </div>
      </div>
    </section>
  );
}
