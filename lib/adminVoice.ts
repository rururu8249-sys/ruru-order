// 관리자 알림 음성 — 한국어 여성 음성으로 "주문!", "입금!" 등을 읽어준다.
//   - speechSynthesis 미지원/실패 시 기존 비프음으로 자동 폴백.
//   - 볼륨은 localStorage(ruru_admin_voice_volume, 0~1)에서 읽는다.
//   - 켜짐/꺼짐(ruru_admin_sound_on)은 호출 측에서 확인한 뒤 부른다(테스트 재생은 무시).
//   - 돈/주문/입금 로직과 무관(알림 소리 출력 전용).

import { shouldPlayAlert, DEPOSIT_KIND_COOLDOWN_MS } from "@/lib/alertDedupe";

export const ADMIN_SOUND_ON_KEY = "ruru_admin_sound_on";
export const ADMIN_VOICE_VOLUME_KEY = "ruru_admin_voice_volume";

function getVolume(): number {
  if (typeof window === "undefined") return 1;
  try {
    const raw = window.localStorage.getItem(ADMIN_VOICE_VOLUME_KEY);
    if (raw == null) return 1;
    const v = Number(raw);
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
  } catch {
    return 1;
  }
}

// 한국어 여성 음성 우선 선택(없으면 첫 한국어 음성 — 대부분 OS 기본이 여성).
function pickKoreanFemaleVoice(synth: SpeechSynthesis): SpeechSynthesisVoice | null {
  const voices = synth.getVoices() || [];
  const ko = voices.filter((v) => (v.lang || "").toLowerCase().startsWith("ko"));
  if (ko.length === 0) return null;
  const femaleHints = [
    "female", "여성", "여자", "yuna", "heami", "sun-hi", "sunhi", "sora",
    "seoyeon", "nara", "jiyoung", "yura", "google", "siwon",
  ];
  const female = ko.find((v) => femaleHints.some((h) => (v.name || "").toLowerCase().includes(h)));
  return female || ko[0];
}

function beepFallback() {
  if (typeof window === "undefined") return;
  try {
    const AC =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = 760;
    gain.gain.setValueAtTime(0.25 * getVolume(), ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.24);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.24);
    osc.onended = () => void ctx.close();
  } catch {
    /* 무시 */
  }
}

// ── [2026-08-31 사장님 요청] 알림 소리 파일 재생 ──
//   TTS는 볼륨 1.0이 상한이라 OS에 따라 작게 들렸다 → mp3 파일을 WebAudio로 재생하고
//   증폭(최대 1.7배)까지 건다. 파일 실패 시 TTS → 비프 순서로 폴백. 돈 로직 무관(소리 전용).
export const ORDER_ALERT_SRC = "/sounds/order-alert.mp3";   // 띵동~ 주문~ (배민 구간 제거 편집본)
// [2026-09-20 사장님 요청] 입금 알림음을 «철컥띵 캐셔»(금전등록기) 효과음으로 교체.
//   원본을 그대로 쓰지 않고 기존 알림음과 «같은 크기»로 맞춰 넣었다(실측, 추정 아님):
//   앞뒤 무음 제거(0.075~1.72s) → 크기 맞춤 → 최종 1.68초 / -13.1 LUFS / 최대 -4.3 dB.
//   기존 order-alert.mp3(-12.1 LUFS / -4.3 dB)와 같은 최대치라 아래 1.7배 증폭에서도 찢어지지 않는다.
//   옛 파일(deposit-ding.mp3)은 되돌릴 때를 위해 남겨 둔다.
export const DEPOSIT_ALERT_SRC = "/sounds/deposit-cashier.mp3";

let sharedAudioCtx: AudioContext | null = null;
const alertBufferCache = new Map<string, AudioBuffer>();

function ensureAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!sharedAudioCtx) {
      const AC =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      sharedAudioCtx = new AC();
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

async function loadAlertBuffer(src: string, ctx: AudioContext): Promise<AudioBuffer | null> {
  const cached = alertBufferCache.get(src);
  if (cached) return cached;
  try {
    const res = await fetch(src, { cache: "force-cache" });
    if (!res.ok) return null;
    const raw = await res.arrayBuffer();
    const buf = await ctx.decodeAudioData(raw);
    alertBufferCache.set(src, buf);
    return buf;
  } catch {
    return null;
  }
}

// 파일 알림 재생 — 성공 true. 실패 시 fallbackText 를 TTS(→비프)로.
async function playAdminAlertFile(src: string, fallbackText: string): Promise<boolean> {
  try {
    const ctx = ensureAudioCtx();
    if (ctx) {
      if (ctx.state === "suspended") await ctx.resume().catch(() => {});
      const buf = await loadAlertBuffer(src, ctx);
      if (buf) {
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        source.buffer = buf;
        source.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.value = Math.min(2, Math.max(0, getVolume() * 1.7)); // 파일 증폭 — TTS보다 확실히 크게
        source.start();
        return true;
      }
    }
  } catch {
    /* 폴백 */
  }
  speakAdmin(fallbackText);
  return false;
}

// [2026-08-31 사장님 제보] 같은 알림이 "동시에 두 번" — 관리자 페이지가 탭/창 2개면
//   각 탭이 따로 울린다 → localStorage 로 탭끼리 공유하는 1회 가드(같은 건은 3초 안에 한 탭만).
// [2026-09-20] 판단 규칙은 lib/alertDedupe.ts 로 빼서 테스트(scripts/test-alert-dedupe.mjs)로 고정했다.
function readLastAt(storageKey: string): number | null {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function markNow(storageKey: string, now: number) {
  try {
    window.localStorage.setItem(storageKey, String(now));
  } catch {
    /* 무시 */
  }
}

/**
 * 울려도 되는지 판단하고, 울릴 거면 기록을 남긴다.
 *   dedupeKey 없음(수동 «들어보기» 버튼) → 언제나 재생.
 *   kindCooldownMs > 0 → 같은 종류가 그 시간 안에 이미 울렸으면 건너뛴다(입금 전용).
 */
function alertOnce(kind: string, dedupeKey: string | undefined, kindCooldownMs: number): boolean {
  if (!dedupeKey) return true;
  if (typeof window === "undefined") return true;
  const now = Date.now();
  const keyStore = `ruru_alert_once_${kind}_${dedupeKey}`;
  const kindStore = `ruru_alert_kind_${kind}`;
  const ok = shouldPlayAlert({
    now,
    lastSameKeyAt: readLastAt(keyStore),
    lastKindAt: kindCooldownMs > 0 ? readLastAt(kindStore) : null,
    kindCooldownMs,
  });
  markNow(keyStore, now); // 막혔어도 그 id 는 «처리됨»으로 남긴다(나중에 다시 울리지 않게)
  if (!ok) return false;
  if (kindCooldownMs > 0) markNow(kindStore, now);
  return true;
}

// 새 주문 알림 — 「띵동~ 주문~」 파일 (실패 시 음성 "주문!"). dedupeKey = 주문 그룹 등 식별자
export function playOrderAlert(dedupeKey?: string) {
  // 주문은 손님마다 따로 울려야 한다(2초 간격 주문도 각각) → 종류 가드 없음(0)
  if (!alertOnce("order", dedupeKey, 0)) return;
  void playAdminAlertFile(ORDER_ALERT_SRC, "주문!");
}

// 입금확인 알림 — 「띵동」 차임(크게) + 음성 "입금!" (차임 실패 시 음성만)
export function playDepositAlert(dedupeKey?: string) {
  // [2026-09-20] ① 파일 뒤에 음성 「입금!」을 덧붙이던 것을 삭제 — 그게 «두 번 연속»의 정체였다.
  //   ② 한 입금이 주문 여러 건을 확인시켜 폴링이 나눠 읽어도 4초 안엔 한 번만 울린다.
  if (!alertOnce("deposit", dedupeKey, DEPOSIT_KIND_COOLDOWN_MS)) return;
  void playAdminAlertFile(DEPOSIT_ALERT_SRC, "입금!"); // 파일이 안 되면 그때만 음성으로 폴백
}

// 브라우저 음성 잠금 해제용 — 사용자 제스처(클릭/키) 안에서 1회 무음 재생.
//   - 이걸 호출해두면 이후 자동 알림(주문!/입금!) 음성이 정책에 막히지 않는다.
//   - [2026-08-31] 오디오 컨텍스트 깨우기 + 알림 파일 미리 받아두기까지 같이 한다.
export function primeAdminVoice() {
  try {
    const ctx = ensureAudioCtx();
    if (ctx) {
      if (ctx.state === "suspended") void ctx.resume().catch(() => {});
      void loadAlertBuffer(ORDER_ALERT_SRC, ctx);
      void loadAlertBuffer(DEPOSIT_ALERT_SRC, ctx);
    }
  } catch {
    /* 무시 */
  }
  if (typeof window === "undefined") return;
  try {
    const synth = window.speechSynthesis;
    if (synth && typeof SpeechSynthesisUtterance !== "undefined") {
      try {
        synth.resume();
      } catch {
        /* 무시 */
      }
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      synth.speak(u);
    }
  } catch {
    /* 무시 */
  }
}

export function speakAdmin(text: string) {
  if (typeof window === "undefined") return;
  try {
    const synth = window.speechSynthesis;
    if (synth && typeof SpeechSynthesisUtterance !== "undefined") {
      synth.cancel(); // 밀린 음성 제거(겹침 방지)
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "ko-KR";
      u.rate = 1.05;
      u.pitch = 1.15; // 살짝 높여 여성 음성 느낌
      u.volume = getVolume();
      const voice = pickKoreanFemaleVoice(synth);
      if (voice) u.voice = voice;
      synth.speak(u);
      return;
    }
  } catch {
    /* TTS 실패 → 비프 폴백 */
  }
  beepFallback();
}
