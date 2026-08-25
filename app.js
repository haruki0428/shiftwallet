'use strict';

const STORAGE_KEY = 'shiftwallet.v2';
const LEGACY_KEY = 'shiftwallet.v1';
const APP_VERSION = 2;
const $ = (id) => document.getElementById(id);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const pad = (n) => String(n).padStart(2, '0');
const yen = (n) => new Intl.NumberFormat('ja-JP', { style:'currency', currency:'JPY', maximumFractionDigits:0 }).format(Math.round(Number(n) || 0));
const num = (v, fallback=0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const escapeHtml = (s='') => String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

function dateKey(d){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function parseDate(s){ const [y,m,d]=String(s).split('-').map(Number); return new Date(y,m-1,d,12,0,0,0); }
function addDays(d, days){ const x=new Date(d); x.setDate(x.getDate()+days); return x; }
function addMonths(d, months){ const x=new Date(d.getFullYear(), d.getMonth()+months, 1, 12); return x; }
function daysInMonth(y,m0){ return new Date(y,m0+1,0).getDate(); }
function monthKey(d){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}`; }
function monthLabel(d){ return `${d.getFullYear()}年 ${d.getMonth()+1}月`; }
function shortDate(s){ const d=parseDate(s); return `${d.getMonth()+1}/${d.getDate()}`; }
function formatDateJP(s){ const d=parseDate(s); return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`; }
function clampDay(y,m0,day){ return Math.min(Math.max(1, Number(day)||1), daysInMonth(y,m0)); }
function resolveDay(y,m0,value){ return value==='end' ? daysInMonth(y,m0) : clampDay(y,m0,value); }
function makeDate(y,m0,dayValue){ return new Date(y,m0,resolveDay(y,m0,dayValue),12); }
function todayKey(){ return dateKey(new Date()); }
function isFutureDate(s){ return s > todayKey(); }
function hoursText(h){ const x=Math.round(num(h)*10)/10; return `${x.toLocaleString('ja-JP')}h`; }

function createDefaultWorkplace(){
  return {
    id: uid(), name:'バイト先', closingDay:'10', payDay:'25', payLag:0, weekendRule:'none',
    transportPerShift:0, overtimeAfterHours:8, overtimeRate:1.25, nightStart:'22:00', nightEnd:'05:00', nightRate:1.25
  };
}

function defaultState(){
  const wp=createDefaultWorkplace();
  const p1={id:uid(), workplaceId:wp.id, name:'夕方 17-21', start:'17:00', end:'21:00', breakMinutes:0, transportOverride:null};
  const p2={id:uid(), workplaceId:wp.id, name:'ロング 9-17', start:'09:00', end:'17:00', breakMinutes:60, transportOverride:null};
  return {
    version:APP_VERSION,
    settings:{selectedWorkplaceId:wp.id,currentBalance:0,salaryGoal:100000,goalPresetId:p1.id},
    workplaces:[wp],
    wageHistory:[{id:uid(),workplaceId:wp.id,effectiveFrom:'2000-01-01',hourlyWage:1000}],
    presets:[p1,p2], shifts:[], fixedCosts:[], expenses:[], categoryBudgets:[], payslips:[]
  };
}

function migrateLegacy(legacy){
  const base=defaultState();
  const wp=base.workplaces[0];
  const oldWage=num(legacy?.settings?.hourlyWage,1000);
  base.wageHistory=[{id:uid(),workplaceId:wp.id,effectiveFrom:'2000-01-01',hourlyWage:oldWage}];
  base.settings.salaryGoal=num(legacy?.settings?.monthlyGoal,100000);
  base.presets=(legacy?.presets||[]).map(p=>({id:p.id||uid(),workplaceId:wp.id,name:p.name||'シフト',start:p.start||'17:00',end:p.end||'21:00',breakMinutes:num(p.breakMins),transportOverride:null}));
  if(!base.presets.length) base.presets=defaultState().presets.map(p=>({...p,workplaceId:wp.id}));
  const oldGoal=legacy?.settings?.goalPresetId;
  base.settings.goalPresetId=base.presets.find(p=>p.id===oldGoal)?.id || base.presets[0]?.id || '';
  base.shifts=(legacy?.shifts||[]).map(s=>({
    id:s.id||uid(), workplaceId:wp.id, date:s.date||todayKey(),
    planned:{start:s.start||'17:00',end:s.end||'21:00',breakMinutes:num(s.breakMins)},
    actual:s.worked?{start:s.start||'17:00',end:s.end||'21:00',breakMinutes:num(s.breakMins)}:null,
    status:s.worked?'worked':'planned', wageOverride:Number.isFinite(Number(s.wage))?Number(s.wage):null, transportOverride:null, note:s.name||''
  }));
  base.fixedCosts=(legacy?.fixedCosts||[]).map(x=>({id:x.id||uid(),name:x.name||'固定費',amount:num(x.amount),category:'固定費',recurrence:'monthly',month:null,day:'1',enabled:true}));
  base.expenses=(legacy?.expenses||[]).map(x=>({id:x.id||uid(),date:x.date||todayKey(),name:x.name||'支出',amount:num(x.amount),category:x.category||'その他',note:''}));
  return base;
}

function normalizeState(s){
  const base=defaultState();
  const out={...base,...s,version:APP_VERSION,settings:{...base.settings,...(s.settings||{})}};
  for(const key of ['workplaces','wageHistory','presets','shifts','fixedCosts','expenses','categoryBudgets','payslips']) if(!Array.isArray(out[key])) out[key]=[];
  if(!out.workplaces.length){ const wp=createDefaultWorkplace(); out.workplaces=[wp]; out.settings.selectedWorkplaceId=wp.id; }
  if(!out.workplaces.some(w=>w.id===out.settings.selectedWorkplaceId)) out.settings.selectedWorkplaceId=out.workplaces[0].id;
  return out;
}

function loadState(){
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    if(raw) return normalizeState(JSON.parse(raw));
    const legacy=localStorage.getItem(LEGACY_KEY);
    if(legacy){ const migrated=migrateLegacy(JSON.parse(legacy)); localStorage.setItem(STORAGE_KEY,JSON.stringify(migrated)); return migrated; }
  }catch(err){ console.error(err); }
  return defaultState();
}

let state=loadState();
let shiftViewMonth=new Date(); shiftViewMonth.setDate(1);
let budgetViewMonth=new Date(); budgetViewMonth.setDate(1);
let deferredInstallPrompt=null;

function persist(render=true){ localStorage.setItem(STORAGE_KEY,JSON.stringify(state)); if(render) renderAll(); }
function toast(message){ const el=$('toast'); el.textContent=message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.remove('show'),1800); }
function workplace(id){ return state.workplaces.find(w=>w.id===id) || state.workplaces[0]; }
function preset(id){ return state.presets.find(p=>p.id===id); }
function sortedWages(workplaceId){ return state.wageHistory.filter(w=>w.workplaceId===workplaceId).sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom)); }
function wageForDate(workplaceId,date){ const list=sortedWages(workplaceId).filter(w=>w.effectiveFrom<=date); return list.length?num(list[list.length-1].hourlyWage):0; }

function minutesBetween(start,end){
  if(!start||!end) return 0;
  const [sh,sm]=start.split(':').map(Number), [eh,em]=end.split(':').map(Number);
  let a=sh*60+sm, b=eh*60+em; if(b<=a) b+=1440; return Math.max(0,b-a);
}
function timeToMin(t){ if(!t) return 0; const [h,m]=t.split(':').map(Number); return h*60+m; }
function overlap(a1,a2,b1,b2){ return Math.max(0,Math.min(a2,b2)-Math.max(a1,b1)); }
function nightMinutes(start,end,nightStart,nightEnd){
  if(!start||!end||!nightStart||!nightEnd) return 0;
  const s=timeToMin(start); let e=timeToMin(end); if(e<=s)e+=1440;
  const ns=timeToMin(nightStart), ne0=timeToMin(nightEnd); const overnight=ne0<=ns;
  let total=0;
  for(const offset of [-1440,0,1440]){
    const ws=ns+offset, we=(overnight?ne0+1440:ne0)+offset;
    total+=overlap(s,e,ws,we);
  }
  return Math.max(0,total);
}
function shiftTiming(s, preferActual=true){
  if(preferActual && s.status==='worked' && s.actual?.start && s.actual?.end) return {start:s.actual.start,end:s.actual.end,breakMinutes:num(s.actual.breakMinutes)};
  return {start:s.planned?.start||'',end:s.planned?.end||'',breakMinutes:num(s.planned?.breakMinutes)};
}
function calculateShift(s, preferActual=true){
  const wp=workplace(s.workplaceId); const t=shiftTiming(s,preferActual);
  const gross=minutesBetween(t.start,t.end); const paid=Math.max(0,gross-t.breakMinutes);
  const wage=s.wageOverride!==null && s.wageOverride!=='' && s.wageOverride!==undefined ? num(s.wageOverride) : wageForDate(s.workplaceId,s.date);
  const nightRaw=nightMinutes(t.start,t.end,wp.nightStart,wp.nightEnd); const night=Math.min(paid,nightRaw);
  const overtime=Math.max(0,paid-num(wp.overtimeAfterHours,8)*60);
  const transport=s.transportOverride!==null && s.transportOverride!=='' && s.transportOverride!==undefined ? num(s.transportOverride) : num(wp.transportPerShift);
  const base=paid/60*wage;
  const nightExtra=night/60*wage*Math.max(0,num(wp.nightRate,1.25)-1);
  const overtimeExtra=overtime/60*wage*Math.max(0,num(wp.overtimeRate,1.25)-1);
  return {paidMinutes:paid,hours:paid/60,wage,transport,nightMinutes:night,overtimeMinutes:overtime,pay:Math.round(base+nightExtra+overtimeExtra+transport)};
}
function calculatePreset(p,date=todayKey()){
  if(!p) return {pay:0,hours:0};
  return calculateShift({workplaceId:p.workplaceId,date,planned:{start:p.start,end:p.end,breakMinutes:num(p.breakMinutes)},actual:null,status:'planned',wageOverride:null,transportOverride:p.transportOverride},false);
}

function cycleForShift(wp,dateStr){
  const d=parseDate(dateStr); let close;
  if(wp.closingDay==='end') close=makeDate(d.getFullYear(),d.getMonth(),'end');
  else { const cd=num(wp.closingDay,31); close=d.getDate()<=resolveDay(d.getFullYear(),d.getMonth(),cd)?makeDate(d.getFullYear(),d.getMonth(),cd):makeDate(d.getFullYear(),d.getMonth()+1,cd); }
  let prevClose;
  if(wp.closingDay==='end') prevClose=makeDate(close.getFullYear(),close.getMonth()-1,'end');
  else prevClose=makeDate(close.getFullYear(),close.getMonth()-1,wp.closingDay);
  return {start:dateKey(addDays(prevClose,1)),end:dateKey(close),closeDate:dateKey(close)};
}
function adjustWeekend(d,rule){
  const x=new Date(d); if(rule==='previous'){ while(x.getDay()===0||x.getDay()===6)x.setDate(x.getDate()-1); }
  if(rule==='next'){ while(x.getDay()===0||x.getDay()===6)x.setDate(x.getDate()+1); }
  return x;
}
function payDateForClose(wp,closeDateStr){
  const c=parseDate(closeDateStr); const base=new Date(c.getFullYear(),c.getMonth()+num(wp.payLag),1,12); const pd=makeDate(base.getFullYear(),base.getMonth(),wp.payDay); return dateKey(adjustWeekend(pd,wp.weekendRule));
}
function cyclesAroundWorkplace(wp,center=new Date(),back=5,forward=8){
  const out=[];
  for(let i=-back;i<=forward;i++){
    const m=addMonths(new Date(center.getFullYear(),center.getMonth(),1,12),i);
    const close=makeDate(m.getFullYear(),m.getMonth(),wp.closingDay);
    let prev=wp.closingDay==='end'?makeDate(close.getFullYear(),close.getMonth()-1,'end'):makeDate(close.getFullYear(),close.getMonth()-1,wp.closingDay);
    const c={start:dateKey(addDays(prev,1)),end:dateKey(close),closeDate:dateKey(close)}; c.payDate=payDateForClose(wp,c.closeDate); out.push(c);
  }
  return out.sort((a,b)=>a.payDate.localeCompare(b.payDate));
}
function nextPayCycle(wp,from=todayKey()){ return cyclesAroundWorkplace(wp,parseDate(from),8,12).find(c=>c.payDate>=from) || cyclesAroundWorkplace(wp,parseDate(from),2,24).slice(-1)[0]; }
function cycleByPayDate(wp,payDate){ return cyclesAroundWorkplace(wp,parseDate(payDate),16,8).find(c=>c.payDate===payDate) || null; }
function shiftsForCycle(wpId,cycle){ return state.shifts.filter(s=>s.workplaceId===wpId && s.date>=cycle.start && s.date<=cycle.end); }
function cycleStats(wpId,cycle){
  const list=shiftsForCycle(wpId,cycle); let worked=0,forecast=0,hours=0,workedHours=0;
  for(const s of list){ const calc=calculateShift(s,true); forecast+=calc.pay; hours+=calc.hours; if(s.status==='worked'){worked+=calc.pay;workedHours+=calc.hours;} }
  return {list,worked,forecast,hours,workedHours};
}

function fixedOccurrenceDate(item,y,m0){ return dateKey(makeDate(y,m0,item.day||'1')); }
function fixedOccurrencesBetween(startStr,endStr){
  const start=parseDate(startStr), end=parseDate(endStr); const events=[];
  for(const f of state.fixedCosts.filter(x=>x.enabled!==false)){
    let cursor=new Date(start.getFullYear(),start.getMonth(),1,12); const last=new Date(end.getFullYear(),end.getMonth(),1,12);
    while(cursor<=last){
      if(f.recurrence==='monthly' || (f.recurrence==='yearly' && num(f.month)===cursor.getMonth()+1)){
        const d=fixedOccurrenceDate(f,cursor.getFullYear(),cursor.getMonth());
        if(d>=startStr && d<=endStr) events.push({date:d,type:'fixed',name:f.name,category:f.category||'固定費',amount:-Math.abs(num(f.amount)),refId:f.id});
      }
      cursor=addMonths(cursor,1);
    }
  }
  return events;
}
function salaryEventsBetween(startStr,endStr){
  const events=[];
  for(const wp of state.workplaces){
    for(const c of cyclesAroundWorkplace(wp,parseDate(startStr),8,8)){
      if(c.payDate<startStr||c.payDate>endStr) continue;
      const stats=cycleStats(wp.id,c); const slip=state.payslips.find(p=>p.workplaceId===wp.id&&p.payDate===c.payDate);
      const amount=slip?num(slip.actualAmount):stats.forecast;
      if(amount) events.push({date:c.payDate,type:'salary',name:`${wp.name} 給与`,amount:Math.abs(amount),workplaceId:wp.id,cycle:c});
    }
  }
  return events;
}
function expenseEventsBetween(startStr,endStr){ return state.expenses.filter(e=>e.date>=startStr&&e.date<=endStr).map(e=>({date:e.date,type:'expense',name:e.name,category:e.category,amount:-Math.abs(num(e.amount)),refId:e.id})); }
function cashflowEvents(startStr,endStr){
  return [...salaryEventsBetween(startStr,endStr),...fixedOccurrencesBetween(startStr,endStr),...expenseEventsBetween(startStr,endStr)].sort((a,b)=>a.date.localeCompare(b.date)||b.amount-a.amount);
}

function currentSelectedWorkplace(){ return workplace(state.settings.selectedWorkplaceId); }
function fixedMonthTotal(monthDate){ const start=dateKey(new Date(monthDate.getFullYear(),monthDate.getMonth(),1,12)); const end=dateKey(new Date(monthDate.getFullYear(),monthDate.getMonth()+1,0,12)); return fixedOccurrencesBetween(start,end).reduce((s,e)=>s+Math.abs(e.amount),0); }
function expensesInMonth(monthDate){ const key=monthKey(monthDate); return state.expenses.filter(e=>e.date.startsWith(key)).sort((a,b)=>b.date.localeCompare(a.date)); }
function shiftsInMonth(monthDate,wpFilter='all'){ const key=monthKey(monthDate); return state.shifts.filter(s=>s.date.startsWith(key)&&(wpFilter==='all'||s.workplaceId===wpFilter)).sort((a,b)=>a.date.localeCompare(b.date)||(s.planned?.start||'').localeCompare(b.planned?.start||'')); }

function renderSelects(){
  const wpOptions=state.workplaces.map(w=>`<option value="${w.id}">${escapeHtml(w.name)}</option>`).join('');
  for(const id of ['dashboardWorkplace','wageWorkplace','presetWorkplace','shiftWorkplace','bulkWorkplace','payslipWorkplace']){ const el=$(id); if(el){ const val=el.value; el.innerHTML=wpOptions; if(state.workplaces.some(w=>w.id===val))el.value=val; } }
  $('shiftWorkplaceFilter').innerHTML=`<option value="all">すべての勤務先</option>${wpOptions}`;
  $('dashboardWorkplace').value=state.settings.selectedWorkplaceId;

  const dayOpts=Array.from({length:31},(_,i)=>`<option value="${i+1}">${i+1}日</option>`).join('')+'<option value="end">月末</option>';
  for(const id of ['closingDay','payDay','fixedDay']){ if($(id)&&!$(id).dataset.ready){ $(id).innerHTML=dayOpts; $(id).dataset.ready='1'; } }
  if($('fixedMonth')&&!$('fixedMonth').dataset.ready){ $('fixedMonth').innerHTML=Array.from({length:12},(_,i)=>`<option value="${i+1}">${i+1}月</option>`).join(''); $('fixedMonth').dataset.ready='1'; }

  renderPresetSelects();
}
function renderPresetSelects(){
  const wpId=$('shiftWorkplace')?.value||state.settings.selectedWorkplaceId;
  const shiftPresets=state.presets.filter(p=>p.workplaceId===wpId);
  if($('shiftPreset')) $('shiftPreset').innerHTML='<option value="">手入力</option>'+shiftPresets.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  const bwp=$('bulkWorkplace')?.value||state.settings.selectedWorkplaceId;
  const bulkPresets=state.presets.filter(p=>p.workplaceId===bwp);
  if($('bulkPreset')) $('bulkPreset').innerHTML=bulkPresets.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  const goalPresets=state.presets.filter(p=>p.workplaceId===state.settings.selectedWorkplaceId);
  $('goalPreset').innerHTML=goalPresets.length?goalPresets.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join(''):'<option value="">プリセットなし</option>';
  if(goalPresets.some(p=>p.id===state.settings.goalPresetId)) $('goalPreset').value=state.settings.goalPresetId;
  else if(goalPresets[0]){ state.settings.goalPresetId=goalPresets[0].id; $('goalPreset').value=goalPresets[0].id; }
}

function renderDashboard(){
  const wp=currentSelectedWorkplace(); const cycle=nextPayCycle(wp); const stats=cycleStats(wp.id,cycle); const goal=num(state.settings.salaryGoal); const remain=Math.max(0,goal-stats.forecast); const pct=goal>0?Math.min(100,Math.round(stats.forecast/goal*100)):0;
  $('nextPayForecast').textContent=yen(stats.forecast); $('nextPayWorked').textContent=yen(stats.worked); $('nextPayDate').textContent=formatDateJP(cycle.payDate); $('nextPayPeriod').textContent=`対象期間 ${formatDateJP(cycle.start)}〜${formatDateJP(cycle.end)}`;
  $('goalAmount').textContent=yen(goal); $('remainingToGoal').textContent=yen(remain); $('goalPercent').textContent=`${pct}%`; $('goalProgress').style.width=`${pct}%`; $('cycleHours').textContent=hoursText(stats.hours);
  $('currentBalanceHome').textContent=yen(state.settings.currentBalance);

  const gp=preset(state.settings.goalPresetId); const calc=gp&&gp.workplaceId===wp.id?calculatePreset(gp,cycle.end):{pay:0,hours:0}; const needed=calc.pay>0?Math.ceil(remain/calc.pay):0;
  $('neededShifts').textContent=remain<=0?'達成':calc.pay>0?`${needed}回`:'—';
  $('goalGuide').innerHTML=gp&&calc.pay>0?`<div class="big-guide-number">${remain<=0?'目標達成':`あと ${needed} 回`}</div><p class="muted">「${escapeHtml(gp.name)}」1回 約 <b>${yen(calc.pay)}</b> / ${hoursText(calc.hours)}</p><div class="guide-subgrid"><div><span>不足額</span><b>${yen(remain)}</b></div><div><span>必要勤務時間の目安</span><b>${calc.hours>0?hoursText(needed*calc.hours):'—'}</b></div></div>`:'<div class="big-guide-number">—</div><p class="muted">設定で目標計算用プリセットを選択してください。</p>';

  const dayBeforePay=dateKey(addDays(parseDate(cycle.payDate),-1)); const start=todayKey(); const flows=dayBeforePay>=start?cashflowEvents(start,dayBeforePay):[]; const delta=flows.reduce((s,e)=>s+e.amount,0); const spendable=num(state.settings.currentBalance)+delta;
  $('spendableUntilPay').textContent=yen(spendable); $('spendableUntilPay').className=spendable<0?'negative':''; $('spendableNote').textContent=`${shortDate(cycle.payDate)}までの予定を反映`;

  const q=$('quickPresetList'); const quickPresets=state.presets.filter(p=>p.workplaceId===wp.id);
  q.innerHTML=quickPresets.length?quickPresets.map(p=>{const c=calculatePreset(p,$('quickDate').value||todayKey());return `<button class="preset-chip" type="button" data-quick-preset="${p.id}"><b>${escapeHtml(p.name)}</b><span>${p.start}–${p.end} / 約${yen(c.pay)}</span></button>`;}).join(''):'<div class="empty">この勤務先のプリセットがありません</div>';

  const futureEnd=dateKey(addDays(new Date(),30)); const preview=cashflowEvents(todayKey(),futureEnd).slice(0,7); $('cashflowPreview').innerHTML=preview.length?preview.map(timelineHtml).join(''):'<div class="empty">今後30日の入出金予定はありません</div>';
  const recent=[...state.shifts].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5); $('recentShifts').innerHTML=recent.length?recent.map(shiftItemHtml).join(''):'<div class="empty">まだシフトがありません</div>';
}

function timelineHtml(e,balance=null){
  const positive=e.amount>=0; return `<div class="timeline-item"><div class="timeline-date">${shortDate(e.date)}</div><div class="timeline-name">${escapeHtml(e.name)}<small>${e.type==='salary'?'給与':escapeHtml(e.category||'予定')}</small></div><div class="timeline-amount ${positive?'positive':'negative'}">${positive?'+':'−'}${yen(Math.abs(e.amount))}${balance===null?'':`<span class="timeline-balance">残高 ${yen(balance)}</span>`}</div></div>`;
}
function shiftItemHtml(s){
  const wp=workplace(s.workplaceId); const c=calculateShift(s,true); const planned=s.planned||{}; const actual=s.actual||{}; const status=s.status==='worked';
  const actualText=status&&actual.start&&actual.end?` → 実績 ${actual.start}–${actual.end}`:'';
  return `<div class="list-item"><div class="list-main"><div class="list-title"><span class="status-dot ${status?'worked':''}"></span>${escapeHtml(s.date)} ${escapeHtml(wp.name)}${status?'<span class="tag">勤務済</span>':'<span class="tag">予定</span>'}</div><div class="list-sub">予定 ${planned.start||'—'}–${planned.end||'—'}${actualText} / ${hoursText(c.hours)}${s.note?`<br>${escapeHtml(s.note)}`:''}</div></div><div class="list-value"><b>${yen(c.pay)}</b><small>時給 ${yen(c.wage)}</small><div class="item-actions"><button class="mini-link" data-edit-shift="${s.id}">編集</button><button class="mini-link danger" data-delete-shift="${s.id}">削除</button></div></div></div>`;
}

function renderShifts(){
  $('monthTitle').textContent=monthLabel(shiftViewMonth); const filter=$('shiftWorkplaceFilter').value||'all'; const list=shiftsInMonth(shiftViewMonth,filter); $('monthlyShiftList').innerHTML=list.length?list.map(shiftItemHtml).join(''):'<div class="empty">この月のシフトはありません</div>';
  const hours=list.reduce((s,x)=>s+calculateShift(x,true).hours,0); $('monthlyHoursTotal').textContent=hoursText(hours);
  renderCalendar(list);
}
function renderCalendar(monthShifts){
  const y=shiftViewMonth.getFullYear(),m=shiftViewMonth.getMonth(); const first=new Date(y,m,1,12); const start=addDays(first,-first.getDay()); const today=todayKey(); let html='';
  for(let i=0;i<42;i++){
    const d=addDays(start,i); const key=dateKey(d); const shifts=monthShifts.filter(s=>s.date===key); const outside=d.getMonth()!==m; html+=`<div class="calendar-day ${outside?'outside':''} ${key===today?'today':''}" data-calendar-date="${key}"><span class="day-number">${d.getDate()}</span>${shifts.slice(0,2).map(s=>`<div class="day-chip ${s.status==='worked'?'worked':''}"><span class="chip-time">${s.planned?.start||''}</span><span class="chip-workplace">${escapeHtml(workplace(s.workplaceId).name)}</span></div>`).join('')}${shifts.length>2?`<div class="day-chip">+${shifts.length-2}</div>`:''}</div>`;
  }
  $('calendarGrid').innerHTML=html;
}

function renderBudget(){
  $('budgetMonthTitle').textContent=monthLabel(budgetViewMonth); const expenses=expensesInMonth(budgetViewMonth); const variable=expenses.reduce((s,e)=>s+num(e.amount),0); const fixed=fixedMonthTotal(budgetViewMonth);
  $('budgetExpense').textContent=yen(variable); $('budgetFixed').textContent=yen(fixed); $('budgetCategoryCount').textContent=`${state.categoryBudgets.length}件`;
  $('expenseList').innerHTML=expenses.length?expenses.map(e=>`<div class="list-item"><div class="list-main"><div class="list-title">${escapeHtml(e.name)}<span class="tag">${escapeHtml(e.category)}</span></div><div class="list-sub">${e.date}${e.note?` / ${escapeHtml(e.note)}`:''}${isFutureDate(e.date)?' / 予定':''}</div></div><div class="list-value"><b>${yen(e.amount)}</b><div class="item-actions"><button class="mini-link" data-edit-expense="${e.id}">編集</button><button class="mini-link danger" data-delete-expense="${e.id}">削除</button></div></div></div>`).join(''):'<div class="empty">この月の支出はありません</div>';

  $('fixedCostList').innerHTML=state.fixedCosts.length?state.fixedCosts.map(f=>`<div class="list-item"><div class="list-main"><div class="list-title">${escapeHtml(f.name)}<span class="tag">${escapeHtml(f.category||'固定費')}</span></div><div class="list-sub">${f.recurrence==='yearly'?`毎年${num(f.month)}月`:'毎月'}${f.day==='end'?'末日':`${f.day}日`} ${f.enabled===false?' / 停止中':''}</div></div><div class="list-value"><b>${yen(f.amount)}</b><div class="item-actions"><button class="mini-link" data-edit-fixed="${f.id}">編集</button><button class="mini-link danger" data-delete-fixed="${f.id}">削除</button></div></div></div>`).join(''):'<div class="empty">固定費・サブスクは未登録です</div>';

  $('categoryBudgetList').innerHTML=state.categoryBudgets.length?state.categoryBudgets.map(b=>{
    const spent=expenses.filter(e=>e.category===b.category).reduce((s,e)=>s+num(e.amount),0)+fixedOccurrencesBetween(dateKey(new Date(budgetViewMonth.getFullYear(),budgetViewMonth.getMonth(),1,12)),dateKey(new Date(budgetViewMonth.getFullYear(),budgetViewMonth.getMonth()+1,0,12))).filter(e=>e.category===b.category).reduce((s,e)=>s+Math.abs(e.amount),0);
    const amount=num(b.amount); const pct=amount>0?Math.round(spent/amount*100):0; return `<div class="list-item"><div class="list-main"><div class="list-title">${escapeHtml(b.category)}</div><div class="budget-progress"><div class="budget-progress-head"><span>${yen(spent)} / ${yen(amount)}</span><span>${pct}%</span></div><div class="budget-track"><div class="budget-fill ${pct>100?'over':''}" style="width:${Math.min(100,pct)}%"></div></div></div></div><div class="list-value"><b class="${pct>100?'negative':''}">${pct>100?'超過':'残り'} ${yen(Math.abs(amount-spent))}</b><div class="item-actions"><button class="mini-link" data-edit-budget="${escapeHtml(b.category)}">編集</button><button class="mini-link danger" data-delete-budget="${escapeHtml(b.category)}">削除</button></div></div></div>`;
  }).join(''):'<div class="empty">カテゴリ予算を登録すると使いすぎが分かります</div>';

  const end=dateKey(addDays(new Date(),60)); const events=cashflowEvents(todayKey(),end); let bal=num(state.settings.currentBalance); $('futureBalance').innerHTML=events.length?events.slice(0,20).map(e=>{bal+=e.amount; return timelineHtml(e,bal);}).join(''):'<div class="empty">今後60日の予定はありません</div>';

  const slips=[...state.payslips].sort((a,b)=>b.payDate.localeCompare(a.payDate)); $('payslipList').innerHTML=slips.length?slips.map(p=>payslipItemHtml(p)).join(''):'<div class="empty">給与明細を登録すると予測との差額を確認できます</div>';
}
function payslipItemHtml(p){
  const wp=workplace(p.workplaceId); const cycle=cycleByPayDate(wp,p.payDate); const predicted=cycle?cycleStats(wp.id,cycle).forecast:0; const diff=num(p.actualAmount)-predicted; return `<div class="list-item"><div class="list-main"><div class="list-title">${escapeHtml(wp.name)} ${formatDateJP(p.payDate)}</div><div class="list-sub">予測 ${yen(predicted)} / 実際 ${yen(p.actualAmount)}${p.note?`<br>${escapeHtml(p.note)}`:''}</div></div><div class="list-value"><b class="${diff===0?'':diff>0?'positive':'negative'}">差額 ${diff>=0?'+':''}${yen(diff)}</b><div class="item-actions"><button class="mini-link" data-edit-payslip="${p.id}">編集</button><button class="mini-link danger" data-delete-payslip="${p.id}">削除</button></div></div></div>`;
}

function renderAnalysis(){
  const months=[]; const now=new Date(); for(let i=5;i>=0;i--) months.push(addMonths(new Date(now.getFullYear(),now.getMonth(),1,12),-i));
  const salaryData=months.map(m=>{const start=dateKey(new Date(m.getFullYear(),m.getMonth(),1,12)),end=dateKey(new Date(m.getFullYear(),m.getMonth()+1,0,12)); return salaryEventsBetween(start,end).reduce((s,e)=>s+e.amount,0);});
  const hoursData=months.map(m=>shiftsInMonth(m,'all').filter(s=>s.status==='worked').reduce((s,x)=>s+calculateShift(x,true).hours,0));
  const spendData=months.map(m=>expensesInMonth(m).reduce((s,e)=>s+num(e.amount),0)+fixedMonthTotal(m));
  renderBarChart('salaryChart',months,salaryData,'money'); renderBarChart('hoursChart',months,hoursData,'hours'); renderBarChart('spendingChart',months,spendData,'money');
}
function renderBarChart(id,months,values,type){
  const max=Math.max(1,...values.map(v=>num(v))); $(id).innerHTML=values.map((v,i)=>{const h=Math.max(2,Math.round(num(v)/max*100)); const value=type==='money'?compactMoney(v):hoursText(v); return `<div class="bar-col"><div class="bar-value">${value}</div><div class="bar-well"><div class="bar" style="height:${h}%"></div></div><div class="bar-label">${months[i].getMonth()+1}月</div></div>`;}).join('');
}
function compactMoney(v){ const n=Math.round(num(v)); if(Math.abs(n)>=10000)return `${Math.round(n/1000)/10}万`; return `¥${n.toLocaleString('ja-JP')}`; }

function renderSettings(){
  $('currentBalance').value=num(state.settings.currentBalance); $('salaryGoal').value=num(state.settings.salaryGoal);
  $('workplaceList').innerHTML=state.workplaces.map(w=>{const c=nextPayCycle(w); const currentWage=wageForDate(w.id,todayKey()); return `<div class="list-item"><div class="list-main"><div class="list-title">${escapeHtml(w.name)}${w.id===state.settings.selectedWorkplaceId?'<span class="tag">ホーム表示</span>':''}</div><div class="list-sub">${w.closingDay==='end'?'月末':`${w.closingDay}日`}締め / ${w.payDay==='end'?'月末':`${w.payDay}日`}支給 / ${num(w.payLag)===0?'締め月':num(w.payLag)===1?'翌月':'翌々月'}<br>現在時給 ${yen(currentWage)} / 次回 ${shortDate(c.payDate)}</div></div><div class="list-value"><div class="item-actions"><button class="mini-link" data-select-workplace="${w.id}">表示</button><button class="mini-link" data-edit-workplace="${w.id}">編集</button>${state.workplaces.length>1?`<button class="mini-link danger" data-delete-workplace="${w.id}">削除</button>`:''}</div></div></div>`;}).join('');

  const wages=[...state.wageHistory].sort((a,b)=>b.effectiveFrom.localeCompare(a.effectiveFrom)); $('wageHistoryList').innerHTML=wages.length?wages.map(w=>`<div class="list-item"><div class="list-main"><div class="list-title">${escapeHtml(workplace(w.workplaceId).name)} ${yen(w.hourlyWage)}</div><div class="list-sub">${w.effectiveFrom} から適用</div></div><div class="list-value"><div class="item-actions"><button class="mini-link" data-edit-wage="${w.id}">編集</button><button class="mini-link danger" data-delete-wage="${w.id}">削除</button></div></div></div>`).join(''):'<div class="empty">時給履歴がありません</div>';

  $('presetList').innerHTML=state.presets.length?state.presets.map(p=>{const c=calculatePreset(p); return `<div class="list-item"><div class="list-main"><div class="list-title">${escapeHtml(p.name)} <span class="tag">${escapeHtml(workplace(p.workplaceId).name)}</span></div><div class="list-sub">${p.start}–${p.end} / 休憩${num(p.breakMinutes)}分 / 約${yen(c.pay)}</div></div><div class="list-value"><div class="item-actions"><button class="mini-link" data-edit-preset="${p.id}">編集</button><button class="mini-link danger" data-delete-preset="${p.id}">削除</button></div></div></div>`;}).join(''):'<div class="empty">プリセットがありません</div>';
}

function renderAll(){ renderSelects(); renderDashboard(); renderShifts(); renderBudget(); renderAnalysis(); renderSettings(); }

function navigate(page){
  document.querySelectorAll('.page').forEach(el=>el.classList.toggle('active',el.dataset.page===page)); document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.nav===page)); location.hash=page;
  if(page==='analysis')renderAnalysis();
}
function openDialog(id){ $(id).showModal(); }
function closeDialogs(){ document.querySelectorAll('dialog[open]').forEach(d=>d.close()); }

function openWorkplaceEditor(id=''){
  const w=id?state.workplaces.find(x=>x.id===id):null; $('workplaceId').value=w?.id||''; $('workplaceModalTitle').textContent=w?'勤務先を編集':'勤務先を追加'; $('workplaceName').value=w?.name||''; $('closingDay').value=w?.closingDay||'10'; $('payDay').value=w?.payDay||'25'; $('payLag').value=String(num(w?.payLag)); $('weekendRule').value=w?.weekendRule||'none'; $('transportPerShift').value=num(w?.transportPerShift); $('overtimeAfterHours').value=num(w?.overtimeAfterHours,8); $('overtimeRate').value=num(w?.overtimeRate,1.25); $('nightRate').value=num(w?.nightRate,1.25); $('nightStart').value=w?.nightStart||'22:00'; $('nightEnd').value=w?.nightEnd||'05:00'; openDialog('workplaceModal');
}
function openWageEditor(id=''){
  const w=id?state.wageHistory.find(x=>x.id===id):null; $('wageId').value=w?.id||''; $('wageModalTitle').textContent=w?'時給を編集':'時給を追加'; $('wageWorkplace').value=w?.workplaceId||state.settings.selectedWorkplaceId; $('wageEffectiveFrom').value=w?.effectiveFrom||todayKey(); $('wageAmount').value=w?.hourlyWage??''; openDialog('wageModal');
}
function openPresetEditor(id=''){
  const p=id?state.presets.find(x=>x.id===id):null; $('presetId').value=p?.id||''; $('presetModalTitle').textContent=p?'プリセット編集':'プリセット作成'; $('presetWorkplace').value=p?.workplaceId||state.settings.selectedWorkplaceId; $('presetName').value=p?.name||''; $('presetStart').value=p?.start||'17:00'; $('presetEnd').value=p?.end||'21:00'; $('presetBreak').value=num(p?.breakMinutes); $('presetTransport').value=p?.transportOverride??''; openDialog('presetModal');
}
function openShiftEditor(id='',date=todayKey(),presetId=''){
  const s=id?state.shifts.find(x=>x.id===id):null; $('shiftId').value=s?.id||''; $('shiftModalTitle').textContent=s?'シフト編集':'シフト追加'; $('shiftWorkplace').value=s?.workplaceId||preset(presetId)?.workplaceId||state.settings.selectedWorkplaceId; renderPresetSelects(); $('shiftDate').value=s?.date||date; $('shiftPreset').value=presetId||''; $('shiftPlannedStart').value=s?.planned?.start||''; $('shiftPlannedEnd').value=s?.planned?.end||''; $('shiftPlannedBreak').value=num(s?.planned?.breakMinutes); $('shiftWorked').checked=s?.status==='worked'; $('shiftActualStart').value=s?.actual?.start||''; $('shiftActualEnd').value=s?.actual?.end||''; $('shiftActualBreak').value=s?.actual?.breakMinutes??''; $('shiftWageOverride').value=s?.wageOverride??''; $('shiftTransportOverride').value=s?.transportOverride??''; $('shiftNote').value=s?.note||''; $('actualFields').hidden=!$('shiftWorked').checked; if(!s&&presetId) applyPresetToShift(presetId); updateShiftPreview(); openDialog('shiftModal');
}
function applyPresetToShift(id){ const p=preset(id); if(!p)return; $('shiftWorkplace').value=p.workplaceId; renderPresetSelects(); $('shiftPreset').value=id; $('shiftPlannedStart').value=p.start; $('shiftPlannedEnd').value=p.end; $('shiftPlannedBreak').value=num(p.breakMinutes); $('shiftTransportOverride').value=p.transportOverride??''; updateShiftPreview(); }
function buildShiftFromForm(){ return {id:$('shiftId').value||uid(),workplaceId:$('shiftWorkplace').value,date:$('shiftDate').value,planned:{start:$('shiftPlannedStart').value,end:$('shiftPlannedEnd').value,breakMinutes:num($('shiftPlannedBreak').value)},actual:$('shiftWorked').checked?{start:$('shiftActualStart').value||$('shiftPlannedStart').value,end:$('shiftActualEnd').value||$('shiftPlannedEnd').value,breakMinutes:$('shiftActualBreak').value===''?num($('shiftPlannedBreak').value):num($('shiftActualBreak').value)}:null,status:$('shiftWorked').checked?'worked':'planned',wageOverride:$('shiftWageOverride').value===''?null:num($('shiftWageOverride').value),transportOverride:$('shiftTransportOverride').value===''?null:num($('shiftTransportOverride').value),note:$('shiftNote').value.trim()}; }
function updateShiftPreview(){ try{ const s=buildShiftFromForm(); $('shiftPayPreview').textContent=yen(calculateShift(s,true).pay); }catch{ $('shiftPayPreview').textContent='¥0'; } }
function openFixedEditor(id=''){
  const f=id?state.fixedCosts.find(x=>x.id===id):null; $('fixedId').value=f?.id||''; $('fixedModalTitle').textContent=f?'固定費を編集':'固定費を登録'; $('fixedName').value=f?.name||''; $('fixedAmount').value=f?.amount??''; $('fixedCategory').value=f?.category||'サブスク'; $('fixedRecurrence').value=f?.recurrence||'monthly'; $('fixedMonth').value=String(f?.month||new Date().getMonth()+1); $('fixedDay').value=f?.day||'1'; $('fixedEnabled').checked=f?.enabled!==false; toggleFixedMonth(); openDialog('fixedModal');
}
function toggleFixedMonth(){ $('fixedMonthWrap').hidden=$('fixedRecurrence').value!=='yearly'; }
function openExpenseEditor(id=''){
  const e=id?state.expenses.find(x=>x.id===id):null; $('expenseId').value=e?.id||''; $('expenseModalTitle').textContent=e?'支出を編集':'支出を追加'; $('expenseDate').value=e?.date||todayKey(); $('expenseName').value=e?.name||''; $('expenseAmount').value=e?.amount??''; $('expenseCategory').value=e?.category||'その他'; $('expenseNote').value=e?.note||''; openDialog('expenseModal');
}
function openBudgetEditor(category=''){ const b=state.categoryBudgets.find(x=>x.category===category); $('budgetCategory').value=b?.category||category||''; $('budgetAmount').value=b?.amount??''; openDialog('budgetModal'); }
function openPayslipEditor(id=''){
  const p=id?state.payslips.find(x=>x.id===id):null; $('payslipId').value=p?.id||''; $('payslipModalTitle').textContent=p?'給与明細を編集':'給与明細を登録'; $('payslipWorkplace').value=p?.workplaceId||state.settings.selectedWorkplaceId; const wp=workplace($('payslipWorkplace').value); $('payslipPayDate').value=p?.payDate||nextPayCycle(wp).payDate; $('payslipAmount').value=p?.actualAmount??''; $('payslipNote').value=p?.note||''; openDialog('payslipModal');
}

function download(filename,text,type){ const blob=new Blob([text],{type}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000); }
function exportJSON(){ download(`shiftwallet-backup-${todayKey()}.json`,JSON.stringify(state,null,2),'application/json'); toast('JSONを書き出しました'); }
function csvEscape(v){ const s=String(v??''); return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s; }
function exportCSV(){
  const rows=[['record_type','date','workplace','name','category','amount','hours','status','note']];
  for(const s of state.shifts){ const c=calculateShift(s,true); rows.push(['shift',s.date,workplace(s.workplaceId).name,s.note||'シフト','',c.pay,c.hours,s.status,`${s.planned.start}-${s.planned.end}`]); }
  for(const e of state.expenses) rows.push(['expense',e.date,'',e.name,e.category,-Math.abs(num(e.amount)),'','',e.note||'']);
  for(const f of state.fixedCosts) rows.push(['fixed_cost','', '',f.name,f.category,-Math.abs(num(f.amount)),'',f.enabled===false?'disabled':'enabled',`${f.recurrence}:${f.month||''}/${f.day}`]);
  for(const p of state.payslips) rows.push(['payslip',p.payDate,workplace(p.workplaceId).name,'給与明細','給与',num(p.actualAmount),'','actual',p.note||'']);
  const text='\uFEFF'+rows.map(r=>r.map(csvEscape).join(',')).join('\n'); download(`shiftwallet-${todayKey()}.csv`,text,'text/csv;charset=utf-8'); toast('CSVを書き出しました');
}

function bindForms(){
  $('moneySettingsForm').addEventListener('submit',e=>{e.preventDefault(); state.settings.currentBalance=num($('currentBalance').value); state.settings.salaryGoal=num($('salaryGoal').value); state.settings.goalPresetId=$('goalPreset').value; persist(); toast('設定を保存しました');});
  $('workplaceForm').addEventListener('submit',e=>{e.preventDefault(); const id=$('workplaceId').value||uid(); const item={id,name:$('workplaceName').value.trim(),closingDay:$('closingDay').value,payDay:$('payDay').value,payLag:num($('payLag').value),weekendRule:$('weekendRule').value,transportPerShift:num($('transportPerShift').value),overtimeAfterHours:num($('overtimeAfterHours').value,8),overtimeRate:num($('overtimeRate').value,1.25),nightRate:num($('nightRate').value,1.25),nightStart:$('nightStart').value||'22:00',nightEnd:$('nightEnd').value||'05:00'}; const i=state.workplaces.findIndex(x=>x.id===id); if(i>=0)state.workplaces[i]=item; else {state.workplaces.push(item); state.wageHistory.push({id:uid(),workplaceId:id,effectiveFrom:'2000-01-01',hourlyWage:1000});} if(!state.settings.selectedWorkplaceId)state.settings.selectedWorkplaceId=id; persist(); closeDialogs(); toast('勤務先を保存しました');});
  $('wageForm').addEventListener('submit',e=>{e.preventDefault(); const id=$('wageId').value||uid(); const item={id,workplaceId:$('wageWorkplace').value,effectiveFrom:$('wageEffectiveFrom').value,hourlyWage:num($('wageAmount').value)}; const i=state.wageHistory.findIndex(x=>x.id===id); if(i>=0)state.wageHistory[i]=item; else state.wageHistory.push(item); persist(); closeDialogs(); toast('時給を保存しました');});
  $('presetForm').addEventListener('submit',e=>{e.preventDefault(); const id=$('presetId').value||uid(); const item={id,workplaceId:$('presetWorkplace').value,name:$('presetName').value.trim(),start:$('presetStart').value,end:$('presetEnd').value,breakMinutes:num($('presetBreak').value),transportOverride:$('presetTransport').value===''?null:num($('presetTransport').value)}; const i=state.presets.findIndex(x=>x.id===id); if(i>=0)state.presets[i]=item; else state.presets.push(item); if(!state.settings.goalPresetId&&item.workplaceId===state.settings.selectedWorkplaceId)state.settings.goalPresetId=id; persist(); closeDialogs(); toast('プリセットを保存しました');});
  $('shiftForm').addEventListener('submit',e=>{e.preventDefault(); const item=buildShiftFromForm(); const i=state.shifts.findIndex(x=>x.id===item.id); if(i>=0)state.shifts[i]=item; else state.shifts.push(item); persist(); closeDialogs(); toast('シフトを保存しました');});
  $('bulkShiftForm').addEventListener('submit',e=>{e.preventDefault(); const from=parseDate($('bulkFrom').value), to=parseDate($('bulkTo').value); const days=Math.round((to-from)/86400000); if(days<0||days>61){toast('期間は最大62日で指定してください');return;} const p=preset($('bulkPreset').value); if(!p){toast('プリセットを選択してください');return;} const picked=[...document.querySelectorAll('#bulkWeekdays input:checked')].map(x=>num(x.value)); let added=0,skipped=0; for(let d=new Date(from);d<=to;d=addDays(d,1)){ if(picked.length&&!picked.includes(d.getDay()))continue; const key=dateKey(d); const dup=state.shifts.some(s=>s.workplaceId===p.workplaceId&&s.date===key&&s.planned?.start===p.start&&s.planned?.end===p.end); if(dup){skipped++;continue;} state.shifts.push({id:uid(),workplaceId:p.workplaceId,date:key,planned:{start:p.start,end:p.end,breakMinutes:num(p.breakMinutes)},actual:null,status:'planned',wageOverride:null,transportOverride:p.transportOverride,note:p.name}); added++; } persist(); closeDialogs(); toast(`${added}件追加${skipped?` / ${skipped}件重複を除外`:''}`);});
  $('fixedForm').addEventListener('submit',e=>{e.preventDefault(); const id=$('fixedId').value||uid(); const item={id,name:$('fixedName').value.trim(),amount:num($('fixedAmount').value),category:$('fixedCategory').value.trim()||'固定費',recurrence:$('fixedRecurrence').value,month:$('fixedRecurrence').value==='yearly'?num($('fixedMonth').value):null,day:$('fixedDay').value,enabled:$('fixedEnabled').checked}; const i=state.fixedCosts.findIndex(x=>x.id===id); if(i>=0)state.fixedCosts[i]=item; else state.fixedCosts.push(item); persist(); closeDialogs(); toast('固定費を保存しました');});
  $('expenseForm').addEventListener('submit',e=>{e.preventDefault(); const id=$('expenseId').value||uid(); const item={id,date:$('expenseDate').value,name:$('expenseName').value.trim(),amount:num($('expenseAmount').value),category:$('expenseCategory').value.trim()||'その他',note:$('expenseNote').value.trim()}; const i=state.expenses.findIndex(x=>x.id===id); if(i>=0)state.expenses[i]=item; else state.expenses.push(item); persist(); closeDialogs(); toast('支出を保存しました');});
  $('budgetForm').addEventListener('submit',e=>{e.preventDefault(); const cat=$('budgetCategory').value.trim(); const amount=num($('budgetAmount').value); const i=state.categoryBudgets.findIndex(x=>x.category===cat); if(i>=0)state.categoryBudgets[i]={category:cat,amount}; else state.categoryBudgets.push({category:cat,amount}); persist(); closeDialogs(); toast('予算を保存しました');});
  $('payslipForm').addEventListener('submit',e=>{e.preventDefault(); const id=$('payslipId').value||uid(); const item={id,workplaceId:$('payslipWorkplace').value,payDate:$('payslipPayDate').value,actualAmount:num($('payslipAmount').value),note:$('payslipNote').value.trim()}; const i=state.payslips.findIndex(x=>x.id===id); if(i>=0)state.payslips[i]=item; else state.payslips.push(item); persist(); closeDialogs(); toast('給与明細を保存しました');});
}

function bindEvents(){
  document.querySelectorAll('.nav-btn').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.nav))); document.querySelectorAll('[data-nav-to]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.navTo))); document.querySelectorAll('[data-close-dialog]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
  $('dashboardWorkplace').addEventListener('change',()=>{state.settings.selectedWorkplaceId=$('dashboardWorkplace').value; const gp=state.presets.find(p=>p.workplaceId===state.settings.selectedWorkplaceId); state.settings.goalPresetId=gp?.id||''; persist();});
  $('shiftWorkplaceFilter').addEventListener('change',renderShifts);
  $('prevMonth').onclick=()=>{shiftViewMonth=addMonths(shiftViewMonth,-1);renderShifts();}; $('nextMonth').onclick=()=>{shiftViewMonth=addMonths(shiftViewMonth,1);renderShifts();}; $('prevBudgetMonth').onclick=()=>{budgetViewMonth=addMonths(budgetViewMonth,-1);renderBudget();}; $('nextBudgetMonth').onclick=()=>{budgetViewMonth=addMonths(budgetViewMonth,1);renderBudget();};
  $('openWorkplaceModal').onclick=()=>openWorkplaceEditor(); $('openWageModal').onclick=()=>openWageEditor(); $('openPresetModal').onclick=()=>openPresetEditor(); $('openShiftModal').onclick=()=>openShiftEditor(); $('openBulkShiftModal').onclick=()=>{ $('bulkWorkplace').value=state.settings.selectedWorkplaceId; renderPresetSelects(); $('bulkFrom').value=todayKey(); $('bulkTo').value=dateKey(addDays(new Date(),14)); openDialog('bulkShiftModal'); }; $('openFixedModal').onclick=()=>openFixedEditor(); $('openExpenseModal').onclick=()=>openExpenseEditor(); $('openBudgetModal').onclick=()=>openBudgetEditor(); $('openPayslipModal').onclick=()=>openPayslipEditor();
  $('shiftWorkplace').addEventListener('change',()=>{renderPresetSelects();updateShiftPreview();}); $('bulkWorkplace').addEventListener('change',renderPresetSelects); $('shiftPreset').addEventListener('change',()=>{if($('shiftPreset').value)applyPresetToShift($('shiftPreset').value);}); $('shiftWorked').addEventListener('change',()=>{$('actualFields').hidden=!$('shiftWorked').checked;if($('shiftWorked').checked&&!$('shiftActualStart').value){$('shiftActualStart').value=$('shiftPlannedStart').value;$('shiftActualEnd').value=$('shiftPlannedEnd').value;$('shiftActualBreak').value=$('shiftPlannedBreak').value;}updateShiftPreview();}); $('copyPlannedToActual').onclick=()=>{$('shiftActualStart').value=$('shiftPlannedStart').value;$('shiftActualEnd').value=$('shiftPlannedEnd').value;$('shiftActualBreak').value=$('shiftPlannedBreak').value;updateShiftPreview();};
  ['shiftDate','shiftPlannedStart','shiftPlannedEnd','shiftPlannedBreak','shiftActualStart','shiftActualEnd','shiftActualBreak','shiftWageOverride','shiftTransportOverride'].forEach(id=>$(id).addEventListener('input',updateShiftPreview));
  $('fixedRecurrence').addEventListener('change',toggleFixedMonth);
  $('exportJsonBtn').onclick=exportJSON; $('exportCsvBtn').onclick=exportCSV;
  $('importInput').addEventListener('change',async e=>{const file=e.target.files?.[0]; if(!file)return; try{const data=JSON.parse(await file.text()); state=normalizeState(data); persist(); toast('バックアップを読み込みました');}catch{toast('JSONを読み込めませんでした');} e.target.value='';});
  $('resetBtn').onclick=()=>{if(confirm('ShiftWalletの全データを削除します。元に戻せません。')){state=defaultState();persist();toast('初期化しました');}};
  $('installBtn').onclick=async()=>{if(deferredInstallPrompt){deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;$('installBtn').hidden=true;}else navigate('settings');};

  document.body.addEventListener('click',e=>{
    const btn=e.target.closest('button'); if(!btn)return;
    const q=(name)=>btn.dataset[name];
    if(q('quickPreset')){ const p=preset(q('quickPreset')); if(p){ const d=$('quickDate').value||todayKey(); state.shifts.push({id:uid(),workplaceId:p.workplaceId,date:d,planned:{start:p.start,end:p.end,breakMinutes:num(p.breakMinutes)},actual:null,status:'planned',wageOverride:null,transportOverride:p.transportOverride,note:p.name}); persist(); toast(`${d} に追加しました`);} }
    if(q('editShift'))openShiftEditor(q('editShift')); if(q('deleteShift')&&confirm('このシフトを削除しますか？')){state.shifts=state.shifts.filter(x=>x.id!==q('deleteShift'));persist();}
    if(q('editWorkplace'))openWorkplaceEditor(q('editWorkplace')); if(q('selectWorkplace')){state.settings.selectedWorkplaceId=q('selectWorkplace');const p=state.presets.find(x=>x.workplaceId===q('selectWorkplace'));state.settings.goalPresetId=p?.id||'';persist();toast('ホーム表示を変更しました');} if(q('deleteWorkplace'))deleteWorkplace(q('deleteWorkplace'));
    if(q('editWage'))openWageEditor(q('editWage')); if(q('deleteWage')&&confirm('この時給履歴を削除しますか？')){state.wageHistory=state.wageHistory.filter(x=>x.id!==q('deleteWage'));persist();}
    if(q('editPreset'))openPresetEditor(q('editPreset')); if(q('deletePreset')&&confirm('このプリセットを削除しますか？')){state.presets=state.presets.filter(x=>x.id!==q('deletePreset'));if(state.settings.goalPresetId===q('deletePreset'))state.settings.goalPresetId='';persist();}
    if(q('editFixed'))openFixedEditor(q('editFixed')); if(q('deleteFixed')&&confirm('この固定費を削除しますか？')){state.fixedCosts=state.fixedCosts.filter(x=>x.id!==q('deleteFixed'));persist();}
    if(q('editExpense'))openExpenseEditor(q('editExpense')); if(q('deleteExpense')&&confirm('この支出を削除しますか？')){state.expenses=state.expenses.filter(x=>x.id!==q('deleteExpense'));persist();}
    if(q('editBudget'))openBudgetEditor(q('editBudget')); if(q('deleteBudget')&&confirm('このカテゴリ予算を削除しますか？')){state.categoryBudgets=state.categoryBudgets.filter(x=>x.category!==q('deleteBudget'));persist();}
    if(q('editPayslip'))openPayslipEditor(q('editPayslip')); if(q('deletePayslip')&&confirm('この給与明細を削除しますか？')){state.payslips=state.payslips.filter(x=>x.id!==q('deletePayslip'));persist();}
  });
  $('calendarGrid').addEventListener('click',e=>{const cell=e.target.closest('[data-calendar-date]');if(cell)openShiftEditor('',cell.dataset.calendarDate);});
}
function deleteWorkplace(id){
  if(state.workplaces.length<=1)return; const related=state.shifts.some(x=>x.workplaceId===id)||state.presets.some(x=>x.workplaceId===id)||state.payslips.some(x=>x.workplaceId===id); if(related&&!confirm('関連するシフト・プリセット・給与明細も削除します。続けますか？'))return; if(!related&&!confirm('この勤務先を削除しますか？'))return;
  state.workplaces=state.workplaces.filter(x=>x.id!==id); state.wageHistory=state.wageHistory.filter(x=>x.workplaceId!==id); state.presets=state.presets.filter(x=>x.workplaceId!==id); state.shifts=state.shifts.filter(x=>x.workplaceId!==id); state.payslips=state.payslips.filter(x=>x.workplaceId!==id); if(state.settings.selectedWorkplaceId===id)state.settings.selectedWorkplaceId=state.workplaces[0].id; const p=state.presets.find(x=>x.workplaceId===state.settings.selectedWorkplaceId); state.settings.goalPresetId=p?.id||''; persist();
}

function setupPWA(){
  if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').then(reg=>reg.update()).catch(console.error);
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstallPrompt=e;$('installBtn').hidden=false;});
  const isiOS=/iphone|ipad|ipod/i.test(navigator.userAgent); const standalone=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone; if(isiOS&&!standalone)$('iosInstallCard').hidden=false;
}

function init(){
  $('quickDate').value=todayKey(); renderSelects(); bindForms(); bindEvents(); renderAll(); setupPWA(); const hash=location.hash.replace('#',''); if(['dashboard','shifts','budget','analysis','settings'].includes(hash))navigate(hash);
}
init();
