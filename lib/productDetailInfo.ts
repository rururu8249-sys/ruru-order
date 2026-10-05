import { parseProductNote, type ProductLike } from './productDetailModel';
import type { DetailInfo } from './productBrandLinks';
export type { DetailInfo } from './productBrandLinks';

export function normalizeDetailChips(values: string[]): string[] {
  return [...new Set(values.map(value => [...value.trim()].slice(0,10).join('')).filter(Boolean))].slice(0,6);
}

/** Empty custom information is intentional, not an instruction to inherit. */
export function resolveDetailInfo(parent: ProductLike, info?: DetailInfo): {chips:string[];description:string} {
  if (info?.mode === 'hidden') return {chips:[],description:''};
  if (info?.mode === 'custom') return {chips:normalizeDetailChips(info.chips),description:info.description};
  const note = parseProductNote(parent);
  const chips = Array.isArray(note.spec_chips) ? note.spec_chips.filter((value):value is string => typeof value==='string') : [];
  return {chips:normalizeDetailChips(chips),description:String(parent.product_description || parent.detail_description || parent.description || '')};
}

/** Exact detail key only; changing selection cannot retain the previous detail's text. */
export function selectedDetailInfo(parent: ProductLike, detailName: string): {chips:string[];description:string} {
  const note=parseProductNote(parent);
  const group=note.brand_group as {detail_info?:Record<string,unknown>} | undefined;
  const raw=group?.detail_info?.[detailName];
  if (!detailName || !raw || typeof raw!=='object' || Array.isArray(raw)) return resolveDetailInfo(parent);
  const value=raw as Record<string,unknown>;
  if (!['inherit','custom','hidden'].includes(String(value.mode))) return resolveDetailInfo(parent);
  return resolveDetailInfo(parent,{
    mode:value.mode as DetailInfo['mode'],
    chips:Array.isArray(value.chips)?value.chips.filter((chip):chip is string=>typeof chip==='string'):[],
    description:typeof value.description==='string'?value.description:'',
  });
}
