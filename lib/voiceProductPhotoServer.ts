import type {SupabaseClient} from "@supabase/supabase-js";
import {detailProducts,parseProductNote} from "./productDetailModel";
import type {CaptureTarget} from "./voiceAutomation";
type PhotoRow={id:string|number;product_note:string|null;image_url?:string|null;main_image_url?:string|null;detail_image_urls:unknown;[key:string]:unknown};
const strings=(v:unknown):string[]=>Array.isArray(v)?v.filter((s):s is string=>typeof s==="string"&&!!s):[];
/** Append to the actual per-variant gallery, preserving cover and unrelated note fields. */
export function appendVoicePhoto(row:PhotoRow,detail:string,url:string) {
  const images=strings(row.detail_image_urls);
  const variants=detailProducts(row);
  if(detail) {
    const selected=variants.find(d=>d.detailName===detail);
    if(!selected)throw new Error("촬영할 상품 종류를 확인하지 못했어요.");
    const note=parseProductNote(row);
    const sets=note.detail_photo_sets&&typeof note.detail_photo_sets==="object"&&!Array.isArray(note.detail_photo_sets)?note.detail_photo_sets as Record<string,unknown>:{};
    return {note:JSON.stringify({...note,detail_photo_sets:{...sets,[detail]:[...new Set([...selected.images,url])]}}),images};
  }
  if(variants.length)throw new Error("촬영할 상품 종류를 먼저 선택해 주세요.");
  const cover=row.image_url||row.main_image_url||"";
  return {note:row.product_note,images:[...new Set([cover,...images,url].filter(Boolean))]};
}
/** captureAndUpload must extract the buffered frame at the speech timestamp.
 * It is NEVER called when any previous broadcast already saved this product.
 * No browser endpoint exposes this service-role operation. */
export async function captureVoicePhotoOnce(sb:SupabaseClient,target:CaptureTarget,requestId:string,captureAndUpload:()=>Promise<string>) {
  const load=async()=>{
    const {data,error}=await sb.from("products").select("id,product_name,product_note,image_url,main_image_url,detail_image_urls").eq("id",target.productId).maybeSingle();
    if(error||!data)throw new Error("촬영할 상품을 불러오지 못했어요.");
    return data as PhotoRow;
  };
  const initial=await load();
  appendVoicePhoto(initial,target.detailName,"validation-only"); // validate BEFORE capture
  const args={p_product:target.productId,p_detail:target.detailName,p_request:requestId};
  const claim=await sb.rpc("voice_photo_claim",args);
  if(claim.error)throw new Error("촬영 기록 확인 실패: 사진을 찍지 않았어요.");
  if(claim.data==="exists"||claim.data==="busy")return {status:claim.data as "exists"|"busy"};
  if(claim.data!=="capture")throw new Error("촬영 권한을 확인하지 못했어요.");
  try {
    const url=await captureAndUpload();
    const parsed=new URL(url);
    if(parsed.protocol!=="https:"||parsed.username||parsed.password)throw new Error("잘못된 사진 주소입니다.");
    for(let attempt=0;attempt<3;attempt++) {
      const row=await load(),next=appendVoicePhoto(row,target.detailName,url);
      const saved=await sb.rpc("voice_photo_finish",{...args,p_url:url,p_expected_note:row.product_note,p_expected_images:row.detail_image_urls,p_note:next.note,p_images:next.images});
      if(saved.error)throw new Error("착용 사진 저장 결과를 확인하지 못했어요.");
      if(saved.data==="saved")return {status:"saved" as const,url};
      if(saved.data!=="conflict")throw new Error("다른 촬영 요청으로 변경됐어요. 기존 사진은 유지됩니다.");
    }
    throw new Error("상품이 수정 중이라 사진을 연결하지 못했어요.");
  }catch(error){
    // If a commit succeeded but its reply was lost, this cannot reset a saved row.
    await sb.rpc("voice_photo_fail",args);
    throw error;
  }
}
