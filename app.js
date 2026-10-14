(function(){
/* ---------- 목록 정의 ---------- */
const OPT = {
  channel:['전화','카카오톡','문자','방문','기타'],
  process:['설비','욕실','주방','목공','타일','도장','도배','필름','전기·조명','창호','가구','기타'],
  cause:['확인 중','시공 하자','자재 불량','고객 사용 부주의','노후·자연 마모','건물·공용 설비','기타'],
  charge:['확인 중','무상','유상','일부 유상'],
  costBearer:['회사','고객','담당자 예치금','협력업체','분담'],
  satisfaction:['매우 만족','만족','보통','불만'],
  ownerStatus:['재직','휴직','퇴사'],
  stage:null // 아래 STAGES + 보류
};
const STAGES = ['접수','고객 연락','일정 확정','처리 완료','종결'];
const HOLD = '보류';
OPT.stage = [...STAGES, HOLD];
const GROUPS = [['재직','재직자 현장'],['휴직','휴직자 현장'],['퇴사','퇴사자 현장']];
const COSTS = [['parts','부품비'],['trip','출장비'],['labor','공임 / 시공비'],['etc','기타']];
const NONE = '__none';

/* ---------- 작성 항목 ---------- */
const SECTIONS = [
  {no:'1', title:'접수', fields:[
    ['no','접수번호','text',{ph:'비워 두면 자동 부여 (AS-2026-001)'}],
    ['receivedAt','접수일','date'],
    ['channel','접수 경로','select'],
    ['round','회차','number',{ph:'같은 현장의 몇 번째 AS인지'}]
  ]},
  {no:'2', title:'고객 · 현장', fields:[
    ['customer','고객명','text'],
    ['phone','고객 연락처','tel',{ph:'010-0000-0000'}],
    ['address','현장 주소','text',{wide:true,ph:'계약서·마감보고서와 같은 주소'}],
    ['siteCode','현장코드','text',{ph:'마감보고서의 현장코드'}],
    ['finishedAt','준공일 (마감일)','date'],
    ['builtYear','시공 연도','number',{ph:'준공일을 모르면 연도만 (예: 2024)'}]
  ]},
  {no:'3', title:'마감보고서 첨부', attach:true, guide:'이 현장의 마감보고서(엑셀)를 첨부해 주세요. 담당자가 이 파일을 보고 진행합니다. PDF·사진도 올릴 수 있습니다.', fields:[]},
  {no:'4', title:'현장 담당자 · 처리 담당', owner:true, guide:'현장 담당자는 마감보고서의 담당 디자이너입니다. 재직·휴직·퇴사 구분은 업무지원포털 직원 명단에서 자동으로 정해집니다.', fields:[]},
  {no:'5', title:'문제 내용', fields:[
    ['process','공정','select',{wide:true}],
    ['symptom','문제 내용','textarea',{ph:'예: 세면대와 배수 부위가 분리되어 물이 배수관으로 내려가지 못하고 외부로 샘'}],
    ['note','비고','textarea',{ph:'예: 24년 공사 건으로 AS 비용 발생 가능성 사전 안내 완료'}],
    ['costNotice','비용 안내','check',{text:'부품비·출장비 발생 가능성을 고객에게 미리 안내함'}]
  ]},
  {no:'6', title:'처리', fields:[
    ['stage','진행 단계','select',{wide:true}],
    ['contactedAt','첫 고객 연락일','date'],
    ['visitAt','방문 일정','datetime'],
    ['vendor','처리 업체 / 기사','text',{wide:true,ph:'(업체명) / (기사) / (전화번호)'}],
    ['cause','원인','select',{wide:true}],
    ['charge','비용 구분','select',{wide:true}]
  ]},
  {no:'7', title:'비용', costs:true, guide:'합계는 자동 계산됩니다.', fields:[
    ['costBearer','비용 부담','select',{wide:true}],
    ['customerCharge','고객 청구액 (원)','money']
  ]},
  {no:'8', title:'완료 · 고객 피드백', fields:[
    ['doneAt','처리 완료일','date'],
    ['satisfaction','고객 만족도','select'],
    ['result','처리 결과','textarea'],
    ['feedback','고객 피드백','textarea']
  ]}
];

/* ---------- 상태 ---------- */
const S = {
  view:'list', id:null, tickets:[], loaded:false,
  f:{group:'전체', stage:'진행 중', q:'', mine:false, alert:'', owner:''},
  me:{isAdmin:false, name:''}, members:[], staff:false,
  session:null, authReady:false, email:null, uid:null, offline:false,
  photoUrls:{}, confirmDel:false, busy:false
};
const app = document.getElementById('app');

/* ---------- 유틸 ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const won = n => (n===''||n==null||isNaN(n)) ? '' : Number(n).toLocaleString('ko-KR');
const parseNum = v => { const n = Number(String(v??'').replace(/[^\d.-]/g,'')); return isFinite(n)&&String(v??'').trim()!=='' ? n : ''; };
const pad = n => String(n).padStart(2,'0');
const dstr = d => d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const todayStr = () => dstr(new Date());
const addYears = (s,n) => { const [y,m,d] = String(s).split('-'); return `${(+y)+n}-${m}-${d}`; };
const days = (a,b) => { const x = new Date(a+'T00:00:00'), y = new Date((b||todayStr())+'T00:00:00'); const n = Math.round((y-x)/86400000); return isNaN(n)?'':n; };
const costTotal = t => COSTS.reduce((a,[k]) => a + (Number(t?.costs?.[k]?.amt)||0), 0);
const fmtDT = s => s ? String(s).replace('T',' ') : '';
const shortDT = iso => { const d = new Date(iso); return isNaN(d) ? '' : `${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
function toast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.hidden=false; clearTimeout(toast._t); toast._t=setTimeout(()=>t.hidden=true,2600); }
const siteKey = a => String(a||'').replace(/\s+/g,'').replace(/[,.]/g,'');

/* ---------- 판정 ---------- */
const normStatus = s => { s = String(s||''); return s.includes('퇴사') ? '퇴사' : s.includes('휴직') ? '휴직' : s.trim()==='재직' ? '재직' : ''; };
const member = email => email ? S.members.find(x=>x.email===String(email).toLowerCase()) : null;
const nameOf = email => member(email)?.name || String(email||'').split('@')[0];
function ownerOf(t){
  const m = member(t.ownerEmail);
  if(m) return {name:m.name, status:normStatus(m.status), dept:m.dept, email:m.email};
  return {name:t.ownerName||'', status:normStatus(t.ownerStatus), dept:'', email:null};
}
const groupOf = t => ownerOf(t).status || '미확인';
const groupLabel = g => (GROUPS.find(x=>x[0]===g)||[,'담당자 미확인'])[1];
/** 휴직·퇴사자 현장은 현장팀이 맡는다 (2026-10-14 대표 지시). 사람이 바뀌면 이름만 고친다. */
const FIELD_TEAM = ['김응수','박명철'];
const TEAM = 'team:field';
const fieldTeam = () => S.members.filter(m=>FIELD_TEAM.includes(m.name) && normStatus(m.status)==='재직').map(m=>m.email);
/** 처리 담당 (이메일 목록). 따로 지정했으면 그 사람, 아니면 재직자 현장은 담당자 본인, 휴직·퇴사자 현장은 현장팀. */
function handlersOf(t){
  if(t.handlerEmail===TEAM) return fieldTeam();
  if(t.handlerEmail) return [t.handlerEmail];
  const o = ownerOf(t);
  if(o.status==='재직') return o.email ? [o.email] : [];
  if(o.status==='휴직' || o.status==='퇴사') return fieldTeam();
  return [];
}
const isTeam = t => t.handlerEmail===TEAM || (!t.handlerEmail && ['휴직','퇴사'].includes(ownerOf(t).status));
/** 처리 담당 표시용 이름. 현장팀은 명단에서 못 찾아도 이름으로 보여 준다. */
function handlerLabel(t){
  if(isTeam(t)) return '현장팀 ' + FIELD_TEAM.join('·');
  const h = handlersOf(t); return h.length ? h.map(nameOf).join('·') : '';
}
const isMine = t => handlersOf(t).includes(S.email);
const stageIdx = t => STAGES.indexOf(t.stage||'접수');
const isOpen = t => (t.stage||'접수')!=='종결';
function warranty(t){
  const ref = t.receivedAt || todayStr();
  if(t.finishedAt) return ref <= addYears(t.finishedAt,1) ? {k:'in', label:'보증 1년 이내', cls:'info'} : {k:'out', label:'보증 기간 경과', cls:'info'};
  if(t.builtYear){
    const gap = (+ref.slice(0,4)) - (+t.builtYear);
    if(gap>=2) return {k:'out', label:'보증 기간 경과', cls:'info'};
    if(gap<=0) return {k:'in', label:'보증 1년 이내', cls:'info'};
  }
  return {k:'unk', label:'준공일 확인 필요', cls:'info'};
}
/** 퇴사 후 1년 안에 생긴 AS 는 예치금에서 비용을 뺀다 (포털 FAQ '예치금'). */
function deposit(t){
  if(groupOf(t)!=='퇴사') return null;
  if(!t.resignedAt) return {k:'unk', label:'퇴사일 확인 필요', cls:'info'};
  return (t.receivedAt||todayStr()) <= addYears(t.resignedAt,1) ? {k:'yes', label:'예치금 차감 대상', cls:'hot'} : {k:'no', label:'예치금 기간 경과', cls:'info'};
}
function uncontacted(t){
  if((t.stage||'접수')!=='접수' || !t.receivedAt) return 0;
  const n = days(t.receivedAt); return n>=1 ? n : 0;
}
const needsHandler = t => isOpen(t) && t.stage!==HOLD && !handlerLabel(t);
function elapsed(t){ if(!t.receivedAt) return ''; return days(t.receivedAt, (!isOpen(t)||t.stage==='처리 완료') && t.doneAt ? t.doneAt : todayStr()); }
function nextNo(){
  const y = new Date().getFullYear(), re = new RegExp('^AS-'+y+'-(\\d+)$');
  const max = S.tickets.reduce((m,t)=>{ const r=re.exec(t.no||''); return r?Math.max(m,+r[1]):m; },0);
  return `AS-${y}-${String(max+1).padStart(3,'0')}`;
}
function suggestRound(address, selfId){
  const k = siteKey(address); if(!k) return '';
  return S.tickets.filter(t=>t._id!==selfId && siteKey(t.address)===k).length + 1;
}
function stagePill(t){
  const s = t.stage||'접수';
  return `<span class="pill ${s===HOLD?'st-hold':'st-'+STAGES.indexOf(s)}">${esc(s)}</span>`;
}
function flagsHTML(t, opt={}){
  const out = [];
  const w = warranty(t); if(opt.all || w.k!=='in') out.push(`<span class="flag ${w.cls}">${esc(w.label)}</span>`);
  const d = deposit(t); if(d) out.push(`<span class="flag ${d.cls}">${esc(d.label)}</span>`);
  const dl = delayOf(t); if(dl) out.push(`<span class="flag hot">${esc(dl)}</span>`);
  if(needsHandler(t)) out.push(`<span class="flag hot">처리 담당 지정 필요</span>`);
  if(!(t.files||[]).length) out.push(`<span class="flag">마감보고서 없음</span>`);
  if(opt.all && +t.round>1) out.push(`<span class="flag">${esc(t.round)}차 AS</span>`);
  return out.join('');
}

/* ---------- 카톡 알림 ----------
   접수·지연 알림 문구를 만들어 카톡으로 보낸다. 휴대폰에서는 공유 창에서 카카오톡을 고르고,
   PC 에서는 문구를 복사해 단톡방에 붙여 넣는다. (자동 발송은 카카오 알림톡 계약이 있어야 가능) */
const DELAY_DAYS = 7;
/** 손이 가야 하는 지연: 접수 후 하루 넘게 미연락, 또는 접수 후 7일이 지나도록 처리 완료 전. */
function delayOf(t){
  if(!isOpen(t) || t.stage===HOLD || t.stage==='처리 완료') return '';
  const u = uncontacted(t); if(u) return `고객 미연락 ${u}일째`;
  const e = elapsed(t); return e>=DELAY_DAYS ? `접수 ${e}일째 처리 중` : '';
}
const shortAddr = a => String(a||'').split(/\s+/).slice(0,3).join(' ');
function notifyMsg(t){
  const o = ownerOf(t), g = groupOf(t);
  return [
    '[AS 접수 알림]',
    'AS 접수되었습니다. AS 진행관리에서 확인해 주세요.',
    '',
    `- 고객: ${t.customer||''}${t.address?` (${shortAddr(t.address)})`:''}`,
    `- 현장 담당: ${o.name||'미확인'}${g!=='재직'&&g!=='미확인'?` (${groupLabel(g)})`:''}`,
    `- 처리 담당: ${handlerLabel(t)||'지정 필요'}`,
    t.symptom ? `- 내용: ${t.symptom.length>60?t.symptom.slice(0,60)+'…':t.symptom}` : '',
    '',
    '▶ '+link(t)
  ].filter((l,i,a)=>l!=='' || (a[i-1]!=='' && i>0)).join('\n');
}
function delayMsg(list){
  const d = new Date();
  const lines = [`[AS 지연 알림] ${d.getMonth()+1}/${d.getDate()} 기준 ${list.length}건`, '처리가 늦어지고 있는 AS입니다. 오늘 안에 확인하고 진행 기록을 남겨 주세요.', ''];
  list.forEach(t=>lines.push(`- ${t.customer||'(고객명 없음)'} · ${handlerLabel(t)||'담당 미지정'} · ${delayOf(t)}`));
  lines.push('', '▶ '+location.origin+location.pathname);
  return lines.join('\n');
}
/** 휴대폰이면 공유 창(카카오톡 선택), 아니면 복사. 보냈으면 true. */
async function sendKakao(text){
  if(navigator.share && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)){
    try{ await navigator.share({text}); return true; }catch(e){ if(e?.name==='AbortError') return false; }
  }
  await copy(text, '알림 문구를 복사했습니다. 카톡 단톡방에 붙여 넣어 주세요.');
  return true;
}

/* ---------- 링크 복사 ---------- */
const link = t => location.origin + location.pathname + '#' + t._id;
async function copy(text, msg){
  try{ await navigator.clipboard.writeText(text); toast(msg); }
  catch(_){
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position='fixed'; ta.style.opacity='0';
    document.body.appendChild(ta); ta.select();
    try{ document.execCommand('copy'); toast(msg); }catch(e){ toast('복사하지 못했습니다.'); }
    ta.remove();
  }
}
const fileExt = n => (String(n||'').split('.').pop()||'').slice(0,4);
const fileSize = b => !b ? '' : b>=1048576 ? (b/1048576).toFixed(1)+'MB' : Math.max(1,Math.round(b/1024))+'KB';

/* ---------- 화면 전환 ---------- */
function go(view,id){
  S.view=view; S.id=id||null; S.confirmDel=false;
  const h = view==='doc' && id ? '#'+id : '';
  if(location.hash!==h) history.replaceState(null,'',location.pathname+location.search+h);
  render(); window.scrollTo(0,0);
}
document.querySelectorAll('.tab[data-view]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.view)));
document.getElementById('btn-new').addEventListener('click',()=>go('edit'));

function render(){
  document.getElementById('nav').hidden = !S.session;
  document.getElementById('who').hidden = !S.session;
  if(!S.session){ renderLogin(); return; }
  if(S.loaded && !S.staff){ document.getElementById('nav').hidden = true; document.getElementById('btn-new').hidden = true; renderBlocked(); return; }
  document.querySelectorAll('.tab[data-view]').forEach(b=>b.setAttribute('aria-current', String(b.dataset.view===S.view || (b.dataset.view==='list' && (S.view==='doc'||S.view==='edit')))));
  document.getElementById('btn-new').hidden = !S.session || S.offline;
  if(S.view==='list') renderList();
  else if(S.view==='doc') renderDoc();
  else if(S.view==='edit') renderEdit();
  else if(S.view==='people') renderPeople();
  else if(S.view==='guide') renderGuide();
}

/* ---------- 현황판 ---------- */
function filtered(){
  const q = S.f.q.trim().toLowerCase();
  return S.tickets.filter(t=>{
    if(S.f.group!=='전체' && groupOf(t)!==S.f.group) return false;
    const st = t.stage||'접수';
    if(S.f.stage==='진행 중' && !(isOpen(t) && st!==HOLD)) return false;
    if(S.f.stage!=='진행 중' && S.f.stage!=='전체' && st!==S.f.stage) return false;
    if(S.f.mine && !isMine(t)) return false;
    if(S.f.alert==='delayed' && !delayOf(t)) return false;
    if(S.f.alert==='nohandler' && !needsHandler(t)) return false;
    if(S.f.alert==='deposit' && deposit(t)?.k!=='yes') return false;
    if(S.f.owner && ownerKey(t)!==S.f.owner) return false;
    if(q){
      const o = ownerOf(t), h = handlerLabel(t);
      const hay = [t.no,t.customer,t.phone,t.address,t.siteCode,t.symptom,t.vendor,o.name,h].join(' ').toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  }).sort((a,b)=> String(b.receivedAt||'').localeCompare(String(a.receivedAt||'')) || String(b.no||'').localeCompare(String(a.no||'')));
}
function segHTML(name,vals,cur){
  return `<div class="seg" role="group" aria-label="${esc(name)}">`+vals.map(([v,lab])=>`<button type="button" data-seg="${esc(name)}" data-v="${esc(v)}" aria-pressed="${v===cur}">${lab}</button>`).join('')+`</div>`;
}
function renderList(){
  const all = S.tickets, open = all.filter(t=>isOpen(t) && t.stage!==HOLD);
  const card = (g,label) => {
    const inG = g==='전체' ? all : all.filter(t=>groupOf(t)===g);
    const o = inG.filter(t=>isOpen(t) && t.stage!==HOLD);
    const nh = o.filter(needsHandler).length, un = o.filter(t=>delayOf(t)).length;
    const dep = g==='퇴사' ? inG.filter(t=>deposit(t)?.k==='yes' && isOpen(t)).length : 0;
    const warn = nh ? `담당 지정 필요 ${nh}건` : un ? `지연 ${un}건` : dep ? `예치금 차감 대상 ${dep}건` : '';
    return `<button type="button" class="gcard g-${esc(g)}" data-group="${esc(g)}" aria-pressed="${S.f.group===g}">
      <small>${esc(label)}<em>총 ${inG.length}건</em></small>
      <strong>${o.length}<em>건 진행 중</em></strong>
      <span class="warn ${warn?'':'ok'}">${warn?esc(warn):'밀린 건 없음'}</span></button>`;
  };
  const unk = all.filter(t=>groupOf(t)==='미확인').length;
  const delayed = open.filter(t=>delayOf(t)), unC = delayed.length, noH = open.filter(needsHandler).length, depN = all.filter(t=>isOpen(t)&&deposit(t)?.k==='yes').length;
  const cnt = s => all.filter(t=>(t.stage||'접수')===s).length;
  const rows = filtered();
  let body;
  if(!S.loaded) body = `<div class="empty"><h3>AS 목록을 불러오는 중입니다</h3><p>잠시만 기다려 주세요.</p></div>`;
  else if(S.offline && !all.length) body = `<div class="empty"><h3>AS 데이터베이스에 연결하지 못했습니다</h3><p>처음 쓰는 거라면 관리자가 Supabase에 <b>as.sql</b>을 한 번 실행해야 합니다. 이미 했다면 새로고침해 보세요.</p></div>`;
  else if(!all.length) body = `<div class="empty"><h3>아직 접수된 AS가 없습니다</h3><p>AS가 들어오면 현장 정보를 넣고 마감보고서를 첨부해 접수하세요. 담당자가 이 화면에서 진행합니다.</p><button class="btn primary" data-act="new">첫 AS 접수</button></div>`;
  else if(!rows.length) body = `<div class="empty"><h3>조건에 맞는 AS가 없습니다</h3><p>구분·단계 필터를 바꾸거나 검색어를 지워 보세요.</p><button class="btn" data-act="reset">필터 초기화</button></div>`;
  else body = `<div class="tbl-wrap"><table class="ledger"><thead><tr>
      <th>접수번호</th><th>고객 / 현장</th><th>현장 담당 (구분)</th><th>처리 담당</th><th>공정</th><th>단계</th><th>확인할 것</th><th class="num">경과</th>
    </tr></thead><tbody>`+rows.map(t=>{
      const o = ownerOf(t), g = groupOf(t), h = handlerLabel(t), el = elapsed(t);
      return `<tr data-open="${esc(t._id)}" tabindex="0">
        <td class="mono" data-c="hide">${esc(t.no||'—')}${+t.round>1?`<br><span class="flag">${esc(t.round)}차</span>`:''}</td>
        <td class="cust"><b>${esc(t.customer||'(고객명 미입력)')}</b><span>${esc(t.address||'')}</span></td>
        <td class="who-cell g-${esc(g)}" data-c="hide"><b>${esc(o.name||'—')}</b><span class="gtag">${esc(groupLabel(g))}</span></td>
        <td data-c="hide" style="white-space:nowrap">${h?esc(h):'<span class="flag hot">지정 필요</span>'}</td>
        <td data-c="hide">${esc(t.process||'')}</td>
        <td>${stagePill(t)}</td>
        <td data-c="hide"><div class="flags">${flagsHTML(t)}</div></td>
        <td class="num ${delayOf(t)?'over':''}">${el===''?'':el+'일'}</td>
      </tr>`;}).join('')+`</tbody></table></div>`;
  const ownerChip = S.f.owner ? `<button class="btn" data-act="clear-owner">담당자: ${esc(S.f.owner.split('|')[1]||'')} ✕</button>` : '';
  app.innerHTML = `
    <h1 class="page">AS 현황판</h1>
    <p class="sub">접수된 AS는 현장 담당자의 재직 상태로 자동 구분됩니다. 카드를 누르면 그 구분만 보입니다.${S.offline?' · 저장소에 연결되지 않아 저장되지 않습니다.':''}</p>
    <div class="groups">${card('전체','전체')}${GROUPS.map(([g,l])=>card(g,l)).join('')}</div>
    ${unk?`<p class="guide" style="margin-top:-8px">현장 담당자가 비어 있거나 명단에서 확인되지 않는 AS가 ${unk}건 있습니다. <button class="linkish" data-group="미확인">보기</button></p>`:''}
    ${(unC||noH||depN)?`<div class="alerts">
      ${noH?`<button class="alert" data-alert="nohandler" aria-pressed="${S.f.alert==='nohandler'}">처리 담당 지정 필요 ${noH}건</button>`:''}
      ${unC?`<button class="alert" data-alert="delayed" aria-pressed="${S.f.alert==='delayed'}">지연 ${unC}건 (미연락·${DELAY_DAYS}일 경과)</button><button class="btn primary" data-act="remind">지연 알림 카톡 보내기</button>`:''}
      ${depN?`<button class="alert" data-alert="deposit" aria-pressed="${S.f.alert==='deposit'}">예치금 차감 대상 ${depN}건</button>`:''}
    </div>`:''}
    <div class="filters">
      <span><span class="flabel">단계</span>${segHTML('stage',[['진행 중',`진행 중 ${open.length}`],...OPT.stage.map(s=>[s,`${s} ${cnt(s)}`]),['전체','전체']],S.f.stage)}</span>
      <button type="button" class="btn ${S.f.mine?'primary':''}" data-act="mine" aria-pressed="${S.f.mine}">내가 처리할 AS ${all.filter(t=>isOpen(t)&&isMine(t)).length}건</button>
      ${ownerChip}
      <input class="search" id="f-q" type="search" placeholder="고객명, 주소, 연락처, 담당자 검색" value="${esc(S.f.q)}">
      ${all.length?'<button class="btn ghost" data-act="csv">CSV 내보내기</button>':''}
    </div>
    ${body}`;
  app.querySelectorAll('[data-seg]').forEach(b=>b.addEventListener('click',()=>{ S.f[b.dataset.seg]=b.dataset.v; renderList(); }));
  app.querySelectorAll('[data-group]').forEach(b=>b.addEventListener('click',()=>{ const g=b.dataset.group; S.f.group = (S.f.group===g && g!=='전체') ? '전체' : g; renderList(); }));
  app.querySelectorAll('[data-alert]').forEach(b=>b.addEventListener('click',()=>{ const a=b.dataset.alert; S.f.alert = S.f.alert===a ? '' : a; if(S.f.alert) S.f.stage='전체'; renderList(); }));
  const q = app.querySelector('#f-q');
  q.addEventListener('input',e=>{ S.f.q=e.target.value; clearTimeout(q._t); q._t=setTimeout(()=>{ renderList(); const n=app.querySelector('#f-q'); n.focus(); n.setSelectionRange(n.value.length,n.value.length); },250); });
  app.querySelectorAll('[data-open]').forEach(tr=>{
    tr.addEventListener('click',()=>go('doc',tr.dataset.open));
    tr.addEventListener('keydown',e=>{ if(e.key==='Enter') go('doc',tr.dataset.open); });
  });
  app.querySelector('[data-act="new"]')?.addEventListener('click',()=>go('edit'));
  app.querySelector('[data-act="reset"]')?.addEventListener('click',()=>{ S.f={group:'전체',stage:'전체',q:'',mine:false,alert:'',owner:''}; renderList(); });
  app.querySelector('[data-act="mine"]')?.addEventListener('click',()=>{ S.f.mine=!S.f.mine; renderList(); });
  app.querySelector('[data-act="remind"]')?.addEventListener('click',()=>sendKakao(delayMsg(delayed)));
  app.querySelector('[data-act="clear-owner"]')?.addEventListener('click',()=>{ S.f.owner=''; renderList(); });
  app.querySelector('[data-act="csv"]')?.addEventListener('click',()=>exportCSV(rows));
}

function exportCSV(rows){
  const head = ['No','접수번호','접수일','회차','접수 경로','고객명','연락처','현장 주소','현장코드','준공일','시공 연도','첨부 파일','현장 담당자','구분','퇴사일','처리 담당','공정','문제 내용','비고','비용 사전 안내','진행 단계','첫 연락일','방문 일정','처리 업체','원인','비용 구분','부품비','출장비','공임','기타','비용 합계','비용 부담','고객 청구액','처리 완료일','고객 만족도','처리 결과','고객 피드백','보증','예치금','경과일'];
  const q = v => { const s=String(v??''); return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; };
  const lines = [head.join(',')].concat(rows.map((t,i)=>{
    const o = ownerOf(t), h = handlerLabel(t);
    return [i+1,t.no,t.receivedAt,t.round,t.channel,t.customer,t.phone,t.address,t.siteCode,t.finishedAt,t.builtYear,(t.files||[]).map(f=>f.name).join(' / '),o.name,groupLabel(groupOf(t)),t.resignedAt,h,t.process,t.symptom,t.note,t.costNotice?'안내함':'',t.stage||'접수',t.contactedAt,fmtDT(t.visitAt),t.vendor,t.cause,t.charge,
      ...COSTS.map(([k])=>t.costs?.[k]?.amt??''),costTotal(t)||'',t.costBearer,t.customerCharge,t.doneAt,t.satisfaction,t.result,t.feedback,warranty(t).label,deposit(t)?.label||'',elapsed(t)].map(q).join(',');
  }));
  const blob = new Blob(['﻿'+lines.join('\r\n')], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `AS_진행관리_${todayStr()}.csv`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
}

/* ---------- AS 기록 보기 ---------- */
const dd = v => (v===''||v==null||v===false) ? `<dd class="blank">—</dd>` : `<dd>${esc(v)}</dd>`;
const kv = (label,v,wide) => `<div class="${wide?'wide':''}"><dt>${esc(label)}</dt>${dd(v)}</div>`;
function renderDoc(){
  const t = S.tickets.find(x=>x._id===S.id);
  if(!t){ app.innerHTML = `<div class="empty" style="margin-top:28px"><h3>AS 기록을 찾을 수 없습니다</h3><p>삭제되었거나 아직 불러오는 중입니다.</p><button class="btn" data-act="back">현황판으로</button></div>`; app.querySelector('[data-act="back"]').onclick=()=>go('list'); return; }
  const canW = !S.offline;
  const canDel = canW && (S.me.isAdmin || (t.createdBy && t.createdBy===S.email));
  const o = ownerOf(t), g = groupOf(t), h = handlerLabel(t), w = warranty(t), dep = deposit(t);
  const si = t.stage===HOLD ? -1 : stageIdx(t);
  const photos = t.photos||[], files = t.files||[];
  const log = [...(t.log||[])].reverse();
  app.innerHTML = `
    <div class="back"><button class="btn ghost" data-act="back">← 현황판</button></div>
    ${canW && isOpen(t) && !t.notifiedAt ? `<div class="notify">
      <div class="notify-txt"><b>담당자에게 접수 알림을 보내 주세요</b><span>처리 담당: ${esc(h||'지정 필요')} · 휴대폰에서는 카카오톡을 골라 보내고, PC에서는 문구가 복사됩니다.</span></div>
      <pre class="notify-msg">${esc(notifyMsg(t))}</pre>
      <div class="notify-act"><button class="btn primary" data-act="notify">카톡으로 접수 알림 보내기</button><button class="btn ghost" data-act="notify-skip">보내지 않음</button></div>
    </div>` : ''}
    <div class="doc" style="margin-top:12px">
      <div class="as-head">
        <div style="min-width:0">
          <div class="doc-meta" style="margin:0 0 6px"><span class="mono">${esc(t.no||'')}</span>${stagePill(t)}<span class="gtag g-${esc(g)}">${esc(groupLabel(g))}</span><div class="flags">${flagsHTML(t,{all:true})}</div></div>
          <h1>${esc(t.customer||'(고객명 미입력)')} 고객 AS</h1>
          <div class="cust-line">${esc(t.address||'')}</div>
        </div>
        <div class="as-actions">
          <button class="btn" data-act="notify" title="처리 담당에게 보낼 접수 알림 문구">카톡 알림${t.notifiedAt?' 다시 보내기':''}</button>
          ${canW?'<button class="btn primary" data-act="edit">수정</button>':''}
        </div>
      </div>
      <div class="steps" role="group" aria-label="진행 단계">
        ${STAGES.map((s,i)=>`<button type="button" class="step ${i<si?'done':''} ${i===si?'cur':''}" data-stage="${esc(s)}" ${canW?'':'disabled'} title="${canW?esc(s)+' 단계로 바꾸기':''}"><i></i><span>${i+1}. ${esc(s)}</span></button>`).join('')}
      </div>
      <div class="step-sub">
        <span>${t.stage===HOLD?'<b>보류 중</b> · ':''}접수 ${esc(t.receivedAt||'')}${t.contactedAt?` · 연락 ${esc(t.contactedAt)}`:''}${t.visitAt?` · 방문 ${esc(fmtDT(t.visitAt))}`:''}${t.doneAt?` · 완료 ${esc(t.doneAt)}`:''}</span>
        ${canW?`<button class="linkish" data-stage="${t.stage===HOLD?'접수':HOLD}" style="font-size:12px">${t.stage===HOLD?'보류 풀기':'보류로 돌리기'}</button>`:''}
      </div>
    </div>
    <div class="cols">
      <article class="doc">
        <section class="sec" style="padding-top:0"><h2><i>1.</i>담당</h2>
          <dl class="kv">
            <div><dt>현장 담당자</dt><dd>${o.name?`${esc(o.name)} <span class="gtag g-${esc(g)}">${esc(o.status||'상태 미확인')}</span>`:'<span class="blank">—</span>'}${o.dept?`<br><span class="guide">${esc(o.dept)}</span>`:''}</dd></div>
            <div><dt>처리 담당</dt><dd>${h?esc(h)+(t.handlerEmail&&t.handlerEmail!==TEAM&&t.handlerEmail!==o.email?' <span class="guide">(대신 처리)</span>':''):'<span class="flag hot">지정 필요</span>'}</dd></div>
            ${g==='퇴사'?`${kv('퇴사일',t.resignedAt)}<div><dt>예치금</dt><dd><span class="flag ${dep.cls}">${esc(dep.label)}</span></dd></div>`:''}
          </dl>
        </section>
        <section class="sec"><h2><i>2.</i>고객 · 현장</h2>
          <dl class="kv">
            ${kv('고객명',t.customer)}
            <div><dt>연락처</dt><dd>${t.phone?`<a href="tel:${esc(String(t.phone).replace(/[^\d+]/g,''))}">${esc(t.phone)}</a>`:'<span class="blank">—</span>'}</dd></div>
            ${kv('현장 주소',t.address,true)}
            ${kv('현장코드',t.siteCode)}
            ${kv('회차',t.round?t.round+'차':'')}
            ${kv('준공일',t.finishedAt||(t.builtYear?t.builtYear+'년 시공':''))}
            <div><dt>보증</dt><dd><span class="flag ${w.cls}">${esc(w.label)}</span></dd></div>
            ${kv('접수 경로',t.channel)}
          </dl>
        </section>
        <section class="sec"><h2><i>3.</i>마감보고서 · 첨부 파일</h2><p class="guide">파일 이름을 누르면 내려받습니다.</p>
          ${files.length?`<ul class="files">${files.map((f,i)=>`<li><span class="ext">${esc(fileExt(f.name))}</span><a href="#" data-dl="${i}">${esc(f.name)}</a><span class="size">${esc(fileSize(f.size))}</span>${canW?`<button data-rmfile="${i}">빼기</button>`:''}</li>`).join('')}</ul>`:'<p class="guide" style="margin:0"><span class="flag hot">마감보고서 없음</span> 이 현장의 마감보고서를 첨부해 주세요.</p>'}
          ${canW?`<div class="file-pick"><label class="btn" for="file-in">${S.busy==='file'?'올리는 중…':'+ 파일 첨부'}</label><input id="file-in" type="file" multiple hidden></div>`:''}
        </section>
        <section class="sec"><h2><i>4.</i>문제 내용</h2>
          <dl class="kv">
            ${kv('공정',t.process,true)}
            ${kv('문제 내용',t.symptom,true)}
            ${kv('비고',t.note,true)}
            ${kv('비용 안내',t.costNotice?'부품비·출장비 발생 가능성 사전 안내함':'',true)}
          </dl>
        </section>
        <section class="sec"><h2><i>5.</i>처리 · 비용</h2>
          <dl class="kv">
            ${kv('처리 업체 / 기사',t.vendor,true)}
            ${kv('원인',t.cause)}
            ${kv('비용 구분',t.charge)}
          </dl>
          <table class="cost" style="margin-top:10px"><thead><tr><th>항목</th><th class="num">금액 (원)</th><th>비고</th></tr></thead><tbody>
            ${COSTS.map(([k,l])=>`<tr><td>${l}</td><td class="num">${won(t.costs?.[k]?.amt)||'—'}</td><td>${esc(t.costs?.[k]?.note||'')}</td></tr>`).join('')}
            <tr class="total"><td>합계</td><td class="num">${won(costTotal(t))}</td><td style="font-weight:400">${t.costBearer?esc(t.costBearer)+' 부담':''}${t.customerCharge?` · 고객 청구 ${won(t.customerCharge)}원`:''}</td></tr>
          </tbody></table>
        </section>
        <section class="sec"><h2><i>6.</i>완료 · 고객 피드백</h2>
          <dl class="kv">
            ${kv('처리 완료일',t.doneAt)}
            ${kv('고객 만족도',t.satisfaction)}
            ${kv('처리 결과',t.result,true)}
            ${kv('고객 피드백',t.feedback,true)}
          </dl>
        </section>
        <section class="sec"><h2><i>7.</i>사진</h2><p class="guide">접수 사진·처리 전후 사진을 올려 두세요. 누르면 원본이 새 탭에서 열립니다.</p>
          <div class="photos">
            ${photos.map(p=>`<div class="photo"><a href="${esc(S.photoUrls[p]||'#')}" target="_blank" rel="noopener"><img data-photo="${esc(p)}" ${S.photoUrls[p]?`src="${esc(S.photoUrls[p])}"`:''} alt="AS 현장 사진" loading="lazy"></a>${canW?`<button data-rmphoto="${esc(p)}">빼기</button>`:''}</div>`).join('')}
            ${canW?`<label class="dropzone" for="photo-in">${S.busy===true?'올리는 중…':'+ 사진 추가<br>(여러 장 선택 가능)'}</label><input id="photo-in" type="file" accept="image/*" multiple hidden>`:''}
            ${!photos.length && !canW?'<p class="guide">첨부된 사진이 없습니다.</p>':''}
          </div>
        </section>
      </article>
      <aside class="side">
        <h2>진행 기록</h2>
        <p class="guide" style="margin:0">고객 통화, 방문, 협의 내용을 그때그때 남겨 주세요. 예전에 파일에 정리하던 내용입니다.</p>
        ${canW?`<form class="note-in" id="note-f"><textarea id="note-t" placeholder="예: 10/15 고객 통화, 10/17(금) 오후 2시 방문 약속"></textarea><div style="display:flex;justify-content:flex-end"><button class="btn primary" type="submit">기록 남기기</button></div></form>`:''}
        <ul class="tl">${log.length?log.map(l=>`<li class="${l.kind==='stage'?'stage':''}"><div class="meta">${esc(shortDT(l.at))} · ${esc(l.by?nameOf(l.by):'')}</div><div class="txt">${l.kind==='stage'?'단계 → '+esc(l.text):esc(l.text)}</div></li>`).join(''):'<li class="empty-tl">아직 기록이 없습니다.</li>'}</ul>
      </aside>
    </div>
    <div class="doc-actions">
      <span style="flex:1"></span>
      ${canDel?(S.confirmDel?'<span class="confirm">이 AS 기록을 삭제할까요? <button class="btn danger" data-act="del-yes">삭제</button><button class="btn" data-act="del-no">취소</button></span>':'<button class="btn ghost" data-act="del">삭제</button>'):''}
    </div>`;
  loadPhotoUrls(photos);
  app.querySelector('[data-act="back"]').onclick=()=>go('list');
  app.querySelector('[data-act="edit"]')?.addEventListener('click',()=>go('edit',t._id));
  app.querySelectorAll('[data-act="notify"]').forEach(b=>b.addEventListener('click',async()=>{
    if(!await sendKakao(notifyMsg(t))) return;
    if(canW) api.appendLog(t._id, [{at:new Date().toISOString(), by:S.email, kind:'note', text:`카톡 접수 알림 보냄 → ${handlerLabel(t)||'담당 미지정'}`}], {notifiedAt:new Date().toISOString()}).catch(()=>{});
  }));
  app.querySelector('[data-act="notify-skip"]')?.addEventListener('click',()=>patch(t._id,{notifiedAt:'skip'},'알림 안내를 닫았습니다.'));
  app.querySelector('[data-act="del"]')?.addEventListener('click',()=>{ S.confirmDel=true; renderDoc(); });
  app.querySelector('[data-act="del-no"]')?.addEventListener('click',()=>{ S.confirmDel=false; renderDoc(); });
  app.querySelector('[data-act="del-yes"]')?.addEventListener('click',async()=>{
    try{ await api.remove(t._id); toast('삭제했습니다.'); go('list'); }catch(e){ toast('삭제하지 못했습니다. 등록한 사람이나 관리자만 지울 수 있습니다.'); }
  });
  app.querySelectorAll('[data-stage]').forEach(b=>b.addEventListener('click',async()=>{
    const s = b.dataset.stage; if(s===(t.stage||'접수')) return;
    await setStage(t, s);
  }));
  app.querySelector('#note-f')?.addEventListener('submit',async e=>{
    e.preventDefault();
    const ta = app.querySelector('#note-t'), text = ta.value.trim(); if(!text) return;
    ta.disabled = true;
    try{ await api.appendLog(t._id, [{at:new Date().toISOString(), by:S.email, kind:'note', text}]); toast('기록을 남겼습니다.'); }
    catch(_){ ta.disabled=false; toast('저장하지 못했습니다. 인터넷 연결을 확인해 주세요.'); }
  });
  app.querySelectorAll('[data-dl]').forEach(a=>a.addEventListener('click',async e=>{
    e.preventDefault();
    const f = files[+a.dataset.dl]; if(!f) return;
    try{ const u = await api.fileUrl(f.path, f.name); const x = document.createElement('a'); x.href = u; x.download = f.name; x.rel = 'noopener'; document.body.appendChild(x); x.click(); x.remove(); }
    catch(_){ toast('파일을 열지 못했습니다.'); }
  }));
  app.querySelectorAll('[data-rmfile]').forEach(b=>b.addEventListener('click',async()=>{
    const f = files[+b.dataset.rmfile]; if(!f) return;
    await patch(t._id,{files:files.filter(x=>x.path!==f.path)},`${f.name}을(를) 뺐습니다.`);
    api.removeFiles([f.path]).catch(()=>{});
  }));
  app.querySelector('#file-in')?.addEventListener('change',async e=>{
    const list=[...e.target.files]; if(!list.length) return;
    S.busy='file'; renderDoc();
    const n = await uploadFiles(t._id, list).catch(()=>0);
    S.busy=false; renderDoc();
    if(n) toast(`파일 ${n}개를 첨부했습니다.`);
  });
  app.querySelectorAll('[data-rmphoto]').forEach(b=>b.addEventListener('click',async e=>{
    e.preventDefault();
    const p = b.dataset.rmphoto;
    await patch(t._id,{photos:(t.photos||[]).filter(x=>x!==p)},'사진을 뺐습니다.');
    api.removePhotos([p]).catch(()=>{});
  }));
  app.querySelector('#photo-in')?.addEventListener('change',async e=>{
    const files=[...e.target.files]; if(!files.length) return;
    S.busy=true; renderDoc();
    const added=[];
    for(const f of files){
      try{ added.push(await api.uploadPhoto(t._id, f)); }
      catch(err){ toast(err?.tooLarge?'20MB보다 큰 사진은 올릴 수 없습니다.':'사진 한 장을 올리지 못했습니다.'); }
    }
    S.busy=false;
    const cur = S.tickets.find(x=>x._id===t._id);
    if(added.length) await patch(t._id,{photos:[...(cur?.photos||[]),...added]},`사진 ${added.length}장을 추가했습니다.`);
    else renderDoc();
  });
}
/** 단계를 바꾸면서 연락일·완료일을 비어 있으면 오늘로 채우고, 진행 기록에 남긴다. */
function stagePatch(t, s){
  const p = {stage:s}, today = todayStr(), i = STAGES.indexOf(s);
  if(i>=1 && !t.contactedAt) p.contactedAt = today;
  if(i>=3 && !t.doneAt) p.doneAt = today;
  return p;
}
async function setStage(t, s){
  try{ await api.appendLog(t._id, [{at:new Date().toISOString(), by:S.email, kind:'stage', text:s}], stagePatch(t,s)); toast(`'${s}' 단계로 바꿨습니다.`); }
  catch(_){ toast('저장하지 못했습니다. 인터넷 연결을 확인해 주세요.'); }
}
async function patch(id,data,msg){
  try{ await api.update(id, data); toast(msg); }
  catch(e){ toast('저장하지 못했습니다. 인터넷 연결을 확인해 주세요.'); }
}

/* ---------- 접수 / 수정 ---------- */
function fieldHTML(t,[key,label,type,o]){
  const v = t[key] ?? '';
  const id = 'f_'+key, wide = (o?.wide||type==='textarea')?' wide':'';
  const ph = o?.ph ? ` placeholder="${esc(o.ph)}"` : '';
  let input;
  if(type==='select'){
    const opts = OPT[key];
    input = `<div class="chips" role="radiogroup" aria-label="${esc(label)}">`+opts.map((op,i)=>`<label class="chip"><input type="radio" name="${id}" id="${id}_${i}" value="${esc(op)}" ${op===v?'checked':''}><span>${esc(op)}</span></label>`).join('')+`</div>`;
    if(key==='charge') input += `<div class="auto" id="charge-auto"></div>`;
    return `<div class="fld${wide}"><span class="lbl">${esc(label)}</span>${input}</div>`;
  }
  if(type==='check') return `<div class="fld${wide}"><span class="lbl">${esc(label)}</span><label class="check"><input type="checkbox" id="${id}" ${v?'checked':''}>${esc(o.text)}</label></div>`;
  if(type==='textarea') input = `<textarea id="${id}"${ph}>${esc(v)}</textarea>`;
  else if(type==='date') input = `<input type="date" id="${id}" value="${esc(v)}">`;
  else if(type==='datetime') input = `<input type="datetime-local" id="${id}" value="${esc(v)}">`;
  else if(type==='money') input = `<input type="text" inputmode="numeric" id="${id}" value="${esc(won(v))}" data-money style="text-align:right">`;
  else if(type==='number') input = `<input type="number" id="${id}" value="${esc(v)}"${ph}>`;
  else if(type==='tel') input = `<input type="text" inputmode="tel" id="${id}" value="${esc(v)}"${ph}>`;
  else input = `<input type="text" id="${id}" value="${esc(v)}"${ph}>`;
  if(key==='round') input += `<span class="hint" id="round-hint"></span>`;
  return `<div class="fld${wide}"><label for="${id}">${esc(label)}</label>${input}</div>`;
}
function memberOptions(cur, onlyActive){
  const by = st => S.members.filter(m=>normStatus(m.status)===st).sort((a,b)=>a.name.localeCompare(b.name,'ko'));
  const opt = m => `<option value="${esc(m.email)}" ${m.email===cur?'selected':''}>${esc(m.name)}${m.dept?' · '+esc(m.dept):''}</option>`;
  if(onlyActive) return by('재직').map(opt).join('');
  return GROUPS.map(([st,l])=>{ const list = by(st); return list.length?`<optgroup label="${esc(st)}">${list.map(opt).join('')}</optgroup>`:''; }).join('');
}
function ownerSecHTML(t){
  const ownerSel = t.ownerEmail===NONE || (!t.ownerEmail && t.ownerName) ? NONE : (t.ownerEmail||'');
  return `<div class="grid">
    <div class="fld"><label for="f_ownerEmail">현장 담당자 (마감보고서 담당)</label>
      <select id="f_ownerEmail"><option value="">선택하세요</option>${memberOptions(ownerSel)}<option value="${NONE}" ${ownerSel===NONE?'selected':''}>명단에 없는 사람 (직접 입력)</option></select></div>
    <div class="fld"><label for="f_handlerEmail">처리 담당</label>
      <select id="f_handlerEmail"><option value="">자동 (재직자 현장은 본인, 휴직·퇴사자 현장은 현장팀)</option><option value="${TEAM}" ${t.handlerEmail===TEAM?'selected':''}>현장팀 ${esc(FIELD_TEAM.join('·'))}</option><optgroup label="다른 사람 지정">${memberOptions(t.handlerEmail||'',true)}</optgroup></select></div>
    <div class="fld" data-show="none"><label for="f_ownerName">담당자 이름</label><input type="text" id="f_ownerName" value="${esc(t.ownerName||'')}"></div>
    <div class="fld" data-show="none"><span class="lbl">담당자 상태</span><div class="chips">${OPT.ownerStatus.map((s,i)=>`<label class="chip"><input type="radio" name="f_ownerStatus" id="f_ownerStatus_${i}" value="${s}" ${normStatus(t.ownerStatus)===s?'checked':''}><span>${s}</span></label>`).join('')}</div></div>
    <div class="fld" data-show="out"><label for="f_resignedAt">퇴사일</label><input type="date" id="f_resignedAt" value="${esc(t.resignedAt||'')}"><span class="hint">퇴사 후 1년 안의 AS는 예치금 차감 대상입니다.</span></div>
    <div class="fld wide"><div class="auto" id="owner-auto"></div></div>
  </div>`;
}
function readForm(frm){
  const data = {};
  SECTIONS.forEach(sec=>sec.fields.forEach(([key,,type])=>{
    if(type==='select') data[key] = frm.querySelector(`[name="f_${key}"]:checked`)?.value || '';
    else if(type==='check') data[key] = frm.querySelector('#f_'+key).checked;
    else if(type==='money') data[key] = parseNum(frm.querySelector('#f_'+key).value);
    else if(type==='number') data[key] = parseNum(frm.querySelector('#f_'+key).value);
    else data[key] = frm.querySelector('#f_'+key).value.trim();
  }));
  const oe = frm.querySelector('#f_ownerEmail').value;
  data.ownerEmail = oe && oe!==NONE ? oe : '';
  data.ownerName = oe===NONE ? frm.querySelector('#f_ownerName').value.trim() : (member(oe)?.name||'');
  data.ownerStatus = oe===NONE ? (frm.querySelector('[name="f_ownerStatus"]:checked')?.value||'') : '';
  data.handlerEmail = frm.querySelector('#f_handlerEmail').value || '';
  data.resignedAt = frm.querySelector('#f_resignedAt').value;
  data.costs = {};
  COSTS.forEach(([ck])=>{ data.costs[ck] = {amt:parseNum(frm.querySelector('#c_'+ck+'_amt').value), note:frm.querySelector('#c_'+ck+'_note').value.trim()}; });
  data.costTotal = COSTS.reduce((a,[ck])=>a+(Number(data.costs[ck].amt)||0),0);
  return data;
}
function attachHTML(t){
  const files = t.files||[];
  return `${files.length?`<ul class="files" style="margin-top:12px">${files.map(f=>`<li><span class="ext">${esc(fileExt(f.name))}</span><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(f.name)}</span><span class="size">${esc(fileSize(f.size))}</span></li>`).join('')}</ul>`:''}
    <div class="file-pick"><label class="btn" for="f_files">+ 파일 선택</label><input id="f_files" type="file" multiple hidden><span class="pending" id="pending"></span></div>`;
}
/** 고른 파일을 올리고 AS 기록의 files 목록 뒤에 붙인다. 한 장이 실패해도 나머지는 올린다. */
async function uploadFiles(id, list){
  if(!list.length) return 0;
  const added = [];
  for(const f of list){
    try{ added.push(await api.uploadFile(id, f)); }
    catch(err){ toast(err?.tooLarge ? `${f.name}: 50MB보다 큰 파일은 올릴 수 없습니다.` : `${f.name}을(를) 올리지 못했습니다.`); }
  }
  if(added.length){
    const cur = S.tickets.find(x=>x._id===id);
    await api.update(id, {files:[...(cur?.files||[]), ...added]});
  }
  return added.length;
}
function renderEdit(){
  const editing = S.id ? S.tickets.find(x=>x._id===S.id) : null;
  const t = editing || {receivedAt:todayStr(), stage:'접수', cause:'확인 중', charge:'확인 중'};
  app.innerHTML = `
    <div class="back"><button class="btn ghost" data-act="cancel">← ${editing?'AS 기록으로':'현황판으로'}</button></div>
    <h1 class="page">${editing?'AS 기록 수정':'AS 접수'}</h1>
    <p class="sub">${editing?esc(t.no||''):'현장 정보를 넣고 마감보고서를 첨부하면, 현장 담당자(또는 처리 담당)가 이 기록을 보고 진행합니다. 필요한 칸만 채워도 저장할 수 있습니다.'}</p>
    <form id="frm" novalidate>
      ${SECTIONS.map(sec=>`<section class="form-sec"><h2><i>${sec.no}.</i>${esc(sec.title)}</h2>${sec.guide?`<p class="guide">${esc(sec.guide)}</p>`:''}
        ${sec.owner?ownerSecHTML(t):''}
        ${sec.attach?attachHTML(t):''}
        ${sec.costs?`<table class="cost-in"><thead><tr><th style="width:34%">항목</th><th style="width:28%">금액 (원)</th><th>비고</th></tr></thead><tbody>`+
          COSTS.map(([ck,cl])=>`<tr><td>${cl}</td><td><input class="money" inputmode="numeric" id="c_${ck}_amt" data-money value="${esc(won(t.costs?.[ck]?.amt))}" aria-label="${cl} 금액"></td><td><input id="c_${ck}_note" value="${esc(t.costs?.[ck]?.note||'')}" aria-label="${cl} 비고"></td></tr>`).join('')+
          `<tr class="total"><td>합계</td><td class="num" id="cost-total">0</td><td></td></tr></tbody></table>`:''}
        ${sec.fields.length?`<div class="grid">${sec.fields.map(f=>fieldHTML(t,f)).join('')}</div>`:''}</section>`).join('')}
      <div class="save-bar">
        <button type="button" class="btn" data-act="cancel">취소</button>
        <button type="submit" class="btn primary" id="btn-save">${editing?'변경 내용 저장':'AS 접수 저장'}</button>
      </div>
    </form>`;
  const frm = app.querySelector('#frm');
  app.querySelectorAll('[data-act="cancel"]').forEach(b=>b.onclick=()=>editing?go('doc',editing._id):go('list'));
  frm.querySelectorAll('[data-money]').forEach(inp=>inp.addEventListener('input',()=>{
    const n = parseNum(inp.value); const pos = inp.value.length - inp.selectionStart;
    inp.value = n===''?'':won(n); const p = Math.max(0,inp.value.length-pos); inp.setSelectionRange(p,p); updateAuto();
  }));
  frm.addEventListener('change',updateAuto);
  frm.querySelector('#f_address').addEventListener('input',updateAuto);
  function updateAuto(){
    const d = readForm(frm);
    frm.querySelector('#cost-total').textContent = won(d.costTotal);
    const pend = [...frm.querySelector('#f_files').files];
    frm.querySelector('#pending').textContent = pend.length ? `저장할 때 함께 올립니다: ${pend.map(f=>f.name).join(', ')}` : '';
    const oe = frm.querySelector('#f_ownerEmail').value;
    frm.querySelectorAll('[data-show="none"]').forEach(el=>el.hidden = oe!==NONE);
    const probe = Object.assign({}, t, d);
    const g = groupOf(probe);
    frm.querySelectorAll('[data-show="out"]').forEach(el=>el.hidden = g!=='퇴사');
    if(g==='퇴사' && !frm.querySelector('#f_resignedAt').value){ const r = resignedFromOthers(probe); if(r){ frm.querySelector('#f_resignedAt').value = r; probe.resignedAt = r; } }
    const h = handlerLabel(probe), dep = deposit(probe);
    const box = frm.querySelector('#owner-auto');
    if(!oe) box.innerHTML = '현장 담당자를 고르면 재직·휴직·퇴사 구분과 처리 담당이 자동으로 정해집니다.';
    else box.innerHTML = `구분: <b class="gtag g-${esc(g)}">${esc(groupLabel(g))}</b> · 처리 담당: ${h?`<b>${esc(h)}</b>`:'<span class="flag hot">지정 필요</span> 현장 담당자 상태를 확인하거나 처리할 사람을 골라 주세요'}${dep?` · <span class="flag ${dep.cls}">${esc(dep.label)}</span>`:''}`;
    const w = warranty(probe), ca = frm.querySelector('#charge-auto');
    const careless = d.cause==='고객 사용 부주의';
    ca.innerHTML = `<span class="flag ${w.cls}">${esc(w.label)}</span> ` + (careless ? '고객 부주의로 생긴 AS는 비용이 발생할 수 있습니다.' : w.k==='in' ? '준공 후 1년 안이라 원칙적으로 무상입니다.' : w.k==='out' ? '보증 기간이 지나 부품비·출장비가 발생할 수 있습니다. 고객에게 미리 안내해 주세요.' : '준공일이나 시공 연도를 넣으면 보증 기간을 계산합니다.');
    const sr = suggestRound(d.address, editing?._id);
    frm.querySelector('#round-hint').textContent = sr>1 ? `같은 주소로 이전 AS ${sr-1}건이 있습니다 → ${sr}차` : (sr===1 ? '이 주소의 첫 AS입니다' : '');
  }
  updateAuto();
  frm.addEventListener('submit',async e=>{
    e.preventDefault();
    if(S.offline){ toast('데이터베이스에 연결되지 않아 저장할 수 없습니다.'); return; }
    const data = readForm(frm);
    if(!data.stage) data.stage = '접수';
    if(!data.round) data.round = suggestRound(data.address, editing?._id) || 1;
    if(!data.no) data.no = editing?.no || nextNo();
    Object.assign(data, stagePatch(Object.assign({}, editing||{}, data), data.stage));
    const btn = frm.querySelector('#btn-save'); btn.disabled = true; btn.textContent='저장 중…';
    const now = new Date().toISOString();
    try{
      if(editing){
        const logs = (editing.stage||'접수')!==data.stage ? [{at:now, by:S.email, kind:'stage', text:data.stage}] : [];
        await api.appendLog(editing._id, logs, data);
        await uploadFiles(editing._id, [...frm.querySelector('#f_files').files]);
        toast('저장했습니다.'); go('doc',editing._id);
      } else {
        data.photos=[]; data.files=[]; data.createdBy=S.email||null;
        data.log=[{at:now, by:S.email, kind:'stage', text:'접수'}];
        if(data.stage!=='접수') data.log.push({at:now, by:S.email, kind:'stage', text:data.stage});
        const pend = [...frm.querySelector('#f_files').files];
        const newId = await api.insert(data);
        await uploadFiles(newId, pend);
        toast(`${data.no} AS를 접수했습니다.`); go('doc',newId);
      }
    }catch(err){
      btn.disabled=false; btn.textContent= editing?'변경 내용 저장':'AS 접수 저장';
      toast('저장하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.');
    }
  });
}
function resignedFromOthers(d){
  const key = ownerKey(d); if(!key) return '';
  const hit = S.tickets.filter(x=>x.resignedAt && ownerKey(x)===key).sort((a,b)=>String(b.receivedAt).localeCompare(String(a.receivedAt)))[0];
  return hit?.resignedAt || '';
}
/** 담당자별로 묶는 열쇠. 명단에 있으면 이메일, 없으면 이름. 뒤에 표시용 이름을 붙인다. */
function ownerKey(t){ const o = ownerOf(t); return o.email ? o.email+'|'+o.name : (o.name ? '@'+o.name+'|'+o.name : ''); }

/* ---------- 담당자별 ---------- */
function renderPeople(){
  const map = new Map();
  S.tickets.forEach(t=>{
    const k = ownerKey(t) || '|담당자 미입력';
    if(!map.has(k)) map.set(k, {key:k, o:ownerOf(t), g:groupOf(t), list:[]});
    map.get(k).list.push(t);
  });
  const rank = {'퇴사':0,'휴직':1,'재직':2,'미확인':3};
  const rows = [...map.values()].map(r=>{
    const open = r.list.filter(isOpen).length;
    const cost = r.list.reduce((a,t)=>a+costTotal(t),0);
    const depCost = r.list.filter(t=>deposit(t)?.k==='yes').reduce((a,t)=>a+costTotal(t),0);
    const depN = r.list.filter(t=>deposit(t)?.k==='yes').length;
    const resigned = r.list.map(t=>t.resignedAt).filter(Boolean).sort().pop()||'';
    return Object.assign(r,{open,cost,depCost,depN,resigned});
  }).sort((a,b)=>rank[a.g]-rank[b.g] || b.open-a.open || b.list.length-a.list.length);
  const tot = g => rows.filter(r=>r.g===g).reduce((a,r)=>a+r.list.length,0);
  app.innerHTML = `
    <h1 class="page">담당자별 AS</h1>
    <p class="sub">현장 담당자(마감보고서 담당) 기준으로 묶었습니다. 퇴사자는 퇴사 후 1년 안에 생긴 AS 비용을 예치금 정산에 씁니다. 행을 누르면 그 사람의 AS만 현황판에 보입니다.</p>
    <div class="kpis">
      ${GROUPS.map(([g,l])=>`<div class="kpi"><small>${esc(l)}</small><strong>${tot(g)}<em>건</em></strong></div>`).join('')}
      <div class="kpi"><small>예치금 차감 대상 비용</small><strong>${won(rows.reduce((a,r)=>a+r.depCost,0))}<em>원</em></strong></div>
    </div>
    ${rows.length?`<div class="tbl-wrap"><table class="ledger"><thead><tr><th>현장 담당자</th><th>상태</th><th class="num">전체</th><th class="num">진행 중</th><th class="num">비용 합계(원)</th><th>퇴사일</th><th class="num">예치금 차감(원)</th></tr></thead><tbody>
      ${rows.map(r=>`<tr data-owner="${esc(r.key)}" tabindex="0">
        <td class="cust"><b>${esc(r.o.name||'담당자 미입력')}</b><span>${esc(r.o.dept||'')}</span></td>
        <td class="g-${esc(r.g)}"><span class="gtag">${esc(r.g==='미확인'?'미확인':r.g)}</span></td>
        <td class="num" data-c="hide">${r.list.length}</td>
        <td class="num">${r.open||''}</td>
        <td class="num" data-c="hide">${won(r.cost)||''}</td>
        <td data-c="hide">${esc(r.resigned)}</td>
        <td class="num" data-c="hide">${r.depN?`<b>${won(r.depCost)||'0'}</b> <span class="guide">(${r.depN}건)</span>`:''}</td>
      </tr>`).join('')}
    </tbody></table></div>`:`<div class="empty"><h3>아직 AS가 없습니다</h3></div>`}`;
  app.querySelectorAll('[data-owner]').forEach(tr=>{
    const open = ()=>{ S.f = {group:'전체', stage:'전체', q:'', mine:false, alert:'', owner:tr.dataset.owner.startsWith('|')?'':tr.dataset.owner}; go('list'); };
    tr.addEventListener('click',open); tr.addEventListener('keydown',e=>{ if(e.key==='Enter') open(); });
  });
}

/* ---------- 처리 기준 ---------- */
function renderGuide(){
  app.innerHTML = `
    <h1 class="page">AS 처리 기준</h1>
    <p class="sub">업무지원포털의 A/S·예치금 안내를 정리했습니다. 바뀌면 관리자에게 알려 주세요.</p>
    <section class="form-sec">
      <h2>흐름</h2>
      <div class="flow"><span class="key">AS 접수 · 현장 정보 입력</span><i>+</i><span class="key">마감보고서 첨부</span><i>→</i><span>재직·휴직·퇴사 구분</span><i>→</i>${STAGES.slice(1).map(s=>`<span>${esc(s)}</span>`).join('<i>→</i>')}</div>
      <p class="guide" style="margin-top:12px">예전에는 카톡 단톡방으로 접수 내용을 보냈지만, 이제는 이 앱에서 접수합니다. 접수할 때 현장 정보를 넣고 그 현장의 <b>마감보고서</b>를 첨부하면, 현장 담당자(휴직·퇴사자 현장은 처리 담당)가 '내가 처리할 AS'에서 보고 진행합니다.</p>
      <p class="guide" style="margin-top:12px">접수 안내를 받으면 하루 안에 고객에게 연락하고 '고객 연락' 단계로 바꿔 주세요. 하루가 지나도 '접수'에 머물면 현황판에 <b>미연락</b>으로 표시됩니다. 통화·방문·협의 내용은 AS 기록의 <b>진행 기록</b>에 남깁니다.</p>
    </section>
    <section class="form-sec">
      <h2>현장 담당자 구분</h2>
      <p class="guide">현장 담당자의 상태는 업무지원포털 '직원' 시트에서 10분마다 가져옵니다.</p>
      <div class="rules">
        <div class="rule"><h3>재직자 현장</h3><ul><li>현장 담당자 본인이 처리합니다.</li><li>처리 담당을 '자동'으로 두면 본인으로 잡힙니다.</li></ul></div>
        <div class="rule"><h3>휴직자 현장</h3><ul><li>현장팀 ${esc(FIELD_TEAM.join('·'))} 프로가 진행합니다. (자동 배정)</li><li>다른 사람이 맡을 때만 처리 담당을 바꿉니다.</li></ul></div>
        <div class="rule"><h3>퇴사자 현장</h3><ul><li>현장팀 ${esc(FIELD_TEAM.join('·'))} 프로가 진행합니다. (자동 배정)</li><li>퇴사 후 1년 안에 생긴 AS 비용은 그 사람의 예치금에서 뺍니다.</li><li>1년이 지나면 남은 예치금을 돌려줍니다.</li></ul></div>
      </div>
    </section>
    <section class="form-sec">
      <h2>비용</h2>
      <table class="std"><tbody>
        <tr><th style="width:180px">준공 후 1년 이내</th><td>A/S를 무상으로 제공합니다. (준공일 기준, 접수일로 판단)</td></tr>
        <tr><th>고객 부주의</th><td>기간과 관계없이 별도 비용이 발생할 수 있습니다.</td></tr>
        <tr><th>보증 기간 경과</th><td>부품비·출장비 등 비용 발생 가능성을 고객에게 <b>미리</b> 안내하고, '비용 안내'에 체크합니다.</td></tr>
        <tr><th>예치금</th><td>정산 때마다 20만 원씩 24회, 480만 원까지 적립. 퇴사 후 1년 동안 담당 현장 AS 비용을 차감합니다.</td></tr>
      </tbody></table>
    </section>`;
}

function renderBlocked(){
  app.innerHTML = `<div class="login"><h1 class="page">접속할 수 없는 계정입니다</h1>
    <p class="sub">${esc(S.email||'')} 은(는) 업무지원포털 직원 명단에 없거나 재직 중이 아닙니다. 포털에 등록된 이메일로 다시 로그인하거나 관리자에게 문의하세요.</p>
    <button class="btn" id="blk-out">다른 이메일로 로그인</button></div>`;
  app.querySelector('#blk-out').onclick = ()=>sb.auth.signOut();
}

/* ---------- 로그인 (클레임 보고서와 같은 계정·세션) ---------- */
function renderLogin(){
  if(!S.authReady){ app.innerHTML = `<div class="empty" style="margin-top:28px"><h3>불러오는 중입니다</h3></div>`; return; }
  app.innerHTML = `
    <div class="login">
      <h1 class="page">로그인</h1>
      <p class="sub">업무지원포털에 등록된 이메일로 6자리 로그인 코드를 받아 접속합니다. 비밀번호는 없습니다.</p>
      <form id="lf" class="form-sec" novalidate>
        <div class="fld"><label for="login-email">이메일 (업무지원포털과 같은 주소)</label><input type="text" id="login-email" inputmode="email" autocomplete="email" placeholder="name@homeludens.co.kr"></div>
        <button type="submit" class="btn primary" id="login-send" style="margin-top:12px">로그인 코드 받기</button>
      </form>
      <form id="cf" class="form-sec" novalidate hidden>
        <p class="guide" id="code-msg"></p>
        <div class="fld"><label for="login-code">메일로 받은 6자리 코드</label><input type="text" id="login-code" inputmode="numeric" autocomplete="one-time-code" maxlength="10"></div>
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button type="submit" class="btn primary">확인</button><button type="button" class="btn ghost" id="code-back">이메일 다시 입력</button></div>
      </form>
    </div>`;
  const lf = app.querySelector('#lf'), cf = app.querySelector('#cf');
  let email = '';
  lf.addEventListener('submit', async e=>{
    e.preventDefault();
    email = app.querySelector('#login-email').value.trim().toLowerCase();
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ toast('이메일 주소를 확인해 주세요.'); return; }
    const btn = app.querySelector('#login-send'); btn.disabled = true; btn.textContent = '보내는 중…';
    const {error} = await sb.auth.signInWithOtp({email, options:{shouldCreateUser:true}});
    btn.disabled = false; btn.textContent = '로그인 코드 받기';
    if(error){ toast(error.status===429 ? '잠시 후 다시 시도해 주세요. 코드는 1분에 한 번 보낼 수 있습니다.' : '코드를 보내지 못했습니다. 이메일 주소를 확인해 주세요.'); return; }
    lf.hidden = true; cf.hidden = false;
    app.querySelector('#code-msg').textContent = `${email}로 6자리 코드를 보냈습니다. 메일에 적힌 코드를 입력하세요. (몇 분 안에 안 오면 스팸함도 확인해 주세요)`;
    app.querySelector('#login-code').focus();
  });
  app.querySelector('#code-back').addEventListener('click', ()=>{ cf.hidden = true; lf.hidden = false; });
  cf.addEventListener('submit', async e=>{
    e.preventDefault();
    const token = app.querySelector('#login-code').value.replace(/\D/g,'');
    const {error} = await sb.auth.verifyOtp({email, token, type:'email'});
    if(error) toast('코드가 맞지 않거나 만료되었습니다. 새 코드를 받아 주세요.');
  });
}

/* ---------- Supabase 연결 ---------- */
const CFG = window.CLAIM_APP_CONFIG || {};
const BUCKET = 'claim-photos', FILES = 'as-files', TABLE = 'as_tickets';
const configured = window.supabase && CFG.supabaseUrl && CFG.supabaseAnonKey && !/YOUR-/.test(CFG.supabaseUrl+CFG.supabaseAnonKey);
const sb = configured ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey) : null;

let api = {
  async loadAll(){
    const {data, error} = await sb.from(TABLE).select('id,data').order('created_at', {ascending:true});
    if(error) throw error;
    S.tickets = data.map(r=>Object.assign({}, r.data, {_id:r.id}));
    S.loaded = true;
  },
  async insert(d){
    const {data, error} = await sb.from(TABLE).insert({data:d}).select('id').single();
    if(error) throw error;
    await api.loadAll();
    return data.id;
  },
  /** 다른 사람이 방금 기록을 남겼을 수 있으니 최신 내용 위에 합치고, 진행 기록은 뒤에 붙인다. */
  async appendLog(id, entries, patch){
    const {data:fresh, error:readErr} = await sb.from(TABLE).select('data').eq('id', id).single();
    if(readErr) throw readErr;
    const next = Object.assign({}, fresh.data, patch||{}, {updatedAt:new Date().toISOString()});
    next.log = [...(fresh.data.log||[]), ...(entries||[])];
    const {error} = await sb.from(TABLE).update({data:next}).eq('id', id);
    if(error) throw error;
    await api.loadAll();
    if(S.view==='doc' && S.id===id) render();
  },
  async update(id, patch){ return api.appendLog(id, [], patch); },
  async remove(id){
    const cur = S.tickets.find(x=>x._id===id);
    const {data, error} = await sb.from(TABLE).delete().eq('id', id).select('id');
    if(error) throw error;
    if(!data?.length) throw new Error('not allowed');
    if(cur?.photos?.length) await api.removePhotos(cur.photos).catch(()=>{});
    await api.loadAll();
  },
  async loadMembers(){
    const [emp, adm] = await Promise.all([
      sb.from('employees').select('email,name,dept,title,status,synced_at'),
      sb.from('app_admins').select('email')
    ]);
    if(emp.error) throw emp.error;
    if(adm.error) throw adm.error;
    const admins = new Set(adm.data.map(a=>a.email));
    S.members = emp.data;
    const m = S.members.find(x=>x.email===S.email);
    // 관리자(app_admins)는 직원 시트에 없어도 들어온다 — 회사 대표 계정(official@) 같은 경우
    S.staff = (!!m && m.status==='재직') || admins.has(S.email);
    S.me = {isAdmin:S.staff&&admins.has(S.email), name:m?.name||''};
    document.getElementById('who-email').textContent = `${S.me.name||S.email}${S.me.isAdmin?' · 관리자':''}`;
  },
  async uploadPhoto(id, file){
    if(file.size > 20*1024*1024) throw {tooLarge:true};
    const ext = ((file.name||'').split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'') || 'jpg';
    const path = `as/${id}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
    const {error} = await sb.storage.from(BUCKET).upload(path, file, {contentType:file.type||'image/jpeg'});
    if(error) throw error;
    return path;
  },
  async removePhotos(paths){
    const {error} = await sb.storage.from(BUCKET).remove(paths);
    if(error) throw error;
  },
  async uploadFile(id, file){
    if(file.size > 50*1024*1024) throw {tooLarge:true};
    // 저장소 경로에는 한글을 쓸 수 없어 임의 이름으로 올리고, 원래 이름은 기록에 남긴다
    const ext = ((file.name||'').split('.').pop()||'bin').toLowerCase().replace(/[^a-z0-9]/g,'') || 'bin';
    const path = `as/${id}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
    const {error} = await sb.storage.from(FILES).upload(path, file, {contentType:file.type||'application/octet-stream'});
    if(error) throw error;
    return {path, name:file.name, size:file.size, at:new Date().toISOString(), by:S.email};
  },
  async removeFiles(paths){
    const {error} = await sb.storage.from(FILES).remove(paths);
    if(error) throw error;
  },
  async fileUrl(path, name){
    const {data, error} = await sb.storage.from(FILES).createSignedUrl(path, 60*10, {download:name});
    if(error) throw error;
    return data.signedUrl;
  },
  async signUrls(paths){
    const {data} = await sb.storage.from(BUCKET).createSignedUrls(paths, 60*60*6);
    return (data||[]).filter(r=>r.signedUrl && r.path).map(r=>[r.path, r.signedUrl]);
  }
};

async function loadPhotoUrls(paths){
  const need = paths.filter(p=>!S.photoUrls[p]);
  if(need.length) (await api.signUrls(need).catch(()=>[])).forEach(([p,u])=>S.photoUrls[p]=u);
  app.querySelectorAll('img[data-photo]').forEach(img=>{
    const u = S.photoUrls[img.dataset.photo];
    if(u && img.getAttribute('src')!==u){ img.src = u; img.closest('a').href = u; }
  });
}

function subscribe(){
  if(S.chan || !sb) return;
  const refresh = ()=>{ clearTimeout(S._rt); S._rt = setTimeout(async()=>{
    try{ await Promise.all([api.loadAll(), api.loadMembers()]); }catch(_){ return; }
    const typing = app.contains(document.activeElement) && /TEXTAREA|INPUT|SELECT/.test(document.activeElement.tagName);
    if((S.view==='list'||S.view==='doc'||S.view==='people') && !typing) render();
  }, 300); };
  S.chan = sb.channel('as-live')
    .on('postgres_changes', {event:'*', schema:'public', table:TABLE}, refresh)
    .on('postgres_changes', {event:'*', schema:'public', table:'employees'}, refresh)
    .subscribe();
}

function openFromHash(){
  const id = location.hash.slice(1);
  if(id && id!=='demo' && S.tickets.some(t=>t._id===id)){ S.view='doc'; S.id=id; }
}
window.addEventListener('hashchange',()=>{ if(S.loaded){ openFromHash(); render(); } });

async function onSession(session){
  const sameUser = S.session && session && S.session.user.id===session.user.id;
  S.session = session; S.authReady = true;
  S.email = session?.user?.email?.toLowerCase() || null;
  document.getElementById('who-email').textContent = S.email || '';
  if(!session){
    if(S.chan){ sb.removeChannel(S.chan); S.chan = null; }
    S.tickets = []; S.members = []; S.staff = false; S.me = {isAdmin:false, name:''}; S.loaded = false; S.view = 'list';
    render(); return;
  }
  if(sameUser && S.loaded) return;
  render();
  try{ await api.loadMembers(); }
  catch(e){ S.loaded = true; S.offline = true; toast('직원 명단을 불러오지 못했습니다. 새로고침해 주세요.'); render(); return; }
  try{ await api.loadAll(); S.offline = false; }
  catch(e){ S.loaded = true; S.offline = true; toast('AS 데이터를 불러오지 못했습니다.'); }
  openFromHash();
  subscribe();
  render();
}

document.getElementById('btn-logout').addEventListener('click', ()=>sb ? sb.auth.signOut() : location.reload());

/* ---------- 미리보기 (내 컴퓨터에서 #demo 로 열 때만: 가짜 데이터, 저장 안 됨) ---------- */
const DEMO = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && location.hash==='#demo';
if(DEMO){
  document.body.insertAdjacentHTML('afterbegin','<div class="demo-bar">미리보기 — 가짜 데이터입니다. 저장되지 않습니다.</div>');
  const mem = [['kim@x','김도윤','디자인1팀','팀장','재직'],['kwon@x','권혁찬','디자인1팀','디자이너','재직'],['seo@x','서나영','디자인2팀','팀장','휴직'],['park@x','박지후','디자인2팀','디자이너','퇴사'],['lee@x','이수민','디자인1팀','디자이너','재직'],['me@x','나관리','경영지원','대표','재직'],['ks@x','김응수','현장팀','프로','재직'],['mc@x','박명철','현장팀','프로','재직']];
  S.members = mem.map(([email,name,dept,title,status])=>({email,name,dept,title,status}));
  const d = n => { const x = new Date(); x.setDate(x.getDate()-n); return dstr(x); };
  const iso = n => { const x = new Date(); x.setDate(x.getDate()-n); return x.toISOString(); };
  let seq = 0; const mk = o => Object.assign({_id:'demo'+(++seq), photos:[], log:[{at:iso(o._ago||0), by:'me@x', kind:'stage', text:'접수'}], createdBy:'me@x'}, o);
  S.tickets = [
    mk({no:'AS-2026-001', receivedAt:d(0), _ago:0, round:1, channel:'카카오톡', customer:'이가람', phone:'010-0000-1002', address:'서울특별시 은평구 은평로 220, 녹번 이편한세상캐슬 127동 102호', builtYear:2024, ownerEmail:'seo@x', process:'설비', symptom:'세면대와 배수 부위가 분리되어, 물이 배수관으로 정상적으로 내려가지 못하고 외부로 새는 현상', note:'24년 공사 건으로 AS 비용 발생 가능성에 대해 고객님께 사전 안내 완료(부품비/출장비)', costNotice:true, stage:'접수', cause:'확인 중', charge:'확인 중'}),
    mk({no:'AS-2026-002', receivedAt:d(3), _ago:3, round:1, customer:'정하늘', phone:'010-0000-2231', address:'서울특별시 마포구 월드컵북로 100, 101동 803호', finishedAt:d(200), ownerEmail:'kwon@x', process:'도배', symptom:'거실 벽지 이음매 들뜸', stage:'접수', cause:'확인 중', charge:'확인 중'}),
    mk({no:'AS-2026-003', receivedAt:d(6), _ago:6, round:2, customer:'오민재', phone:'010-0000-7781', address:'경기도 고양시 덕양구 화정로 55, 302동 1501호', finishedAt:d(330), ownerEmail:'park@x', resignedAt:d(90), handlerEmail:'lee@x', process:'타일', symptom:'욕실 바닥 타일 줄눈 갈라짐', stage:'일정 확정', contactedAt:d(5), visitAt:d(-2)+'T14:00', vendor:'한빛타일 / 김기사', cause:'시공 하자', charge:'무상', costs:{parts:{amt:30000},trip:{amt:50000},labor:{amt:120000}}, costTotal:200000, costBearer:'담당자 예치금',
      log:[{at:iso(6),by:'me@x',kind:'stage',text:'접수'},{at:iso(5),by:'lee@x',kind:'stage',text:'고객 연락'},{at:iso(5),by:'lee@x',kind:'note',text:'고객 통화. 작년 같은 욕실 줄눈 보수 이력 있음. 사진 받아 타일 업체 전달'},{at:iso(4),by:'lee@x',kind:'stage',text:'일정 확정'}]}),
    mk({no:'AS-2026-004', receivedAt:d(12), _ago:12, round:1, customer:'한서윤', phone:'010-0000-4410', address:'서울특별시 서대문구 통일로 87, 1203호', finishedAt:d(500), ownerEmail:'kim@x', process:'주방', symptom:'싱크대 하부장 문 처짐', stage:'종결', contactedAt:d(12), doneAt:d(8), cause:'노후·자연 마모', charge:'유상', costs:{trip:{amt:30000},parts:{amt:15000}}, costTotal:45000, costBearer:'고객', customerCharge:45000, satisfaction:'만족', result:'경첩 교체', feedback:'빠르게 와 줘서 고맙다고 하심'}),
    mk({no:'AS-2026-005', receivedAt:d(2), _ago:2, round:1, customer:'윤채원', phone:'010-0000-9001', address:'서울특별시 은평구 진관2로 12, 805호', finishedAt:d(150), ownerEmail:'park@x', resignedAt:d(90), process:'전기·조명', symptom:'거실 매입등 2개 점등 불량', stage:'접수', cause:'확인 중', charge:'확인 중'}),
    mk({no:'AS-2026-006', receivedAt:d(9), _ago:9, round:1, customer:'강도현', phone:'010-0000-3321', address:'서울특별시 강서구 공항대로 300, 1102호', builtYear:2025, ownerEmail:'seo@x', handlerEmail:'kwon@x', process:'필름', symptom:'현관 중문 필름 들뜸', stage:'처리 완료', contactedAt:d(9), doneAt:d(1), cause:'시공 하자', charge:'무상', costs:{labor:{amt:80000}}, costTotal:80000, costBearer:'협력업체'})
  ];
  S.tickets.forEach(t=>delete t._ago);
  const save = ()=>{ if(S.view==='doc') render(); };
  api = {
    async loadAll(){}, async loadMembers(){},
    async insert(d0){ const id='demo'+(++seq); S.tickets.push(Object.assign({}, d0, {_id:id})); return id; },
    async appendLog(id, entries, p){ const t = S.tickets.find(x=>x._id===id); Object.assign(t, p||{}); t.log=[...(t.log||[]),...(entries||[])]; save(); },
    async update(id,p){ return api.appendLog(id,[],p); },
    async remove(id){ S.tickets = S.tickets.filter(x=>x._id!==id); },
    async uploadPhoto(id,f){ const u = URL.createObjectURL(f); S.photoUrls[u]=u; return u; },
    async removePhotos(){}, async signUrls(){ return []; },
    async uploadFile(id,f){ return {path:URL.createObjectURL(f), name:f.name, size:f.size, at:new Date().toISOString(), by:S.email}; },
    async removeFiles(){}, async fileUrl(p){ return p; }
  };
  S.session = {user:{id:'demo', email:'me@x'}}; S.authReady = true; S.email = 'me@x'; S.staff = true; S.loaded = true;
  S.me = {isAdmin:true, name:'나관리'};
  document.getElementById('who-email').textContent = '나관리 · 관리자 (미리보기)';
  history.replaceState(null,'',location.pathname);
  render();
} else if(!sb){
  document.getElementById('nav').hidden = true;
  app.innerHTML = `<div class="empty" style="margin-top:28px"><h3>아직 설정되지 않았습니다</h3><p>config.js에 Supabase 주소와 anon 키를 넣어 주세요.</p></div>`;
} else {
  sb.auth.onAuthStateChange((event, session)=>{
    if(event==='INITIAL_SESSION' || event==='SIGNED_IN' || event==='SIGNED_OUT') setTimeout(()=>onSession(session), 0);
  });
  render();
}
})();
