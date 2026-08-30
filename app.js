'use strict';

const KEY='shiftwallet.simple.v4'; // Keep the storage key so existing installations migrate in place.
const APP_VERSION='5.0.5';
const SCHEMA_VERSION=5;
const V3='shiftwallet.v3';
const V2='shiftwallet.v2';
const V1='shiftwallet.v1';
const $=id=>document.getElementById(id);
const uid=()=>globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`;
const num=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const pad=n=>String(n).padStart(2,'0');
const yen=v=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Math.round(num(v)));
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
// Shared form components. New forms should be assembled from these primitives so iOS fixes apply everywhere.
const FormUI={
  applyAttributes(el,attrs={}){
    Object.entries(attrs).forEach(([key,value])=>{
      if(value===undefined||value===null||value===false)return;
      if(key==='className')el.className=value;
      else if(key==='textContent')el.textContent=value;
      else if(key==='required')el.required=Boolean(value);
      else if(key in el)el[key]=value;
      else el.setAttribute(key,value===true?'':String(value));
    });
    return el;
  },
  Input({id,type='text',...attrs}){return this.applyAttributes(document.createElement('input'),{id,type,...attrs})},
  HiddenField(id){return this.Input({id,type:'hidden'})},
  Field(labelText,control){const label=document.createElement('label');label.className='form-field';const title=document.createElement('span');title.textContent=labelText;label.append(title,control);return label},
  TextField({label,id,...attrs}){return this.Field(label,this.Input({id,type:'text',...attrs}))},
  NumberField({label,id,...attrs}){return this.Field(label,this.Input({id,type:'number',...attrs}))},
  SelectField({label,id,...attrs}){const select=this.applyAttributes(document.createElement('select'),{id,...attrs});return this.Field(label,select)},
  NativeField({label,id,type,...attrs}){const wrap=document.createElement('div');wrap.className='native-control';wrap.append(this.Input({id,type,...attrs}));return this.Field(label,wrap)},
  DateField(opts){return this.NativeField({...opts,type:'date'})},
  TimeField(opts){return this.NativeField({...opts,type:'time'})},
  MoneyField({label,id,...attrs}){const wrap=document.createElement('div');wrap.className='money-input';const mark=document.createElement('span');mark.textContent='¥';wrap.append(mark,this.Input({id,type:'number',...attrs}));return this.Field(label,wrap)},
  SuffixField({label,id,suffix,...attrs}){const wrap=document.createElement('div');wrap.className='suffix-input';const tail=document.createElement('span');tail.textContent=suffix;wrap.append(this.Input({id,type:'number',...attrs}),tail);return this.Field(label,wrap)},
  TwoColumn(...nodes){const row=document.createElement('div');row.className='two-col';row.append(...nodes);return row},
  mount(targetId,...nodes){const target=$(targetId);if(!target)return;target.replaceChildren(...nodes)},
  mountAll(){
    this.mount('goalFields',this.MoneyField({label:'目標金額',id:'goalAmountInput',min:0,step:1000,inputMode:'numeric',required:true}));
    this.mount('workplaceFields',
      this.HiddenField('workplaceId'),
      this.TextField({label:'バイト先の名前',id:'workplaceName',maxLength:40,required:true,placeholder:'例：ぼってんの湯'}),
      this.MoneyField({label:'時給',id:'workplaceWage',min:0,step:1,inputMode:'numeric',required:true}),
      this.TwoColumn(
        this.SuffixField({label:'締め日',id:'workplaceClosingDay',suffix:'日',min:1,max:31,step:1,inputMode:'numeric',required:true}),
        this.SuffixField({label:'給料日',id:'workplacePayday',suffix:'日',min:1,max:31,step:1,inputMode:'numeric',required:true})
      )
    );
    this.mount('presetFields',
      this.HiddenField('presetId'),
      this.SelectField({label:'バイト先',id:'presetWorkplace',required:true}),
      this.TextField({label:'名前',id:'presetName',maxLength:30,required:true,placeholder:'例：A班'}),
      this.TwoColumn(
        this.TimeField({label:'開始',id:'presetStart',required:true}),
        this.TimeField({label:'終了',id:'presetEnd',required:true})
      ),
      this.SuffixField({label:'休憩時間',id:'presetBreak',suffix:'分',min:0,max:600,step:5,inputMode:'numeric',value:'0',required:true})
    );
    this.mount('fixedFields',
      this.HiddenField('fixedId'),
      this.TextField({label:'名前',id:'fixedName',maxLength:40,required:true,placeholder:'例：携帯料金'}),
      this.MoneyField({label:'毎月の金額',id:'fixedAmount',min:0,step:1,inputMode:'numeric',required:true})
    );
    this.mount('shiftFields',
      this.HiddenField('shiftId'),
      this.DateField({label:'日付',id:'shiftDate',required:true}),
      this.SelectField({label:'バイト先',id:'shiftWorkplace',required:true}),
      this.TwoColumn(
        this.TimeField({label:'開始',id:'shiftStart',required:true}),
        this.TimeField({label:'終了',id:'shiftEnd',required:true})
      ),
      this.MoneyField({label:'時給',id:'shiftWage',min:0,step:1,inputMode:'numeric',required:true}),
      this.SuffixField({label:'休憩時間',id:'shiftBreak',suffix:'分',min:0,max:600,step:5,inputMode:'numeric',required:true})
    );
  }
};
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
// Stable, low-saturation palette. Colors are stored as indices so deleting/reordering jobs does not change old colors.
const WORK_COLORS=['#6b7565','#806958','#657086','#816b67','#736f57','#6e667a','#597370','#806e59'];
const PRESET_TONES=[0,1,2,3,4,5,6,7];
function workplaceColor(id){const w=state.workplaces.find(x=>x.id===id);return WORK_COLORS[Math.abs(num(w?.colorIndex,0))%WORK_COLORS.length]}
function shadeHex(hex,amount=0){const h=String(hex).replace('#','');if(h.length!==6)return hex;const n=parseInt(h,16),r=(n>>16)&255,g=(n>>8)&255,b=n&255,target=amount>=0?255:0,p=Math.min(1,Math.abs(amount));const c=v=>Math.round(v+(target-v)*p).toString(16).padStart(2,'0');return `#${c(r)}${c(g)}${c(b)}`}
function presetColor(p){if(!p)return '#77736b';const base=workplaceColor(p.workplaceId),tones=[-.18,-.09,0,.09,.17,.24,-.25,.30],tone=tones[Math.abs(num(p.toneIndex,0))%tones.length];return shadeHex(base,tone)}
function shiftColor(s){const p=preset(s.presetId);return p?presetColor(p):workplaceColor(s.workplaceId)}
function shiftDisplayName(s){const p=preset(s.presetId);return String(s.label||p?.name||workplace(s.workplaceId)?.name||'勤').trim().replace(/\s+/g,' ')}
function shiftMarkLabel(s){return esc(shiftDisplayName(s).slice(0,5))}
function defaultState(){
  const w={id:uid(),name:'バイト先',hourlyWage:1000,closingDay:10,payday:25,colorIndex:0};
  const p={id:uid(),workplaceId:w.id,name:'夕方',start:'17:00',end:'21:00',breakMinutes:0,toneIndex:0};
  return {schemaVersion:SCHEMA_VERSION,version:APP_VERSION,settings:{monthlyGoal:100000,goalPresetId:p.id},workplaces:[w],presets:[p],shifts:[],fixedCosts:[]};
}
function normalize(s){
  const b=defaultState(),src=s&&typeof s==='object'?s:{};
  const o={...b,...src,schemaVersion:SCHEMA_VERSION,version:APP_VERSION,settings:{...b.settings,...(src.settings||{})}};
  o.workplaces=Array.isArray(src.workplaces)&&src.workplaces.length?src.workplaces.map((w,index)=>({
    id:w.id||uid(),name:w.name||'バイト先',hourlyWage:Math.max(0,num(w.hourlyWage??w.wage)),
    closingDay:Math.min(31,Math.max(1,num(w.closingDay??w.cutoffDay,10))),payday:Math.min(31,Math.max(1,num(w.payday??w.payDay,25))),
    colorIndex:Number.isFinite(Number(w.colorIndex))?num(w.colorIndex):index%WORK_COLORS.length
  })):b.workplaces;
  const wp0=o.workplaces[0].id;
  o.presets=Array.isArray(src.presets)?src.presets.map((p,index)=>({
    id:p.id||uid(),workplaceId:o.workplaces.some(w=>w.id===p.workplaceId)?p.workplaceId:wp0,name:p.name||'シフト',
    start:p.start||'17:00',end:p.end||'21:00',breakMinutes:Math.max(0,num(p.breakMinutes??p.breakMins)),
    toneIndex:Number.isFinite(Number(p.toneIndex))?num(p.toneIndex):index%PRESET_TONES.length
  })):[];
  const presetById=new Map(o.presets.map(p=>[p.id,p]));
  o.shifts=Array.isArray(src.shifts)?src.shifts.map(x=>{
    const workplaceId=o.workplaces.some(w=>w.id===x.workplaceId)?x.workplaceId:wp0,p=presetById.get(x.presetId);
    const w=o.workplaces.find(w=>w.id===workplaceId)||o.workplaces[0];
    return {
      id:x.id||uid(),date:x.date||todayKey(),workplaceId,presetId:p?.id||'',source:x.source||(p?'preset':'manual'),
      label:String(x.label??p?.name??''),start:x.start||x.planned?.start||p?.start||'17:00',end:x.end||x.planned?.end||p?.end||'21:00',
      breakMinutes:Math.max(0,num(x.breakMinutes??x.breakMins??x.planned?.breakMinutes??p?.breakMinutes)),
      // v5 snapshots the wage on the actual shift so later workplace wage changes do not rewrite history.
      hourlyWage:Math.max(0,num(x.hourlyWage??w?.hourlyWage)),
      presetSnapshot:x.presetSnapshot|| (p?{name:p.name,start:p.start,end:p.end,breakMinutes:num(p.breakMinutes)}:null)
    };
  }):[];
  o.fixedCosts=Array.isArray(src.fixedCosts)?src.fixedCosts.map(f=>({id:f.id||uid(),name:f.name||'固定費',amount:Math.max(0,num(f.amount))})).filter(f=>f.amount>=0):[];
  o.settings.monthlyGoal=Math.max(0,num(o.settings.monthlyGoal??o.settings.salaryGoal,100000));
  if(!o.presets.some(p=>p.id===o.settings.goalPresetId))o.settings.goalPresetId=o.presets[0]?.id||'';
  return o;
}
function migrateV3(v){
  const wageHistory=Array.isArray(v.wageHistory)?v.wageHistory:[];
  const workplaces=(v.workplaces||[]).map((w,index)=>{
    const ws=wageHistory.filter(x=>x.workplaceId===w.id).sort((a,b)=>String(a.effectiveFrom).localeCompare(String(b.effectiveFrom)));
    return {id:w.id||uid(),name:w.name||'バイト先',hourlyWage:num(ws.at(-1)?.hourlyWage??w.hourlyWage),closingDay:Math.min(31,Math.max(1,num(w.closingDay??w.cutoffDay,10))),payday:Math.min(31,Math.max(1,num(w.payday??w.payDay,25))),colorIndex:index%WORK_COLORS.length};
  });
  const fallback=workplaces[0]?.id||uid();
  const presets=(v.presets||[]).map((p,index)=>({id:p.id||uid(),workplaceId:p.workplaceId||fallback,name:p.name||'シフト',start:p.start||'17:00',end:p.end||'21:00',breakMinutes:num(p.breakMinutes??p.breakMins),toneIndex:index%PRESET_TONES.length}));
  const presetById=new Map(presets.map(p=>[p.id,p]));
  const wageByWorkplace=new Map(workplaces.map(w=>[w.id,w.hourlyWage]));
  const shifts=(v.shifts||[]).map(x=>{const p=presetById.get(x.presetId);return {id:x.id||uid(),date:x.date||todayKey(),workplaceId:x.workplaceId||fallback,presetId:p?.id||'',source:p?'preset':'manual',label:p?.name||'',start:x.planned?.start||x.start||p?.start||'17:00',end:x.planned?.end||x.end||p?.end||'21:00',breakMinutes:num(x.planned?.breakMinutes??x.breakMinutes??x.breakMins??p?.breakMinutes),hourlyWage:Math.max(0,num(x.hourlyWage??wageByWorkplace.get(x.workplaceId||fallback))),presetSnapshot:p?{name:p.name,start:p.start,end:p.end,breakMinutes:num(p.breakMinutes)}:null}});
  const fixedCosts=(v.fixedCosts||[]).filter(f=>f.enabled!==false&&(!f.recurrence||f.recurrence==='monthly')).map(f=>({id:f.id||uid(),name:f.name||'固定費',amount:num(f.priceHistory?.at?.(-1)?.amount??f.amount)}));
  return normalize({schemaVersion:SCHEMA_VERSION,version:APP_VERSION,settings:{monthlyGoal:num(v.settings?.salaryGoal??v.settings?.monthlyGoal,100000),goalPresetId:v.settings?.goalPresetId||''},workplaces:workplaces.length?workplaces:undefined,presets,shifts,fixedCosts});
}
const DataStore={
  read(){
    try{
      const own=localStorage.getItem(KEY);if(own)return normalize(JSON.parse(own));
      const v3=localStorage.getItem(V3);if(v3){const m=migrateV3(JSON.parse(v3));this.write(m);return m}
      const v2=localStorage.getItem(V2);if(v2){const m=migrateV3(JSON.parse(v2));this.write(m);return m}
      const v1=localStorage.getItem(V1);if(v1){const old=JSON.parse(v1),m=normalize({settings:{monthlyGoal:num(old.settings?.monthlyGoal,100000)},workplaces:old.workplaces||[],presets:old.presets||[],shifts:old.shifts||[],fixedCosts:old.fixedCosts||[]});this.write(m);return m}
    }catch(e){console.error('ShiftWallet data load failed',e)}
    return defaultState();
  },
  write(value){localStorage.setItem(KEY,JSON.stringify(normalize(value)))},
  reset(){const fresh=defaultState();this.write(fresh);return fresh}
};
function load(){return DataStore.read()}
let state=load();
let viewMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1,12);
let selectedPresetId='';
let deferredInstallPrompt=null;
function save(){state=normalize(state);DataStore.write(state);renderAll()}
function workplace(id){return state.workplaces.find(w=>w.id===id)||state.workplaces[0]}
function preset(id){return state.presets.find(p=>p.id===id)}
const PayrollEngine={
  shift(s){const gross=minutesBetween(s.start,s.end),paid=Math.max(0,gross-num(s.breakMinutes)),wage=Math.max(0,num(s.hourlyWage??workplace(s.workplaceId)?.hourlyWage));return {minutes:paid,pay:Math.round(paid/60*wage),hourlyWage:wage}},
  preset(p){if(!p)return {minutes:0,pay:0};return this.shift({workplaceId:p.workplaceId,start:p.start,end:p.end,breakMinutes:p.breakMinutes,hourlyWage:workplace(p.workplaceId)?.hourlyWage})},
  sum(list){return list.reduce((a,s)=>a+this.shift(s).pay,0)}
};
function calcShift(s){return PayrollEngine.shift(s)}
function calcPreset(p){return PayrollEngine.preset(p)}
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
function sumPay(list){return PayrollEngine.sum(list)}
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
const UI={
  toast(text,options={}){
    const t=$('toast'),label=$('toastText'),action=$('toastAction');
    if(label)label.textContent=text;else t.textContent=text;
    const duration=num(options.duration,options.actionLabel?5000:1600);
    if(action){
      action.hidden=!options.actionLabel;action.textContent=options.actionLabel||'';action.onclick=null;
      if(options.actionLabel&&typeof options.onAction==='function')action.onclick=()=>{options.onAction();this.hideToast()};
    }
    t.classList.add('show');clearTimeout(this._toastTimer);this._toastTimer=setTimeout(()=>this.hideToast(),duration);
  },
  hideToast(){const t=$('toast');if(t)t.classList.remove('show');const a=$('toastAction');if(a){a.hidden=true;a.onclick=null}},
  openDialog(id){const d=$(id);if(d&&!d.open)d.showModal()},
  closeDialogs(){document.querySelectorAll('dialog[open]').forEach(d=>d.close())},
  confirm(message){return window.confirm(message)},
  set(id,value){const el=$(id);if(el)el.value=value??''},
  number(id,fallback=0){return Math.max(0,num($(id)?.value,fallback))},
  clone(value){return globalThis.structuredClone?structuredClone(value):JSON.parse(JSON.stringify(value))},
  deleteWithUndo(message,mutate){
    if(!this.confirm(message))return false;
    const before=this.clone(state);mutate();save();this.closeDialogs();
    this.toast('削除しました',{actionLabel:'元に戻す',duration:5000,onAction:()=>{state=normalize(before);save();this.toast('元に戻しました')}});
    return true;
  }
};
function toast(text,options){UI.toast(text,options)}
function openDialog(id){UI.openDialog(id)}
function closeDialogs(){UI.closeDialogs()}
function formatShiftLine(s){const w=workplace(s.workplaceId),name=shiftDisplayName(s);return `${w.name} · ${name||`${s.start}–${s.end}`}`}

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
  $('fixedBreakdownHome').innerHTML=state.fixedCosts.length?state.fixedCosts.map(f=>`<div class="income-line"><div><b>${esc(f.name)}</b></div><strong>${yen(f.amount)}</strong></div>`).join(''):'<div class="empty">固定費はまだありません</div>';
  const goal=num(state.settings.monthlyGoal),remaining=Math.max(0,goal-planned),pct=goal?Math.min(100,planned/goal*100):0;
  $('goalAmountHome').textContent=yen(goal);$('goalRemainingHome').textContent=remaining?yen(remaining):'達成';$('goalProgress').style.width=`${pct}%`;
  if(remaining<=0)$('goalPresetNeeds').innerHTML='<div class="goal-done">目標に到達しています</div>';
  else if(!state.presets.length)$('goalPresetNeeds').innerHTML='<div class="empty">プリセットを設定してください</div>';
  else{
    const rows=state.presets.map(p=>{const cp=calcPreset(p),need=cp.pay?Math.ceil(remaining/cp.pay):null;return `<div class="goal-need-row"><span><i class="color-swatch" style="--swatch:${presetColor(p)}"></i><b>${esc(p.name)}</b><small>${esc(workplace(p.workplaceId).name)}</small></span><strong>${need===null?'—':`あと${need}回`}</strong></div>`});
    $('goalPresetNeeds').innerHTML=rows.slice(0,3).join('')+(rows.length>3?`<details class="more-details"><summary>ほか${rows.length-3}件を見る</summary>${rows.slice(3).join('')}</details>`:'');
  }
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
  $('calendarPresetStrip').innerHTML=presets.length?presets.map(p=>`<button type="button" class="preset-chip ${selectedPresetId===p.id?'selected':''}" style="--shift-color:${presetColor(p)}" data-select-preset="${p.id}" aria-pressed="${selectedPresetId===p.id?'true':'false'}"><i class="color-swatch" style="--swatch:${presetColor(p)}"></i><b>${esc(p.name)}</b><small>${esc(workplace(p.workplaceId).name)} · ${esc(p.start)}–${esc(p.end)}</small></button>`).join(''):'<div class="empty">プリセットなしでも日付タップで追加できます</div>';
  const sp=preset(selectedPresetId),panel=$('presetPanel');
  $('addModeText').textContent=sp?`追加モード：${sp.name}（同じプリセットを再タップで解除）`:'プリセットをタップで追加モード / 日付タップで単発追加';
  panel.classList.toggle('adding',!!sp);panel.style.setProperty('--mode-color',sp?presetColor(sp):'var(--line-strong)');
  renderCalendar();renderWeeklyHours();
  const list=monthShifts(monthKey(viewMonth));$('shiftCount').textContent=`${list.length}件`;$('viewMonthIncome').textContent=yen(sumPay(list));
}
function renderCalendar(){
  const y=viewMonth.getFullYear(),m=viewMonth.getMonth(),first=new Date(y,m,1,12),start=new Date(y,m,1-first.getDay(),12),today=todayKey(),html=[];
  for(let i=0;i<42;i++){
    const d=new Date(start);d.setDate(start.getDate()+i);const key=dateKey(d),inside=d.getMonth()===m,items=state.shifts.filter(s=>s.date===key).sort((a,b)=>a.start.localeCompare(b.start));
    const visibleCount=Math.min(2,items.length),marks=items.slice(0,visibleCount).map(s=>`<span class="shift-mark" style="--shift-color:${shiftColor(s)}">${shiftMarkLabel(s)}</span>`).join(''),more=items.length>visibleCount?`<span class="shift-more">+${items.length-visibleCount}</span>`:'';
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
  state.shifts.push({id:uid(),date,workplaceId:p.workplaceId,presetId:p.id,source:'preset',label:p.name,start:p.start,end:p.end,breakMinutes:num(p.breakMinutes),hourlyWage:num(workplace(p.workplaceId)?.hourlyWage),presetSnapshot:{name:p.name,start:p.start,end:p.end,breakMinutes:num(p.breakMinutes)}});save();toast(`${date.slice(5).replace('-','/')} に追加しました`)
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
  const w=workplace(id);UI.deleteWithUndo(`「${w.name}」と関連するプリセット・シフトを削除しますか？`,()=>{
    state.workplaces=state.workplaces.filter(x=>x.id!==id);const presetIds=new Set(state.presets.filter(p=>p.workplaceId===id).map(p=>p.id));state.presets=state.presets.filter(p=>p.workplaceId!==id);state.shifts=state.shifts.filter(s=>s.workplaceId!==id);if(presetIds.has(state.settings.goalPresetId))state.settings.goalPresetId=state.presets[0]?.id||'';if(presetIds.has(selectedPresetId))selectedPresetId='';
  });
}
const TEST_BACKUP_KEY='shiftwallet.simple.preTestBackup';
function buildTestState(){
  const now=new Date(),mk=monthKey(now),[yy,mm]=mk.split('-').map(Number),days=new Date(yy,mm,0).getDate();
  const works=[
    {id:uid(),name:'温泉フロント長名称',hourlyWage:1120,closingDay:10,payday:25,colorIndex:0},
    {id:uid(),name:'カフェ',hourlyWage:1250,closingDay:31,payday:15,colorIndex:1},
    {id:uid(),name:'イベント補助',hourlyWage:1400,closingDay:20,payday:5,colorIndex:2}
  ];
  const specs=[['A班 男','09:00','14:00',30],['B班 女','14:00','19:00',30],['ロング','09:00','18:00',60],['夜勤','22:00','02:00',0],['早朝','06:00','10:00',0],['夕方','17:00','22:00',30],['短時間','11:00','14:00',0],['繁忙応援','12:00','20:00',60]];
  const presets=specs.map((x,i)=>({id:uid(),workplaceId:works[i%works.length].id,name:x[0],start:x[1],end:x[2],breakMinutes:x[3],toneIndex:i}));
  const shifts=[];
  for(let d=1;d<=days;d+=2){const p=presets[d%presets.length],w=works.find(x=>x.id===p.workplaceId);shifts.push({id:uid(),date:`${yy}-${pad(mm)}-${pad(d)}`,workplaceId:w.id,presetId:p.id,source:'preset',label:p.name,start:p.start,end:p.end,breakMinutes:p.breakMinutes,hourlyWage:w.hourlyWage,presetSnapshot:{name:p.name,start:p.start,end:p.end,breakMinutes:p.breakMinutes}})}
  const crowded=Math.min(29,days);presets.slice(0,4).forEach(p=>{const w=works.find(x=>x.id===p.workplaceId);shifts.push({id:uid(),date:`${yy}-${pad(mm)}-${pad(crowded)}`,workplaceId:w.id,presetId:p.id,source:'preset',label:p.name,start:p.start,end:p.end,breakMinutes:p.breakMinutes,hourlyWage:w.hourlyWage,presetSnapshot:{name:p.name,start:p.start,end:p.end,breakMinutes:p.breakMinutes}})});
  // Month-boundary and February records are deliberately included for regression testing.
  const next=new Date(yy,mm,1,12),prev=new Date(yy,mm-1,0,12),edgeDates=[dateKey(prev),dateKey(next),'2028-02-28','2028-02-29'];
  edgeDates.forEach((date,i)=>{const p=presets[(i+3)%presets.length],w=works.find(x=>x.id===p.workplaceId);shifts.push({id:uid(),date,workplaceId:w.id,presetId:p.id,source:'preset',label:p.name,start:p.start,end:p.end,breakMinutes:p.breakMinutes,hourlyWage:w.hourlyWage,presetSnapshot:{name:p.name,start:p.start,end:p.end,breakMinutes:p.breakMinutes}})});
  return normalize({schemaVersion:SCHEMA_VERSION,version:APP_VERSION,settings:{monthlyGoal:180000,goalPresetId:presets[0].id},workplaces:works,presets,shifts,fixedCosts:[{id:uid(),name:'携帯料金',amount:8500},{id:uid(),name:'サブスク長名称テスト',amount:3000},{id:uid(),name:'交通定期',amount:7200}]});
}
function generateTestData(){
  if(!UI.confirm('現在のデータを退避して、表示テスト用データに切り替えますか？'))return;
  localStorage.setItem(TEST_BACKUP_KEY,JSON.stringify(state));state=buildTestState();viewMonth=new Date();viewMonth=new Date(viewMonth.getFullYear(),viewMonth.getMonth(),1,12);selectedPresetId='';save();toast('テストデータに切り替えました');
}
function restoreTestData(){
  const raw=localStorage.getItem(TEST_BACKUP_KEY);if(!raw){toast('退避データがありません');return}
  try{state=normalize(JSON.parse(raw));localStorage.removeItem(TEST_BACKUP_KEY);selectedPresetId='';save();toast('元のデータに戻しました')}catch{toast('復元できませんでした')}
}
function runLayoutCheck(){
  renderAll();const issues=[];
  const overflow=(el,label)=>{if(el&&el.scrollWidth>el.clientWidth+2)issues.push(`${label}が横にはみ出しています`)};
  overflow(document.documentElement,'画面全体');overflow($('calendar'),'カレンダー');overflow($('presetPanel'),'プリセット欄');
  document.querySelectorAll('.day').forEach((el,i)=>overflow(el,`カレンダー${i+1}マス目`));
  const dlg=$('shiftDialog'),was=dlg.open;if(!was){renderSelects();$('shiftDate').value=todayKey();dlg.showModal()}
  const card=dlg.querySelector('.dialog-card');overflow(card,'シフト入力画面');card?.querySelectorAll('input,select,.native-control').forEach((el,i)=>overflow(el,`入力欄${i+1}`));if(!was)dlg.close();
  const result=$('layoutCheckResult');result.textContent=issues.length?`要確認：${issues.slice(0,5).join(' / ')}`:'OK：主要画面で横方向の見切れは検出されませんでした。';result.classList.toggle('check-ok',!issues.length);result.classList.toggle('check-ng',!!issues.length);
  toast(issues.length?'レイアウト診断で要確認項目があります':'レイアウト診断はOKです');
}

function downloadBackup(){const a=document.createElement('a');const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});a.href=URL.createObjectURL(blob);a.download=`shiftwallet-backup-${todayKey()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}

FormUI.mountAll();

// Smoothly expand/collapse the income breakdown while preserving native <details> semantics.
function setupIncomeBreakdownAnimation(){
  const reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  document.querySelectorAll('.income-summary-details').forEach(details=>{
    const summary=details.querySelector(':scope > .income-summary-trigger');
    const panel=details.querySelector(':scope > .income-breakdown-motion');
    if(!summary||!panel||details.dataset.animated==='1')return;
    details.dataset.animated='1';
    const clean=()=>{
      panel.style.height='';
      panel.style.opacity='';
      panel.style.transform='';
      panel.style.overflow='';
      panel.style.willChange='';
      details.dataset.animating='0';
    };
    summary.addEventListener('click',e=>{
      e.preventDefault();
      if(details.dataset.animating==='1')return;
      const opening=!details.open;
      if(reducedMotion){details.open=opening;return}
      details.dataset.animating='1';
      panel.style.overflow='hidden';
      panel.style.willChange='height, opacity, transform';
      if(opening){
        details.open=true;
        const target=Math.max(1,panel.scrollHeight);
        const anim=panel.animate([
          {height:'0px',opacity:0,transform:'translateY(-6px)'},
          {height:`${target}px`,opacity:1,transform:'translateY(0)'}
        ],{duration:280,easing:'cubic-bezier(.22,1,.36,1)',fill:'both'});
        anim.addEventListener('finish',clean,{once:true});
        anim.addEventListener('cancel',clean,{once:true});
      }else{
        const start=Math.max(1,panel.getBoundingClientRect().height||panel.scrollHeight);
        const anim=panel.animate([
          {height:`${start}px`,opacity:1,transform:'translateY(0)'},
          {height:'0px',opacity:0,transform:'translateY(-6px)'}
        ],{duration:220,easing:'cubic-bezier(.4,0,.2,1)',fill:'both'});
        const close=()=>{details.open=false;clean()};
        anim.addEventListener('finish',close,{once:true});
        anim.addEventListener('cancel',close,{once:true});
      }
    });
  });
}
setupIncomeBreakdownAnimation();

// navigation
document.querySelectorAll('[data-nav]').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('[data-nav]').forEach(x=>x.classList.toggle('active',x===btn));document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.dataset.page===btn.dataset.nav));if(btn.dataset.nav==='shifts')renderShiftPage();window.scrollTo({top:0,behavior:'instant'})}));
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',closeDialogs));

$('prevMonth').onclick=()=>{viewMonth=addMonths(viewMonth,-1);renderShiftPage()};$('nextMonth').onclick=()=>{viewMonth=addMonths(viewMonth,1);renderShiftPage()};
$('calendarPresetStrip').addEventListener('click',e=>{const b=e.target.closest('[data-select-preset]');if(!b)return;selectedPresetId=selectedPresetId===b.dataset.selectPreset?'':b.dataset.selectPreset;renderShiftPage()});
$('calendar').addEventListener('click',e=>{const b=e.target.closest('[data-date]');if(!b)return;const p=preset(selectedPresetId);if(p){if(b.classList.contains('outside')){toast('前後の月は月を切り替えて追加してください');return}addPresetToDate(p,b.dataset.date);return}const items=state.shifts.filter(s=>s.date===b.dataset.date);if(items.length){openDay(b.dataset.date);return}if(b.classList.contains('outside')){toast('前後の月は月を切り替えて追加してください');return}openManualShift(b.dataset.date)});
$('addShiftForDayBtn').onclick=()=>openManualShift($('addShiftForDayBtn').dataset.date);
$('shiftWorkplace').addEventListener('change',()=>{if(!$('shiftId').value)$('shiftWage').value=workplace($('shiftWorkplace').value)?.hourlyWage??0});
$('goalForm').onsubmit=e=>{e.preventDefault();state.settings.monthlyGoal=Math.max(0,num($('goalAmountInput').value));save();toast('目標を保存しました')};
$('addWorkplaceBtn').onclick=()=>openWorkplaceEditor();$('addPresetBtn').onclick=()=>openPresetEditor();$('addFixedBtn').onclick=()=>openFixedEditor();
$('workplaceForm').onsubmit=e=>{e.preventDefault();const id=$('workplaceId').value||uid(),i=state.workplaces.findIndex(x=>x.id===id),existing=i>=0?state.workplaces[i]:null,item={id,name:$('workplaceName').value.trim(),hourlyWage:Math.max(0,num($('workplaceWage').value)),closingDay:Math.min(31,Math.max(1,num($('workplaceClosingDay').value,10))),payday:Math.min(31,Math.max(1,num($('workplacePayday').value,25))),colorIndex:existing?.colorIndex??state.workplaces.length%WORK_COLORS.length};if(i>=0)state.workplaces[i]=item;else state.workplaces.push(item);save();closeDialogs();toast('保存しました')};
$('presetForm').onsubmit=e=>{e.preventDefault();const id=$('presetId').value||uid(),i=state.presets.findIndex(x=>x.id===id),existing=i>=0?state.presets[i]:null,item={id,workplaceId:$('presetWorkplace').value,name:$('presetName').value.trim(),start:$('presetStart').value,end:$('presetEnd').value,breakMinutes:Math.max(0,num($('presetBreak').value)),toneIndex:existing?.toneIndex??state.presets.filter(x=>x.workplaceId===$('presetWorkplace').value).length%PRESET_TONES.length};if(i>=0)state.presets[i]=item;else state.presets.push(item);if(!state.settings.goalPresetId)state.settings.goalPresetId=id;save();closeDialogs();toast(`休憩${item.breakMinutes}分で保存しました`)};
$('fixedForm').onsubmit=e=>{e.preventDefault();const id=$('fixedId').value||uid(),item={id,name:$('fixedName').value.trim(),amount:Math.max(0,num($('fixedAmount').value))},i=state.fixedCosts.findIndex(x=>x.id===id);if(i>=0)state.fixedCosts[i]=item;else state.fixedCosts.push(item);save();closeDialogs();toast('保存しました')};
$('shiftForm').onsubmit=e=>{e.preventDefault();const id=$('shiftId').value,workplaceId=$('shiftWorkplace').value,hourlyWage=Math.max(0,num($('shiftWage').value)),data={date:$('shiftDate').value,workplaceId,start:$('shiftStart').value,end:$('shiftEnd').value,breakMinutes:Math.max(0,num($('shiftBreak').value)),hourlyWage};if(!id){state.shifts.push({id:uid(),presetId:'',source:'manual',label:'',presetSnapshot:null,...data});save();closeDialogs();toast('シフトを追加しました');return}const s=state.shifts.find(x=>x.id===id);if(!s)return;const oldWorkplace=s.workplaceId;s.date=data.date;s.workplaceId=data.workplaceId;s.start=data.start;s.end=data.end;s.breakMinutes=data.breakMinutes;s.hourlyWage=hourlyWage;if(oldWorkplace!==s.workplaceId){s.presetId='';s.source='manual';s.label='';s.presetSnapshot=null;}save();closeDialogs();toast('シフトを更新しました')};

document.addEventListener('click',e=>{
  const q=a=>e.target.closest(`[${a}]`)?.getAttribute(a);
  const ew=q('data-edit-workplace');if(ew)return openWorkplaceEditor(ew);const dw=q('data-delete-workplace');if(dw)return deleteWorkplace(dw);
  const ep=q('data-edit-preset');if(ep)return openPresetEditor(ep);const dp=q('data-delete-preset');if(dp){UI.deleteWithUndo('このプリセットを削除しますか？ 登録済みシフトは残ります。',()=>{state.presets=state.presets.filter(x=>x.id!==dp);if(state.settings.goalPresetId===dp)state.settings.goalPresetId=state.presets[0]?.id||'';if(selectedPresetId===dp)selectedPresetId=''});return}
  const ef=q('data-edit-fixed');if(ef)return openFixedEditor(ef);const df=q('data-delete-fixed');if(df){UI.deleteWithUndo('この固定費を削除しますか？',()=>{state.fixedCosts=state.fixedCosts.filter(x=>x.id!==df)});return}
  const es=q('data-edit-shift');if(es)return openShiftEditor(es);const ds=q('data-delete-shift');if(ds){UI.deleteWithUndo('このシフトを削除しますか？',()=>{state.shifts=state.shifts.filter(x=>x.id!==ds)});return}
});
$('exportBtn').onclick=downloadBackup;
$('generateTestDataBtn').onclick=generateTestData;$('restoreTestDataBtn').onclick=restoreTestData;$('runLayoutCheckBtn').onclick=runLayoutCheck;
$('importInput').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{state=normalize(JSON.parse(await f.text()));save();toast('読み込みました')}catch{toast('読み込めませんでした')}e.target.value=''};
$('resetBtn').onclick=()=>{if(confirm('ShiftWalletのデータをすべて削除しますか？')){state=DataStore.reset();selectedPresetId='';localStorage.removeItem('shiftwallet.simple.paydayReportSeen');renderAll();toast('初期化しました')}};
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstallPrompt=e;$('installBtn').hidden=false});$('installBtn').onclick=async()=>{if(!deferredInstallPrompt)return;deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;$('installBtn').hidden=true};
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js?v=5.0.5').catch(console.error));
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
