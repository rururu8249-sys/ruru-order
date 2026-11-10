import { EMOJI_MAX_BYTES, EMOJI_PIXELS } from "./liveChatEmoji";

/** GIF는 캔버스로 줄이면 첫 프레임만 남으므로 규격을 확인하고 원본 그대로 보관한다. */
export function chatEmojiGifError(bytes: Uint8Array): string | null {
  if (bytes.length > EMOJI_MAX_BYTES) return "GIF는 1MB 이하로 줄여서 올려 주세요.";
  const signature = String.fromCharCode(...bytes.subarray(0, 6));
  if (bytes.length < 13 || (signature !== "GIF87a" && signature !== "GIF89a")) return "올바른 GIF 파일이 아니에요.";
  const width = bytes[6] | (bytes[7] << 8);
  const height = bytes[8] | (bytes[9] << 8);
  if (!width || !height) return "GIF 그림 크기를 확인해 주세요.";
  if (Math.max(width, height) > EMOJI_PIXELS) return `GIF는 긴 쪽 ${EMOJI_PIXELS}px 이하로 줄여서 올려 주세요.`;
  const invalid = "GIF 파일이 손상되었거나 끝까지 저장되지 않았어요.";
  let pos = 13 + ((bytes[10] & 0x80) ? 3 * (1 << ((bytes[10] & 7) + 1)) : 0);
  let frames = 0;
  const skipBlocks = (requireData = false): boolean => {
    let hasData = false;
    while (pos < bytes.length) {
      const size = bytes[pos++];
      if (size === 0) return !requireData || hasData;
      if (pos + size > bytes.length) return false;
      pos += size;
      hasData = true;
    }
    return false;
  };
  while (pos < bytes.length) {
    const marker = bytes[pos++];
    if (marker === 0x3b) return frames > 0 ? null : invalid;
    if (marker === 0x21) {
      if (pos >= bytes.length) return invalid;
      pos++; // extension label; graphics control/app/comment extensions all use sub-blocks
      if (!skipBlocks()) return invalid;
    } else if (marker === 0x2c) {
      if (pos + 9 > bytes.length) return invalid;
      const left = bytes[pos] | (bytes[pos + 1] << 8);
      const top = bytes[pos + 2] | (bytes[pos + 3] << 8);
      const frameWidth = bytes[pos + 4] | (bytes[pos + 5] << 8);
      const frameHeight = bytes[pos + 6] | (bytes[pos + 7] << 8);
      const packed = bytes[pos + 8];
      if (!frameWidth || !frameHeight || left + frameWidth > width || top + frameHeight > height) return invalid;
      pos += 9 + ((packed & 0x80) ? 3 * (1 << ((packed & 7) + 1)) : 0);
      if (pos >= bytes.length || bytes[pos] < 2 || bytes[pos] > 8) return invalid;
      pos++; // LZW minimum code size
      if (!skipBlocks(true)) return invalid;
      frames++;
    } else {
      return invalid;
    }
  }
  return invalid; // trailer is required, including for single-frame GIFs
}

export async function preserveChatEmojiGif(file: Blob): Promise<Blob> {
  if (file.size > EMOJI_MAX_BYTES) throw new Error("GIF는 1MB 이하로 줄여서 올려 주세요.");
  const error = chatEmojiGifError(new Uint8Array(await file.arrayBuffer()));
  if (error) throw new Error(error);
  return file;
}

export function chatEmojiImageExtension(type: string): "gif" | "webp" | "png" | "jpg" {
  return type === "image/gif" ? "gif" : type === "image/webp" ? "webp" : type === "image/png" ? "png" : "jpg";
}
