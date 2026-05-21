// components/admin-v2/today/kakaoConversationTimeline.ts
// 목적: 카톡 원본 대화를 순서대로 고객문의/관리자답변/자동응답으로 나누고 문의별 분석 생성
// 주의: 카카오 API 아님. 붙여넣은 텍스트 기반 분석 전용.

import {
  analyzeKakaoConversation,
  type KakaoAnalysisResult,
} from "@/components/admin-v2/today/kakaoSupportUtils";

export type KakaoTimelineRole = "customer" | "admin" | "auto";

export type KakaoTimelineItem = {
  id: string;
  role: KakaoTimelineRole;
  dateLabel: string;
  senderLabel: string;
  content: string;
  lineCount: number;
  analysis?: KakaoAnalysisResult;
};

const DEFAULT_ADMIN_SENDERS = [
  "유혜원",
  "유혜원님",
  "유혜원이 보냄",
  "유혜원님이 보냄",
  "한두희",
  "한두희님",
  "한두희가 보냄",
  "한두희님이 보냄",
];

const DEFAULT_AUTO_SENDERS = [
  "루루동이",
  "루루동이님",
  "루루동이님이 보냄",
  "카나나 상담매니저",
  "카나나 상담매니저가 보냄",
  "Kanana 상담매니저",
  "Kanana",
  "카나나",
  "챗봇",
  "챗봇이 보냄",
  "자동응답",
];

const AUTO_REPLY_PATTERNS = [
  "상담매니저",
  "관리자가 없을때 대신 답변",
  "관리자가 없을 때 대신 답변",
  "저는 아는 질문에 대해서만 대답할 수 있어요",
  "채널 관리자에게 전달할게요",
  "카나나가 답변 중입니다",
  "챗봇",
  "자동응답",
];

const normalize = (value: unknown) =>
  String(value ?? "")
    .replace(/\s+/g, "")
    .replace(/[()[\]{}:：,./\\|_-]/g, "")
    .toLowerCase();

const splitExtraWords = (value: string) =>
  String(value || "")
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);

const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

const makeWords = (extraAdminSenders = "", extraAutoSenders = "") => {
  return {
    adminSenders: unique([...DEFAULT_ADMIN_SENDERS, ...splitExtraWords(extraAdminSenders)]),
    autoSenders: unique([...DEFAULT_AUTO_SENDERS, ...splitExtraWords(extraAutoSenders)]),
  };
};

const lineHasAny = (line: string, words: string[]) => {
  const compactLine = normalize(line);

  return words.some((word) => {
    const compactWord = normalize(word);
    return compactWord && compactLine.includes(compactWord);
  });
};

const looksLikeSenderMarker = (line: string) => {
  const compact = normalize(line);

  return (
    compact.includes("보냄") ||
    compact.includes("님이보냄") ||
    compact.includes("가보냄") ||
    compact.includes("이보냄")
  );
};

const extractSenderName = (line: string) => {
  return String(line || "")
    .replace(/님이\s*보냄/g, "")
    .replace(/님이보냄/g, "")
    .replace(/이\s*보냄/g, "")
    .replace(/가\s*보냄/g, "")
    .replace(/보냄/g, "")
    .replace(/[:：]/g, "")
    .trim();
};

const detectDateLine = (line: string) => {
  const text = String(line || "").trim();

  const full = text.match(/(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?/);
  if (full) return `${Number(full[2])}월 ${Number(full[3])}일`;

  const monthDay = text.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (monthDay) return `${Number(monthDay[1])}월 ${Number(monthDay[2])}일`;

  const dot = text.match(/^(\d{1,2})[.\-/](\d{1,2})(?:\s|$)/);
  if (dot) return `${Number(dot[1])}월 ${Number(dot[2])}일`;

  if (text.includes("오늘")) return "오늘";
  if (text.includes("어제")) return "어제";

  return "";
};

const detectTimeLine = (line: string) => {
  const text = String(line || "").trim();

  const korean = text.match(/(오전|오후)\s*(\d{1,2})[:시]\s*(\d{2})?/);
  if (korean) {
    return `${korean[1]} ${korean[2]}:${korean[3] || "00"}`;
  }

  const basic = text.match(/^(\d{1,2}):(\d{2})$/);
  if (basic) return `${basic[1]}:${basic[2]}`;

  return "";
};

const detectRoleFromSenderOrLine = (
  line: string,
  adminSenders: string[],
  autoSenders: string[]
): KakaoTimelineRole => {
  if (lineHasAny(line, autoSenders) || lineHasAny(line, AUTO_REPLY_PATTERNS)) return "auto";
  if (lineHasAny(line, adminSenders)) return "admin";
  return "customer";
};

const makeDateLabel = (dateText: string, timeText: string) => {
  if (dateText && timeText) return `${dateText} ${timeText}`;
  if (dateText) return dateText;
  if (timeText) return `시간 ${timeText}`;
  return "날짜확인 필요";
};

const pushOrAppend = (
  items: KakaoTimelineItem[],
  next: Omit<KakaoTimelineItem, "id" | "lineCount" | "analysis"> & { analysis?: KakaoAnalysisResult }
) => {
  const last = items[items.length - 1];

  if (
    last &&
    last.role === next.role &&
    last.dateLabel === next.dateLabel &&
    last.senderLabel === next.senderLabel
  ) {
    last.content = [last.content, next.content].filter(Boolean).join("\n");
    last.lineCount += 1;

    if (last.role === "customer") {
      last.analysis = analyzeKakaoConversation(last.content);
    }

    return;
  }

  const item: KakaoTimelineItem = {
    id: `kakao-${items.length + 1}`,
    role: next.role,
    dateLabel: next.dateLabel,
    senderLabel: next.senderLabel,
    content: next.content,
    lineCount: 1,
    analysis: next.role === "customer" ? analyzeKakaoConversation(next.content) : undefined,
  };

  items.push(item);
};

export function buildKakaoConversationTimeline(
  rawText: string,
  extraAdminSenders = "",
  extraAutoSenders = ""
): KakaoTimelineItem[] {
  const { adminSenders, autoSenders } = makeWords(extraAdminSenders, extraAutoSenders);

  const lines = String(rawText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const items: KakaoTimelineItem[] = [];

  let currentDate = "";
  let currentTime = "";
  let pendingRole: KakaoTimelineRole | null = null;
  let pendingSender = "";

  lines.forEach((line) => {
    const dateLine = detectDateLine(line);
    if (dateLine && line.length <= 30) {
      currentDate = dateLine;
      return;
    }

    const timeLine = detectTimeLine(line);
    if (timeLine && line.length <= 20) {
      currentTime = timeLine;
      return;
    }

    if (looksLikeSenderMarker(line)) {
      const role = detectRoleFromSenderOrLine(line, adminSenders, autoSenders);
      pendingRole = role;
      pendingSender = extractSenderName(line) || (role === "admin" ? "관리자" : role === "auto" ? "자동응답" : "고객");
      return;
    }

    const role = pendingRole || detectRoleFromSenderOrLine(line, adminSenders, autoSenders);
    const senderLabel =
      pendingSender ||
      (role === "admin" ? "관리자 답변" : role === "auto" ? "자동응답/챗봇" : "고객");

    pushOrAppend(items, {
      role,
      dateLabel: makeDateLabel(currentDate, currentTime),
      senderLabel,
      content: line,
    });

    pendingRole = null;
    pendingSender = "";
  });

  return items;
}

export function buildKakaoTimelineMemo(items: KakaoTimelineItem[]) {
  if (items.length === 0) return "";

  return items
    .map((item, index) => {
      if (item.role === "customer") {
        return [
          `${index + 1}. [${item.dateLabel} 고객 문의]`,
          `보낸사람: ${item.senderLabel}`,
          `분류: ${item.analysis?.label || "일반문의"} / 위험도: ${item.analysis?.riskLabel || "-"}`,
          "내용:",
          item.content,
          "",
          "추천답변:",
          item.analysis?.recommendedReply || "-",
        ].join("\n");
      }

      if (item.role === "admin") {
        return [
          `${index + 1}. [${item.dateLabel} 관리자 답변]`,
          `보낸사람: ${item.senderLabel}`,
          "내용:",
          item.content,
        ].join("\n");
      }

      return [
        `${index + 1}. [${item.dateLabel} 자동응답 제외]`,
        `보낸사람: ${item.senderLabel}`,
        `제외내용: ${item.lineCount}줄`,
      ].join("\n");
    })
    .join("\n\n");
}
