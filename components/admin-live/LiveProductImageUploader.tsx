"use client";

import QuickProductImageDropzone from "./quick-product/QuickProductImageDropzone";

export type UploadedProductImage = {
  url?: string;
  publicUrl?: string;
  public_url?: string;
  imageUrl?: string;
  image_url?: string;
  path?: string;
  fileName?: string;
  filename?: string;
  [key: string]: unknown;
};

type LiveProductImageUploaderProps = {
  label?: string;
  title?: string;
  description?: string;
  helperText?: string;
  helpText?: string;

  value?: unknown;
  imageUrl?: unknown;
  images?: unknown;
  detailImages?: unknown;

  maxFiles?: number;
  multiple?: boolean;

  kind?: string;
  type?: string;
  imageType?: string;
  uploadKind?: "cover" | "detail";

  compact?: boolean;
  mode?: string;
  className?: string;
  disabled?: boolean;

  onChange?: unknown;
  onUploaded?: unknown;
  onImagesChange?: unknown;
};

function callMaybe(handler: unknown, value: unknown) {
  if (typeof handler === "function") {
    (handler as (nextValue: unknown) => void)(value);
  }
}

function pickImageUrl(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (!value || typeof value !== "object") {
    return "";
  }

  const image = value as UploadedProductImage;

  return String(
    image.url ||
      image.publicUrl ||
      image.public_url ||
      image.imageUrl ||
      image.image_url ||
      image.path ||
      "",
  ).trim();
}

function normalizeImagesFromProps(props: LiveProductImageUploaderProps): string[] {
  const source =
    props.images !== undefined
      ? props.images
      : props.detailImages !== undefined
        ? props.detailImages
        : props.value !== undefined
          ? props.value
          : props.imageUrl;

  if (Array.isArray(source)) {
    return source.map(pickImageUrl).filter(Boolean);
  }

  const single = pickImageUrl(source);

  return single ? [single] : [];
}

function guessIsDetail(props: LiveProductImageUploaderProps) {
  const text = [
    props.label,
    props.title,
    props.description,
    props.helperText,
    props.helpText,
    props.kind,
    props.type,
    props.imageType,
    props.uploadKind,
    props.mode,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    props.uploadKind === "detail" ||
    props.multiple === true ||
    Number(props.maxFiles || 0) > 1 ||
    text.includes("상세") ||
    text.includes("detail")
  );
}

function shouldReturnArray(props: LiveProductImageUploaderProps, isDetail: boolean) {
  return (
    isDetail ||
    Array.isArray(props.images) ||
    Array.isArray(props.detailImages) ||
    Array.isArray(props.value)
  );
}

function toUploadedImage(url: string): UploadedProductImage {
  return {
    url,
    publicUrl: url,
    public_url: url,
    imageUrl: url,
    image_url: url,
    path: url,
  };
}

function normalizeNextImages(nextValue: string | string[] | null): string[] {
  if (Array.isArray(nextValue)) {
    return nextValue.map((item) => String(item || "").trim()).filter(Boolean);
  }

  if (typeof nextValue === "string" && nextValue.trim()) {
    return [nextValue.trim()];
  }

  return [];
}

export function LiveProductImageUploader(props: LiveProductImageUploaderProps) {
  const isDetail = guessIsDetail(props);
  const returnArray = shouldReturnArray(props, isDetail);
  const maxFiles = isDetail ? 5 : Number(props.maxFiles || 1);
  const label = props.label || props.title || (isDetail ? "상세사진" : "대표사진");
  const description =
    props.description ||
    props.helperText ||
    props.helpText ||
    (isDetail
      ? "상세사진은 최대 5장까지 등록할 수 있습니다."
      : "고객 상품리스트에 보이는 대표사진입니다.");

  return (
    <QuickProductImageDropzone
      label={label}
      description={description}
      value={normalizeImagesFromProps(props)}
      maxFiles={maxFiles}
      multiple={isDetail}
      uploadKind={isDetail ? "detail" : "cover"}
      onChange={(nextValue: string | string[] | null) => {
        const urls = normalizeNextImages(nextValue);
        const uploadedImages = urls.map(toUploadedImage);
        const outputValue = returnArray ? uploadedImages : uploadedImages[0] || null;

        callMaybe(props.onChange, outputValue);
        callMaybe(props.onImagesChange, outputValue);
      }}
      onUploaded={(payload: unknown) => {
        callMaybe(props.onUploaded, payload);
      }}
    />
  );
}

export default LiveProductImageUploader;
