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
  return {chips:normalizeDetailChips(chips),description:String(parent.product_description ?? parent.description ?? '')};
}
