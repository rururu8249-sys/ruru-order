// [2026-11-02 사장님 「알림톡 뭐로 쏠지 정해서 보낼 수 있나」] 방송 알림 템플릿 여러 개 — 순수 함수.
//   저장: settings `live_alert_templates_v1` = {"list":[{id,name}],"defaultId":"…"}
//   Vercel 환경변수 SOLAPI_TEMPLATE_ID(처음 설정한 템플릿)는 목록 맨 앞 「방송시작 알림 (기존)」으로 늘 들어간다.
//   발송 때 고른 ID 는 «목록에 있는 것만» 통과(아무 ID 나 보내지 못하게). 발송 명단·중복 방지 규칙과 무관.

export const LIVE_ALERT_TEMPLATES_KEY = "live_alert_templates_v1";
export const ENV_TEMPLATE_NAME = "방송시작 알림 (기존)";

export type LiveAlertTemplate = { id: string; name: string; fromEnv?: boolean };
export type LiveAlertTemplateConfig = { list: LiveAlertTemplate[]; defaultId: string };

export function cleanAlertTemplateId(v: unknown): string {
  const s = String(v ?? "").trim();
  return /^[A-Za-z0-9_-]{6,80}$/.test(s) ? s : "";
}

/** 저장값(문자열/객체) → 사장님이 넣은 목록(환경변수 템플릿 제외). 망가진 줄은 버림. */
export function parseLiveAlertTemplates(raw: unknown): LiveAlertTemplateConfig {
  let obj: any = raw;
  if (typeof raw === "string") {
    try { obj = JSON.parse(raw); } catch { obj = null; }
  }
  const list: LiveAlertTemplate[] = [];
  const seen = new Set<string>();
  for (const row of Array.isArray(obj?.list) ? obj.list : []) {
    const id = cleanAlertTemplateId(row?.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    list.push({ id, name: String(row?.name ?? "").trim().slice(0, 40) || id });
  }
  const defaultId = cleanAlertTemplateId(obj?.defaultId);
  return { list, defaultId };
}

/** 화면에 보일 전체 목록 = 환경변수 템플릿(있으면 맨 앞) + 저장 목록. */
export function allLiveAlertTemplates(cfg: LiveAlertTemplateConfig, envId: string | undefined | null): LiveAlertTemplate[] {
  const env = String(envId ?? "").trim(); // Vercel 값은 그대로 믿음(예전에도 그 값으로 보냈음)
  const out: LiveAlertTemplate[] = env ? [{ id: env, name: ENV_TEMPLATE_NAME, fromEnv: true }] : [];
  for (const t of cfg.list) if (t.id !== env) out.push(t);
  return out;
}

/** 기본으로 고를 템플릿 = 저장한 기본값(목록에 있을 때) → 환경변수 → 목록 첫 번째. */
export function defaultLiveAlertTemplateId(cfg: LiveAlertTemplateConfig, envId: string | undefined | null): string {
  const all = allLiveAlertTemplates(cfg, envId);
  if (cfg.defaultId && all.some((t) => t.id === cfg.defaultId)) return cfg.defaultId;
  return all[0]?.id || "";
}

/** 발송에 쓸 ID. 요청한 ID 가 목록에 없으면 null(보내지 않음), 요청이 비면 기본값. */
export function resolveLiveAlertTemplateId(cfg: LiveAlertTemplateConfig, envId: string | undefined | null, requested: unknown): string | null {
  const all = allLiveAlertTemplates(cfg, envId);
  const req = String(requested ?? "").trim();
  if (req) return all.some((t) => t.id === req) ? req : null;
  return defaultLiveAlertTemplateId(cfg, envId) || null;
}

export function liveAlertTemplateName(cfg: LiveAlertTemplateConfig, envId: string | undefined | null, id: string): string {
  return allLiveAlertTemplates(cfg, envId).find((t) => t.id === id)?.name || id;
}
