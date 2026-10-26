// [2026-10-26] 알림톡 발송(서버 전용). 템플릿 ID 가 설정에 없으면 아무것도 안 보내고 "not_configured".
//   카톡 실패·미가입이면 SOLAPI 가 문자로 대신 보낸다(disableSms:false). 기록은 live_alert_logs(있으면)에 남김.
//   주문·입금·돈 데이터 무접촉. 실패해도 호출한 쪽(쪽지 저장)은 그대로 성공.
import { SolapiMessageService } from "solapi";
import { KAKAO_NOTIFY_TEMPLATES, cleanTemplateId, kakaoTargetPhone, kakaoVariables, type KakaoNotifyKind } from "@/lib/kakaoNotify";

type Sb = any;

export type KakaoNotifyResult = { status: "sent" | "not_configured" | "no_phone" | "bad_vars" | "fail"; sent: number; failed: number; message?: string };

export async function readKakaoTemplateIds(sb: Sb): Promise<Record<KakaoNotifyKind, string>> {
  const keys = Object.values(KAKAO_NOTIFY_TEMPLATES).map((t) => t.settingKey);
  const out: Record<KakaoNotifyKind, string> = { unpaid: "", cart: "" };
  try {
    const { data } = await sb.from("settings").select("key,value").in("key", keys);
    for (const row of (data || []) as { key: string; value: unknown }[]) {
      const tpl = Object.values(KAKAO_NOTIFY_TEMPLATES).find((t) => t.settingKey === row.key);
      if (tpl) out[tpl.kind] = cleanTemplateId(row.value);
    }
  } catch { /* 못 읽으면 미설정으로 — 쪽지만 간다 */ }
  return out;
}

export function solapiEnvReady(): boolean {
  return Boolean(process.env.SOLAPI_API_KEY && process.env.SOLAPI_API_SECRET && process.env.SOLAPI_PF_ID && process.env.SOLAPI_SENDER);
}

/** targets: 받는 사람마다 전화·변수 원본. 같은 번호는 한 번만. */
export async function sendKakaoNotify(sb: Sb, kind: KakaoNotifyKind, targets: { phone: unknown; vars: Record<string, unknown> }[], sentBy: string, templateIdOverride?: string): Promise<KakaoNotifyResult> {
  const templateId = templateIdOverride ? cleanTemplateId(templateIdOverride) : (await readKakaoTemplateIds(sb))[kind];
  if (!templateId || !solapiEnvReady()) return { status: "not_configured", sent: 0, failed: 0 };
  const seen = new Set<string>();
  const messages: any[] = [];
  let badVars = 0;
  for (const t of targets) {
    const to = kakaoTargetPhone(t.phone);
    if (!to || seen.has(to)) continue;
    const variables = kakaoVariables(kind, t.vars);
    if (!variables) { badVars++; continue; }
    seen.add(to);
    messages.push({
      to,
      from: process.env.SOLAPI_SENDER,
      kakaoOptions: {
        pfId: process.env.SOLAPI_PF_ID,
        templateId,
        variables,
        disableSms: false, // 카톡 실패·미가입이면 문자로 대신 (버튼은 등록된 템플릿 것을 그대로 씀)
      },
    });
  }
  if (!messages.length) return { status: badVars ? "bad_vars" : "no_phone", sent: 0, failed: 0 };

  let failed = 0;
  let status: KakaoNotifyResult["status"] = "sent";
  let memo = "";
  const raw: unknown[] = [];
  try {
    const svc = new SolapiMessageService(String(process.env.SOLAPI_API_KEY), String(process.env.SOLAPI_API_SECRET));
    const r: any = await svc.send(messages as any);
    raw.push(r);
    failed = Array.isArray(r?.failedMessageList) ? r.failedMessageList.length : 0;
    if (failed >= messages.length) { status = "fail"; memo = String(r?.failedMessageList?.[0]?.statusMessage || "발송 실패").slice(0, 300); }
  } catch (e: any) {
    status = "fail"; failed = messages.length; memo = String(e?.message ?? e).slice(0, 300); raw.push({ error: memo });
  }
  try {
    await sb.from("live_alert_logs").insert({
      broadcast_id: null,
      template_code: templateId,
      target_count: messages.length,
      success_count: messages.length - failed,
      fail_count: failed,
      status: status === "sent" ? (failed ? "partial" : "success") : "fail",
      sent_by: sentBy.slice(0, 80),
      memo: `notify:${kind}${memo ? ` ${memo}` : ""}`,
      raw_result: raw,
    });
  } catch { /* 기록 실패는 무시 */ }
  return { status, sent: messages.length - failed, failed, message: memo || undefined };
}
