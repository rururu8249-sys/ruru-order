import type {ProductManageTab} from './AdminLiveProductManagePopup';

export default function ProductToolbar({tab,onTab,onImport,onCreate}:{tab:ProductManageTab;onTab:(tab:ProductManageTab)=>void;onImport:()=>void;onCreate:()=>void}) {
  return <div className="flex min-w-0 flex-1 flex-wrap items-end justify-between gap-x-4 gap-y-1">
    <nav aria-label="상품 메뉴" className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
      {([['broadcast','방송 상품'],['shop','쇼핑몰 진열'],['products','전체 상품']] as const).map(([key,label])=><button key={key} type="button" aria-pressed={tab===key} onClick={()=>onTab(key)} className={`-mb-px min-h-11 shrink-0 whitespace-nowrap rounded-t-lg border-b-2 px-3.5 py-2 text-[13px] font-black md:min-h-9 ${tab===key?'border-rose-deep bg-rose-soft/60 text-rose-deep':'border-transparent text-ink-soft hover:text-rose-deep'}`}>{label}</button>)}
    </nav>
    <div className="flex shrink-0 items-center gap-1.5 pb-1.5">
      <button type="button" onClick={onImport} className="min-h-9 whitespace-nowrap rounded-lg border border-rose-line px-2.5 py-1.5 text-xs font-black text-rose-deep hover:bg-rose-soft">엑셀 대량등록</button>
      <button type="button" onClick={onCreate} className="min-h-9 whitespace-nowrap rounded-lg bg-rose-deep px-2.5 py-1.5 text-xs font-black text-white">+ 상품 등록</button>
    </div>
  </div>;
}
