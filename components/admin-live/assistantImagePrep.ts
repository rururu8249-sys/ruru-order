"use client";

// [2026-10-22 AI 비서 8단계] 캡처 사진 준비(브라우저 안): 줄이고 → tesseract.js 로 글자 읽고 → 전화·계좌·주소 검게 → JPEG base64.
//   응대 문구(ReplyBox)와 대화창(ChatBox)이 같이 쓴다. 원본 사진은 사장님 컴퓨터 밖으로 안 나간다. 이름·닉네임은 못 가린다.
import { mergeAdjacentNumberWords, ocrStripPlan, pickMaskBoxes, type OcrWord } from "@/lib/imagePrivacyMask";

export type PreparedImage = { mimeType: string; data: string; preview: string; masked: number; status: "ocr" | "ready" | "nomask" };
type Img = PreparedImage;

export const MAX_IMAGES = 10;
const MAX_EDGE = 1280;

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("사진을 열 수 없어요."));
      el.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function toCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

// 글자 인식기는 한 번만 만들어 재사용(한국어+영어 모델은 처음 한 번 내려받고 브라우저가 기억)
let ocrWorkerPromise: Promise<import("tesseract.js").Worker> | null = null;
async function getOcrWorker() {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      return createWorker(["kor", "eng"]);
    })();
  }
  return ocrWorkerPromise;
}

/** 사진 → 줄이고 → 글자 읽고 → 개인정보 상자 검게 → base64 */
export async function prepareImage(file: File, onStage: (s: Img["status"]) => void): Promise<PreparedImage> {
  const img = await loadImage(file);
  const canvas = toCanvas(img);
  let masked = 0;
  let status: Img["status"] = "ready";
  try {
    onStage("ocr");
    const worker = await getOcrWorker();
    // [10/22 실측] 원본을 키워 가로 조각으로 읽어야 대화 위에 붙은 작은 사진 속 계좌번호까지 잡힌다(1배 한 번 읽기는 놓침).
    const { scale, strips } = ocrStripPlan(img.width, img.height);
    const toCanvasRatio = canvas.width / img.width;
    const words: OcrWord[] = [];
    let lineNo = 0;
    for (const strip of strips) {
      const part = document.createElement("canvas");
      part.width = Math.round(img.width * scale);
      part.height = Math.round(strip.sh * scale);
      const pctx = part.getContext("2d");
      if (!pctx) continue;
      pctx.imageSmoothingQuality = "high";
      pctx.drawImage(img, 0, strip.sy, img.width, strip.sh, 0, 0, part.width, part.height);
      const { data } = await worker.recognize(part, {}, { blocks: true });
      for (const block of data.blocks || []) for (const para of block.paragraphs || []) for (const line of para.lines || []) {
        lineNo += 1;
        for (const w of line.words || []) {
          if (!w.text?.trim()) continue;
          const k = toCanvasRatio / scale;
          words.push({ text: w.text, x0: w.bbox.x0 * k, y0: (w.bbox.y0 / scale + strip.sy) * toCanvasRatio, x1: w.bbox.x1 * k, y1: (w.bbox.y1 / scale + strip.sy) * toCanvasRatio, line: lineNo, confidence: typeof w.confidence === "number" ? w.confidence : undefined });
        }
      }
    }
    const boxes = pickMaskBoxes(mergeAdjacentNumberWords(words));
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#111111";
      for (const b of boxes) ctx.fillRect(b.x0 - 3, b.y0 - 3, b.x1 - b.x0 + 6, b.y1 - b.y0 + 6);
    }
    // 조각이 40px 겹쳐 같은 자리가 두 번 잡힐 수 있어 개수는 자리 기준으로 센다
    masked = new Set(boxes.map((b) => `${Math.round(b.y0 / 8)}:${Math.round(b.x0 / 8)}`)).size;
  } catch {
    status = "nomask"; // 글자 인식이 안 되면 가리지 못했다고 표시(보내기 전에 사장님이 판단)
  }
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return { mimeType: "image/jpeg", data: dataUrl.split(",")[1] || "", preview: dataUrl, masked, status };
}

