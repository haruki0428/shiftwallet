'use strict';

const KEY='shiftwallet.simple.v4';
const APP_VERSION='4.9';
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
function shiftEndDateTime(s){const d=parseDate(s.date);const [sh,sm]=String(s.start||'00:00').split(':').map(Number),[eh,em]=String(s.end||'00:00').split(':').map(Number);const end=new Date(d.getFullYear(),d.getMonth(),d.getDate(),eh||0,em||0,0,0);if((eh||0)*60+(em||0)<=((sh||0)*60+(sm||0)))end.setDate(end.getDate()+1);return end}
function isShiftFinished(s,ref=new Date()){return shiftEndDateTime(s).getTime()<=ref.getTime()}
function hoursText(mins){const h=Math.max(0,mins)/60;return `${(Math.round(h*10)/10).toLocaleString('ja-JP')}時間`}
const SHIFT_COLORS=['#6f7a68','#8a6f5b','#69758a','#8c706c','#7d775b','#756b83','#5f7976','#8a765d'];
const WORK_COLORS=['#6b7565','#806958','#657086','#816b67','#736f57','#6e667a','#597370','#806e59'];
function workplaceColor(id){const i=Math.max(0,state.workplaces.findIndex(w=>w.id===id));return WORK_COLORS[i%WORK_COLORS.length]}
function presetColor(p){if(!p)return '#77736b';const wi=Math.max(0,state.workplaces.findIndex(w=>w.id===p.workplaceId)),same=state.presets.filter(x=>x.workplaceId===p.workplaceId),pi=Math.max(0,same.findIndex(x=>x.id===p.id));return SHIFT_COLORS[(wi*3+pi)%SHIFT_COLORS.length]}
function shiftColor(s){const p=preset(s.presetId);return p?presetColor(p):workplaceColor(s.workplaceId)}
function shiftMarkLabel(s){const p=preset(s.presetId),raw=(p?.name||workplace(s.workplaceId)?.name||'勤').trim().replace(/\s+/g,' ');return esc(raw.slice(0,5))}
function defaultState(){
  const w={id:uid(),name:'バイト先',hourlyWage:1000,closingDay:10,payday:25};
  const p={id:uid(),workplaceId:w.id,name:'夕方',start:'17:00',end:'21:00',breakMinutes:0};
  return {version:4.9,settings:{monthlyGoal:100000,goalPresetId:p.id},workplaces:[w],presets:[p],shifts:[],fixedCosts:[]};
}
function normalize(s){
  const b=defaultState();
  const o={...b,...s,version:4.9,settings:{...b.settings,...(s?.settings||{})}};
  o.workplaces=Array.isArray(o.workplaces)&&o.workplaces.length?o.workplaces.map(w=>({id:w.id||uid(),name:w.name||'バイト先',hourlyWage:Math.max(0,num(w.hourlyWage??w.wage)),closingDay:Math.min(31,Math.max(1,num(w.closingDay??w.cutoffDay,10))),payday:Math.min(31,Math.max(1,num(w.payday??w.payDay,25)))})):b.workplaces;
  const wp0=o.workplaces[0].id;
  o.presets=Array.isArray(o.presets)?o.presets.map(p=>({id:p.id||uid(),workplaceId:o.workplaces.some(w=>w.id===p.workplaceId)?p.workplaceId:wp0,name:p.name||'シフト',start:p.start||'17:00',end:p.end||'21:00',breakMinutes:Math.max(0,num(p.breakMinutes??p.breakMins))})):[];
  o.shifts=Array.isArray(o.shifts)?o.shifts.map(x=>({id:x.id||uid(),date:x.date||todayKey(),workplaceId:o.workplaces.some(w=>w.id===x.workplaceId)?x.workplaceId:wp0,presetId:x.presetId||'',start:x.start||x.planned?.start||'17:00',end:x.end||x.planned?.end||'21:00',breakMinutes:Math.max(0,num(x.breakMinutes??x.breakMins??x.planned?.breakMinutes)),hourlyWage:(x.hourlyWage===null||x.hourlyWage===undefined)?null:Math.max(0,num(x.hourlyWage))})):[];
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
  const shifts=(v.shifts||[]).map(x=>({id:x.id||uid(),date:x.date||todayKey(),workplaceId:x.workplaceId||fallback,presetId:x.presetId||'',start:x.planned?.start||x.start||'17:00',end:x.planned?.end||x.end||'21:00',breakMinutes:num(x.planned?.breakMinutes??x.breakMinutes??x.breakMins),hourlyWage:(x.hourlyWage===null||x.hourlyWage===undefined)?null:Math.max(0,num(x.hourlyWage))}));
  const fixedCosts=(v.fixedCosts||[]).filter(f=>f.enabled!==false&&(!f.recurrence||f.recurrence==='monthly')).map(f=>({id:f.id||uid(),name:f.name||'固定費',amount:num(f.priceHistory?.at?.(-1)?.amount??f.amount)}));
  return normalize({version:4.9,settings:{monthlyGoal:num(v.settings?.salaryGoal??v.settings?.monthlyGoal,100000),goalPresetId:v.settings?.goalPresetId||''},workplaces:workplaces.length?workplaces:undefined,presets,shifts,fixedCosts});
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
function calcShift(s){const gross=minutesBetween(s.start,s.end),paid=Math.max(0,gross-num(s.breakMinutes)),wage=(s.hourlyWage===null||s.hourlyWage===undefined)?num(workplace(s.workplaceId)?.hourlyWage):Math.max(0,num(s.hourlyWage));return {minutes:paid,pay:Math.round(paid/60*wage),hourlyWage:wage}}
function calcPreset(p){if(!p)return {minutes:0,pay:0};return calcShift({workplaceId:p.workplaceId,start:p.start,end:p.end,breakMinutes:p.breakMinutes})}
function monthShifts(key){return state.shifts.filter(s=>s.date.startsWith(key)).sort((a,b)=>a.date.localeCompare(b.date)||a.start.localeCompare(b.start))}
function visibleCalendarWeeks(){
  const y=viewMonth.getFullYear(),m=viewMonth.getMonth(),first=new Date(y,m,1,12),start=new Date(y,m,1-first.getDay(),12);
  return Array.from({length:6},(_,i)=>{const ws=addDays(start,i*7),we=addDays(ws,6),from=dateKey(ws),to=dateKey(we),items=state.shifts.filter(s=>s.date>=from&&s.date<=to),minutes=items.reduce((a,s)=>a+calcShift(s).minutes,0);return {start:ws,end:we,minutes,count:items.length}})
}
function renderWeeklyHours(){
  const today=todayKey();
  $('weeklyHoursList').innerHTML=visibleCalendarWeeks().map(w=>{
    const from=dateKey(w.start),to=dateKey(w.end),current=today>=from&&today<=to;
    return `<div class="week-hour-row ${current?'current':''}"><span>${shortDate(w.start)}〜${shortDate(w.end)}</span><b>${hoursText(w.minutes)}</b></div>`
  }).join('');
}
function sumPay(list){return list.reduce((a,s)=>a+calcShift(s).pay,0)}
function fixedTotal(){return state.fixedCosts.reduce((a,f)=>a+num(f.amount),0)}
function daysInMonth(y,m){return new Date(y,m+1,0,12).getDate()}
function dayInMonth(y,m,day){return new Date(y,m,Math.min(daysInMonth(y,m),Math.max(1,num(day,1))),12)}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function payrollCycleForDate(w,ref=new Date()){
  const today=parseDate(dateKey(ref)),y=today.getFullYear(),m=today.getMonth();
  const closeThis=dayInMonth(y,m,w.closingDay);
  let start,end;
  if(today<=closeThis){
    end=closeThis;
    const prevMonth=new Date(y,m-1,1,12),prevClose=dayInMonth(prevMonth.getFullYear(),prevMonth.getMonth(),w.closingDay);
    start=addDays(prevClose,1);
  }else{
    start=addDays(closeThis,1);
    const nextMonth=new Date(y,m+1,1,12);
    end=dayInMonth(nextMonth.getFullYear(),nextMonth.getMonth(),w.closingDay);
  }
  const payMonthOffset=num(w.payday)<=num(w.closingDay)?1:0;
  const pm=new Date(end.getFullYear(),end.getMonth()+payMonthOffset,1,12);
  const payDate=dayInMonth(pm.getFullYear(),pm.getMonth(),w.payday);
  return {start,end,payDate};
}
function previousPayrollCycle(w,cycle){
  const end=addDays(cycle.start,-1),m=new Date(end.getFullYear(),end.getMonth()-1,1,12),prevClose=dayInMonth(m.getFullYear(),m.getMonth(),w.closingDay);
  return {start:addDays(prevClose,1),end};
}
function payrollCycleForPayMonth(w,year,month){
  const payDate=dayInMonth(year,month,w.payday);
  const closeMonth=num(w.payday)>num(w.closingDay)?new Date(year,month,1,12):new Date(year,month-1,1,12);
  const end=dayInMonth(closeMonth.getFullYear(),closeMonth.getMonth(),w.closingDay);
  const previousCloseMonth=new Date(end.getFullYear(),end.getMonth()-1,1,12);
  const previousClose=dayInMonth(previousCloseMonth.getFullYear(),previousCloseMonth.getMonth(),w.closingDay);
  return {start:addDays(previousClose,1),end,payDate};
}
function isConfiguredPaydayToday(w,ref=new Date()){
  const payDate=dayInMonth(ref.getFullYear(),ref.getMonth(),w.payday);
  return dateKey(payDate)===dateKey(ref);
}
function paidThisCalendarMonth(ref=new Date()){
  const cycles=state.workplaces.map(w=>{
    const cycle=payrollCycleForPayMonth(w,ref.getFullYear(),ref.getMonth()),start=dateKey(cycle.start),end=dateKey(cycle.end);
    const shifts=state.shifts.filter(s=>s.workplaceId===w.id&&s.date>=start&&s.date<=end);
    return {w,cycle,shifts,pay:sumPay(shifts)};
  });
  return {cycles,total:cycles.reduce((a,x)=>a+x.pay,0)};
}
function goalReferencePreset(cycles){
  const counts=new Map();
  cycles.forEach(x=>x.shifts.forEach(s=>{if(s.presetId)counts.set(s.presetId,(counts.get(s.presetId)||0)+1)}));
  const byUsage=[...counts.entries()].sort((a,b)=>b[1]-a[1]).map(([id])=>preset(id)).find(p=>p&&calcPreset(p).pay>0);
  if(byUsage)return byUsage;
  const configured=preset(state.settings.goalPresetId);
  if(configured&&calcPreset(configured).pay>0)return configured;
  return state.presets.find(p=>calcPreset(p).pay>0)||null;
}
function daysInclusive(a,b){return Math.max(1,Math.round((parseDate(dateKey(b))-parseDate(dateKey(a)))/86400000)+1)}
function decimal1(v){const n=Math.round(num(v)*10)/10;return Number.isInteger(n)?String(n):n.toFixed(1)}
function maybeShowPaydayReport(ref=new Date()){
  const goal=num(state.settings.monthlyGoal);
  if(goal<=0||!state.workplaces.some(w=>isConfiguredPaydayToday(w,ref)))return;
  const report=paidThisCalendarMonth(ref),actual=report.total,remaining=Math.max(0,goal-actual);
  const paydayNames=state.workplaces.filter(w=>isConfiguredPaydayToday(w,ref)).map(w=>w.name);
  const signature=[dateKey(ref),goal,actual,paydayNames.join('|')].join('::');
  if(localStorage.getItem('shiftwallet.simple.paydayReportSeen')===signature)return;
  const dialog=$('paydayReportDialog');if(!dialog||dialog.open)return;
  localStorage.setItem('shiftwallet.simple.paydayReportSeen',signature);
  $('paydayReportDate').textContent=`${ref.getMonth()+1}月${ref.getDate()}日 給料日`;
  $('paydayReportMeta').textContent=`今月支給分 ${yen(actual)} / 目標 ${yen(goal)}`;
  if(remaining<=0){
    $('paydayReportMessage').textContent='目標月収を達成しました。';
    $('paydayReportDetail').textContent='';
  }else{
    const p=goalReferencePreset(report.cycles),cp=p?calcPreset(p):null,need=cp?.pay?Math.ceil(remaining/cp.pay):null;
    const starts=report.cycles.map(x=>x.cycle.start),ends=report.cycles.map(x=>x.cycle.end);
    const start=new Date(Math.min(...starts.map(d=>d.getTime()))),end=new Date(Math.max(...ends.map(d=>d.getTime()))),weeks=daysInclusive(start,end)/7;
    $('paydayReportMessage').textContent=`目標月収まで残り${yen(remaining)}でした。`;
    if(p&&need!==null){
      const perWeek=need/Math.max(1,weeks);
      $('paydayReportDetail').textContent=`達成するには「${p.name}」であと${need}回シフトに出れば達成できました。平均すると週に＋${decimal1(perWeek)}日必要でした。`;
    }else{
      $('paydayReportDetail').textContent='シフトプリセットの時給・勤務時間を設定すると、必要なシフト回数を計算できます。';
    }
  }
  dialog.showModal();
}
function workplaceIncomeSummary(w,ref=new Date()){
  const cycle=payrollCycleForDate(w,ref),start=dateKey(cycle.start),end=dateKey(cycle.end),today=dateKey(ref);
  const shifts=state.shifts.filter(s=>s.workplaceId===w.id&&s.date>=start&&s.date<=end);
  const currentShifts=shifts.filter(s=>isShiftFinished(s,ref));
  const previous=previousPayrollCycle(w,cycle),ps=dateKey(previous.start),pe=dateKey(previous.end),previousShifts=state.shifts.filter(s=>s.workplaceId===w.id&&s.date>=ps&&s.date<=pe);
  return {...cycle,currentPay:sumPay(currentShifts),plannedPay:sumPay(shifts),currentMinutes:currentShifts.reduce((a,s)=>a+calcShift(s).minutes,0),plannedMinutes:shifts.reduce((a,s)=>a+calcShift(s).minutes,0),previousPay:sumPay(previousShifts),previousCount:previousShifts.length,currentEnd:parseDate(today),currentCount:currentShifts.length,plannedCount:shifts.length};
}
function shortDate(d){return `${d.getMonth()+1}/${d.getDate()}`}
function payDateLabel(d){return `${d.getMonth()+1}/${d.getDate()}`}
function toast(text){const t=$('toast');t.textContent=text;t.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove('show'),1500)}
function openDialog(id){$(id).showModal()}
function closeDialogs(){document.querySelectorAll('dialog[open]').forEach(d=>d.close())}
function formatShiftLine(s){const p=preset(s.presetId),w=workplace(s.workplaceId);return `${w.name} · ${p?.name||`${s.start}–${s.end}`}`}

function renderAll(){renderHome();renderSettings();renderShiftPage();renderSelects()}
function renderHome(){
  const now=new Date(),today=todayKey(),fixed=fixedTotal();
  const incomes=state.workplaces.map(w=>({w,s:workplaceIncomeSummary(w,now)}));
  const cur=incomes.reduce((a,x)=>a+x.s.currentPay,0),planned=incomes.reduce((a,x)=>a+x.s.plannedPay,0);
  const currentMinutes=incomes.reduce((a,x)=>a+x.s.currentMinutes,0),plannedMinutes=incomes.reduce((a,x)=>a+x.s.plannedMinutes,0);
  const previousPay=incomes.reduce((a,x)=>a+x.s.previousPay,0),hasPrevious=incomes.some(x=>x.s.previousCount>0),diff=planned-previousPay;
  $('currentMonthLabel').textContent=monthLabel(now);
  $('currentIncome').textContent=yen(cur);$('plannedIncome').textContent=yen(planned);
  $('currentAfterFixed').textContent=yen(cur-fixed);$('plannedAfterFixed').textContent=yen(planned-fixed);$('fixedTotalHome').textContent=yen(fixed);
  $('currentHoursHome').textContent=hoursText(currentMinutes);$('plannedHoursHome').textContent=hoursText(plannedMinutes);
  $('monthComparison').textContent=hasPrevious?`前月比 ${diff>0?'+':diff<0?'−':'±'}${yen(Math.abs(diff))}`:'前月比 —';
  $('currentIncomeBreakdown').innerHTML=incomes.map(({w,s})=>`<div class="income-line"><div><b><i class="color-swatch" style="--swatch:${workplaceColor(w.id)}"></i>${esc(w.name)}</b><small>${num(w.closingDay)}日〆 · ${num(w.payday)}日給料 · ${shortDate(s.start)}〜${shortDate(s.currentEnd)}</small></div><strong>${yen(s.currentPay)}</strong></div>`).join('');
  $('plannedIncomeBreakdown').innerHTML=incomes.map(({w,s})=>`<div class="income-line"><div><b><i class="color-swatch" style="--swatch:${workplaceColor(w.id)}"></i>${esc(w.name)}</b><small>${num(w.closingDay)}日〆 · ${num(w.payday)}日給料 · ${shortDate(s.start)}〜${shortDate(s.end)} · ${payDateLabel(s.payDate)}支給</small></div><strong>${yen(s.plannedPay)}</strong></div>`).join('');
  const goal=num(state.settings.monthlyGoal),remaining=Math.max(0,goal-planned),pct=goal?Math.min(100,planned/goal*100):0;
  $('goalAmountHome').textContent=yen(goal);$('goalRemainingHome').textContent=remaining?yen(remaining):'達成';$('goalProgress').style.width=`${pct}%`;
  $('goalPresetNeeds').innerHTML=remaining<=0?'<div class="goal-done">目標に到達しています</div>':state.presets.length?state.presets.map(p=>{const cp=calcPreset(p),need=cp.pay?Math.ceil(remaining/cp.pay):null;return `<div class="goal-need-row"><span><i class="color-swatch" style="--swatch:${presetColor(p)}"></i><b>${esc(p.name)}</b><small>${esc(workplace(p.workplaceId).name)}</small></span><strong>${need===null?'—':`あと${need}回`}</strong></div>`}).join(''):'<div class="empty">プリセットを設定してください</div>';
  const future=state.shifts.filter(s=>shiftEndDateTime(s)>=now).sort((a,b)=>a.date.localeCompare(b.date)||a.start.localeCompare(b.start)).slice(0,3);
  $('nextShift').innerHTML=future.length?future.map(s=>`<div class="quiet-row"><div class="quiet-main"><b><i class="color-swatch" style="--swatch:${shiftColor(s)}"></i>${esc(formatShiftLine(s))}</b><small>${esc(s.date.replaceAll('-','/'))}　${esc(s.start)}–${esc(s.end)}　休憩${num(s.breakMinutes)}分</small></div><div class="quiet-side"><b>${yen(calcShift(s).pay)}</b></div></div>`).join(''):'<div class="empty">予定はありません</div>';
}
function renderSelects(){
  const wpOpts=state.workplaces.map(w=>`<option value="${w.id}">${esc(w.name)}</option>`).join('');
  ['presetWorkplace','shiftWorkplace'].forEach(id=>{const el=$(id);const old=el.value;el.innerHTML=wpOpts;if(state.workplaces.some(w=>w.id===old))el.value=old});
}
function renderSettings(){
  $('goalAmountInput').value=num(state.settings.monthlyGoal);$('fixedTotalSetting').textContent=yen(fixedTotal());
  $('fixedList').innerHTML=state.fixedCosts.length?state.fixedCosts.map(f=>`<div class="quiet-row"><div class="quiet-main"><b>${esc(f.name)}</b></div><div class="quiet-side"><b>${yen(f.amount)}</b><div class="row-actions"><button class="mini-link" data-edit-fixed="${f.id}">編集</button><button class="mini-link" data-delete-fixed="${f.id}">削除</button></div></div></div>`).join(''):'<div class="empty">固定費はまだありません</div>';
  $('workplaceList').innerHTML=state.workplaces.map(w=>`<div class="quiet-row"><div class="quiet-main"><b><i class="color-swatch" style="--swatch:${workplaceColor(w.id)}"></i>${esc(w.name)}</b><small>時給 ${yen(w.hourlyWage)}　·　${num(w.closingDay)}日〆 / ${num(w.payday)}日給料</small></div><div class="quiet-side"><div class="row-actions"><button class="mini-link" data-edit-workplace="${w.id}">編集</button><button class="mini-link" data-delete-workplace="${w.id}">削除</button></div></div></div>`).join('');
  $('presetList').innerHTML=state.presets.length?state.presets.map(p=>`<div class="quiet-row"><div class="quiet-main"><b><i class="color-swatch" style="--swatch:${presetColor(p)}"></i>${esc(p.name)} <span style="font-weight:400;color:var(--muted)">｜ ${esc(workplace(p.workplaceId).name)}</span></b><small>${esc(p.start)}–${esc(p.end)}　休憩${num(p.breakMinutes)}分　約${yen(calcPreset(p).pay)}</small></div><div class="quiet-side"><div class="row-actions"><button class="mini-link" data-edit-preset="${p.id}">編集</button><button class="mini-link" data-delete-preset="${p.id}">削除</button></div></div></div>`).join(''):'<div class="empty">プリセットを作成してください</div>';
}
function renderShiftPage(){
  $('calendarMonthTitle').textContent=monthLabel(viewMonth);
  const presets=state.presets;
  $('calendarPresetStrip').innerHTML=presets.length?presets.map(p=>`<button type="button" class="preset-chip ${selectedPresetId===p.id?'selected':''}" style="--shift-color:${presetColor(p)}" data-select-preset="${p.id}"><i class="color-swatch" style="--swatch:${presetColor(p)}"></i><b>${esc(p.name)}</b><small>${esc(workplace(p.workplaceId).name)} · ${esc(p.start)}–${esc(p.end)}</small></button>`).join(''):'<div class="empty">プリセットなしでも日付タップで追加できます</div>';
  const sp=preset(selectedPresetId),panel=$('presetPanel');
  $('addModeText').textContent=sp?`追加モード：${sp.name}（選択解除で単発追加）`:'日付タップで単発シフトを追加 / 登録済み日は編集';$('clearPresetSelection').hidden=!sp;
  panel.classList.toggle('adding',!!sp);panel.style.setProperty('--mode-color',sp?presetColor(sp):'var(--line-strong)');
  renderCalendar();renderWeeklyHours();
  const list=monthShifts(monthKey(viewMonth));$('shiftCount').textContent=`${list.length}件`;$('viewMonthIncome').textContent=yen(sumPay(list));
}
function renderCalendar(){
  const y=viewMonth.getFullYear(),m=viewMonth.getMonth(),first=new Date(y,m,1,12),start=new Date(y,m,1-first.getDay(),12),today=todayKey(),html=[];
  for(let i=0;i<42;i++){
    const d=new Date(start);d.setDate(start.getDate()+i);const key=dateKey(d),inside=d.getMonth()===m,items=state.shifts.filter(s=>s.date===key).sort((a,b)=>a.start.localeCompare(b.start));
    const visibleCount=items.length>2?1:2,marks=items.slice(0,visibleCount).map(s=>`<span class="shift-mark" style="--shift-color:${shiftColor(s)}">${shiftMarkLabel(s)}</span>`).join(''),more=items.length>visibleCount?`<span class="shift-more">+${items.length-visibleCount}</span>`:'';
    html.push(`<button type="button" class="day ${inside?'':'outside'} ${key===today?'today':''} ${selectedPresetId?'addable':''}" data-date="${key}"><span class="day-num">${d.getDate()}</span>${items.length?`<span class="day-marks">${marks}${more}</span>`:''}</button>`);
  }
  $('calendar').innerHTML=html.join('');
}
function openDay(date){
  const items=state.shifts.filter(s=>s.date===date).sort((a,b)=>a.start.localeCompare(b.start));$('dayDialogTitle').textContent=date.replaceAll('-','/');
  $('dayShiftList').innerHTML=items.length?items.map(s=>{const c=calcShift(s);return `<div class="quiet-row shift-detail-row" style="--shift-color:${shiftColor(s)}"><div class="quiet-main"><b><i class="color-swatch" style="--swatch:${shiftColor(s)}"></i>${esc(formatShiftLine(s))}</b><small>${esc(s.start)}–${esc(s.end)}　休憩${num(s.breakMinutes)}分　時給${yen(c.hourlyWage)}</small></div><div class="quiet-side"><b>${yen(c.pay)}</b><div class="row-actions"><button type="button" class="mini-link" data-edit-shift="${s.id}">編集</button><button type="button" class="mini-link" data-delete-shift="${s.id}">削除</button></div></div></div>`}).join(''):'<div class="empty">この日のシフトはありません</div>';
  $('addShiftForDayBtn').dataset.date=date;
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
function openManualShift(date){
  renderSelects();const w=state.workplaces[0];$('shiftDialogTitle').textContent='シフトを追加';$('shiftId').value='';$('shiftDate').value=date;$('shiftWorkplace').value=w?.id||'';$('shiftStart').value='09:00';$('shiftEnd').value='17:00';$('shiftWage').value=w?.hourlyWage??0;$('shiftBreak').value=0;closeDialogs();openDialog('shiftDialog')
}
function openShiftEditor(id){
  const s=state.shifts.find(x=>x.id===id);if(!s)return;renderSelects();const c=calcShift(s);$('shiftDialogTitle').textContent='シフトを編集';$('shiftId').value=s.id;$('shiftDate').value=s.date;$('shiftWorkplace').value=s.workplaceId;$('shiftStart').value=s.start;$('shiftEnd').value=s.end;$('shiftWage').value=c.hourlyWage;$('shiftBreak').value=s.breakMinutes;closeDialogs();openDialog('shiftDialog')
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
$('calendar').addEventListener('click',e=>{const b=e.target.closest('[data-date]');if(!b)return;const p=preset(selectedPresetId);if(p){if(b.classList.contains('outside')){toast('前後の月は月を切り替えて追加してください');return}addPresetToDate(p,b.dataset.date);return}const items=state.shifts.filter(s=>s.date===b.dataset.date);if(items.length){openDay(b.dataset.date);return}if(b.classList.contains('outside')){toast('前後の月は月を切り替えて追加してください');return}openManualShift(b.dataset.date)});
$('addShiftForDayBtn').onclick=()=>openManualShift($('addShiftForDayBtn').dataset.date);
$('shiftWorkplace').addEventListener('change',()=>{if(!$('shiftId').value)$('shiftWage').value=workplace($('shiftWorkplace').value)?.hourlyWage??0});
$('goalForm').onsubmit=e=>{e.preventDefault();state.settings.monthlyGoal=Math.max(0,num($('goalAmountInput').value));save();toast('目標を保存しました')};
$('addWorkplaceBtn').onclick=()=>openWorkplaceEditor();$('addPresetBtn').onclick=()=>openPresetEditor();$('addFixedBtn').onclick=()=>openFixedEditor();
$('workplaceForm').onsubmit=e=>{e.preventDefault();const id=$('workplaceId').value||uid(),item={id,name:$('workplaceName').value.trim(),hourlyWage:Math.max(0,num($('workplaceWage').value)),closingDay:Math.min(31,Math.max(1,num($('workplaceClosingDay').value,10))),payday:Math.min(31,Math.max(1,num($('workplacePayday').value,25)))},i=state.workplaces.findIndex(x=>x.id===id);if(i>=0)state.workplaces[i]=item;else state.workplaces.push(item);save();closeDialogs();toast('保存しました')};
$('presetForm').onsubmit=e=>{e.preventDefault();const id=$('presetId').value||uid(),item={id,workplaceId:$('presetWorkplace').value,name:$('presetName').value.trim(),start:$('presetStart').value,end:$('presetEnd').value,breakMinutes:Math.max(0,num($('presetBreak').value))},i=state.presets.findIndex(x=>x.id===id);if(i>=0)state.presets[i]=item;else state.presets.push(item);if(!state.settings.goalPresetId)state.settings.goalPresetId=id;save();closeDialogs();toast(`休憩${item.breakMinutes}分で保存しました`)};
$('fixedForm').onsubmit=e=>{e.preventDefault();const id=$('fixedId').value||uid(),item={id,name:$('fixedName').value.trim(),amount:Math.max(0,num($('fixedAmount').value))},i=state.fixedCosts.findIndex(x=>x.id===id);if(i>=0)state.fixedCosts[i]=item;else state.fixedCosts.push(item);save();closeDialogs();toast('保存しました')};
$('shiftForm').onsubmit=e=>{e.preventDefault();const id=$('shiftId').value,workplaceId=$('shiftWorkplace').value,hourlyWage=Math.max(0,num($('shiftWage').value)),data={date:$('shiftDate').value,workplaceId,start:$('shiftStart').value,end:$('shiftEnd').value,breakMinutes:Math.max(0,num($('shiftBreak').value)),hourlyWage};if(!id){state.shifts.push({id:uid(),presetId:'',...data});save();closeDialogs();toast('シフトを追加しました');return}const s=state.shifts.find(x=>x.id===id);if(!s)return;const oldWorkplace=s.workplaceId;s.date=data.date;s.workplaceId=data.workplaceId;s.start=data.start;s.end=data.end;s.breakMinutes=data.breakMinutes;s.hourlyWage=s.presetId&&hourlyWage===num(workplace(data.workplaceId)?.hourlyWage)?null:hourlyWage;if(oldWorkplace!==s.workplaceId)s.presetId='';save();closeDialogs();toast('シフトを更新しました')};

document.addEventListener('click',e=>{
  const q=a=>e.target.closest(`[${a}]`)?.getAttribute(a);
  const ew=q('data-edit-workplace');if(ew)return openWorkplaceEditor(ew);const dw=q('data-delete-workplace');if(dw)return deleteWorkplace(dw);
  const ep=q('data-edit-preset');if(ep)return openPresetEditor(ep);const dp=q('data-delete-preset');if(dp){if(confirm('このプリセットを削除しますか？ 登録済みシフトは残ります。')){state.presets=state.presets.filter(x=>x.id!==dp);if(state.settings.goalPresetId===dp)state.settings.goalPresetId=state.presets[0]?.id||'';if(selectedPresetId===dp)selectedPresetId='';save()}return}
  const ef=q('data-edit-fixed');if(ef)return openFixedEditor(ef);const df=q('data-delete-fixed');if(df){if(confirm('この固定費を削除しますか？')){state.fixedCosts=state.fixedCosts.filter(x=>x.id!==df);save()}return}
  const es=q('data-edit-shift');if(es)return openShiftEditor(es);const ds=q('data-delete-shift');if(ds){if(confirm('このシフトを削除しますか？')){state.shifts=state.shifts.filter(x=>x.id!==ds);save();closeDialogs();toast('削除しました')}return}
});
$('exportBtn').onclick=downloadBackup;
$('importInput').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{state=normalize(JSON.parse(await f.text()));save();toast('読み込みました')}catch{toast('読み込めませんでした')}e.target.value=''};
$('resetBtn').onclick=()=>{if(confirm('ShiftWalletのデータをすべて削除しますか？')){state=defaultState();selectedPresetId='';localStorage.setItem(KEY,JSON.stringify(state));localStorage.removeItem('shiftwallet.simple.paydayReportSeen');renderAll();toast('初期化しました')}};
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstallPrompt=e;$('installBtn').hidden=false});$('installBtn').onclick=async()=>{if(!deferredInstallPrompt)return;deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;$('installBtn').hidden=true};
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js?v=4.9.0').catch(console.error));
let lastRenderedDate=todayKey();
function refreshForDateChange(){
  const nowKey=todayKey();
  if(nowKey!==lastRenderedDate){
    const previousMonth=lastRenderedDate.slice(0,7),newMonth=nowKey.slice(0,7);
    if(previousMonth!==newMonth&&monthKey(viewMonth)===previousMonth){const d=parseDate(nowKey);viewMonth=new Date(d.getFullYear(),d.getMonth(),1,12)}
    lastRenderedDate=nowKey;renderAll();return;
  }
  // 同じ日でもシフト終了時刻を過ぎたら「現在の月収」を更新する
  renderHome();
}
window.addEventListener('focus',()=>{refreshForDateChange();maybeShowPaydayReport()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){refreshForDateChange();maybeShowPaydayReport()}});
setInterval(()=>{if(!document.hidden)refreshForDateChange()},60000);
renderAll();
setTimeout(()=>maybeShowPaydayReport(),120);
