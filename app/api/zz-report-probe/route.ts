// 임시 읽기 전용 시뮬레이션 주소 — 텔레그램 결산 글을 «보내지 않고» 만들어 보기만. 끝나면 삭제
import { NextRequest, NextResponse } from "next/server";
import { computeLiveSummary } from "@/lib/liveSummary";
import { formatReport } from "@/lib/telegramReport";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("k") !== "rr-rep-7w2m") return NextResponse.json({ why: "key" });
  try {
    const bid = request.nextUrl.searchParams.get("b") || undefined;
    const s = await computeLiveSummary("broadcast", { broadcastId: bid });
    const text = formatReport(s);
    return new NextResponse(text.replace(/<\/?b>/g, "") + `\n\n[len ${text.length}] paid=${s.paidSum} cost=${s.productCostSum} costed=${s.costedQty} missing=${s.costMissingQty} fee=${s.cardFeeSum} point=${s.pointUsedSum}`, { headers: { "content-type": "text/plain; charset=utf-8" } });
  } catch (e) { return NextResponse.json({ fatal: String(e) }); }
}
