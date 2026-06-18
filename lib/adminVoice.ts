// 관리자 알림 음성 — 한국어 여성 음성으로 "주문!", "입금!" 등을 읽어준다.
//   - speechSynthesis 미지원/실패 시 기존 비프음으로 자동 폴백.
//   - 볼륨은 localStorage(ruru_admin_voice_volume, 0~1)에서 읽는다.
//   - 켜짐/꺼짐(ruru_admin_sound_on)은 호출 측에서 확인한 뒤 부른다(테스트 재생은 무시).
//   - 돈/주문/입금 로직과 무관(알림 소리 출력 전용).

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

// 브라우저 음성 잠금 해제용 — 사용자 제스처(클릭/키) 안에서 1회 무음 재생.
//   - 이걸 호출해두면 이후 자동 알림(주문!/입금!) 음성이 정책에 막히지 않는다.
export function primeAdminVoice() {
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
