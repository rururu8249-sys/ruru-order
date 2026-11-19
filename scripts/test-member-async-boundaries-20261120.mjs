// Standalone regression check using the repository's shared real-component fixture.
// Run before or after the fix: node scripts/test-member-async-boundaries-20261120.mjs
// All requests, including the simulated edit POST, are intercepted. Nothing is persisted.
import assert from 'node:assert/strict';
import { act, zeroStats, fixtures, makeEnvironment, textOf, buttonText, click, renderMembers, openMember, memberDialog, closeMember } from './test-member-ui-state-20261120.mjs';

async function runCases() {
  async function activeBuyerRefresh() {
    const env = makeEnvironment({byProfile:{'1':{...zeroStats,all:1},'2':zeroStats}});
    const tree = await renderMembers(env);
    try {
      const orig = globalThis.fetch;
      const findBuyers = () => tree.root.findAllByType('button').find(n => textOf(n).includes('주문 있는 고객만'));
      await click(findBuyers(), '구매자 필터 켜기');
      const includesNonbuyer = () => tree.root.findAllByProps({role:'button'}).some(n => textOf(n).includes(fixtures.b.youtube_nickname));
      assert.equal(includesNonbuyer(), false, 'fixture control: before refresh');
      let resolveLifetime;
      globalThis.fetch = (url, opts) => url === '/api/admin-live/customer-lifetime' ? new Promise(resolve => {resolveLifetime=resolve}) : orig(url, opts);
      await click(buttonText(tree,'새로고침'), '새로고침');
      const widened = includesNonbuyer();
      const selectAll = tree.root.findAllByProps({'aria-label':'이 페이지 전체 선택'})[0];
      if (selectAll && !selectAll.props.disabled) await act(async () => selectAll.props.onChange());
      const selectedTwo = textOf(tree.root).includes('2명 선택');
      if (resolveLifetime) await act(async () => resolveLifetime(await orig('/api/admin-live/customer-lifetime')));
      assert.deepEqual({widened, selectedTwo}, {widened:false,selectedTwo:false}, 'refresh of an active buyer filter must not reveal or bulk-select nonbuyers');
    } finally { await act(async () => tree.unmount()); }
  }

  async function lateMutation(kind) {
    const env=makeEnvironment({modules:{
      '@/lib/adminConfirm': {showAdminConfirm: async () => true},
      '@/lib/adminToast': {showAdminToast() {}},
    }});
    const tree=await renderMembers(env);
    try {
      const endpoint=kind==='phone'?'/api/admin-live/customer-phone-change':'/api/admin-live/customer-update';
      const orig=globalThis.fetch;
      let resolveSave;
      globalThis.fetch=(url,opts)=>url===endpoint?new Promise(resolve=>{resolveSave=resolve}):orig(url,opts);
      await openMember(tree,fixtures.a.youtube_nickname);
      await click(buttonText(tree,'정보 수정'),'정보 수정');
      if(kind==='phone'){
        await click(buttonText(tree,'번호 변경'),'번호 변경 열기');
        const input=memberDialog(tree).findByProps({'aria-label':'새 전화번호'});
        await act(async()=>input.props.onChange({target:{value:'01055556666'}}));
      }
      let request;
      await act(async()=>{request=buttonText(tree,kind==='phone'?'전화번호 변경':'저장').props.onClick()});
      assert.equal(typeof resolveSave,'function','fixture control: A request intercepted');
      await closeMember(tree);
      await openMember(tree,fixtures.b.youtube_nickname);
      const before=memberDialog(tree);
      assert.ok(before && textOf(before).includes(fixtures.b.youtube_nickname),'fixture control: B opened');
      await act(async()=>{resolveSave({ok:true,json:async()=>({ok:true})});await request});
      const after=memberDialog(tree);
      assert.ok(after && textOf(after).includes(fixtures.b.youtube_nickname),'late A response must leave B detail open');
      assert.ok(textOf(after).includes(fixtures.b.kakao_nickname),'B must retain its profile');
    } finally { await act(async()=>tree.unmount()); }
  }

  for (const [name,run] of [['active-buyers-refresh',activeBuyerRefresh],['late-edit',()=>lateMutation('profile')],['late-phone-edit',()=>lateMutation('phone')]]) {
    try { await run(); console.log('PASS',name); }
    catch(e) { console.error('FAIL',name,e.message); process.exitCode=1; }
  }
}

await runCases();
