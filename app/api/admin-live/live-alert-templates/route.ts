// [2026-11-02 사장님 「알림톡 뭐로 쏠지 정해서 보낼 수 있나」] 방송 알림 템플릿 목록 — 불러오기·저장·시험 발송.
//   관리자만(middleware + verifyAdminSession). settings 표 한 키(live_alert_templates_v1)만 쓴다. 주문·입금·돈 무접촉.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SolapiMessageService } from "solapi";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import {
  LIVE_ALERT_TEMPLATES_KEY,
  allLiveAlertTemplates,
  cleanAlertTemplateId,
  defaultLiveAlertTemplateId,
  parseLiveAlertTemplates,
  resolveLiveAlertTemplateId,
} from "@/lib/liveAlertTemplates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) throw new Error("Supabase 관리자 환경변수가 없습니다.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function readConfig(sb: ReturnType<typeof admin>) {
  const { data } = await sb.from("settings").select("value").eq("key", LIVE_ALERT_TEMPLATES_KEY).limit(1);
  return parseLiveAlertTemplates(Array.isArray(data) && data[0] ? data[0].value : null);
}

function view(cfg: ReturnType<typeof parseLiveAlertTemplates>) {
  const envId = process.env.SOLAPI_TEMPLATE_ID;
  return { templates: allLiveAlertTemplates(cfg, envId), defaultId: defaultLiveAlertTemplateId(cfg, envId) };
}

export async function GET(request: NextRequest) {
  const session = await verifyAdminSessionFromRequest(request);
  if (!session) return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...view(await readConfig(admin())) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: String(e?.message ?? e) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await verifyAdminSessionFromRequest(request);
  if (!session) return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, any>;
    const sb = admin();
    if (body.action === "save") {
      const rows = Array.isArray(body.list) ? body.list : [];
      for (const r of rows) {
        if (String(r?.id ?? "").trim() && !cleanAlertTemplateId(r?.id)) {
          return NextResponse.json({ ok: false, message: `「${String(r?.name || r?.id)}」 템플릿 ID 모양이 아니에요(영문·숫자). SOLAPI 템플릿 목록의 「템플릿 ID 복사」로 붙여 넣어 주세요.` }, { status: 400 });
        }
      }
      const envId = String(process.env.SOLAPI_TEMPLATE_ID ?? "").trim();
      const cfg = parseLiveAlertTemplates({ list: rows.filter((r: any) => cleanAlertTemplateId(r?.id) !== envId), defaultId: body.defaultId });
      const value = JSON.stringify(cfg);
      const { data: ex } = await sb.from("settings").select("key").eq("key", LIVE_ALERT_TEMPLATES_KEY).limit(1);
      const res = Array.isArray(ex) && ex.length > 0
        ? await sb.from("settings").update({ value }).eq("key", LIVE_ALERT_TEMPLATES_KEY)
        : await sb.from("settings").insert({ key: LIVE_ALERT_TEMPLATES_KEY, value });
      if (res.error) throw new Error(res.error.message);
      return NextResponse.json({ ok: true, ...view(cfg) });
    }
    if (body.action === "test") {
      const apiKey = process.env.SOLAPI_API_KEY, apiSecret = process.env.SOLAPI_API_SECRET, pfId = process.env.SOLAPI_PF_ID, sender = process.env.SOLAPI_SENDER;
      if (!apiKey || !apiSecret || !pfId || !sender) return NextResponse.json({ ok: false, message: "SOLAPI 연결 정보(환경변수)가 없어요." }, { status: 500 });
      const cfg = await readConfig(sb);
      const templateId = resolveLiveAlertTemplateId(cfg, process.env.SOLAPI_TEMPLATE_ID, body.templateId);
      if (!templateId) return NextResponse.json({ ok: false, message: "저장된 템플릿이 아니에요. 먼저 저장해 주세요." }, { status: 400 });
      const phone = String(body.phone ?? "").replace(/[^0-9]/g, "");
      if (!/^01[016789]\d{7,8}$/.test(phone)) return NextResponse.json({ ok: false, message: "받을 휴대폰 번호(010…)를 넣어 주세요." }, { status: 400 });
      const svc = new SolapiMessageService(apiKey, apiSecret);
      try {
        const r: any = await svc.send([{ to: phone, from: sender, kakaoOptions: { pfId, templateId, variables: {}, disableSms: true } }] as any);
        const failed = Array.isArray(r?.failedMessageList) ? r.failedMessageList : [];
        if (failed.length) {
          const f = failed[0] || {};
          return NextResponse.json({ ok: false, message: `발송 실패: ${String(f.statusMessage || f.reason || f.statusCode || "알 수 없음")}` }, { status: 502 });
        }
      } catch (e: any) {
        return NextResponse.json({ ok: false, message: `발송 실패: ${String(e?.message ?? e).slice(0, 300)}` }, { status: 502 });
      }
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: false, message: "알 수 없는 요청" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: String(e?.message ?? e) }, { status: 500 });
  }
}
