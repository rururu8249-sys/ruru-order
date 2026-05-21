// components/admin-v2/today/kakaoConversationFilter.ts
// 목적: 카톡 원본 대화를 고객 메시지 / 관리자 답변 / 자동응답으로 분리
// - 고객 메시지만 문의유형/감정/상품 분석
// - 유혜원/한두희 답변은 고객으로 보지 않고 관리자 답변으로 기록
// - 루루동이/카나나/챗봇 자동응답은 분석에서 제외

export type KakaoConversationRole = "customer" | "admin" | "auto";

export type KakaoFilteredConversation = {
  customerText: string;
  adminText: string;
  autoText: string;
  customerCount: number;
  adminCount: number;
  autoCount: number;
  adminSenders: string[];
  autoSenders: string[];
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
  "Kanana 상담매니저",
  "카나나 상담매니저",
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

export function parseKakaoRoleWords(params?: {
  extraAdminSenders?: string;
  extraAutoSenders?: string;
}) {
  return {
    adminSenders: unique([...DEFAULT_ADMIN_SENDERS, ...splitExtraWords(params?.extraAdminSenders || "")]),
    autoSenders: unique([...DEFAULT_AUTO_SENDERS, ...splitExtraWords(params?.extraAutoSenders || "")]),
  };
}

const lineHasAny = (line: string, words: string[]) => {
  const compactLine = normalize(line);

  return words.some((word) => {
    const compactWord = normalize(word);
    return compactWord && compactLine.includes(compactWord);
  });
};

const looksLikeSenderMarker = (line: string, senders: string[]) => {
  const compactLine = normalize(line);

  return senders.some((sender) => {
    const compactSender = normalize(sender);
    if (!compactSender) return false;

    const hasSender = compactLine.includes(compactSender);
    const shortLine = compactLine.length <= compactSender.length + 12;
    const hasSentWord =
      compactLine.includes("보냄") ||
      compactLine.includes("님이보냄") ||
      compactLine.includes("가보냄") ||
      compactLine.includes("이보냄");

    return hasSender && (shortLine || hasSentWord);
  });
};

const detectLineRole = (
  line: string,
  adminSenders: string[],
  autoSenders: string[]
): {
  role: KakaoConversationRole | null;
  isSenderMarker: boolean;
} => {
  const isAuto = lineHasAny(line, autoSenders) || lineHasAny(line, AUTO_REPLY_PATTERNS);

  if (isAuto) {
    return {
      role: "auto",
      isSenderMarker: looksLikeSenderMarker(line, autoSenders),
    };
  }

  const isAdmin = lineHasAny(line, adminSenders);

  if (isAdmin) {
    return {
      role: "admin",
      isSenderMarker: looksLikeSenderMarker(line, adminSenders),
    };
  }

  return {
    role: null,
    isSenderMarker: false,
  };
};

export function buildKakaoCustomerOnlyConversation(
  rawText: string,
  extraAdminSenders = "",
  extraAutoSenders = ""
): KakaoFilteredConversation {
  const { adminSenders, autoSenders } = parseKakaoRoleWords({
    extraAdminSenders,
    extraAutoSenders,
  });

  const lines = String(rawText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const customerLines: string[] = [];
  const adminLines: string[] = [];
  const autoLines: string[] = [];

  let nextLineRole: KakaoConversationRole | null = null;

  lines.forEach((line) => {
    if (nextLineRole) {
      if (nextLineRole === "admin") adminLines.push(line);
      if (nextLineRole === "auto") autoLines.push(line);
      nextLineRole = null;
      return;
    }

    const detected = detectLineRole(line, adminSenders, autoSenders);

    if (detected.role === "auto") {
      autoLines.push(line);
      if (detected.isSenderMarker) nextLineRole = "auto";
      return;
    }

    if (detected.role === "admin") {
      adminLines.push(line);
      if (detected.isSenderMarker) nextLineRole = "admin";
      return;
    }

    customerLines.push(line);
  });

  return {
    customerText: customerLines.join("\n"),
    adminText: adminLines.join("\n"),
    autoText: autoLines.join("\n"),
    customerCount: customerLines.length,
    adminCount: adminLines.length,
    autoCount: autoLines.length,
    adminSenders,
    autoSenders,
  };
}
