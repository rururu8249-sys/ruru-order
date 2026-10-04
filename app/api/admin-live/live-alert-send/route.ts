import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { SolapiMessageService } from "solapi";
import { selectAlertRecipients, sealAlertSelection, readAlertSelection, ALERT_SELECTION_POLICY } from "@/lib/liveAlertSelection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL 없음");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY 없음");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function normalizePhone(v: unknown): string {
  return String(v ?? "").replace(/[^0-9]/g, "");
}

function maskPhone(p: string): string {
  return p.length >= 8 ? `${p.slice(0, 3)}****${p.slice(-4)}` : p;
}

// 발송 대상 모드:
//   - "optin": 방송알림 신청(live_alert_optin=true) 회원만  (안전, 기본값)
//   - "all"  : 전체 회원 (신청 안 한 사람 포함) — 동의 미확인자에게 발송 = 카카오 채널 제재 위험
// 어느 모드든 "이 방송에서 이미 받은 사람"은 자동 제외(증분 발송). 재발송해도 중복 안 감.
type SendMode = "optin" | "all" | "priority";

export async function POST(request: NextRequest) {
  try {
    const session = await verifyAdminSessionFromRequest(request);
    if (!session) return NextResponse.json({ ok: false, error: "권한 없음" }, { status: 401 });

    const apiKey = process.env.SOLAPI_API_KEY;
    const apiSecret = process.env.SOLAPI_API_SECRET;
    const pfId = process.env.SOLAPI_PF_ID;
    const templateId = process.env.SOLAPI_TEMPLATE_ID;
    const sender = process.env.SOLAPI_SENDER;
    if (!apiKey || !apiSecret || !pfId || !templateId || !sender) {
      return NextResponse.json({ ok: false, error: "SOLAPI 환경변수 누락(KEY/SECRET/PF_ID/TEMPLATE_ID/SENDER)" }, { status: 500 });
    }

    const body = await request.json().catch(() => ({} as any));
    const broadcastId = String(body?.broadcastId ?? "").trim();
    const dryRun = body?.dryRun === true;
    const mode: SendMode = body?.mode === "priority" ? "priority" : body?.mode === "all" ? "all" : "optin";
    const actor = String((session as any)?.sub ?? (session as any)?.name ?? "admin");
    if (!broadcastId) return NextResponse.json({ok:false,error:"현재 방송을 선택해 주세요."},{status:400});

    const supabase = getSupabaseAdmin();
    const {data:broadcast,error:broadcastError}=await supabase.from("broadcasts").select("id,status").eq("id",broadcastId).maybeSingle();
    if(broadcastError||!broadcast||String(broadcast.status).toUpperCase()!=="ON")return NextResponse.json({ok:false,error:"진행 중인 방송을 확인할 수 없습니다. 발송하지 않았습니다."},{status:409});

    // 이 방송에서 이미 받은 사람(성공 기록) — 증분 발송을 위해 제외 목록으로 사용
    const received = new Set<string>();
    if (broadcastId) {
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from("live_alert_recipients")
          .select("customer_phone")
          .eq("broadcast_id", broadcastId)
          .order("id")
          .range(from, from + 999);
        if (error) return NextResponse.json({ok:false,error:"중복 발송 기록을 확인하지 못했습니다. 발송하지 않았습니다."},{status:503});
        if (!data || data.length === 0) break;
        for (const r of data) {
          const p = normalizePhone((r as any).customer_phone);
          if (p) received.add(p);
        }
        if (data.length < 1000) break;
      }
    }

    // 후보 회원(모드별) — 전화번호 + 이름(미리보기용)
    const candidates = new Map<string, string>(); // phone -> name
    const customerRows: any[] = [];
    for (let from = 0; ; from += 1000) {
      const q = supabase.from("customers").select("id,customer_phone,customer_name,live_alert_optin,live_alert_optin_at").order("id").range(from, from + 999);
      const { data, error } = await q;
      if (error) return NextResponse.json({ ok: false, error: `고객 조회 실패: ${error.message}` }, { status: 500 });
      if (!data || data.length === 0) break;
      customerRows.push(...data);
      for (const row of data) {
        const p = normalizePhone((row as any).customer_phone);
        if (/^01[016789]\d{7,8}$/.test(p) && (mode === "all" || row.live_alert_optin === true) && !candidates.has(p)) candidates.set(p, String((row as any).customer_name ?? ""));
      }
      if (data.length < 1000) break;
    }

    // 대상 = 후보 − 이미 받은 사람
    // Explicit OFF wins if old duplicate customer records disagree.
    if(mode!=="all")for(const c of customerRows)if(c.live_alert_optin===false)candidates.delete(normalizePhone(c.customer_phone));
    let targets = Array.from(candidates.keys()).filter((p) => !received.has(p));
    let selected: ReturnType<typeof selectAlertRecipients> = [];
    if(mode==="priority"&&dryRun){
      const limit=Number(body.limit),orderDays=Number(body.orderDays),recentDays=Number(body.recentDays);
      if(!Number.isInteger(limit)||limit<1||limit>10000||[orderDays,recentDays].some(n=>!Number.isInteger(n)||n<1||n>365))return NextResponse.json({ok:false,error:"발송 인원 1~10,000명, 기간 1~365일을 입력해 주세요."},{status:400});
      const orders:any[]=[];
      for(let from=0;;from+=1000){
        const {data,error}=await supabase.from("orders").select("id,customer_phone,phone,created_at,order_status,admin_order_status_v2,is_deleted,is_permanently_deleted,is_test_order").gte("created_at",new Date(Date.now()-orderDays*86400000).toISOString()).order("id").range(from,from+999);
        if(error)return NextResponse.json({ok:false,error:"주문 이력 조회 실패. 발송하지 않았습니다."},{status:503});
        orders.push(...(data||[]));if(!data||data.length<1000)break;
      }
      selected=selectAlertRecipients(customerRows,orders,received,{limit,orderDays,recentDays,now:Date.now()});
      targets=selected.map(p=>p.phone);
    }
    if(!dryRun){
      let manifest;
      try{manifest=readAlertSelection(String(body.selectionToken||""),apiSecret,broadcastId,actor,Date.now());if(manifest.mode!==mode)throw new Error("발송 설정이 변경되었습니다. 명단을 다시 확인해 주세요.");}
      catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:"명단 확인 실패"},{status:409});}
      if(mode==="priority"&&manifest.policy!==ALERT_SELECTION_POLICY)return NextResponse.json({ok:false,error:"선정 기준이 변경되었습니다. 대상 선정 / 다시 뽑기를 눌러 명단을 확인해 주세요. 발송하지 않았습니다."},{status:409});
      const eligible=new Set(targets);
      // Never replace removed recipients with newly selected people behind the operator's back.
      if(manifest.phones.some(p=>!eligible.has(p)))return NextResponse.json({ok:false,error:"동의 또는 발송 이력이 변경되었습니다. 명단을 다시 확인해 주세요."},{status:409});
      targets=manifest.phones;
    }
    const targetCount = targets.length;
    const candidateCount = candidates.size;
    const receivedCount = received.size;

    if (dryRun) {
      if(targets.length>10000)return NextResponse.json({ok:false,error:"대상이 10,000명을 초과합니다. 인원 제한 모드를 사용해 주세요."},{status:400});
      const details=new Map(selected.map(s=>[s.phone,s]));
      const sample = targets.slice(0, mode==="priority"?10000:100).map((p) => {
        const detail=details.get(p);
        return {name:candidates.get(p)||"",phone:maskPhone(p),...(detail?{orderDays:detail.orderDays,recent:detail.recent}:{})};
      });
      const selectionToken=sealAlertSelection({broadcastId,actor,mode,policy:ALERT_SELECTION_POLICY,phones:targets,expires:Date.now()+15*60000},apiSecret);
      const selectionGroups=mode==="priority"?{
        frequent:selected.filter(p=>p.orderDays>=2).length,
        newBuyer:selected.filter(p=>p.orderDays===1).length,
        noRecentOrders:selected.filter(p=>p.orderDays===0).length,
        noRecentOrdersMax:Math.floor(Number(body.limit)/20),
      }:undefined;
      return NextResponse.json({ ok: true, dryRun: true, mode, candidateCount, receivedCount, targetCount, sample, selectionToken, selectionGroups });
    }

    if (targetCount === 0) {
      return NextResponse.json({
        ok: true,
        mode,
        targetCount: 0,
        successCount: 0,
        failCount: 0,
        message: receivedCount > 0 ? "이 방송은 대상 전원이 이미 받았습니다." : "발송 대상이 없습니다.",
      });
    }

    // Unique broadcast/phone rows reserve delivery before contacting SOLAPI.
    // Retries and concurrent clicks cannot submit the same recipient twice.
    const claimedPhones:string[]=[];
    for(let i=0;i<targets.length;i+=500){
      const {data:claimed,error:claimError}=await supabase.from("live_alert_recipients").upsert(targets.slice(i,i+500).map(p=>({broadcast_id:broadcastId,customer_phone:p,status:"pending"})),{onConflict:"broadcast_id,customer_phone",ignoreDuplicates:true}).select("customer_phone");
      if(claimError)return NextResponse.json({ok:false,error:"발송 예약 기록에 실패했습니다. 발송하지 않았습니다. 일부 예약은 중복 방지를 위해 유지됩니다."},{status:503});
      claimedPhones.push(...(claimed||[]).map(r=>normalizePhone(r.customer_phone)));
    }
    if(!claimedPhones.length)return NextResponse.json({ok:false,error:"이미 발송 처리 중인 명단입니다. 중복 발송하지 않았습니다."},{status:409});

    const messageService = new SolapiMessageService(apiKey, apiSecret);
    const messages = claimedPhones.map((to) => ({
      to,
      from: sender,
      kakaoOptions: { pfId, templateId, variables: {}, disableSms: true },
    }));

    const failedPhones = new Set<string>();
    let status = "success";
    let memo = "";
    const rawResults: any[] = [];
    try {
      for (let i = 0; i < messages.length; i += 10000) {
        const part = messages.slice(i, i + 10000);
        const r: any = await messageService.send(part as any);
        rawResults.push(r);
        const fl = Array.isArray(r?.failedMessageList) ? r.failedMessageList : [];
        for (const f of fl) {
          const fp = normalizePhone((f as any)?.to);
          if (fp) failedPhones.add(fp);
        }
      }
    } catch (e: any) {
      status = "fail";
      memo = String(e?.message ?? e).slice(0, 500);
      for (const p of claimedPhones) failedPhones.add(p);
      rawResults.push({ error: memo });
    }

    const successPhones = claimedPhones.filter((p) => !failedPhones.has(p));
    const successCount = successPhones.length;
    const failCount = claimedPhones.length - successCount;
    if (status !== "fail") status = failCount === 0 ? "success" : successCount === 0 ? "fail" : "partial";

    // 성공한 수신자 기록(증분 발송 근거). 중복은 무시(유니크 인덱스 + ignoreDuplicates). broadcastId 있을 때만.
    if (broadcastId && successPhones.length > 0) {
      for (let i = 0; i < successPhones.length; i += 1000) {
        const rows = successPhones.slice(i, i + 1000).map((p) => ({
          broadcast_id: broadcastId,
          customer_phone: p,
          status: "success",
        }));
        const { error: recErr } = await supabase
          .from("live_alert_recipients")
          .upsert(rows, { onConflict: "broadcast_id,customer_phone" });
        if (recErr) console.warn("[live-alert] 수신자 기록 실패(예약 유지):", recErr.message);
      }
    }

    // 발송 요약 로그(기존 유지)
    const sentBy = String((session as any)?.name ?? (session as any)?.sub ?? (session as any)?.id ?? "admin");
    await supabase.from("live_alert_logs").insert({
      broadcast_id: broadcastId || null,
      template_code: templateId,
      target_count: targetCount,
      success_count: successCount,
      fail_count: failCount,
      status,
      sent_by: sentBy,
      memo: memo || `mode=${mode}`,
      raw_result: rawResults,
    });

    return NextResponse.json({ ok: status !== "fail", mode, targetCount:claimedPhones.length, successCount, failCount, status, error: status==="fail" ? "접수 여부를 확정하지 못했습니다. 중복 방지를 위해 예약을 유지합니다. SOLAPI 내역 확인 후 처리해 주세요." : undefined });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
