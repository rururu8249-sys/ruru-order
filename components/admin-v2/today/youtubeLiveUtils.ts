// components/admin-v2/today/youtubeLiveUtils.ts
// 목적: 유튜브 LIVE 채팅 패널의 URL/검색/ChatGPT 문구 생성 유틸
// 주의: UI 보조 전용. 주문/입금/배송/정산 로직 없음.

export const YOUTUBE_LIVE_STORAGE_KEY = "ruru-admin-youtube-live-url";
export const CHATGPT_URL = "https://chatgpt.com/";

export function normalizeYoutubeSearchText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, "").toLowerCase();
}

export function extractYoutubeVideoId(input: string) {
  const raw = input.trim();

  if (!raw) return "";

  if (/^[a-zA-Z0-9_-]{8,20}$/.test(raw) && !raw.includes("/")) {
    return raw;
  }

  try {
    const url = new URL(raw);
    const v = url.searchParams.get("v");

    if (v) return v;

    const parts = url.pathname.split("/").filter(Boolean);

    const liveIndex = parts.findIndex((part) => part === "live");
    if (liveIndex >= 0 && parts[liveIndex + 1]) return parts[liveIndex + 1];

    const shortsIndex = parts.findIndex((part) => part === "shorts");
    if (shortsIndex >= 0 && parts[shortsIndex + 1]) return parts[shortsIndex + 1];

    if (url.hostname.includes("youtu.be") && parts[0]) return parts[0];

    return "";
  } catch {
    return "";
  }
}

export function filterYoutubeChatLines({
  chatText,
  keyword,
  nickname,
}: {
  chatText: string;
  keyword: string;
  nickname: string;
}) {
  const lines = chatText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const key = normalizeYoutubeSearchText(keyword);
  const nick = normalizeYoutubeSearchText(nickname);

  return lines.filter((line) => {
    const target = normalizeYoutubeSearchText(line);
    const keywordMatch = !key || target.includes(key);
    const nicknameMatch = !nick || target.includes(nick);

    return keywordMatch && nicknameMatch;
  });
}

export function buildYoutubeLiveGptPrompt({
  liveUrl,
  videoId,
  keyword,
  nickname,
  chatText,
  filteredText,
}: {
  liveUrl: string;
  videoId: string;
  keyword: string;
  nickname: string;
  chatText: string;
  filteredText: string;
}) {
  return [
    "아래 유튜브 라이브 채팅 내용을 라이브커머스 운영자 입장에서 분석해줘.",
    "",
    "분석 기준:",
    "1. 구매 의사, 주문 문의, 입금 문의, 배송 문의, 사이즈/색상 문의를 먼저 찾아줘.",
    "2. 닉네임별로 누가 무엇을 문의했는지 정리해줘.",
    "3. 내가 바로 답변해야 할 채팅을 우선순위로 표시해줘.",
    "4. 단순 잡담/인사/반응은 참고용으로만 분류해줘.",
    "5. 오늘할일에 등록해야 할 채팅만 따로 모아줘.",
    "6. 답변은 짧고 부드러운 라이브방송 채팅 말투로 추천해줘.",
    "",
    "출력 형식:",
    "## 바로 처리할 채팅",
    "- 닉네임:",
    "- 문의 내용:",
    "- 분류:",
    "- 추천 답변:",
    "- 오늘할일 등록 추천 여부:",
    "",
    "## 참고용 채팅",
    "- 닉네임:",
    "- 내용:",
    "",
    `방송 URL: ${liveUrl || "-"}`,
    `영상ID: ${videoId || "-"}`,
    `검색어: ${keyword || "-"}`,
    `닉네임 검색: ${nickname || "-"}`,
    "",
    "[검색 필터 결과]",
    filteredText || "-",
    "",
    "[전체 채팅 복사 내용]",
    chatText || "-",
  ].join("\n");
}
