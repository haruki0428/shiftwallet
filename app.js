'use strict';

const KEY='shiftwallet.simple.v4';
const APP_VERSION='4.1';
const V3='shiftwallet.v3';
const V2='shiftwallet.v2';
const V1='shiftwallet.v1';
const $=id=>document.getElementById(id);
const uid=()=>globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`;
const num=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const pad=n=>String(n).padStart(2,'0');
const yen=v=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Math.round(num(v)));
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
function dateKey(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
function todayKey(){return dateKey(new Date())}
function parseDate(s){const [y,m,d]=String(s).split('-').map(Number);return new Date(y,m-1,d,12)}
function monthKey(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}`}
function monthLabel(d){return `${d.getFullYear()}年${d.getMonth()+1}月`}
function addMonths(d,n){return new Date(d.getFullYear(),d.getMonth()+n,1,12)}
function minutesBetween(start,end){if(!start||!end)return 0;const [sh,sm]=start.split(':').map(Number),[eh,em]=end.split(':').map(Number);let a=sh*60+sm,b=eh*60+em;if(b<=a)b+=1440;return Math.max(0,b-a)}
function hoursText(mins){const h=Math.max(0,mins)/60;return `${(Math.round(h*10)/10).toLocaleString('ja-JP')}時間`}
function defaultState(){
  const w={id:uid(),name:'バイト先',hourlyWage:1000,closingDay:10,payday:25};
  const p={id:uid(),workplaceId:w.id,name:'夕方',start:'17:00',end:'21:00',breakMinutes:0};
  return {version:4.1,settings:{monthlyGoal:100000,goalPresetId:p.id},workplaces:[w],presets:[p],shifts:[],fixedCosts:[]};
}
function normalize(s){
  const b=defaultState();
  const o={...b,...s,version:4.1,settings:{...b.settings,...(s?.settings||{})}};
  o.workplaces=Array.isArray(o.workplaces)&&o.workplaces.length?o.workplaces.map(w=>({id:w.id||uid(),name:w.name||'バイト先',hourlyWage:Math.max(0,num(w.hourlyWage??w.wage)),closingDay:Math.min(31,Math.max(1,num(w.closingDay??w.cutoffDay,10))),payday:Math.min(31,Math.max(1,num(w.payday??w.payDay,25)))})):b.workplaces;
  const wp0=o.workplaces[0].id;
  o.presets=Array.isArray(o.presets)?o.presets.map(p=>({id:p.id||uid(),workplaceId:o.workplaces.some(w=>w.id===p.workplaceId)?p.workplaceId:wp0,name:p.name||'シフト',start:p.start||'17:00',end:p.end||'21:00',breakMinutes:Math.max(0,num(p.breakMinutes??p.breakMins))})):[];
  o.shifts=Array.isArray(o.shifts)?o.shifts.map(x=>({id:x.id||uid(),date:x.date||todayKey(),workplaceId:o.workplaces.some(w=>w.id===x.workplaceId)?x.workplaceId:wp0,presetId:x.presetId||'',start:x.start||x.planned?.start||'17:00',end:x.end||x.planned?.end||'21:00',breakMinutes:Math.max(0,num(x.breakMinutes??x.breakMins??x.planned?.breakMinutes))})):[];
  o.fixedCosts=Array.isArray(o.fixedCosts)?o.fixedCosts.map(f=>({id:f.id||uid(),name:f.name||'固定費',amount:Math.max(0,num(f.amount))})).filter(f=>f.amount>=0):[];
  o.settings.monthlyGoal=Math.max(0,num(o.settings.monthlyGoal??o.settings.salaryGoal,100000));
  if(!o.presets.some(p=>p.id===o.settings.goalPresetId))o.settings.goalPresetId=o.presets[0]?.id||'';
  return o;
}
function migrateV3(v){
  const wageHistory=Array.isArray(v.wageHistory)?v.wageHistory:[];
  const workplaces=(v.workplaces||[]).map(w=>{
    const ws=wageHistory.filter(x=>x.workplaceId===w.id).sort((a,b)=>String(a.effectiveFrom).localeCompare(String(b.effectiveFrom)));
    return {id:w.id||uid(),name:w.name||'バイト先',hourlyWage:num(ws.at(-1)?.hourlyWage??w.hourlyWage),closingDay:Math.min(31,Math.max(1,num(w.closingDay??w.cutoffDay,10))),payday:Math.min(31,Math.max(1,num(w.payday??w.payDay,25)))};
  });
  const fallback=workplaces[0]?.id||uid();
  const presets=(v.presets||[]).map(p=>({id:p.id||uid(),workplaceId:p.workplaceId||fallback,name:p.name||'シフト',start:p.start||'17:00',end:p.end||'21:00',breakMinutes:num(p.breakMinutes??p.breakMins)}));
  const shifts=(v.shifts||[]).map(x=>({id:x.id||uid(),date:x.date||todayKey(),workplaceId:x.workplaceId||fallback,presetId:x.presetId||'',start:x.planned?.start||x.start||'17:00',end:x.planned?.end||x.end||'21:00',breakMinutes:num(x.planned?.breakMinutes??x.breakMinutes??x.breakMins)}));
  const fixedCosts=(v.fixedCosts||[]).filter(f=>f.enabled!==false&&(!f.recurrence||f.recurrence==='monthly')).map(f=>({id:f.id||uid(),name:f.name||'固定費',amount:num(f.priceHistory?.at?.(-1)?.amount??f.amount)}));
  return normalize({version:4.1,settings:{monthlyGoal:num(v.settings?.salaryGoal??v.settings?.monthlyGoal,100000),goalPresetId:v.settings?.goalPresetId||''},workplaces:workplaces.length?workplaces:undefined,presets,shifts,fixedCosts});
}
function load(){
  try{
    const own=localStorage.getItem(KEY);if(own)return normalize(JSON.parse(own));
    const v3=localStorage.getItem(V3);if(v3){const m=migrateV3(JSON.parse(v3));localStorage.setItem(KEY,JSON.stringify(m));return m}
    const v2=localStorage.getItem(V2);if(v2){const m=migrateV3(JSON.parse(v2));localStorage.setItem(KEY,JSON.stringify(m));return m}
    const v1=localStorage.getItem(V1);if(v1){const old=JSON.parse(v1);const m=normalize({settings:{monthlyGoal:num(old.settings?.monthlyGoal,100000)},workplaces:old.workplaces||[],presets:old.presets||[],shifts:old.shifts||[],fixedCosts:old.fixedCosts||[]});localStorage.setItem(KEY,JSON.stringify(m));return m}
  }catch(e){console.error(e)}
  return defaultState();
}
let state=load();
let viewMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1,12);
let selectedPresetId='';
let deferredInstallPrompt=null;
function save(){state=normalize(state);localStorage.setItem(KEY,JSON.stringify(state));renderAll()}
function workplace(id){return state.workplaces.find(w=>w.id===id)||state.workplaces[0]}
function preset(id){return state.presets.find(p=>p.id===id)}
function calcShift(s){const gross=minutesBetween(s.start,s.end),paid=Math.max(0,gross-num(s.breakMinutes));return {minutes:paid,pay:Math.round(paid/60*num(workplace(s.workplaceId)?.hourlyWage))}}
function calcPreset(p){if(!p)return {minutes:0,pay:0};return calcShift({workplaceId:p.workplaceId,start:p.start,end:p.end,breakMinutes:p.breakMinutes})}
function monthShifts(key){return state.shifts.filter(s=>s.date.startsWith(key)).sort((a,b)=>a.date.localeCompare(b.date)||a.start.localeCompare(b.start))}
function sumPay(list){return list.reduce((a,s)=>a+calcShift(s).pay,0)}
function fixedTotal(){return state.fixedCosts.reduce((a,f)=>a+num(f.amount),0)}
function daysInMonth(y,m){return new Date(y,m+1,0,12).getDate()}
function dayInMonth(y,m,day){return new Date(y,m,Math.min(daysInMonth(y,m),Math.max(1,num(day,1))),12)}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function nextPayrollFor(w,ref=new Date()){
  const today=parseDate(dateKey(ref));
  for(let offset=-1;offset<=4;offset++){
    const cm=new Date(today.getFullYear(),today.getMonth()+offset,1,12);
    const close=dayInMonth(cm.getFullYear(),cm.getMonth(),w.closingDay);
    const prevMonth=new Date(cm.getFullYear(),cm.getMonth()-1,1,12);
    const prevClose=dayInMonth(prevMonth.getFullYear(),prevMonth.getMonth(),w.closingDay);
    const payMonthOffset=num(w.payday)<=num(w.closingDay)?1:0;
    const pm=new Date(cm.getFullYear(),cm.getMonth()+payMonthOffset,1,12);
    const payDate=dayInMonth(pm.getFullYear(),pm.getMonth(),w.payday);
    if(payDate>=today)return {start:addDays(prevClose,1),end:close,payDate};
  }
  return null
}
function workplacePayrollEstimate(w,ref=new Date()){
  const p=nextPayrollFor(w,ref);if(!p)return null;
  const start=dateKey(p.start),end=dateKey(p.end);
  const shifts=state.shifts.filter(s=>s.workplaceId===w.id&&s.date>=start&&s.date<=end);
  return {...p,pay:sumPay(shifts),count:shifts.length}
}
function shortDate(d){return `${d.getMonth()+1}/${d.getDate()}`}
function payDateLabel(d){return `${d.getMonth()+1}月${d.getDate()}日`}
function toast(text){const t=$('toast');t.textContent=text;t.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove('show'),1500)}
function openDialog(id){$(id).showModal()}
function closeDialogs(){document.querySelectorAll('dialog[open]').forEach(d=>d.close())}
function formatShiftLine(s){const p=preset(s.presetId),w=workplace(s.workplaceId);return `${w.name} · ${p?.name||`${s.start}–${s.end}`}`}

function renderAll(){renderHome();renderSettings();renderShiftPage();renderSelects()}
function renderHome(){
  const now=new Date(),mk=monthKey(now),all=monthShifts(mk),today=todayKey(),current=all.filter(s=>s.date<=today),planned=sumPay(all),cur=sumPay(current),fixed=fixedTotal();
  $('currentMonthLabel').textContent=monthLabel(now);
  $('currentIncome').textContent=yen(cur);$('plannedIncome').textContent=yen(planned);
  $('currentAfterFixed').textContent=yen(cur-fixed);$('plannedAfterFixed').textContent=yen(planned-fixed);$('fixedTotalHome').textContent=yen(fixed);
  const payrolls=state.workplaces.map(w=>({w,p:workplacePayrollEstimate(w,now)})).filter(x=>x.p);
  $('nextPayrollList').innerHTML=payrolls.length?payrolls.map(({w,p})=>`<div class="quiet-row"><div class="quiet-main"><b>${esc(w.name)}</b><div class="pay-period">${shortDate(p.start)}〜${shortDate(p.end)}勤務分</div><div class="pay-cycle">${num(w.closingDay)}日〆 · ${num(w.payday)}日給料</div></div><div class="quiet-side"><div class="pay-date">${payDateLabel(p.payDate)}</div><b>${yen(p.pay)}</b></div></div>`).join(''):'<div class="empty">バイト先を設定してください</div>';
  const goal=num(state.settings.monthlyGoal),remaining=Math.max(0,goal-planned),pct=goal?Math.min(100,planned/goal*100):0;
  $('goalAmountHome').textContent=yen(goal);$('goalRemainingHome').textContent=remaining?yen(remaining):'達成';$('goalProgress').style.width=`${pct}%`;
  const gp=preset(state.settings.goalPresetId),cp=calcPreset(gp),need=remaining<=0?0:(cp.pay?Math.ceil(remaining/cp.pay):null);
  $('goalShiftNeed').textContent=remaining<=0?'目標に到達しています':need===null?'時給・プリセットを設定してください':`あと ${need}回（${hoursText(need*cp.minutes)}）`;
  const future=state.shifts.filter(s=>s.date>=today).sort((a,b)=>a.date.localeCompare(b.date)||a.start.localeCompare(b.start)).slice(0,3);
  $('nextShift').innerHTML=future.length?future.map(s=>`<div class="quiet-row"><div class="quiet-main"><b>${esc(formatShiftLine(s))}</b><small>${esc(s.date.replaceAll('-','/'))}　${esc(s.start)}–${esc(s.end)}　休憩${num(s.breakMinutes)}分</small></div><div class="quiet-side"><b>${yen(calcShift(s).pay)}</b></div></div>`).join(''):'<div class="empty">予定はありません</div>';
}
function renderSelects(){
  const wpOpts=state.workplaces.map(w=>`<option value="${w.id}">${esc(w.name)}</option>`).join('');
  ['presetWorkplace','shiftWorkplace'].forEach(id=>{const el=$(id);const old=el.value;el.innerHTML=wpOpts;if(state.workplaces.some(w=>w.id===old))el.value=old});
  const pOpts=state.presets.map(p=>`<option value="${p.id}">${esc(p.name)}｜${esc(workplace(p.workplaceId).name)}</option>`).join('');
  ['goalPresetHome','goalPresetSetting'].forEach(id=>{const el=$(id);el.innerHTML=state.presets.length?pOpts:'<option value="">プリセットなし</option>';el.value=state.settings.goalPresetId||''});
}
function renderSettings(){
  $('goalAmountInput').value=num(state.settings.monthlyGoal);$('fixedTotalSetting').textContent=yen(fixedTotal());
  $('fixedList').innerHTML=state.fixedCosts.length?state.fixedCosts.map(f=>`<div class="quiet-row"><div class="quiet-main"><b>${esc(f.name)}</b></div><div class="quiet-side"><b>${yen(f.amount)}</b><div class="row-actions"><button class="mini-link" data-edit-fixed="${f.id}">編集</button><button class="mini-link" data-delete-fixed="${f.id}">削除</button></div></div></div>`).join(''):'<div class="empty">固定費はまだありません</div>';
  $('workplaceList').innerHTML=state.workplaces.map(w=>`<div class="quiet-row"><div class="quiet-main"><b>${esc(w.name)}</b><small>時給 ${yen(w.hourlyWage)}　·　${num(w.closingDay)}日〆 / ${num(w.payday)}日給料</small></div><div class="quiet-side"><div class="row-actions"><button class="mini-link" data-edit-workplace="${w.id}">編集</button><button class="mini-link" data-delete-workplace="${w.id}">削除</button></div></div></div>`).join('');
  $('presetList').innerHTML=state.presets.length?state.presets.map(p=>`<div class="quiet-row"><div class="quiet-main"><b>${esc(p.name)} <span style="font-weight:400;color:var(--muted)">｜ ${esc(workplace(p.workplaceId).name)}</span></b><small>${esc(p.start)}–${esc(p.end)}　休憩${num(p.breakMinutes)}分　約${yen(calcPreset(p).pay)}</small></div><div class="quiet-side"><div class="row-actions"><button class="mini-link" data-edit-preset="${p.id}">編集</button><button class="mini-link" data-delete-preset="${p.id}">削除</button></div></div></div>`).join(''):'<div class="empty">プリセットを作成してください</div>';
}
function renderShiftPage(){
  $('calendarMonthTitle').textContent=monthLabel(viewMonth);
  const presets=state.presets;
  $('calendarPresetStrip').innerHTML=presets.length?presets.map(p=>`<button type="button" class="preset-chip ${selectedPresetId===p.id?'selected':''}" data-select-preset="${p.id}"><b>${esc(p.name)}</b><small>${esc(workplace(p.workplaceId).name)} · ${esc(p.start)}–${esc(p.end)}</small></button>`).join(''):'<div class="empty">設定からプリセットを作成してください</div>';
  const sp=preset(selectedPresetId);$('addModeText').textContent=sp?`「${sp.name}」を追加中`:'追加するプリセットを選択';$('clearPresetSelection').hidden=!sp;
  renderCalendar();
  const list=monthShifts(monthKey(viewMonth));$('shiftCount').textContent=`${list.length}件`;$('viewMonthIncome').textContent=yen(sumPay(list));
}
function renderCalendar(){
  const y=viewMonth.getFullYear(),m=viewMonth.getMonth(),first=new Date(y,m,1,12),start=new Date(y,m,1-first.getDay(),12),today=todayKey(),html=[];
  for(let i=0;i<42;i++){
    const d=new Date(start);d.setDate(start.getDate()+i);const key=dateKey(d),inside=d.getMonth()===m,items=state.shifts.filter(s=>s.date===key),dots=items.slice(0,4).map(()=>'<i class="shift-dot"></i>').join(''),more=items.length>4?`<span class="shift-more">+${items.length-4}</span>`:'';
    html.push(`<button type="button" class="day ${inside?'':'outside'} ${key===today?'today':''} ${selectedPresetId?'addable':''}" data-date="${key}"><span class="day-num">${d.getDate()}</span>${items.length?`<span class="day-dots">${dots}${more}</span>`:''}</button>`);
  }
  $('calendar').innerHTML=html.join('');
}
function openDay(date){
  const items=state.shifts.filter(s=>s.date===date).sort((a,b)=>a.start.localeCompare(b.start));$('dayDialogTitle').textContent=date.replaceAll('-','/');
  $('dayShiftList').innerHTML=items.length?items.map(s=>`<div class="quiet-row"><div class="quiet-main"><b>${esc(formatShiftLine(s))}</b><small>${esc(s.start)}–${esc(s.end)}　休憩${num(s.breakMinutes)}分</small></div><div class="quiet-side"><b>${yen(calcShift(s).pay)}</b><div class="row-actions"><button type="button" class="mini-link" data-edit-shift="${s.id}">編集</button><button type="button" class="mini-link" data-delete-shift="${s.id}">削除</button></div></div></div>`).join(''):'<div class="empty">この日のシフトはありません</div>';
  openDialog('dayDialog');
}
function addPresetToDate(p,date){
  const duplicate=state.shifts.some(s=>s.date===date&&s.presetId===p.id&&s.start===p.start&&s.end===p.end);
  if(duplicate){toast('同じプリセットはすでに入っています');return}
  state.shifts.push({id:uid(),date,workplaceId:p.workplaceId,presetId:p.id,start:p.start,end:p.end,breakMinutes:num(p.breakMinutes)});save();toast(`${date.slice(5).replace('-','/')} に追加しました`)
}
function openWorkplaceEditor(id=''){
  const w=state.workplaces.find(x=>x.id===id);$('workplaceDialogTitle').textContent=w?'バイト先を編集':'バイト先を追加';$('workplaceId').value=w?.id||'';$('workplaceName').value=w?.name||'';$('workplaceWage').value=w?.hourlyWage??'';$('workplaceClosingDay').value=w?.closingDay??10;$('workplacePayday').value=w?.payday??25;openDialog('workplaceDialog')
}
function openPresetEditor(id=''){
  renderSelects();const p=state.presets.find(x=>x.id===id);$('presetDialogTitle').textContent=p?'プリセットを編集':'プリセットを追加';$('presetId').value=p?.id||'';$('presetWorkplace').value=p?.workplaceId||state.workplaces[0]?.id||'';$('presetName').value=p?.name||'';$('presetStart').value=p?.start||'17:00';$('presetEnd').value=p?.end||'21:00';$('presetBreak').value=p?.breakMinutes??0;openDialog('presetDialog')
}
function openFixedEditor(id=''){
  const f=state.fixedCosts.find(x=>x.id===id);$('fixedDialogTitle').textContent=f?'固定費を編集':'固定費を追加';$('fixedId').value=f?.id||'';$('fixedName').value=f?.name||'';$('fixedAmount').value=f?.amount??'';openDialog('fixedDialog')
}
function openShiftEditor(id){
  const s=state.shifts.find(x=>x.id===id);if(!s)return;renderSelects();$('shiftId').value=s.id;$('shiftDate').value=s.date;$('shiftWorkplace').value=s.workplaceId;$('shiftStart').value=s.start;$('shiftEnd').value=s.end;$('shiftBreak').value=s.breakMinutes;closeDialogs();openDialog('shiftDialog')
}
function deleteWorkplace(id){
  if(state.workplaces.length<=1){toast('最後のバイト先は削除できません');return}
  const w=workplace(id);if(!confirm(`「${w.name}」と関連するプリセット・シフトを削除しますか？`))return;
  state.workplaces=state.workplaces.filter(x=>x.id!==id);const presetIds=new Set(state.presets.filter(p=>p.workplaceId===id).map(p=>p.id));state.presets=state.presets.filter(p=>p.workplaceId!==id);state.shifts=state.shifts.filter(s=>s.workplaceId!==id);if(presetIds.has(state.settings.goalPresetId))state.settings.goalPresetId=state.presets[0]?.id||'';if(presetIds.has(selectedPresetId))selectedPresetId='';save()
}
function downloadBackup(){const a=document.createElement('a');const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});a.href=URL.createObjectURL(blob);a.download=`shiftwallet-backup-${todayKey()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}

// navigation
document.querySelectorAll('[data-nav]').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('[data-nav]').forEach(x=>x.classList.toggle('active',x===btn));document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.dataset.page===btn.dataset.nav));if(btn.dataset.nav==='shifts')renderShiftPage();window.scrollTo({top:0,behavior:'instant'})}));
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',closeDialogs));

$('prevMonth').onclick=()=>{viewMonth=addMonths(viewMonth,-1);renderShiftPage()};$('nextMonth').onclick=()=>{viewMonth=addMonths(viewMonth,1);renderShiftPage()};
$('clearPresetSelection').onclick=()=>{selectedPresetId='';renderShiftPage()};
$('calendarPresetStrip').addEventListener('click',e=>{const b=e.target.closest('[data-select-preset]');if(!b)return;selectedPresetId=selectedPresetId===b.dataset.selectPreset?'':b.dataset.selectPreset;renderShiftPage()});
$('calendar').addEventListener('click',e=>{const b=e.target.closest('[data-date]');if(!b)return;const p=preset(selectedPresetId);if(p)addPresetToDate(p,b.dataset.date);else openDay(b.dataset.date)});
$('goalPresetHome').onchange=e=>{state.settings.goalPresetId=e.target.value;save()};
$('goalPresetSetting').onchange=e=>{state.settings.goalPresetId=e.target.value;save()};
$('goalForm').onsubmit=e=>{e.preventDefault();state.settings.monthlyGoal=Math.max(0,num($('goalAmountInput').value));state.settings.goalPresetId=$('goalPresetSetting').value;save();toast('目標を保存しました')};
$('addWorkplaceBtn').onclick=()=>openWorkplaceEditor();$('addPresetBtn').onclick=()=>openPresetEditor();$('addFixedBtn').onclick=()=>openFixedEditor();
$('workplaceForm').onsubmit=e=>{e.preventDefault();const id=$('workplaceId').value||uid(),item={id,name:$('workplaceName').value.trim(),hourlyWage:Math.max(0,num($('workplaceWage').value)),closingDay:Math.min(31,Math.max(1,num($('workplaceClosingDay').value,10))),payday:Math.min(31,Math.max(1,num($('workplacePayday').value,25)))},i=state.workplaces.findIndex(x=>x.id===id);if(i>=0)state.workplaces[i]=item;else state.workplaces.push(item);save();closeDialogs();toast('保存しました')};
$('presetForm').onsubmit=e=>{e.preventDefault();const id=$('presetId').value||uid(),item={id,workplaceId:$('presetWorkplace').value,name:$('presetName').value.trim(),start:$('presetStart').value,end:$('presetEnd').value,breakMinutes:Math.max(0,num($('presetBreak').value))},i=state.presets.findIndex(x=>x.id===id);if(i>=0)state.presets[i]=item;else state.presets.push(item);if(!state.settings.goalPresetId)state.settings.goalPresetId=id;save();closeDialogs();toast(`休憩${item.breakMinutes}分で保存しました`)};
$('fixedForm').onsubmit=e=>{e.preventDefault();const id=$('fixedId').value||uid(),item={id,name:$('fixedName').value.trim(),amount:Math.max(0,num($('fixedAmount').value))},i=state.fixedCosts.findIndex(x=>x.id===id);if(i>=0)state.fixedCosts[i]=item;else state.fixedCosts.push(item);save();closeDialogs();toast('保存しました')};
$('shiftForm').onsubmit=e=>{e.preventDefault();const s=state.shifts.find(x=>x.id===$('shiftId').value);if(!s)return;s.date=$('shiftDate').value;s.workplaceId=$('shiftWorkplace').value;s.start=$('shiftStart').value;s.end=$('shiftEnd').value;s.breakMinutes=Math.max(0,num($('shiftBreak').value));s.presetId='';save();closeDialogs();toast('シフトを更新しました')};

document.addEventListener('click',e=>{
  const q=a=>e.target.closest(`[${a}]`)?.getAttribute(a);
  const ew=q('data-edit-workplace');if(ew)return openWorkplaceEditor(ew);const dw=q('data-delete-workplace');if(dw)return deleteWorkplace(dw);
  const ep=q('data-edit-preset');if(ep)return openPresetEditor(ep);const dp=q('data-delete-preset');if(dp){if(confirm('このプリセットを削除しますか？ 登録済みシフトは残ります。')){state.presets=state.presets.filter(x=>x.id!==dp);if(state.settings.goalPresetId===dp)state.settings.goalPresetId=state.presets[0]?.id||'';if(selectedPresetId===dp)selectedPresetId='';save()}return}
  const ef=q('data-edit-fixed');if(ef)return openFixedEditor(ef);const df=q('data-delete-fixed');if(df){if(confirm('この固定費を削除しますか？')){state.fixedCosts=state.fixedCosts.filter(x=>x.id!==df);save()}return}
  const es=q('data-edit-shift');if(es)return openShiftEditor(es);const ds=q('data-delete-shift');if(ds){if(confirm('このシフトを削除しますか？')){state.shifts=state.shifts.filter(x=>x.id!==ds);save();closeDialogs();toast('削除しました')}return}
});
$('exportBtn').onclick=downloadBackup;
$('importInput').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{state=normalize(JSON.parse(await f.text()));save();toast('読み込みました')}catch{toast('読み込めませんでした')}e.target.value=''};
$('resetBtn').onclick=()=>{if(confirm('ShiftWalletのデータをすべて削除しますか？')){state=defaultState();selectedPresetId='';localStorage.setItem(KEY,JSON.stringify(state));renderAll();toast('初期化しました')}};
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstallPrompt=e;$('installBtn').hidden=false});$('installBtn').onclick=async()=>{if(!deferredInstallPrompt)return;deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;$('installBtn').hidden=true};
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js?v=4.1.0').catch(console.error));
let lastRenderedDate=todayKey();
function refreshForDateChange(){
  const nowKey=todayKey();if(nowKey===lastRenderedDate)return;
  const previousMonth=lastRenderedDate.slice(0,7),newMonth=nowKey.slice(0,7);
  if(previousMonth!==newMonth&&monthKey(viewMonth)===previousMonth){const d=parseDate(nowKey);viewMonth=new Date(d.getFullYear(),d.getMonth(),1,12)}
  lastRenderedDate=nowKey;renderAll();
}
window.addEventListener('focus',refreshForDateChange);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshForDateChange()});
setInterval(refreshForDateChange,60000);
renderAll();
