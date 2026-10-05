type Props = {
  page: number; pageCount: number; total: number; start: number; end: number;
  size: number; label: string; onPage: (page: number) => void; onSize: (size: number) => void;
};

export default function ProductPagination({ page, pageCount, total, start, end, size, label, onPage, onSize }: Props) {
  const pages = Array.from(new Set([1, page - 1, page, page + 1, pageCount])).filter(p => p >= 1 && p <= pageCount).sort((a,b) => a-b);
  const buttonStyle = { minWidth: 32, minHeight: 36, padding: '4px 8px', border: '1px solid var(--color-line)', borderRadius: 8, background: 'var(--color-surface)', color: 'var(--color-ink)', fontSize: 13, cursor: 'pointer' };
  return <nav aria-label={label} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,flexWrap:'wrap',padding:'12px 0'}}>
    <span aria-live="polite" style={{fontSize:13,color:'var(--color-ink-soft)'}}>총 {total.toLocaleString('ko-KR')}개 · {start}–{end} 표시</span>
    <div style={{display:'flex',alignItems:'center',gap:4,flexWrap:'wrap'}}>
      <select aria-label={`${label} 페이지당 상품 수`} value={size} onChange={e=>onSize(Number(e.target.value))} style={buttonStyle}>
        {[10,20,50].map(n=><option key={n} value={n}>{n}개씩</option>)}
      </select>
      <button type="button" disabled={page===1} onClick={()=>onPage(page-1)} style={{...buttonStyle,opacity:page===1 ? 0.45 : 1}}>이전</button>
      {pages.map((p,i)=><span key={p} style={{display:'inline-flex',alignItems:'center',gap:4}}>
        {i>0 && p>pages[i-1]+1 ? <span aria-hidden="true">…</span> : null}
        <button type="button" aria-label={`${p}페이지`} aria-current={p===page ? 'page' : undefined} onClick={()=>onPage(p)} style={{...buttonStyle,background:p===page ? 'var(--color-rose-deep)' : 'var(--color-surface)',color:p===page ? '#fff' : 'var(--color-ink)',fontWeight:p===page ? 800 : 500}}>{p}</button>
      </span>)}
      <button type="button" disabled={page===pageCount} onClick={()=>onPage(page+1)} style={{...buttonStyle,opacity:page===pageCount ? 0.45 : 1}}>다음</button>
    </div>
  </nav>;
}
