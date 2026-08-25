'use strict';

const STORAGE_KEY='shiftwallet.v2';
const LEGACY_KEY='shiftwallet.v1';
const APP_VERSION=2;
const $=id=>document.getElementById(id);
const uid=()=>crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`;
const pad=n=>String(n).padStart(2,'0');
const yen=n=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Math.round(Number(n)||0));
const num=n=>Number(n)||0;
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const esc=(s='')=>String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const toKey=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const monthKey=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}`;
const parseKey=s=>{const [y,m,d]=String(s).split('-').map(Number);return new Date(y,m-1,d,12,0,0,0)};
const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
const addMonths=(d,n)=>{const x=new Date(d.getFullYear(),d.getMonth()+n,d.getDate(),12);return x};
const startOfMonth=d=>new Date(d.getFullYear(),d.getMonth(),1,12);
const endOfMonth=d=>new Date(d.getFullYear(),d.getMonth()+1,0,12);
const dayCount=(a,b)=>Math.max(0,Math.ceil((b-a)/86400000));
const dateFmt=d=>`${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;
const monthFmt=d=>`${d.getFullYear()}年${d.getMonth()+1}月`;
const today=()=>{const d=new Date();d.setHours(12,0,0,0);return d};

function dayOfMonth(d,day){
  if(Number(day)===0) return endOfMonth(d);
  const last=endOfMonth(d).getDate();
  return new Date(d.getFullYear(),d.getMonth(),Math.min(Number(day),last),12);
}
function shiftWeekend(d,rule){
  const x=new Date(d);
  if(rule==='previous') while(x.getDay()===0||x.getDay()===6)x.setDate(x.getDate()-1);
  if(rule==='next') while(x.getDay()===0||x.getDay()===6)x.setDate(x.getDate()+1);
  return x;
}
function dayLabel(v){return Number(v)===0?'月末':`${v}日`}

function createWorkplace(name='メインバイト'){
  const id=uid();
  return {id,name,closingDay:10,payDay:25,payOffset:0,weekendRule:'previous',nightStart:'22:00',nightEnd:'05:00',nightMultiplier:1.25,overtimeHours:8,overtimeMultiplier:1.25};
}
function defaultState(){
  const w=createWorkplace();
  const p1={id:uid(),workplaceId:w.id,name:'夕方 17-21',start:'17:00',end:'21:00',breakMins:0,transport:0};
  const p2={id:uid(),workplaceId:w.id,name:'ロング 9-17',start:'09:00',end:'17:00',breakMins:60,transport:0};
  return {
    version:APP_VERSION,
    settings:{currentBalance:0,salaryGoal:100000,goalPresetId:p1.id,moneyPeriod:'calendar'},
    workplaces:[w],
    wageHistory:[{id:uid(),workplaceId:w.id,effectiveFrom:'2026-01-01',hourlyWage:1034}],
    presets:[p1,p2],
    shifts:[],expenses:[],fixedCosts:[],budgets:[],payslips:[]
  };
}
function migrateLegacy(old){
  const fresh=defaultState();
  const w=fresh.workplaces[0];
  const oldWage=num(old?.settings?.hourlyWage)||1034;
  fresh.settings.salaryGoal=num(old?.settings?.monthlyGoal)||100000;
  fresh.wageHistory=[{id:uid(),workplaceId:w.id,effectiveFrom:'2020-01-01',hourlyWage:oldWage}];
  fresh.presets=(old.presets||[]).map(p=>({id:p.id||uid(),workplaceId:w.id,name:p.name||'シフト',start:p.start||'17:00',end:p.end||'21:00',breakMins:num(p.breakMins),transport:0}));
  if(!fresh.presets.length) fresh.presets=defaultState().presets.map(p=>({...p,workplaceId:w.id}));
  fresh.settings.goalPresetId=old?.settings?.goalPresetId||fresh.presets[0]?.id||'';
  fresh.shifts=(old.shifts||[]).map(s=>({id:s.id||uid(),date:s.date,workplaceId:w.id,name:s.name||'シフト',plannedStart:s.start||'17:00',plannedEnd:s.end||'21:00',plannedBreak:num(s.breakMins),worked:!!s.worked,actualStart:s.start||'17:00',actualEnd:s.end||'21:00',actualBreak:num(s.breakMins),wageOverride:num(s.wage)||null,transport:0,note:'',presetId:s.presetId||null}));
  fresh.expenses=(old.expenses||[]).map(x=>({...x,id:x.id||uid()}));
  fresh.fixedCosts=(old.fixedCosts||[]).map(x=>({id:x.id||uid(),name:x.name,amount:num(x.amount),category:x.category||'サブスク',cycle:'monthly',day:num(x.day)||1,month:1}));
  return fresh;
}
function normalizeState(s){
  const d=defaultState();
  return {
    ...d,...s,version:APP_VERSION,
    settings:{...d.settings,...(s.settings||{})},
    workplaces:Array.isArray(s.workplaces)&&s.workplaces.length?s.workplaces:d.workplaces,
    wageHistory:Array.isArray(s.wageHistory)?s.wageHistory:d.wageHistory,
    presets:Array.isArray(s.presets)?s.presets:d.presets,
    shifts:Array.isArray(s.shifts)?s.shifts:[],expenses:Array.isArray(s.expenses)?s.expenses:[],fixedCosts:Array.isArray(s.fixedCosts)?s.fixedCosts:[],budgets:Array.isArray(s.budgets)?s.budgets:[],payslips:Array.isArray(s.payslips)?s.payslips:[]
  };
}
function loadState(){
  try{
    const raw=localStorage.getItem(STORAGE_KEY);if(raw)return normalizeState(JSON.parse(raw));
    const legacy=localStorage.getItem(LEGACY_KEY);if(legacy){const migrated=migrateLegacy(JSON.parse(legacy));localStorage.setItem(STORAGE_KEY,JSON.stringify(migrated));return migrated;}
  }catch(e){console.error(e)}
  return defaultState();
}
let state=loadState();
let viewMonth=startOfMonth(today());
let deferredInstallPrompt=null;

function saveState(message){localStorage.setItem(STORAGE_KEY,JSON.stringify(state));renderAll();if(message)toast(message)}
function toast(message){const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),1800)}
function workplace(id){return state.workplaces.find(x=>x.id===id)||state.workplaces[0]}
function wageFor(workplaceId,dateStr){
  const rows=state.wageHistory.filter(x=>x.workplaceId===workplaceId&&x.effectiveFrom<=dateStr).sort((a,b)=>b.effectiveFrom.localeCompare(a.effectiveFrom));
  return num(rows[0]?.hourlyWage);
}
function minutesBetween(start,end){
  if(!start||!end)return 0;const [sh,sm]=start.split(':').map(Number),[eh,em]=end.split(':').map(Number);let x=(eh*60+em)-(sh*60+sm);if(x<0)x+=1440;return x;
}
function timeToMin(t){const [h,m]=String(t||'00:00').split(':').map(Number);return h*60+m}
function workFields(s,useActual=s.worked){
  return useActual&&s.actualStart&&s.actualEnd?{start:s.actualStart,end:s.actualEnd,breakMins:num(s.actualBreak)}:{start:s.plannedStart,end:s.plannedEnd,breakMins:num(s.plannedBreak)};
}
function shiftHours(s,useActual=s.worked){const f=workFields(s,useActual);return Math.max(0,(minutesBetween(f.start,f.end)-f.breakMins)/60)}
function shiftPay(s,useActual=s.worked){
  const w=workplace(s.workplaceId);const f=workFields(s,useActual);const total=Math.max(0,minutesBetween(f.start,f.end)-f.breakMins);if(!total)return num(s.transport);
  const wage=num(s.wageOverride)||wageFor(s.workplaceId,s.date);if(!wage)return num(s.transport);
  const start=timeToMin(f.start);const nightS=timeToMin(w.nightStart||'22:00'),nightE=timeToMin(w.nightEnd||'05:00');const otStart=Math.round(num(w.overtimeHours||8)*60);
  let pay=0;
  // Minute-level calculation keeps overnight/night/overtime overlaps correct enough for payroll estimates.
  for(let i=0;i<total;i++){
    const absolute=start+i;const md=((absolute%1440)+1440)%1440;
    const isNight=nightS>nightE?(md>=nightS||md<nightE):(md>=nightS&&md<nightE);
    const isOT=i>=otStart;
    let mult=1;if(isNight)mult+=Math.max(0,num(w.nightMultiplier||1.25)-1);if(isOT)mult+=Math.max(0,num(w.overtimeMultiplier||1.25)-1);
    pay+=wage/60*mult;
  }
  return pay+num(s.transport);
}
function shiftDisplayPay(s){return shiftPay(s,s.worked)}
function shiftDateInRange(s,a,b){const d=parseKey(s.date);return d>=a&&d<=b}

function payDateForClosingMonth(w,closingMonth){
  const base=new Date(closingMonth.getFullYear(),closingMonth.getMonth()+num(w.payOffset),1,12);
  return shiftWeekend(dayOfMonth(base,w.payDay),w.weekendRule);
}
function payPeriodForClosingMonth(w,closeMonth){
  const end=dayOfMonth(closeMonth,w.closingDay);
  const prevMonth=new Date(closeMonth.getFullYear(),closeMonth.getMonth()-1,1,12);
  const prevEnd=dayOfMonth(prevMonth,w.closingDay);
  return {start:addDays(prevEnd,1),end};
}
function nextPayCycle(w,from=today()){
  // Closing month is kept separately so weekend adjustment crossing a month boundary stays correct.
  const candidates=[];
  for(let i=-3;i<=5;i++){
    const cm=new Date(from.getFullYear(),from.getMonth()+i,1,12),pd=payDateForClosingMonth(w,cm);
    if(pd>=from)candidates.push({payDate:pd,...payPeriodForClosingMonth(w,cm)});
  }
  candidates.sort((a,b)=>a.payDate-b.payDate);return candidates[0];
}
function payCycleByDate(w,payDateStr){
  const pd=parseKey(payDateStr),matches=[];
  for(let i=-3;i<=3;i++){
    const cm=new Date(pd.getFullYear(),pd.getMonth()-num(w.payOffset)+i,1,12),candidate=payDateForClosingMonth(w,cm);
    matches.push({distance:Math.abs(candidate-pd),payDate:pd,...payPeriodForClosingMonth(w,cm)});
  }
  matches.sort((a,b)=>a.distance-b.distance);return matches[0];
}
function payCycleShifts(w,cycle){return state.shifts.filter(s=>s.workplaceId===w.id&&shiftDateInRange(s,cycle.start,cycle.end))}
function payCycleTotals(w,cycle){const arr=payCycleShifts(w,cycle);return {actual:arr.filter(s=>s.worked).reduce((a,s)=>a+shiftPay(s,true),0),planned:arr.reduce((a,s)=>a+shiftPay(s,s.worked),0),hours:arr.reduce((a,s)=>a+shiftHours(s,s.worked),0)}}
function nextPayCyclesAll(from=today()){
  return state.workplaces.map(w=>({w,cycle:nextPayCycle(w,from)})).filter(x=>x.cycle).sort((a,b)=>a.cycle.payDate-b.cycle.payDate);
}
function primaryNextCycle(){return nextPayCyclesAll()[0]||null}

function recurringDates(item,start,end){
  const dates=[];let cursor=new Date(start.getFullYear(),start.getMonth(),1,12);const endMonth=new Date(end.getFullYear(),end.getMonth(),1,12);
  while(cursor<=endMonth){
    const match=item.cycle==='monthly'||(item.cycle==='yearly'&&cursor.getMonth()+1===num(item.month));
    if(match){const d=dayOfMonth(cursor,num(item.day)||1);if(d>=start&&d<=end)dates.push(d)}
    cursor=new Date(cursor.getFullYear(),cursor.getMonth()+1,1,12);
  }
  return dates;
}
function fixedEvents(start,end){const out=[];state.fixedCosts.forEach(x=>recurringDates(x,start,end).forEach(d=>out.push({date:d,type:'expense',name:x.name,amount:num(x.amount),category:x.category,source:'fixed'})));return out}
function salaryEvents(start,end){
  const out=[];state.workplaces.forEach(w=>{for(let i=-2;i<=6;i++){const cm=new Date(start.getFullYear(),start.getMonth()+i,1,12),pd=payDateForClosingMonth(w,cm);if(pd>=start&&pd<=end){const cycle={payDate:pd,...payPeriodForClosingMonth(w,cm)};out.push({date:pd,type:'income',name:`${w.name} 給料`,amount:payCycleTotals(w,cycle).planned,workplaceId:w.id})}}});return out;
}
function cashflowEvents(start,end){return [...fixedEvents(start,end),...salaryEvents(start,end)].sort((a,b)=>a.date-b.date||a.type.localeCompare(b.type))}
function projectedBalanceAt(end){let bal=num(state.settings.currentBalance);const t=today();cashflowEvents(t,end).forEach(e=>{if(e.date>t)bal+=e.type==='income'?e.amount:-e.amount});return bal}

function expensesInRange(a,b){return state.expenses.filter(x=>{const d=parseKey(x.date);return d>=a&&d<=b})}
function shiftsInRange(a,b){return state.shifts.filter(x=>shiftDateInRange(x,a,b))}
function monthlyExpenseTotal(d){const a=startOfMonth(d),b=endOfMonth(d);return expensesInRange(a,b).reduce((s,x)=>s+num(x.amount),0)}
function monthlyWorkedIncome(d){const a=startOfMonth(d),b=endOfMonth(d);return shiftsInRange(a,b).filter(s=>s.worked).reduce((s,x)=>s+shiftPay(x,true),0)}
function monthlyPlannedIncome(d){const a=startOfMonth(d),b=endOfMonth(d);return shiftsInRange(a,b).reduce((s,x)=>s+shiftPay(x,x.worked),0)}
function monthlyHours(d){const a=startOfMonth(d),b=endOfMonth(d);return shiftsInRange(a,b).reduce((s,x)=>s+shiftHours(x,x.worked),0)}
function budgetForCategory(cat){return state.budgets.find(x=>x.category===cat)}

function renderAll(){
  renderSelects();renderDashboard();renderShifts();renderMoney();renderSettings();if(document.querySelector('[data-page="analysis"]').classList.contains('active'))renderCharts();
}
function renderSelects(){
  const wp=state.workplaces.map(w=>`<option value="${w.id}">${esc(w.name)}</option>`).join('');['shiftWorkplace','payslipWorkplace','wageWorkplace','presetWorkplace'].forEach(id=>{const el=$(id);if(el){const old=el.value;el.innerHTML=wp;if(state.workplaces.some(w=>w.id===old))el.value=old}});
  const presetOptions=state.presets.map(p=>`<option value="${p.id}">${esc(workplace(p.workplaceId)?.name||'')}｜${esc(p.name)}</option>`).join('');
  $('goalPreset').innerHTML=`<option value="">自動（先頭）</option>${presetOptions}`;$('goalPreset').value=state.settings.goalPresetId||'';
  $('batchPreset').innerHTML=presetOptions||'<option value="">プリセットを作成してください</option>';
  $('shiftPreset').innerHTML=`<option value="">手動入力</option>${presetOptions}`;
}
function renderDashboard(){
  const primary=primaryNextCycle();
  if(primary){
    const {w,cycle}=primary,t=payCycleTotals(w,cycle),goal=num(state.settings.salaryGoal),remain=Math.max(0,goal-t.planned);const preset=state.presets.find(p=>p.id===state.settings.goalPresetId)||state.presets.find(p=>p.workplaceId===w.id)||state.presets[0];let count='—';
    if(preset){const fake={date:toKey(cycle.end),workplaceId:preset.workplaceId,plannedStart:preset.start,plannedEnd:preset.end,plannedBreak:preset.breakMins,worked:false,transport:preset.transport,wageOverride:null};const one=shiftPay(fake,false);if(one>0)count=`あと${Math.ceil(remain/one)}回`}
    $('nextPayForecast').textContent=yen(t.planned);$('nextPayDate').textContent=`${cycle.payDate.getMonth()+1}/${cycle.payDate.getDate()} ${w.name}`;$('daysToPay').textContent=`あと${dayCount(today(),cycle.payDate)}日`;$('payPeriodLabel').textContent=`対象 ${dateFmt(cycle.start)}〜${dateFmt(cycle.end)}`;$('nextPayActual').textContent=yen(t.actual);$('nextPayPlanned').textContent=yen(t.planned);$('nextPayRemaining').textContent=yen(remain);$('neededShiftCount').textContent=count;
  }else{$('nextPayForecast').textContent='¥0';$('nextPayDate').textContent='—';$('daysToPay').textContent='—';$('payPeriodLabel').textContent='勤務先を設定してください'}
  const now=today(),monthWorked=monthlyWorkedIncome(now),hours=monthlyHours(now),monthExp=monthlyExpenseTotal(now);$('workedThisMonth').textContent=yen(monthWorked);$('workedHoursThisMonth').textContent=`${hours.toFixed(1)}時間`;$('expenseThisMonth').textContent=yen(monthExp);
  const next=primary?.cycle?.payDate||addDays(now,30);const futureFixed=fixedEvents(addDays(now,1),next).reduce((s,e)=>s+e.amount,0);const spendable=num(state.settings.currentBalance)-futureFixed;$('spendableUntilPayday').textContent=yen(spendable);const days=Math.max(1,dayCount(now,next));$('spendableDaily').textContent=`1日あたり ${yen(Math.max(0,spendable)/days)}`;$('balance30').textContent=yen(projectedBalanceAt(addDays(now,30)));
  const totalBudget=state.budgets.reduce((s,x)=>s+num(x.amount),0);$('budgetPaceText').textContent=totalBudget?`予算 ${yen(totalBudget)} の ${Math.round(monthExp/totalBudget*100)}%`:'予算未設定';
  const upcoming=[...state.shifts].filter(s=>parseKey(s.date)>=addDays(now,-1)).sort((a,b)=>a.date.localeCompare(b.date)||a.plannedStart.localeCompare(b.plannedStart)).slice(0,5);$('recentShifts').innerHTML=upcoming.length?upcoming.map(shiftItemHtml).join(''):'<div class="empty">直近のシフトはありません</div>';
  $('quickPresetList').innerHTML=state.presets.length?state.presets.map(p=>{const fake={date:$('quickDate').value||toKey(now),workplaceId:p.workplaceId,plannedStart:p.start,plannedEnd:p.end,plannedBreak:p.breakMins,worked:false,transport:p.transport};return `<button class="preset-chip" data-quick-preset="${p.id}"><b>${esc(p.name)}</b><span>${esc(workplace(p.workplaceId)?.name||'')} ${p.start}–${p.end}</span><span>${yen(shiftPay(fake,false))}</span></button>`}).join(''):'<div class="empty">プリセットを作成してください</div>';
  const events=cashflowEvents(now,addDays(now,45)).filter(e=>e.date>=now).slice(0,6);$('cashflowPreview').innerHTML=events.length?events.map(timelineHtml).join(''):'<div class="empty">今後の予定はありません</div>';
}
function shiftItemHtml(s){const wp=workplace(s.workplaceId);const f=workFields(s,s.worked);return `<div class="list-item"><div class="list-main"><div class="list-title"><span class="status-dot ${s.worked?'worked':''}"></span>${esc(s.date)}　${esc(wp?.name||'勤務先')}｜${esc(s.name||'シフト')}</div><div class="list-sub">予定 ${s.plannedStart}–${s.plannedEnd}${s.worked?` / 実績 ${f.start}–${f.end}`:''} / ${shiftHours(s,s.worked).toFixed(1)}h</div></div><div class="list-value"><b>${yen(shiftDisplayPay(s))}</b><small>${s.worked?'確定':'予定'}</small><div class="item-actions"><button class="mini-link" data-edit-shift="${s.id}">編集</button><button class="mini-link danger" data-delete-shift="${s.id}">削除</button></div></div></div>`}
function renderShifts(){
  $('monthTitle').textContent=monthFmt(viewMonth);const y=viewMonth.getFullYear(),m=viewMonth.getMonth(),first=new Date(y,m,1,12),start=addDays(first,-first.getDay()),tk=toKey(today());let html='';
  for(let i=0;i<42;i++){const d=addDays(start,i),key=toKey(d),arr=state.shifts.filter(s=>s.date===key).sort((a,b)=>a.plannedStart.localeCompare(b.plannedStart));html+=`<button class="calendar-day ${d.getMonth()!==m?'outside':''} ${key===tk?'today':''}" data-day="${key}"><span class="day-number">${d.getDate()}</span>${arr.slice(0,2).map(s=>`<div class="day-chip ${s.worked?'worked':''}">${s.plannedStart} ${esc(workplace(s.workplaceId)?.name||'')}</div>`).join('')}${arr.length>2?`<div class="day-chip">+${arr.length-2}</div>`:''}</button>`}$('calendarGrid').innerHTML=html;
  const a=startOfMonth(viewMonth),b=endOfMonth(viewMonth),arr=shiftsInRange(a,b).sort((x,y)=>x.date.localeCompare(y.date)||x.plannedStart.localeCompare(y.plannedStart));$('monthlyShiftList').innerHTML=arr.length?arr.map(shiftItemHtml).join(''):'<div class="empty">この月のシフトはありません</div>';$('monthShiftSummary').textContent=`${arr.length}件 / ${arr.reduce((s,x)=>s+shiftHours(x,x.worked),0).toFixed(1)}h`;
}
function moneyRange(){
  if(state.settings.moneyPeriod==='paycycle'){
    const p=primaryNextCycle();if(p)return {start:p.cycle.start,end:p.cycle.end,label:`給料月 ${dateFmt(p.cycle.start)}〜${dateFmt(p.cycle.end)}`,income:payCycleTotals(p.w,p.cycle).planned};
  }
  return {start:startOfMonth(viewMonth),end:endOfMonth(viewMonth),label:`暦月 ${monthFmt(viewMonth)}`,income:monthlyPlannedIncome(viewMonth)};
}
function renderMoney(){
  document.querySelectorAll('[data-money-period]').forEach(b=>b.classList.toggle('active',b.dataset.moneyPeriod===state.settings.moneyPeriod));const r=moneyRange(),ex=expensesInRange(r.start,r.end).sort((a,b)=>b.date.localeCompare(a.date)),fixed=fixedEvents(r.start,r.end),expense=ex.reduce((s,x)=>s+num(x.amount),0)+fixed.reduce((s,x)=>s+x.amount,0),balance=r.income-expense;$('moneyIncome').textContent=yen(r.income);$('moneyExpense').textContent=yen(expense);$('moneyBalance').textContent=yen(balance);$('moneyBalance').className=balance>=0?'positive':'negative';$('moneyPeriodLabel').textContent=r.label;
  const cats=[...new Set([...state.budgets.map(x=>x.category),...ex.map(x=>x.category)])];$('categoryBudgetList').innerHTML=cats.length?cats.map(cat=>{const b=budgetForCategory(cat),spent=ex.filter(x=>x.category===cat).reduce((s,x)=>s+num(x.amount),0),limit=num(b?.amount),pct=limit?Math.min(100,spent/limit*100):0;return `<div><div class="budget-row-head"><span>${esc(cat)}</span><b>${yen(spent)}${limit?` / ${yen(limit)}`:''}</b></div>${limit?`<div class="progress"><div class="${spent>limit?'over':''}" style="width:${pct}%"></div></div>`:'<div class="inline-note">予算未設定</div>'}<div class="budget-row-actions">${b?`<button class="mini-link" data-edit-budget="${b.id}">編集</button><button class="mini-link danger" data-delete-budget="${b.id}">削除</button>`:`<button class="mini-link" data-new-budget-category="${esc(cat)}">予算設定</button>`}</div></div>`}).join(''):'<div class="empty">カテゴリ予算を設定すると支出ペースが分かります</div>';
  $('fixedCostList').innerHTML=state.fixedCosts.length?state.fixedCosts.map(x=>`<div class="list-item"><div class="list-main"><div class="list-title">${esc(x.name)}</div><div class="list-sub">${esc(x.category)} / ${x.cycle==='yearly'?`毎年${x.month}月`:'毎月'}${x.day}日</div></div><div class="list-value"><b>${yen(x.amount)}</b><div class="item-actions"><button class="mini-link" data-edit-fixed="${x.id}">編集</button><button class="mini-link danger" data-delete-fixed="${x.id}">削除</button></div></div></div>`).join(''):'<div class="empty">固定費・サブスクは未登録です</div>';
  $('expenseList').innerHTML=ex.length?ex.map(x=>`<div class="list-item"><div class="list-main"><div class="list-title">${esc(x.name)}</div><div class="list-sub">${x.date} / ${esc(x.category)}</div></div><div class="list-value"><b>−${yen(x.amount)}</b><div class="item-actions"><button class="mini-link" data-edit-expense="${x.id}">編集</button><button class="mini-link danger" data-delete-expense="${x.id}">削除</button></div></div></div>`).join(''):'<div class="empty">この期間の支出はありません</div>';
  $('payslipList').innerHTML=state.payslips.length?[...state.payslips].sort((a,b)=>b.payDate.localeCompare(a.payDate)).map(p=>{const w=workplace(p.workplaceId),cycle=payCycleByDate(w,p.payDate),pred=payCycleTotals(w,cycle).actual,diff=num(p.actualAmount)-pred;return `<div class="list-item"><div class="list-main"><div class="list-title">${p.payDate} ${esc(w?.name||'')}</div><div class="list-sub">予測 ${yen(pred)} / 実際 ${yen(p.actualAmount)}</div></div><div class="list-value"><b class="${Math.abs(diff)<1?'positive':diff<0?'negative':'positive'}">${diff>=0?'+':''}${yen(diff)}</b><small>差額</small><div class="item-actions"><button class="mini-link" data-edit-payslip="${p.id}">編集</button><button class="mini-link danger" data-delete-payslip="${p.id}">削除</button></div></div></div>`}).join(''):'<div class="empty">給与明細を登録すると予測との差額を確認できます</div>';
  const cf=cashflowEvents(today(),addDays(today(),90));let running=num(state.settings.currentBalance);$('cashflowList').innerHTML=cf.length?cf.map(e=>{if(e.date>today())running+=e.type==='income'?e.amount:-e.amount;return timelineHtml({...e,balance:running})}).join(''):'<div class="empty">未来の入出金予定はありません</div>';
}
function timelineHtml(e){return `<div class="timeline-item ${e.type}"><div class="timeline-row"><div><b>${dateFmt(e.date)} ${esc(e.name)}</b><small>${e.category?esc(e.category):e.type==='income'?'給与':'固定費'}</small></div><b class="${e.type==='income'?'positive':'negative'}">${e.type==='income'?'+':'−'}${yen(e.amount)}</b></div>${e.balance!=null?`<small>予想残高 ${yen(e.balance)}</small>`:''}</div>`}
function renderSettings(){
  $('currentBalance').value=num(state.settings.currentBalance);$('salaryGoal').value=num(state.settings.salaryGoal);$('goalPreset').value=state.settings.goalPresetId||'';
  $('workplaceList').innerHTML=state.workplaces.length?state.workplaces.map(w=>`<div class="list-item"><div class="list-main"><div class="list-title">${esc(w.name)}</div><div class="list-sub">${dayLabel(w.closingDay)}締め / ${w.payOffset===0?'当月':w.payOffset===1?'翌月':'翌々月'}${dayLabel(w.payDay)}払い / 深夜×${w.nightMultiplier} / 残業×${w.overtimeMultiplier}</div></div><div class="list-value"><div class="item-actions"><button class="mini-link" data-edit-workplace="${w.id}">編集</button>${state.workplaces.length>1?`<button class="mini-link danger" data-delete-workplace="${w.id}">削除</button>`:''}</div></div></div>`).join(''):'<div class="empty">勤務先を追加してください</div>';
  $('wageHistoryList').innerHTML=state.wageHistory.length?[...state.wageHistory].sort((a,b)=>b.effectiveFrom.localeCompare(a.effectiveFrom)).map(x=>`<div class="list-item"><div class="list-main"><div class="list-title">${esc(workplace(x.workplaceId)?.name||'')} ${yen(x.hourlyWage)}/h</div><div class="list-sub">${x.effectiveFrom} から適用</div></div><div class="list-value"><div class="item-actions"><button class="mini-link" data-edit-wage="${x.id}">編集</button><button class="mini-link danger" data-delete-wage="${x.id}">削除</button></div></div></div>`).join(''):'<div class="empty">時給履歴を登録してください</div>';
  $('presetList').innerHTML=state.presets.length?state.presets.map(p=>{const fake={date:toKey(today()),workplaceId:p.workplaceId,plannedStart:p.start,plannedEnd:p.end,plannedBreak:p.breakMins,worked:false,transport:p.transport};return `<div class="list-item"><div class="list-main"><div class="list-title">${esc(p.name)}</div><div class="list-sub">${esc(workplace(p.workplaceId)?.name||'')} / ${p.start}–${p.end} / 休憩${p.breakMins}分 / 交通費${yen(p.transport)}</div></div><div class="list-value"><b>${yen(shiftPay(fake,false))}</b><small>概算</small><div class="item-actions"><button class="mini-link" data-edit-preset="${p.id}">編集</button><button class="mini-link danger" data-delete-preset="${p.id}">削除</button></div></div></div>`}).join(''):'<div class="empty">プリセットを作成してください</div>';
}

function drawBarChart(canvas,labels,values,formatter){
  const rect=canvas.getBoundingClientRect();const dpr=window.devicePixelRatio||1;canvas.width=Math.max(300,rect.width*dpr);canvas.height=190*dpr;const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);const W=canvas.width/dpr,H=190,padL=36,padR=8,padT=10,padB=28,max=Math.max(...values,1);ctx.clearRect(0,0,W,H);ctx.font='10px -apple-system';ctx.fillStyle='#667085';ctx.strokeStyle='#e4e7ec';ctx.lineWidth=1;
  for(let i=0;i<=3;i++){const y=padT+(H-padT-padB)*i/3;ctx.beginPath();ctx.moveTo(padL,y);ctx.lineTo(W-padR,y);ctx.stroke();const val=max*(1-i/3);ctx.fillText(formatter(val),2,y+3)}
  const plotW=W-padL-padR,gap=8,barW=Math.max(8,(plotW-gap*(values.length+1))/values.length);values.forEach((v,i)=>{const h=(H-padT-padB)*(v/max),x=padL+gap+i*(barW+gap),y=H-padB-h;ctx.fillStyle='#101828';ctx.beginPath();if(ctx.roundRect)ctx.roundRect(x,y,barW,h,5);else ctx.rect(x,y,barW,h);ctx.fill();ctx.fillStyle='#667085';ctx.textAlign='center';ctx.fillText(labels[i],x+barW/2,H-10)});ctx.textAlign='left';
}
function renderCharts(){
  const months=[];for(let i=5;i>=0;i--)months.push(new Date(today().getFullYear(),today().getMonth()-i,1,12));const labels=months.map(d=>`${d.getMonth()+1}月`);drawBarChart($('incomeChart'),labels,months.map(monthlyWorkedIncome),v=>`${Math.round(v/1000)}k`);drawBarChart($('hoursChart'),labels,months.map(monthlyHours),v=>`${Math.round(v)}h`);drawBarChart($('expenseChart'),labels,months.map(monthlyExpenseTotal),v=>`${Math.round(v/1000)}k`);
}

function navigate(page){document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.dataset.page===page));document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.nav===page));location.hash=page;window.scrollTo({top:0,behavior:'smooth'});if(page==='analysis')setTimeout(renderCharts,50)}
function closeDialog(el){el.closest('dialog')?.close()}
function updateActualVisibility(){$('actualFields').style.display=$('shiftWorked').checked?'block':'none'}
function updateShiftPreview(){const s=formShiftObject();$('shiftPayPreview').textContent=yen(shiftPay(s,s.worked))}
function formShiftObject(){return {id:$('shiftId').value||uid(),date:$('shiftDate').value,workplaceId:$('shiftWorkplace').value,name:state.presets.find(p=>p.id===$('shiftPreset').value)?.name||'シフト',plannedStart:$('plannedStart').value,plannedEnd:$('plannedEnd').value,plannedBreak:num($('plannedBreak').value),worked:$('shiftWorked').checked,actualStart:$('actualStart').value||$('plannedStart').value,actualEnd:$('actualEnd').value||$('plannedEnd').value,actualBreak:$('actualBreak').value===''?num($('plannedBreak').value):num($('actualBreak').value),wageOverride:$('shiftWageOverride').value?num($('shiftWageOverride').value):null,transport:num($('shiftTransport').value),note:$('shiftNote').value.trim(),presetId:$('shiftPreset').value||null}}
function openShift(date=toKey(today()),s=null){$('shiftModalTitle').textContent=s?'シフト編集':'シフト追加';$('shiftId').value=s?.id||'';$('shiftDate').value=s?.date||date;$('shiftWorkplace').value=s?.workplaceId||state.workplaces[0]?.id||'';$('shiftPreset').value=s?.presetId||'';$('plannedStart').value=s?.plannedStart||'17:00';$('plannedEnd').value=s?.plannedEnd||'21:00';$('plannedBreak').value=s?.plannedBreak??0;$('shiftWorked').checked=!!s?.worked;$('actualStart').value=s?.actualStart||s?.plannedStart||'17:00';$('actualEnd').value=s?.actualEnd||s?.plannedEnd||'21:00';$('actualBreak').value=s?.actualBreak??s?.plannedBreak??0;$('shiftWageOverride').value=s?.wageOverride??'';$('shiftTransport').value=s?.transport??0;$('shiftNote').value=s?.note||'';updateActualVisibility();updateShiftPreview();$('shiftModal').showModal()}
function applyPresetToShift(id){const p=state.presets.find(x=>x.id===id);if(!p)return;$('shiftWorkplace').value=p.workplaceId;$('plannedStart').value=p.start;$('plannedEnd').value=p.end;$('plannedBreak').value=p.breakMins;$('shiftTransport').value=p.transport;$('actualStart').value=p.start;$('actualEnd').value=p.end;$('actualBreak').value=p.breakMins;updateShiftPreview()}
function openExpense(x=null){$('expenseId').value=x?.id||'';$('expenseDate').value=x?.date||toKey(today());$('expenseAmount').value=x?.amount??'';$('expenseName').value=x?.name||'';$('expenseCategory').value=x?.category||'食費';$('expenseModal').showModal()}
function openFixed(x=null){$('fixedId').value=x?.id||'';$('fixedName').value=x?.name||'';$('fixedAmount').value=x?.amount??'';$('fixedCategory').value=x?.category||'サブスク';$('fixedCycle').value=x?.cycle||'monthly';$('fixedDay').value=x?.day??1;$('fixedMonth').value=x?.month??1;updateFixedMonth();$('fixedModal').showModal()}
function updateFixedMonth(){$('fixedMonthWrap').style.display=$('fixedCycle').value==='yearly'?'flex':'none'}
function openBudget(x=null,category=''){$('budgetId').value=x?.id||'';$('budgetCategory').value=x?.category||category;$('budgetAmount').value=x?.amount??'';$('budgetModal').showModal()}
function openPayslip(x=null){$('payslipId').value=x?.id||'';$('payslipWorkplace').value=x?.workplaceId||state.workplaces[0]?.id||'';const w=workplace($('payslipWorkplace').value);$('payslipDate').value=x?.payDate||toKey(nextPayCycle(w)?.payDate||today());$('payslipAmount').value=x?.actualAmount??'';$('payslipNote').value=x?.note||'';$('payslipModal').showModal()}
function openWorkplace(x=null){$('workplaceId').value=x?.id||'';$('workplaceName').value=x?.name||'';$('closingDay').value=x?.closingDay??10;$('payDay').value=x?.payDay??25;$('payOffset').value=x?.payOffset??0;$('weekendRule').value=x?.weekendRule||'previous';$('nightStart').value=x?.nightStart||'22:00';$('nightEnd').value=x?.nightEnd||'05:00';$('nightMultiplier').value=x?.nightMultiplier??1.25;$('overtimeHours').value=x?.overtimeHours??8;$('overtimeMultiplier').value=x?.overtimeMultiplier??1.25;$('workplaceModal').showModal()}
function openWage(x=null){$('wageId').value=x?.id||'';$('wageWorkplace').value=x?.workplaceId||state.workplaces[0]?.id||'';$('wageFrom').value=x?.effectiveFrom||toKey(today());$('wageAmount').value=x?.hourlyWage??'';$('wageModal').showModal()}
function openPreset(x=null){$('presetId').value=x?.id||'';$('presetWorkplace').value=x?.workplaceId||state.workplaces[0]?.id||'';$('presetName').value=x?.name||'';$('presetStart').value=x?.start||'17:00';$('presetEnd').value=x?.end||'21:00';$('presetBreak').value=x?.breakMins??0;$('presetTransport').value=x?.transport??0;updatePresetPreview();$('presetModal').showModal()}
function updatePresetPreview(){const fake={date:toKey(today()),workplaceId:$('presetWorkplace').value,plannedStart:$('presetStart').value,plannedEnd:$('presetEnd').value,plannedBreak:num($('presetBreak').value),worked:false,transport:num($('presetTransport').value)};$('presetPayPreview').textContent=yen(shiftPay(fake,false))}
function openBatch(){const t=toKey(today());$('batchStartDate').value=t;$('batchEndDate').value=t;document.querySelectorAll('#batchModal .weekday-picker input').forEach(x=>x.checked=false);$('batchModal').showModal()}

function addFromPreset(presetId,date){const p=state.presets.find(x=>x.id===presetId);if(!p)return;state.shifts.push({id:uid(),date,workplaceId:p.workplaceId,name:p.name,plannedStart:p.start,plannedEnd:p.end,plannedBreak:num(p.breakMins),worked:false,actualStart:p.start,actualEnd:p.end,actualBreak:num(p.breakMins),wageOverride:null,transport:num(p.transport),note:'',presetId:p.id});saveState(`${p.name}を追加しました`)}
function download(name,text,type){const blob=new Blob([text],{type});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function csvCell(v){const s=String(v??'');return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s}
function exportCsv(){
  const rows=[['record_type','date','workplace','name','category','planned_start','planned_end','actual_start','actual_end','hours','amount','status','note']];
  state.shifts.forEach(s=>rows.push(['shift',s.date,workplace(s.workplaceId)?.name||'',s.name||'','',s.plannedStart,s.plannedEnd,s.actualStart,s.actualEnd,shiftHours(s,s.worked).toFixed(2),Math.round(shiftDisplayPay(s)),s.worked?'worked':'planned',s.note||'']));
  state.expenses.forEach(x=>rows.push(['expense',x.date,'',x.name,x.category,'','','','','',x.amount,'','']));
  state.fixedCosts.forEach(x=>rows.push(['fixed_cost','','',x.name,x.category,'','','','','',x.amount,x.cycle,`${x.month||''}/${x.day}`]));
  state.payslips.forEach(x=>rows.push(['payslip',x.payDate,workplace(x.workplaceId)?.name||'','給与明細','','','','','','',x.actualAmount,'',x.note||'']));
  download(`shiftwallet-${toKey(today())}.csv`,`\ufeff${rows.map(r=>r.map(csvCell).join(',')).join('\n')}`,'text/csv;charset=utf-8');
}

function bindEvents(){
  document.addEventListener('click',e=>{
    const close=e.target.closest('[data-close-dialog]');if(close){closeDialog(close);return}
    const nav=e.target.closest('[data-nav]');if(nav){navigate(nav.dataset.nav);return}const nav2=e.target.closest('[data-nav-to]');if(nav2){navigate(nav2.dataset.navTo);return}
    const quick=e.target.closest('[data-quick-preset]');if(quick){addFromPreset(quick.dataset.quickPreset,$('quickDate').value||toKey(today()));return}
    const day=e.target.closest('[data-day]');if(day){openShift(day.dataset.day);return}
    const es=e.target.closest('[data-edit-shift]');if(es){const x=state.shifts.find(v=>v.id===es.dataset.editShift);if(x)openShift(x.date,x);return}const ds=e.target.closest('[data-delete-shift]');if(ds&&confirm('このシフトを削除しますか？')){state.shifts=state.shifts.filter(x=>x.id!==ds.dataset.deleteShift);saveState('シフトを削除しました');return}
    const ee=e.target.closest('[data-edit-expense]');if(ee){openExpense(state.expenses.find(x=>x.id===ee.dataset.editExpense));return}const de=e.target.closest('[data-delete-expense]');if(de&&confirm('この支出を削除しますか？')){state.expenses=state.expenses.filter(x=>x.id!==de.dataset.deleteExpense);saveState();return}
    const ef=e.target.closest('[data-edit-fixed]');if(ef){openFixed(state.fixedCosts.find(x=>x.id===ef.dataset.editFixed));return}const df=e.target.closest('[data-delete-fixed]');if(df&&confirm('この固定費を削除しますか？')){state.fixedCosts=state.fixedCosts.filter(x=>x.id!==df.dataset.deleteFixed);saveState();return}
    const eb=e.target.closest('[data-edit-budget]');if(eb){openBudget(state.budgets.find(x=>x.id===eb.dataset.editBudget));return}const db=e.target.closest('[data-delete-budget]');if(db&&confirm('この予算を削除しますか？')){state.budgets=state.budgets.filter(x=>x.id!==db.dataset.deleteBudget);saveState();return}const nb=e.target.closest('[data-new-budget-category]');if(nb){openBudget(null,nb.dataset.newBudgetCategory);return}
    const epay=e.target.closest('[data-edit-payslip]');if(epay){openPayslip(state.payslips.find(x=>x.id===epay.dataset.editPayslip));return}const dpay=e.target.closest('[data-delete-payslip]');if(dpay&&confirm('この給与明細を削除しますか？')){state.payslips=state.payslips.filter(x=>x.id!==dpay.dataset.deletePayslip);saveState();return}
    const ew=e.target.closest('[data-edit-workplace]');if(ew){openWorkplace(state.workplaces.find(x=>x.id===ew.dataset.editWorkplace));return}const dw=e.target.closest('[data-delete-workplace]');if(dw&&confirm('勤務先を削除しますか？関連するシフトや時給履歴は残りますが表示が不完全になる可能性があります。')){state.workplaces=state.workplaces.filter(x=>x.id!==dw.dataset.deleteWorkplace);saveState();return}
    const ewh=e.target.closest('[data-edit-wage]');if(ewh){openWage(state.wageHistory.find(x=>x.id===ewh.dataset.editWage));return}const dwh=e.target.closest('[data-delete-wage]');if(dwh&&confirm('この時給履歴を削除しますか？')){state.wageHistory=state.wageHistory.filter(x=>x.id!==dwh.dataset.deleteWage);saveState();return}
    const epr=e.target.closest('[data-edit-preset]');if(epr){openPreset(state.presets.find(x=>x.id===epr.dataset.editPreset));return}const dpr=e.target.closest('[data-delete-preset]');if(dpr&&confirm('このプリセットを削除しますか？')){state.presets=state.presets.filter(x=>x.id!==dpr.dataset.deletePreset);if(state.settings.goalPresetId===dpr.dataset.deletePreset)state.settings.goalPresetId='';saveState();return}
    const mp=e.target.closest('[data-money-period]');if(mp){state.settings.moneyPeriod=mp.dataset.moneyPeriod;saveState();return}
  });
  $('prevMonth').onclick=()=>{viewMonth=new Date(viewMonth.getFullYear(),viewMonth.getMonth()-1,1,12);renderAll()};$('nextMonth').onclick=()=>{viewMonth=new Date(viewMonth.getFullYear(),viewMonth.getMonth()+1,1,12);renderAll()};
  $('openShiftModal').onclick=()=>openShift($('quickDate').value||toKey(today()));$('openBatchModal').onclick=openBatch;$('openExpenseModal').onclick=()=>openExpense();$('openFixedModal').onclick=()=>openFixed();$('openBudgetModal').onclick=()=>openBudget();$('openPayslipModal').onclick=()=>openPayslip();$('openWorkplaceModal').onclick=()=>openWorkplace();$('openWageModal').onclick=()=>openWage();$('openPresetModal').onclick=()=>openPreset();
  $('shiftPreset').onchange=()=>{if($('shiftPreset').value)applyPresetToShift($('shiftPreset').value)};$('shiftWorked').onchange=()=>{updateActualVisibility();updateShiftPreview()};['shiftDate','shiftWorkplace','plannedStart','plannedEnd','plannedBreak','actualStart','actualEnd','actualBreak','shiftTransport','shiftWageOverride'].forEach(id=>$(id).addEventListener('input',updateShiftPreview));
  ['presetWorkplace','presetStart','presetEnd','presetBreak','presetTransport'].forEach(id=>$(id).addEventListener('input',updatePresetPreview));$('fixedCycle').onchange=updateFixedMonth;

  $('shiftForm').addEventListener('submit',e=>{e.preventDefault();const item=formShiftObject(),id=$('shiftId').value;if(id){const old=state.shifts.find(x=>x.id===id);if(!$('shiftPreset').value)item.name=old?.name||'シフト';state.shifts=state.shifts.map(x=>x.id===id?item:x)}else state.shifts.push(item);$('shiftModal').close();saveState('シフトを保存しました')});
  $('batchForm').addEventListener('submit',e=>{e.preventDefault();const p=state.presets.find(x=>x.id===$('batchPreset').value);if(!p)return alert('プリセットを選択してください。');let a=parseKey($('batchStartDate').value),b=parseKey($('batchEndDate').value);if(a>b)[a,b]=[b,a];const days=dayCount(a,b)+1;if(days>62)return alert('一括追加は62日以内にしてください。');const selected=[...document.querySelectorAll('#batchModal .weekday-picker input:checked')].map(x=>num(x.value));let count=0;for(let d=new Date(a);d<=b;d=addDays(d,1)){if(selected.length&&!selected.includes(d.getDay()))continue;state.shifts.push({id:uid(),date:toKey(d),workplaceId:p.workplaceId,name:p.name,plannedStart:p.start,plannedEnd:p.end,plannedBreak:num(p.breakMins),worked:false,actualStart:p.start,actualEnd:p.end,actualBreak:num(p.breakMins),wageOverride:null,transport:num(p.transport),note:'',presetId:p.id});count++}$('batchModal').close();saveState(`${count}件のシフトを追加しました`)});
  $('expenseForm').addEventListener('submit',e=>{e.preventDefault();const id=$('expenseId').value,item={id:id||uid(),date:$('expenseDate').value,name:$('expenseName').value.trim(),amount:num($('expenseAmount').value),category:$('expenseCategory').value.trim()};state.expenses=id?state.expenses.map(x=>x.id===id?item:x):[...state.expenses,item];$('expenseModal').close();saveState('支出を保存しました')});
  $('fixedForm').addEventListener('submit',e=>{e.preventDefault();const id=$('fixedId').value,item={id:id||uid(),name:$('fixedName').value.trim(),amount:num($('fixedAmount').value),category:$('fixedCategory').value.trim(),cycle:$('fixedCycle').value,day:clamp(num($('fixedDay').value),1,31),month:clamp(num($('fixedMonth').value),1,12)};state.fixedCosts=id?state.fixedCosts.map(x=>x.id===id?item:x):[...state.fixedCosts,item];$('fixedModal').close();saveState('固定費を保存しました')});
  $('budgetForm').addEventListener('submit',e=>{e.preventDefault();const id=$('budgetId').value,item={id:id||uid(),category:$('budgetCategory').value.trim(),amount:num($('budgetAmount').value)};const duplicate=state.budgets.find(x=>x.category===item.category&&x.id!==id);if(duplicate){duplicate.amount=item.amount}else if(id)state.budgets=state.budgets.map(x=>x.id===id?item:x);else state.budgets.push(item);$('budgetModal').close();saveState('予算を保存しました')});
  $('payslipForm').addEventListener('submit',e=>{e.preventDefault();const id=$('payslipId').value,item={id:id||uid(),workplaceId:$('payslipWorkplace').value,payDate:$('payslipDate').value,actualAmount:num($('payslipAmount').value),note:$('payslipNote').value.trim()};state.payslips=id?state.payslips.map(x=>x.id===id?item:x):[...state.payslips,item];$('payslipModal').close();saveState('給与明細を保存しました')});
  $('workplaceForm').addEventListener('submit',e=>{e.preventDefault();const id=$('workplaceId').value,item={id:id||uid(),name:$('workplaceName').value.trim(),closingDay:num($('closingDay').value),payDay:num($('payDay').value),payOffset:num($('payOffset').value),weekendRule:$('weekendRule').value,nightStart:$('nightStart').value,nightEnd:$('nightEnd').value,nightMultiplier:num($('nightMultiplier').value)||1,overtimeHours:num($('overtimeHours').value),overtimeMultiplier:num($('overtimeMultiplier').value)||1};state.workplaces=id?state.workplaces.map(x=>x.id===id?item:x):[...state.workplaces,item];if(!id)state.wageHistory.push({id:uid(),workplaceId:item.id,effectiveFrom:toKey(today()),hourlyWage:0});$('workplaceModal').close();saveState('勤務先を保存しました')});
  $('wageForm').addEventListener('submit',e=>{e.preventDefault();const id=$('wageId').value,item={id:id||uid(),workplaceId:$('wageWorkplace').value,effectiveFrom:$('wageFrom').value,hourlyWage:num($('wageAmount').value)};state.wageHistory=id?state.wageHistory.map(x=>x.id===id?item:x):[...state.wageHistory,item];$('wageModal').close();saveState('時給履歴を保存しました')});
  $('presetForm').addEventListener('submit',e=>{e.preventDefault();const id=$('presetId').value,item={id:id||uid(),workplaceId:$('presetWorkplace').value,name:$('presetName').value.trim(),start:$('presetStart').value,end:$('presetEnd').value,breakMins:num($('presetBreak').value),transport:num($('presetTransport').value)};state.presets=id?state.presets.map(x=>x.id===id?item:x):[...state.presets,item];$('presetModal').close();saveState('プリセットを保存しました')});
  $('globalSettingsForm').addEventListener('submit',e=>{e.preventDefault();state.settings.currentBalance=num($('currentBalance').value);state.settings.salaryGoal=num($('salaryGoal').value);state.settings.goalPresetId=$('goalPreset').value;saveState('設定を保存しました')});
  $('exportJsonBtn').onclick=()=>download(`shiftwallet-backup-${toKey(today())}.json`,JSON.stringify(state,null,2),'application/json');$('exportCsvBtn').onclick=exportCsv;
  $('importJsonInput').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{const p=JSON.parse(await f.text());if(!Array.isArray(p.shifts))throw new Error('invalid');state=normalizeState(p);saveState('バックアップを読み込みました')}catch{alert('読み込めないJSONです。')}e.target.value=''};
  $('resetBtn').onclick=()=>{if(confirm('すべてのデータを削除します。元に戻せません。')){state=defaultState();saveState('初期化しました')}};
  $('installBtn').onclick=async()=>{if(deferredInstallPrompt){deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;$('installBtn').hidden=true}else navigate('settings')};
  window.addEventListener('resize',()=>{if(document.querySelector('[data-page="analysis"]').classList.contains('active'))renderCharts()});
}
function setupDaySelects(){const opts=['<option value="0">月末</option>',...Array.from({length:31},(_,i)=>`<option value="${i+1}">${i+1}日</option>`)].join('');$('closingDay').innerHTML=opts;$('payDay').innerHTML=opts}
function setupPWA(){if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(console.error);window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstallPrompt=e;$('installBtn').hidden=false});const isiOS=/iphone|ipad|ipod/i.test(navigator.userAgent),standalone=window.matchMedia('(display-mode:standalone)').matches||navigator.standalone;if(isiOS&&!standalone)$('iosInstallCard').hidden=false}
function init(){setupDaySelects();$('quickDate').value=toKey(today());bindEvents();renderAll();setupPWA();const hash=location.hash.replace('#','');if(['dashboard','shifts','money','analysis','settings'].includes(hash))navigate(hash)}
init();
