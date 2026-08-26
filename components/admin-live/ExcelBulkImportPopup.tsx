"use client";

// components/admin-live/ExcelBulkImportPopup.tsx
// [2026-08-20] 엑셀 대량 상품등록 — 형식이 매번 달라도 되게 설계.
//   흐름: 파일 선택 → 자동 인식(헤더·구조·열역할) → 사장님이 드롭다운으로 확인/수정
//        → 미리보기 검수(문제행 빨간 표시) → 일괄설정(배지/배송/진열/카테고리) → [등록]
//   ⚠️ [등록]을 누르기 전에는 아무것도 저장되지 않는다.
//   ⚠️ 상품 등록은 기존 경로(adminCatalogWrite products insert)만 사용.
//      주문·재고차감·입금·정산 로직 무접촉. 이미지 업로드도 기존 API 재사용.
//   형식 인식 로직은 lib/excelBulkParse.ts (시뮬레이션 검수 가능하도록 UI와 분리)

import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { adminCatalogWrite } from "@/lib/adminCatalogWrite";
import { supabase } from "@/lib/supabase";
import { showAdminToast } from "@/lib/adminToast";
import {
  autoGuessConfig, buildDraftCores, auditDraftCores, norm, totalStock,
  detectOfficialForm, parseOfficialForm,
  type AuditReport, type BulkConfig, type DraftCore, type SheetCell,
} from "@/lib/excelBulkParse";

type Props = {
  onClose: () => void;
  onDone?: (productIds: string[]) => void;
  targetBroadcastId?: string | null;
  targetBroadcastTitle?: string;
};

type SheetImage = { row: number; col: number; ext: string; blob: Blob; url: string };
type ParsedSheet = { name: string; rows: SheetCell[][]; images: SheetImage[] };

type DraftProduct = DraftCore & {
  key: string;
  use: boolean;
  imageUrl: string;      // blob URL (미리보기 전용)
  imageBlob: Blob | null;
  detailImageBlobs: Record<string, Blob[]>;
};

const EMPTY_CFG: BulkConfig = {
  headerRow: 0, layout: "row", blockSize: 1,
  colName: 0, colPrice: -1, colColor: -1, colCode: -1, colSize: -1, colQty: -1, sizeCols: [],
};

export default function ExcelBulkImportPopup({ onClose, onDone, targetBroadcastId, targetBroadcastTitle }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState("");
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [cfg, setCfg] = useState<BulkConfig>(EMPTY_CFG);
  const [drafts, setDrafts] = useState<DraftProduct[]>([]);
  const [step, setStep] = useState<"pick" | "map" | "done">("pick");
  const [official, setOfficial] = useState(false); // 루루동이 정규양식 인식됨 — 열 설정 생략
  const [showSizePick, setShowSizePick] = useState(false);
  const [audit, setAudit] = useState<AuditReport | null>(null);

  // 일괄 설정
  const [bulkBadges, setBulkBadges] = useState<string[]>([]);
  const [bulkCategory, setBulkCategory] = useState("");
  const [bulkShipping, setBulkShipping] = useState<"normal" | "vendor">("normal");
  const [bulkPlace, setBulkPlace] = useState<"shop" | "hidden">("shop");
  const [bulkNamePrefix, setBulkNamePrefix] = useState("");
  const [bulkPriceAdd, setBulkPriceAdd] = useState(0);
  const [progress, setProgress] = useState({ done: 0, total: 0, ok: 0, fail: 0 });

  const sheet = sheets[sheetIdx] || null;

  const colOptions = useMemo(() => {
    if (!sheet) return [] as { i: number; label: string }[];
    const width = sheet.rows.reduce((m, r) => Math.max(m, (r || []).length), 0);
    const hs = cfg.headerRow > 0 ? (sheet.rows[cfg.headerRow - 1] || []) : [];
    const out: { i: number; label: string }[] = [];
    for (let i = 0; i < width; i += 1) {
      const h = norm(hs[i]);
      out.push({ i, label: `${colLetter(i)}열${h ? ` (${h})` : ""}` });
    }
    return out;
  }, [sheet, cfg.headerRow]);

  // ── 파일 읽기 (브라우저에서 파싱 — 서버 부하 0) ──
  const onFile = async (f: File) => {
    setBusy("파일 읽는 중…");
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await f.arrayBuffer());
      const out: ParsedSheet[] = [];
      for (const ws of wb.worksheets) {
        const rows: SheetCell[][] = [];
        ws.eachRow({ includeEmpty: true }, (row, rIdx) => {
          const arr: SheetCell[] = [];
          row.eachCell({ includeEmpty: true }, (cell, cIdx) => {
            const v = cell.value as unknown;
            let cellOut: SheetCell = null;
            if (v == null) cellOut = null;
            else if (typeof v === "object") {
              const o = v as Record<string, unknown>;
              if ("result" in o) cellOut = (o.result as SheetCell) ?? null;
              else if ("richText" in o) cellOut = (o.richText as { text: string }[]).map((t) => t.text).join("");
              else if ("text" in o) cellOut = String(o.text ?? "");
              else cellOut = null;
            } else cellOut = v as SheetCell;
            arr[cIdx - 1] = cellOut;
          });
          rows[rIdx - 1] = arr;
        });
        const images: SheetImage[] = [];
        for (const im of ws.getImages() as unknown as Record<string, never>[]) {
          const anyIm = im as unknown as { imageId: string; range?: { tl?: { nativeRow?: number; nativeCol?: number } } };
          const media = ((wb as unknown as { model?: { media?: { index: unknown; buffer?: Uint8Array; extension?: string }[] } }).model?.media || [])
            .find((m) => String(m.index) === String(anyIm.imageId));
          if (!media?.buffer) continue;
          const ext = media.extension || "jpeg";
          const blob = new Blob([media.buffer as BlobPart], { type: `image/${ext === "jpg" ? "jpeg" : ext}` });
          images.push({
            row: Math.round(anyIm.range?.tl?.nativeRow ?? 0) + 1,
            col: Math.round(anyIm.range?.tl?.nativeCol ?? 0) + 1,
            ext, blob, url: URL.createObjectURL(blob),
          });
        }
        out.push({ name: ws.name, rows, images });
      }
      if (out.length === 0) throw new Error("시트를 찾지 못했어요");
      setSheets(out);
      setSheetIdx(0);
      loadSheet(out[0]);
      setStep("map");
    } catch (e) {
      showAdminToast("엑셀을 읽지 못했어요\n\n" + (e instanceof Error ? e.message : String(e)), "error");
    } finally {
      setBusy("");
    }
  };

  // ── 시트 열기: 정규양식이면 열 설정 없이 바로, 아니면 자동인식 ──
  const loadSheet = (s: ParsedSheet) => {
    const officialHeader = detectOfficialForm(s.rows);
    if (officialHeader > 0) {
      setOfficial(true);
      setCfg(EMPTY_CFG);
      setDrafts(makeOfficialDrafts(s, officialHeader));
      return;
    }
    if (officialHeader === -1) {
      showAdminToast("루루동이 정규양식인데 머리글 줄이 지워진 것 같아요.\n\n양식을 다시 내려받아 옮겨 적어주세요.", "error");
    }
    setOfficial(false);
    const guessed = autoGuessConfig(s.rows);
    setCfg(guessed);
    setDrafts(makeDrafts(s, guessed));
  };

  // 정규양식: 추측 없이 그대로 읽고, 사진은 상품 줄 범위로 매칭
  const makeOfficialDrafts = (s: ParsedSheet, headerRow: number): DraftProduct[] => {
    const { drafts: cores, issues } = parseOfficialForm(s.rows, headerRow);
    setAudit({
      productCount: cores.filter((d) => !d.isExample).length,
      numberedCount: 0,
      stockSum: cores.filter((d) => !d.isExample).reduce((a, d) => a + totalStock(d), 0),
      totalColFound: false, totalMatch: 0, totalMismatches: [],
      missed: issues, unreadOtherCount: 0,
    });
    return cores.map((d, i) => {
      const nextRow = cores[i + 1]?.row ?? s.rows.length + 1;
      const productImages = s.images.filter((x) => x.row >= d.row && x.row < nextRow);
      const im = productImages[0] || null;
      const detailImageBlobs: Record<string, Blob[]> = {};
      for (const [detail, detailRows] of Object.entries(d.detailRows || {})) {
        const rowSet = new Set(detailRows);
        const matches = productImages.filter((image) => rowSet.has(image.row));
        if (matches.length > 0) detailImageBlobs[detail] = matches.map((image) => image.blob);
      }
      const warns = im || d.isExample ? d.warns : [...d.warns, "사진 없음"];
      return { ...d, warns, key: `${s.name}-${d.row}`, use: !d.isExample, imageUrl: im?.url || "", imageBlob: im?.blob || null, detailImageBlobs };
    });
  };

  // ── 미리보기 만들기 (코어 결과 + 사진 매칭) ──
  const makeDrafts = (s: ParsedSheet, c: BulkConfig): DraftProduct[] => {
    const cores = buildDraftCores(s.rows, c);
    setAudit(auditDraftCores(s.rows, c, cores));
    const span = c.layout === "block" ? c.blockSize : 1;
    return cores.map((d) => {
      const im =
        s.images.find((x) => x.row === d.row) ||
        s.images.find((x) => x.row >= d.row && x.row < d.row + span) ||
        null;
      const warns = im ? d.warns : [...d.warns, "사진 없음"];
      return { ...d, warns, key: `${s.name}-${d.row}`, use: true, imageUrl: im?.url || "", imageBlob: im?.blob || null, detailImageBlobs: {} };
    });
  };

  const applyCfg = (patch: Partial<BulkConfig>) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    if (sheet) setDrafts(makeDrafts(sheet, next));
  };

  const reRead = () => { if (sheet) setDrafts(makeDrafts(sheet, cfg)); };
  const autoAgain = () => {
    if (!sheet) return;
    const guessed = autoGuessConfig(sheet.rows);
    setCfg(guessed);
    setDrafts(makeDrafts(sheet, guessed));
  };

  const useCount = drafts.filter((d) => d.use).length;

  // ── 실제 등록 ──
  // 안전 순서:
  //   1) 기존 상품명·업체코드 중복 사전 차단
  //   2) 모든 사진 업로드 완료(실패 시 상품은 0개 생성)
  //   3) 모든 상품을 숨김 상태로 한 번의 INSERT로 저장(부분 등록 차단)
  //   4) 저장 직후 중복·가격·개수 재대조
  //   5) 대상 방송 연결 후에만 원래 진열 상태로 공개
  const commit = async () => {
    const targets = drafts.filter((d) => d.use);
    if (targets.length === 0) { showAdminToast("등록할 상품이 없어요"); return; }
    if (targets.some((d) => d.warns.length > 0)) {
      showAdminToast("확인 필요 표시가 있는 상품은 등록할 수 없어요.\n\n문제없는 것만 선택하거나 엑셀을 수정해주세요.", "error");
      return;
    }
    setBusy("중복 확인 중…");
    setProgress({ done: 0, total: targets.length, ok: 0, fail: 0 });
    try {
      const finalNameOf = (d: DraftProduct) => `${bulkNamePrefix.trim() ? bulkNamePrefix.trim() + " " : ""}${d.name}`.trim();
      const targetNames = targets.map(finalNameOf);
      const targetCodes = targets.map((d) => String(d.code || "").trim()).filter(Boolean);
      const repeatedNames = targetNames.filter((name, i) => targetNames.indexOf(name) !== i);
      const repeatedCodes = targetCodes.filter((code, i) => targetCodes.indexOf(code) !== i);
      if (repeatedNames.length > 0 || repeatedCodes.length > 0) {
        throw new Error(`엑셀 내부 중복: ${[...new Set([...repeatedNames, ...repeatedCodes])].join(", ")}`);
      }

      const existingActive = await loadActiveProductIdentities("기존 상품 중복 확인 실패");
      const existingNames = new Set(existingActive.map((row) => String(row.product_name || "").trim()).filter(Boolean));
      const existingCodes = new Set(existingActive.map((row) => productVendorCode(row)).filter(Boolean));
      const nameHits = targetNames.filter((name) => existingNames.has(name));
      const codeHits = targetCodes.filter((code) => existingCodes.has(code));
      if (nameHits.length > 0 || codeHits.length > 0) {
        throw new Error(`이미 등록된 상품: ${[...new Set([...nameHits, ...codeHits])].join(", ")}`);
      }

      if (targetBroadcastId) {
        const { data: broadcast, error: broadcastError } = await supabase
          .from("broadcasts")
          .select("id, public_title, is_deleted")
          .eq("id", targetBroadcastId)
          .maybeSingle();
        if (broadcastError) throw new Error(`대상 방송 확인 실패: ${broadcastError.message}`);
        if (!broadcast || (broadcast as Record<string, unknown>).is_deleted === true) throw new Error("대상 방송을 찾을 수 없어요.");
        const actualTitle = String((broadcast as Record<string, unknown>).public_title || "").trim();
        if (targetBroadcastTitle && actualTitle !== targetBroadcastTitle.trim()) {
          throw new Error(`대상 방송명이 달라졌어요: ${actualTitle || "제목 없음"}`);
        }
      }

      const importBatch = `excel-${new Date().toISOString()}-${Math.random().toString(36).slice(2, 10)}`;
      const prepared: Array<{
        payload: Record<string, unknown>;
        desired: { status: string; is_visible: boolean; in_shop: boolean; mall_sort_order?: number };
        expectedName: string;
        expectedCode: string;
        expectedPrice: number;
      }> = [];
      setBusy("사진 전체 업로드 중…");
      for (let i = 0; i < targets.length; i += 1) {
        const d = targets[i];
        // 사진은 상품 저장 전에 전부 업로드한다. 한 장이라도 실패하면 상품은 만들지 않는다.
        let imageUrl = "";
        const detailPhotoUrls: Record<string, string> = {};
        const detailPhotoSets: Record<string, string[]> = {};
        const detailImageUrls: string[] = [];
        const uploadBlob = async (blob: Blob, fileName: string, kind: "cover" | "detail") => {
          let lastMessage = "사진 업로드 실패";
          for (let attempt = 1; attempt <= 4; attempt += 1) {
            try {
              const fd = new FormData();
              fd.append("file", new File([blob], fileName, { type: blob.type || "image/jpeg" }));
              fd.append("kind", kind);
              const res = await fetch("/api/admin-live/product-images/upload", { method: "POST", body: fd });
              const json = await res.json().catch(() => null);
              const url = String(json?.url || json?.path || "");
              if (res.ok && url) return url;
              lastMessage = String(json?.message || `HTTP ${res.status}`);
            } catch (error) {
              lastMessage = error instanceof Error ? error.message : String(error);
            }
            if (attempt < 4) await new Promise((resolve) => window.setTimeout(resolve, attempt * 700));
          }
          throw new Error(`${fileName}: 사진 업로드 4회 실패 (${lastMessage})`);
        };
        if (d.imageBlob && !d.brandGroup) {
          imageUrl = await uploadBlob(d.imageBlob, `${d.code || d.name}.jpg`, "cover");
        }
        for (const detail of d.details || []) {
          const blobs = d.detailImageBlobs?.[detail] || [];
          if (d.brandGroup && blobs.length === 0) throw new Error(`${detail}: 상세사진 없음`);
          for (let photoIndex = 0; photoIndex < blobs.length; photoIndex += 1) {
            const url = await uploadBlob(blobs[photoIndex], `${detail}-${photoIndex + 1}.jpg`, "detail");
            if (!detailPhotoUrls[detail]) detailPhotoUrls[detail] = url;
            if (!detailPhotoSets[detail]) detailPhotoSets[detail] = [];
            detailPhotoSets[detail].push(url);
            detailImageUrls.push(url);
          }
        }
        // 옵션·재고
        //    줄별 설정(정규양식에 직접 쓴 값)이 있으면 그게 우선, 없으면 화면의 전체 적용 값
        const colors = d.colors.filter(Boolean);
        const sizes = d.sizes.filter(Boolean);
        const details = (d.details || []).filter(Boolean);
        const rowBadges = d.badges && d.badges.length > 0 ? d.badges : bulkBadges;
        const rowShipping = d.shipping ?? bulkShipping;
        const rowPlace = d.place ?? bulkPlace;
        const rowCategory = (d.category || bulkCategory).trim();
        const variants: { color: string; size: string; stock: number }[] = [];
        if (details.length > 0 || official) {
          // 정규양식·세부상품: 엑셀에 쓴 조합 그대로 (키가 이미 "세부 / 색상|사이즈" 규칙)
          // 옵션이 아예 없는 상품(키 "|")은 조합을 만들지 않고 총재고로만 저장 (기존 등록폼과 동일)
          for (const [key, stock] of Object.entries(d.stocks)) {
            if (key === "|") continue;
            const [c1, s1] = key.split("|");
            variants.push({ color: c1 || "", size: s1 || "", stock });
          }
        } else if (colors.length > 0 && sizes.length > 0) {
          for (const c1 of colors) for (const s1 of sizes) variants.push({ color: c1, size: s1, stock: d.stocks[`${c1}|${s1}`] || 0 });
        } else if (sizes.length > 0) {
          for (const s1 of sizes) variants.push({ color: "", size: s1, stock: d.stocks[`|${s1}`] || 0 });
        } else if (colors.length > 0) {
          for (const c1 of colors) variants.push({ color: c1, size: "", stock: d.stocks[`${c1}|`] || 0 });
        }
        const total = variants.length > 0 ? variants.reduce((a, b) => a + b.stock, 0) : totalStock(d);
        const detailActive = details.length > 0;
        const needAxes = detailActive && (colors.length > 0 || sizes.length > 0);
        const note: Record<string, unknown> = {
          stock_management_enabled: d.stockManagementEnabled ?? true,
          stock_variants: variants,
          ...(rowCategory ? { category: rowCategory } : {}),
          ...(d.code ? { vendor_code: d.code } : {}),
          // 세부상품(하위상세) — QuickProductFastForm과 동일한 note 키 구성 (조합형 규칙 재사용)
          ...(detailActive
            ? {
                combo_mode: true,
                option_label: "세부상품",
                option_pricing: Object.fromEntries(details.map((n) => [n, Math.max(0, Math.floor(d.detailPlus?.[n] ?? 0))])),
                combo_hidden: [],
                ...(Object.keys(detailPhotoUrls).length > 0 ? { detail_photos: detailPhotoUrls } : {}),
                ...(Object.keys(detailPhotoSets).length > 0 ? { detail_photo_sets: detailPhotoSets } : {}),
              }
            : {}),
          ...(needAxes
            ? {
                option_axes: [
                  { key: "detail", label: "세부상품", values: details },
                  ...(colors.length > 0 ? [{ key: "color", label: "색상", values: colors }] : []),
                  ...(sizes.length > 0 ? [{ key: "size", label: "사이즈", values: sizes }] : []),
                ],
                combo_detail_values: details,
              }
            : {}),
          ...(d.brandGroup
            ? {
                brand_group: {
                  enabled: true,
                  brand_ko: d.brandKo || d.name,
                  brand_en: d.brandEn || "",
                  detail_categories: d.detailCategories || {},
                  detail_options: d.detailOptions || {},
                },
              }
            : {}),
          import_batch: importBatch,
        };
        const finalName = finalNameOf(d);
        const desired = {
          status: rowPlace === "shop" ? "판매중" : "숨김",
          is_visible: rowPlace === "shop",
          in_shop: rowPlace === "shop",
          ...(rowPlace === "shop" ? { mall_sort_order: 999999 } : {}),
        };
        const payload: Record<string, unknown> = {
          product_name: finalName,
          price: Math.max(0, d.price + bulkPriceAdd),
          stock: total,
          // 검증·방송 연결이 끝날 때까지 고객에게 공개하지 않는다.
          status: "숨김",
          // 방송과 무관한 대량등록 → 상시판매(group_buy). 쇼핑몰 진열은 in_shop으로.
          product_type: d.brandGroup ? "broadcast" : "group_buy",
          badge_types: rowBadges,
          badge_type: rowBadges[0] ?? null,
          shipping_type: rowShipping,
          combine_shipping: rowShipping === "vendor" ? "N" : "Y",
          sort_order: 0,
          is_pinned: false,
          image_url: d.brandGroup ? null : imageUrl || null,
          // 세부상품만 쓰면 기존 조합형과 동일: color_options에 세부상품명 (QuickProductFastForm 1229행 규칙)
          color_options: detailActive && colors.length === 0 ? details : colors,
          size_options: sizes,
          color_option_enabled: detailActive ? true : colors.length > 0,
          size_option_enabled: sizes.length > 0,
          detail_image_urls: detailImageUrls,
          is_visible: false,
          is_soldout: false,
          in_shop: false,
          product_note: JSON.stringify(note),
        };
        prepared.push({
          payload,
          desired,
          expectedName: finalName,
          expectedCode: String(d.code || "").trim(),
          expectedPrice: Math.max(0, d.price + bulkPriceAdd),
        });
        setProgress({ done: i + 1, total: targets.length, ok: 0, fail: 0 });
      }

      setBusy("상품 일괄 저장 중…");
      const insertedRows = await insertProductsSchemaSafe(prepared.map((row) => row.payload));
      const inserted = (Array.isArray(insertedRows) ? insertedRows : []) as Array<Record<string, unknown>>;
      if (inserted.length !== prepared.length) {
        throw new Error(`저장 개수 불일치: 요청 ${prepared.length}개 / 저장 ${inserted.length}개`);
      }
      const insertedIds = inserted.map((row) => String(row.id || "")).filter(Boolean);
      if (insertedIds.length !== prepared.length) throw new Error("저장된 상품 ID를 전부 확인하지 못했어요.");

      // 저장 직후 실제 DB 값과 중복 여부 재확인. 이 단계까지는 전 상품 숨김 상태다.
      const { data: verifyRows, error: verifyError } = await supabase
        .from("products")
        .select("id, product_name, price, product_note, status, is_visible, in_shop")
        .in("id", insertedIds);
      if (verifyError) throw new Error(`저장 결과 확인 실패: ${verifyError.message}`);
      const verified = (verifyRows as Array<Record<string, unknown>>) || [];
      if (verified.length !== prepared.length) throw new Error(`저장 결과 누락: ${prepared.length - verified.length}개`);
      for (const expected of prepared) {
        const found = verified.find((row) => String(row.product_name || "").trim() === expected.expectedName);
        if (!found) throw new Error(`${expected.expectedName}: 저장 결과 없음`);
        if (Number(found.price) !== expected.expectedPrice) throw new Error(`${expected.expectedName}: 가격 저장값 불일치`);
        if (productVendorCode(found) !== expected.expectedCode) throw new Error(`${expected.expectedName}: 업체코드 저장값 불일치`);
        if (String(found.status || "") !== "숨김" || found.is_visible === true || found.in_shop === true) {
          throw new Error(`${expected.expectedName}: 검증 전 공개 상태 오류`);
        }
      }
      const activeAfter = await loadActiveProductIdentities("등록 후 중복 확인 실패");
      for (const expected of prepared) {
        const sameName = activeAfter.filter((row) => String(row.product_name || "").trim() === expected.expectedName).length;
        const sameCode = expected.expectedCode
          ? activeAfter.filter((row) => productVendorCode(row) === expected.expectedCode).length
          : 1;
        if (sameName !== 1 || sameCode !== 1) throw new Error(`${expected.expectedName}: 등록 후 중복 감지`);
      }

      if (targetBroadcastId) {
        setBusy("방송에 상품 연결 중…");
        const { data: lastLinks, error: lastLinkError } = await supabase
          .from("broadcast_products")
          .select("sort_order")
          .eq("broadcast_id", targetBroadcastId)
          .order("sort_order", { ascending: false })
          .limit(1);
        if (lastLinkError) throw new Error(`방송 진열 순서 확인 실패: ${lastLinkError.message}`);
        const startSort = Math.max(-1, Number((lastLinks as Array<Record<string, unknown>>)?.[0]?.sort_order ?? -1)) + 1;
        const links = insertedIds.map((productId, index) => ({
          broadcast_id: targetBroadcastId,
          product_id: productId,
          sort_order: startSort + index,
          is_visible: true,
        }));
        const { error: linkError } = await adminCatalogWrite({ table: "broadcast_products", op: "insert", values: links });
        if (linkError) throw new Error(`방송 상품 연결 실패: ${linkError.message}`);
        const { data: linkedRows, error: linkedError } = await supabase
          .from("broadcast_products")
          .select("product_id")
          .eq("broadcast_id", targetBroadcastId)
          .in("product_id", insertedIds);
        if (linkedError) throw new Error(`방송 연결 확인 실패: ${linkedError.message}`);
        if (((linkedRows as Array<Record<string, unknown>>) || []).length !== insertedIds.length) {
          throw new Error("방송에 연결된 상품 개수가 맞지 않아요.");
        }
      }

      // 모든 검증과 방송 연결이 끝난 뒤 원래 진열 상태로 공개한다.
      const activationGroups = new Map<string, { values: Record<string, unknown>; ids: string[] }>();
      prepared.forEach((row, index) => {
        const key = JSON.stringify(row.desired);
        const group: { values: Record<string, unknown>; ids: string[] } = activationGroups.get(key) || {
          values: row.desired,
          ids: [],
        };
        group.ids.push(insertedIds[index]);
        activationGroups.set(key, group);
      });
      for (const group of activationGroups.values()) {
        const { error: activateError } = await adminCatalogWrite({
          table: "products",
          op: "update",
          values: group.values,
          filters: [{ type: "in", col: "id", val: group.ids }],
        });
        if (activateError) throw new Error(`최종 공개 전환 실패: ${activateError.message}`);
      }

      const { data: finalRows, error: finalError } = await supabase
        .from("products")
        .select("id, status, is_visible, in_shop")
        .in("id", insertedIds);
      if (finalError) throw new Error(`최종 상태 확인 실패: ${finalError.message}`);
      const finalById = new Map(((finalRows as Array<Record<string, unknown>>) || []).map((row) => [String(row.id), row]));
      prepared.forEach((row, index) => {
        const actual = finalById.get(insertedIds[index]);
        if (!actual || String(actual.status || "") !== row.desired.status || actual.is_visible !== row.desired.is_visible || actual.in_shop !== row.desired.in_shop) {
          throw new Error(`${row.expectedName}: 최종 공개 상태 불일치`);
        }
      });

      setProgress({ done: targets.length, total: targets.length, ok: targets.length, fail: 0 });
      setStep("done");
      showAdminToast(
        `안전 등록 완료\n\n상품 ${targets.length}개 · 중복 0개${targetBroadcastTitle ? ` · ${targetBroadcastTitle} 연결 완료` : ""}`,
        "success",
      );
      onDone?.(insertedIds);
    } catch (e) {
      console.error("[엑셀 안전등록 실패]", e);
      setProgress((prev) => ({ ...prev, fail: Math.max(1, prev.total - prev.ok) }));
      showAdminToast(
        "안전 등록 중단\n\n" + (e instanceof Error ? e.message : String(e)) + "\n\n검증이 끝나지 않은 상품은 공개하지 않았습니다.",
        "error",
      );
    } finally {
      setBusy("");
    }
  };

  const body = (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: "1000px", maxWidth: "100%", height: "700px", maxHeight: "calc(100vh - 32px)", background: "#fff", borderRadius: "14px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "13px 18px", borderBottom: "1px solid #EDE4E8" }}>
          <span style={{ fontSize: "16px", fontWeight: 900, color: "#7B2D43" }}>📄 엑셀 대량등록</span>
          <span style={{ fontSize: "11.5px", fontWeight: 700, color: "#A08A92" }}>[등록] 누르기 전엔 저장되지 않습니다</span>
          <button type="button" onClick={onClose} style={{ marginLeft: "auto", border: "none", background: "none", fontSize: "20px", color: "#999", cursor: "pointer" }}>✕</button>
        </div>

        {step === "pick" ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px", padding: "0 32px" }}>
            <div style={{ display: "flex", gap: "12px", width: "100%", maxWidth: "760px" }}>
              <div style={{ flex: 1, textAlign: "center", padding: "16px 12px", borderRadius: "14px", background: "#FBF3F6" }}>
                <div style={{ fontSize: "24px" }}>📥</div>
                <div style={{ fontSize: "13px", fontWeight: 900, color: "#3A2F34", margin: "7px 0 3px" }}>① 정규양식 받기 <span style={{ fontWeight: 700, color: "#A08A92" }}>(선택)</span></div>
                <div style={{ fontSize: "11.5px", fontWeight: 600, color: "#8A7680", lineHeight: 1.6 }}>우리 양식에 채우면<br />100% 그대로 인식돼요</div>
                <a href="/excel-templates/ruru_form_v1.xlsx" download="루루동이_정규양식_v1.xlsx"
                  style={{ display: "inline-flex", alignItems: "center", height: "34px", padding: "0 14px", marginTop: "9px", borderRadius: "10px", border: "1.5px solid #E0C9D2", background: "#fff", color: "#7B2D43", fontSize: "12px", fontWeight: 900, textDecoration: "none" }}>
                  📥 양식 내려받기
                </a>
              </div>
              <div style={{ flex: 1, textAlign: "center", padding: "16px 12px", borderRadius: "14px", background: "#FBF3F6" }}>
                <div style={{ fontSize: "24px" }}>📤</div>
                <div style={{ fontSize: "13px", fontWeight: 900, color: "#3A2F34", margin: "7px 0 3px" }}>② 파일 올리기</div>
                <div style={{ fontSize: "11.5px", fontWeight: 600, color: "#8A7680", lineHeight: 1.6 }}>거래처 엑셀도 그대로 OK<br />형식이 달라도 읽어드려요</div>
                <button type="button" onClick={() => fileRef.current?.click()} disabled={Boolean(busy)}
                  style={{ height: "34px", padding: "0 16px", marginTop: "9px", border: "none", borderRadius: "10px", background: "#7B2D43", color: "#fff", fontSize: "12px", fontWeight: 900, cursor: "pointer" }}>
                  {busy || "파일 선택"}
                </button>
              </div>
              <div style={{ flex: 1, textAlign: "center", padding: "16px 12px", borderRadius: "14px", background: "#FBF3F6" }}>
                <div style={{ fontSize: "24px" }}>✅</div>
                <div style={{ fontSize: "13px", fontWeight: 900, color: "#3A2F34", margin: "7px 0 3px" }}>③ 눈으로 확인 → 등록</div>
                <div style={{ fontSize: "11.5px", fontWeight: 600, color: "#8A7680", lineHeight: 1.6 }}>읽은 결과를 보여드리고<br />[등록] 눌러야만 저장돼요</div>
              </div>
            </div>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "#A08A92", textAlign: "center", lineHeight: 1.7 }}>
              .xlsx · 엑셀 안에 있는 사진(끌어다 놓은 그림)도 대표사진으로 자동 등록됩니다
            </div>
            <input ref={fileRef} type="file" accept=".xlsx,.xlsm" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }} />
          </div>
        ) : null}

        {step === "map" && sheet ? (
          <>
            {official ? (
              <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 18px", borderBottom: "1px solid #EDE4E8", background: "#EAF7EE", fontSize: "12.5px", fontWeight: 800, color: "#1E7A3C" }}>
                ✅ 루루동이 정규양식 인식 — 열 설정 없이 엑셀에 쓴 그대로 읽었어요
                {sheets.length > 1 ? (
                  <select value={sheetIdx} onChange={(e) => { const i = Number(e.target.value); setSheetIdx(i); loadSheet(sheets[i]); }} style={{ ...selStyle, marginLeft: "auto" }}>
                    {sheets.map((sh, i) => <option key={sh.name} value={i}>{sh.name}</option>)}
                  </select>
                ) : null}
              </div>
            ) : null}
            {/* 매핑 바 — 자동인식이 틀렸으면 여기서 바꾼다 (정규양식이면 숨김) */}
            {!official ? (
            <div style={{ padding: "10px 18px", borderBottom: "1px solid #EDE4E8", background: "#FBF8F9", display: "flex", flexWrap: "wrap", gap: "7px", alignItems: "center", fontSize: "12px", fontWeight: 700, color: "#5C4B52" }}>
              <select value={sheetIdx} onChange={(e) => {
                const i = Number(e.target.value); setSheetIdx(i);
                loadSheet(sheets[i]);
              }} style={selStyle}>
                {sheets.map((s, i) => <option key={s.name} value={i}>{s.name} ({s.rows.length}행)</option>)}
              </select>
              <span>제목줄</span>
              <select value={cfg.headerRow} onChange={(e) => applyCfg({ headerRow: Number(e.target.value) })} style={{ ...selStyle, width: "78px" }}>
                <option value={0}>없음</option>
                {Array.from({ length: Math.min(12, sheet.rows.length) }, (_, i) => <option key={i} value={i + 1}>{i + 1}행</option>)}
              </select>
              <span>구조</span>
              <select value={cfg.layout} onChange={(e) => applyCfg({ layout: e.target.value as BulkConfig["layout"] })} style={selStyle}>
                <option value="row">한 줄 = 한 상품</option>
                <option value="block">여러 줄 = 한 상품</option>
                <option value="variant">한 줄 = 한 옵션</option>
              </select>
              {cfg.layout === "block" ? (
                <input type="number" min={2} max={12} value={cfg.blockSize} onChange={(e) => applyCfg({ blockSize: Math.max(2, Number(e.target.value) || 5) })} style={{ ...selStyle, width: "54px" }} />
              ) : null}
              <span>상품명</span>
              <ColSelect value={cfg.colName} options={colOptions} onChange={(v) => applyCfg({ colName: v })} />
              <span>가격</span>
              <ColSelect value={cfg.colPrice} options={colOptions} onChange={(v) => applyCfg({ colPrice: v })} allowNone />
              <span>색상</span>
              <ColSelect value={cfg.colColor} options={colOptions} onChange={(v) => applyCfg({ colColor: v })} allowNone />
              {cfg.layout === "variant" ? (
                <>
                  <span>사이즈</span>
                  <ColSelect value={cfg.colSize} options={colOptions} onChange={(v) => applyCfg({ colSize: v })} allowNone />
                </>
              ) : null}
              <span>수량</span>
              <ColSelect value={cfg.colQty} options={colOptions} onChange={(v) => applyCfg({ colQty: v })} allowNone />
              <button type="button" onClick={() => setShowSizePick((v) => !v)} style={{ ...selStyle, cursor: "pointer", fontWeight: 800, color: cfg.sizeCols.length ? "#7B2D43" : "#A08A92" }}>
                사이즈 칸 {cfg.sizeCols.length}개 {showSizePick ? "▲" : "▼"}
              </button>
              <button type="button" onClick={autoAgain} style={{ ...selStyle, cursor: "pointer", background: "#fff", fontWeight: 800, color: "#7B2D43" }}>자동인식 다시</button>
              <button type="button" onClick={reRead} style={{ ...selStyle, cursor: "pointer", background: "#fff", fontWeight: 800, color: "#7B2D43" }}>다시 읽기</button>
            </div>
            ) : null}

            {!official && showSizePick ? (
              <div style={{ padding: "8px 18px", borderBottom: "1px solid #EDE4E8", background: "#FFFBFC", display: "flex", flexWrap: "wrap", gap: "5px", alignItems: "center" }}>
                <span style={{ fontSize: "11.5px", fontWeight: 800, color: "#7B2D43", marginRight: "4px" }}>사이즈별 수량이 들어있는 칸을 골라주세요</span>
                {colOptions.map((o) => {
                  const on = cfg.sizeCols.includes(o.i);
                  return (
                    <button key={o.i} type="button"
                      onClick={() => applyCfg({ sizeCols: on ? cfg.sizeCols.filter((x) => x !== o.i) : [...cfg.sizeCols, o.i].sort((a, b) => a - b) })}
                      style={{ padding: "4px 9px", borderRadius: "999px", border: `1.5px solid ${on ? "#7B2D43" : "#E8D5DD"}`, background: on ? "#7B2D43" : "#fff", color: on ? "#fff" : "#7B2D43", fontSize: "11px", fontWeight: 800, cursor: "pointer" }}>
                      {o.label}
                    </button>
                  );
                })}
              </div>
            ) : null}

            {/* 일괄 설정 */}
            <div style={{ padding: "9px 18px", borderBottom: "1px solid #EDE4E8", display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center", fontSize: "12px", fontWeight: 700, color: "#5C4B52" }}>
              <span style={{ color: "#7B2D43", fontWeight: 900 }}>전체 적용</span>
              {([["new", "✨NEW"], ["hot", "🔥HOT"], ["limit", "⏰한정"], ["pick", "⭐MD픽"], ["direct", "🛒바로구매"], ["overseas", "✈️해외배송"]] as const).map(([v, l]) => {
                const on = bulkBadges.includes(v);
                return (
                  <button key={v} type="button" onClick={() => setBulkBadges((p) => on ? p.filter((x) => x !== v) : [...p, v])}
                    style={{ padding: "5px 10px", borderRadius: "999px", border: `1.5px solid ${on ? "#7B2D43" : "#E8D5DD"}`, background: on ? "#7B2D43" : "#fff", color: on ? "#fff" : "#7B2D43", fontSize: "11.5px", fontWeight: 800, cursor: "pointer" }}>{l}</button>
                );
              })}
              <select value={bulkShipping} onChange={(e) => setBulkShipping(e.target.value as "normal" | "vendor")} style={selStyle}>
                <option value="normal">일반배송</option>
                <option value="vendor">업체발송</option>
              </select>
              <select value={bulkPlace} onChange={(e) => setBulkPlace(e.target.value as "shop" | "hidden")} style={selStyle}>
                <option value="shop">쇼핑몰 진열</option>
                <option value="hidden">숨김(나중에 진열)</option>
              </select>
              <input value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)} placeholder="카테고리(선택)" style={{ ...selStyle, width: "110px" }} />
              <input value={bulkNamePrefix} onChange={(e) => setBulkNamePrefix(e.target.value)} placeholder="이름 앞에 붙일 말(선택)" style={{ ...selStyle, width: "150px" }} />
              <span>가격 조정</span>
              <input type="number" value={bulkPriceAdd} onChange={(e) => setBulkPriceAdd(Number(e.target.value) || 0)} style={{ ...selStyle, width: "88px" }} />
              <span style={{ color: "#A08A92" }}>원</span>
            </div>

            {/* 미리보기 */}
            <div style={{ flex: 1, overflowY: "auto", padding: "10px 18px" }}>
              {audit ? (
                <div style={{ marginBottom: "8px", padding: "9px 12px", borderRadius: "10px", border: `1.5px solid ${audit.totalMismatches.length || audit.missed.length ? "#E8B3A8" : "#CBE3CE"}`, background: audit.totalMismatches.length || audit.missed.length ? "#FFF6F3" : "#F4FBF5", fontSize: "11.5px", fontWeight: 700, color: "#4A3B41", lineHeight: 1.7 }}>
                  <div style={{ fontWeight: 900, color: audit.totalMismatches.length || audit.missed.length ? "#B03A2E" : "#2E7D46" }}>
                    🔍 원본 엑셀과 자동 대조 {audit.totalMismatches.length || audit.missed.length ? "— 다른 부분이 있어요, 아래만 확인하세요" : "— 다른 부분 없음"}
                  </div>
                  <div>
                    상품 <b>{audit.productCount}</b>개{audit.numberedCount > 0 ? ` (엑셀 번호 ${audit.numberedCount}개${audit.numberedCount !== audit.productCount ? " ⚠ 개수 다름!" : " ✓"})` : ""} · 재고 총합 <b>{audit.stockSum}</b>개
                    {audit.totalColFound ? ` · 엑셀 합계열 대조: 일치 ${audit.totalMatch}개${audit.totalMismatches.length ? ` / 불일치 ${audit.totalMismatches.length}개` : " ✓"}` : ""}
                    {sheet ? ` · 사진 ${sheet.images.length}장 중 ${drafts.filter((d) => d.imageUrl).length}개 상품에 매칭` : ""}
                  </div>
                  {audit.totalMismatches.map((m) => (
                    <div key={`tm-${m.row}`} style={{ color: "#B03A2E" }}>⚠ {m.row}행 「{m.name}」 엑셀 합계 {m.excel}개 ≠ 읽은 재고 {m.parsed}개</div>
                  ))}
                  {audit.missed.map((m, i) => (
                    <div key={`ms-${i}`} style={{ color: "#B03A2E" }}>⚠ {m.where}에 안 읽힌 숫자 {m.value} — {m.note}. 그 칸을 엑셀에서 확인하거나, 위 「사이즈 칸」에서 이 열을 추가하세요</div>
                  ))}
                  {audit.unreadOtherCount > 0 ? (
                    <div style={{ color: "#8A7480" }}>ℹ 그 외 안 읽힌 숫자 {audit.unreadOtherCount}칸 (원가·날짜·품번 등일 수 있음 — 재고와 무관하면 무시)</div>
                  ) : null}
                </div>
              ) : null}
              <div style={{ fontSize: "12px", fontWeight: 800, color: "#5C4B52", marginBottom: "8px" }}>
                미리보기 {drafts.length}개 · 등록 대상 <b style={{ color: "#7B2D43" }}>{useCount}</b>개
                {drafts.some((d) => d.warns.length > 0) ? <span style={{ marginLeft: "8px", color: "#C0392B" }}>⚠ 확인 필요 {drafts.filter((d) => d.warns.length > 0).length}개</span> : null}
              </div>
              {drafts.length === 0 ? (
                <div style={{ padding: "40px 0", textAlign: "center", fontSize: "13px", fontWeight: 700, color: "#A08A92", lineHeight: 1.8 }}>
                  읽어낸 상품이 없어요.<br />위에서 <b style={{ color: "#7B2D43" }}>제목줄 · 구조 · 상품명 칸</b>을 바꿔보세요.
                </div>
              ) : null}
              {drafts.map((d, i) => (
                <div key={d.key} style={{ display: "flex", gap: "10px", alignItems: "flex-start", padding: "8px", borderRadius: "10px", border: `1px solid ${d.warns.length ? "#F0C9C2" : "#EDE4E8"}`, background: d.warns.length ? "#FFF8F6" : "#fff", marginBottom: "6px", opacity: d.use ? 1 : 0.45 }}>
                  <input type="checkbox" checked={d.use} onChange={(e) => setDrafts((p) => p.map((x, k) => k === i ? { ...x, use: e.target.checked } : x))} style={{ marginTop: "4px", width: "16px", height: "16px" }} />
                  <div style={{ width: "54px", height: "54px", borderRadius: "8px", background: "#F0EBE8", flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", color: "#B0A5A0" }}>
                    {d.imageUrl ? <img src={d.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "사진없음"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                      <input value={d.name} onChange={(e) => setDrafts((p) => p.map((x, k) => k === i ? { ...x, name: e.target.value } : x))}
                        style={{ flex: 1, minWidth: 0, height: "30px", borderRadius: "7px", border: "1px solid #E8D5DD", padding: "0 8px", fontSize: "12.5px", fontWeight: 800, color: "#3A2F34" }} />
                      <input type="number" value={d.price} onChange={(e) => setDrafts((p) => p.map((x, k) => k === i ? { ...x, price: Number(e.target.value) || 0 } : x))}
                        style={{ width: "96px", height: "30px", borderRadius: "7px", border: "1px solid #E8D5DD", padding: "0 8px", fontSize: "12.5px", fontWeight: 800, textAlign: "right", color: "#7B2D43" }} />
                      <span style={{ fontSize: "11px", color: "#A08A92" }}>원</span>
                    </div>
                    <div style={{ marginTop: "4px", fontSize: "11.5px", fontWeight: 700, color: "#68575E" }}>
                      {d.details && d.details.length > 0 ? `세부 ${d.details.map((n) => (d.detailPlus?.[n] ? `${n}(+${d.detailPlus[n].toLocaleString()}원)` : n)).join("·")} · ` : ""}
                      {d.colors.length > 0 ? `색상 ${d.colors.join("·")} · ` : ""}사이즈 {d.sizes.join("·") || "없음"} · 총 {totalStock(d)}개
                      {d.code ? <span style={{ color: "#B0A5A0" }}> · {d.code}</span> : null}
                    </div>
                    {d.badges || d.category || d.shipping || d.place ? (
                      <div style={{ marginTop: "3px", fontSize: "10.5px", fontWeight: 800, color: "#7B2D43" }}>
                        {(d.badges || []).map((b) => BADGE_LABEL[b] || b).join(" ")}
                        {d.category ? ` · ${d.category}` : ""}
                        {d.shipping ? ` · ${d.shipping === "vendor" ? "업체발송" : "일반배송"}` : ""}
                        {d.place ? ` · ${d.place === "hidden" ? "숨김" : "진열"}` : ""}
                        <span style={{ color: "#B0A5A0", fontWeight: 700 }}> (엑셀에 쓴 값 — 전체 적용보다 우선)</span>
                      </div>
                    ) : null}
                    {d.warns.length ? <div style={{ marginTop: "3px", fontSize: "11px", fontWeight: 800, color: "#C0392B" }}>⚠ {d.warns.join(" · ")}</div> : null}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ padding: "12px 18px", borderTop: "1px solid #EDE4E8", display: "flex", gap: "10px", alignItems: "center" }}>
              <button type="button" onClick={() => setDrafts((p) => p.map((x) => ({ ...x, use: true })))} style={{ ...selStyle, cursor: "pointer" }}>전체 선택</button>
              <button type="button" onClick={() => setDrafts((p) => p.map((x) => ({ ...x, use: x.warns.length === 0 })))} style={{ ...selStyle, cursor: "pointer" }}>문제없는 것만</button>
              {targetBroadcastTitle ? (
                <span style={{ fontSize: "11.5px", fontWeight: 900, color: "#1E7A3C" }}>📺 등록 후 {targetBroadcastTitle}에 자동 연결</span>
              ) : null}
              <span style={{ marginLeft: "auto", fontSize: "12px", fontWeight: 700, color: "#68575E" }}>
                {busy ? `${progress.done}/${progress.total} 등록 중…` : ""}
              </span>
              <button type="button" onClick={() => void commit()} disabled={Boolean(busy) || useCount === 0}
                style={{ height: "44px", padding: "0 22px", border: "none", borderRadius: "12px", background: useCount ? "#7B2D43" : "#CFC5C9", color: "#fff", fontSize: "14.5px", fontWeight: 900, cursor: useCount ? "pointer" : "default" }}>
                {busy ? "등록 중…" : `${useCount}개 등록하기`}
              </button>
            </div>
          </>
        ) : null}

        {step === "done" ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px" }}>
            <div style={{ fontSize: "40px" }}>{progress.fail ? "⚠️" : "✅"}</div>
            <div style={{ fontSize: "17px", fontWeight: 900, color: "#7B2D43" }}>등록 완료</div>
            <div style={{ fontSize: "13.5px", fontWeight: 700, color: "#5C4B52" }}>성공 {progress.ok}개 · 실패 {progress.fail}개</div>
            <button type="button" onClick={onClose} style={{ marginTop: "8px", height: "44px", padding: "0 26px", border: "none", borderRadius: "12px", background: "#7B2D43", color: "#fff", fontSize: "14.5px", fontWeight: 900, cursor: "pointer" }}>닫기</button>
          </div>
        ) : null}
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(body, document.body);
}

// products 스키마에 없는 컬럼이 있으면 그 컬럼만 빼고 재시도 (QuickProductFastForm과 동일 패턴)
function getMissingColumn(errorMessage: string) {
  const patterns = [
    /Could not find the '([^']+)' column/i,
    /column "([^"]+)" does not exist/i,
    /Could not find column '([^']+)'/i,
  ];
  for (const pattern of patterns) {
    const match = errorMessage.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function productVendorCode(row: Record<string, unknown>) {
  const raw = row.product_note;
  if (!raw) return "";
  try {
    const note = typeof raw === "string" ? JSON.parse(raw) : raw;
    return String((note as Record<string, unknown>)?.vendor_code || "").trim();
  } catch {
    return "";
  }
}

async function loadActiveProductIdentities(errorPrefix: string) {
  const pageSize = 1000;
  const rows: Array<Record<string, unknown>> = [];
  for (let page = 0; page < 100; page += 1) {
    const from = page * pageSize;
    const { data, error } = await supabase
      .from("products")
      .select("id, product_name, product_note, status")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`${errorPrefix}: ${error.message}`);
    const batch = (data as Array<Record<string, unknown>>) || [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    if (page === 99) throw new Error(`${errorPrefix}: 상품 수가 안전 확인 한도를 초과했어요.`);
  }
  return rows.filter((row) => String(row.status || "") !== "deleted");
}

async function insertProductsSchemaSafe(payloads: Record<string, unknown>[]) {
  if (payloads.length === 0) return [];
  const requiredColumns = new Set(["product_name"]);
  const workingPayloads = payloads.map((payload) => ({ ...payload }));
  for (let attempt = 0; attempt < 12; attempt += 1) {
    // 배열 INSERT 한 번으로 보내므로 DB 문장 단위로 전부 성공하거나 전부 실패한다.
    const { data, error } = await adminCatalogWrite({
      table: "products",
      op: "insert",
      values: workingPayloads,
      select: "id, product_name, price, product_note",
    });
    if (!error) return data;
    const missingColumn = getMissingColumn(error.message || "");
    if (!missingColumn || !workingPayloads.some((payload) => missingColumn in payload)) throw new Error(error.message);
    if (requiredColumns.has(missingColumn)) {
      throw new Error(`products.${missingColumn} 컬럼이 없어 저장할 수 없습니다.`);
    }
    workingPayloads.forEach((payload) => { delete payload[missingColumn]; });
  }
  throw new Error("products 저장 재시도 횟수를 초과했습니다.");
}

function ColSelect({ value, options, onChange, allowNone }: { value: number; options: { i: number; label: string }[]; onChange: (v: number) => void; allowNone?: boolean }) {
  return (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ ...selStyle, maxWidth: "150px" }}>
      {allowNone ? <option value={-1}>없음</option> : null}
      {options.map((o) => <option key={o.i} value={o.i}>{o.label}</option>)}
    </select>
  );
}

function colLetter(i: number) {
  let n = i, s = "";
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
}

const BADGE_LABEL: Record<string, string> = {
  new: "✨NEW", hot: "🔥HOT", limit: "⏰한정", pick: "⭐MD픽", direct: "🛒바로구매", overseas: "✈️해외배송",
};

const selStyle: React.CSSProperties = {
  height: "30px", borderRadius: "7px", border: "1px solid #E8D5DD", background: "#fff",
  padding: "0 8px", fontSize: "11.5px", fontWeight: 700, color: "#5C4B52",
};
