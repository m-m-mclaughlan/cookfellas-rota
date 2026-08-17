(() => {
  'use strict';
  const DAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const LEVELS=['pots','running','floor'];
  const STORAGE='cookfellas-smart-v2-config';
  const LEGACY='cookfellas-rota::cookfellas-rota-v2';
  let activeDay='Mon', lastResult=null;
  const uid=()=>Math.random().toString(36).slice(2,10);
  const clone=x=>JSON.parse(JSON.stringify(x));
  const toMin=t=>{if(!t)return null;let[a,b]=t.split(':').map(Number);return a*60+b};
  const pretty=m=>{let h=Math.floor(m/60),n=m%60,hh=h>12?h-12:h===0?12:h;return `${hh}${n?':'+String(n).padStart(2,'0'):''}`};
  const hours=(a,b)=>(b-a)/60;
  const dayMap=v=>Object.fromEntries(DAYS.map(d=>[d,v]));

  function defaultCoverage(){
    const c={}; DAYS.forEach(d=>c[d]={restaurant:[],bar:[]});
    const add=(d,a,role,start,end,count)=>c[d][a].push({id:uid(),role,start,end,count});
    const normal=(d,open='11:30')=>{add(d,'restaurant','floor',open,'14:30',2);add(d,'restaurant','floor','14:30','17:00',1);add(d,'restaurant','floor','17:00','22:30',2);add(d,'restaurant','pots','18:00','22:30',1);add(d,'bar','bar','11:30','14:30',1);add(d,'bar','bar','14:30','17:00',1);add(d,'bar','bar','17:00','22:30',2)};
    normal('Mon'); normal('Tue','11:00'); normal('Wed'); normal('Thu');
    add('Fri','restaurant','floor','11:30','14:30',2);add('Fri','restaurant','floor','14:30','17:00',1);add('Fri','restaurant','floor','17:00','21:00',3);add('Fri','restaurant','running','17:00','21:00',1);add('Fri','restaurant','floor','21:00','22:30',3);add('Fri','restaurant','pots','17:00','22:30',1);add('Fri','bar','bar','11:30','14:30',1);add('Fri','bar','bar','14:30','17:00',1);add('Fri','bar','bar','17:00','22:30',3);
    add('Sat','restaurant','floor','11:00','12:00',1);add('Sat','restaurant','floor','12:00','17:00',2);add('Sat','restaurant','floor','17:00','21:00',3);add('Sat','restaurant','running','17:00','21:00',1);add('Sat','restaurant','floor','21:00','22:30',3);add('Sat','restaurant','pots','11:00','17:00',1);add('Sat','restaurant','pots','17:00','22:30',1);add('Sat','bar','bar','11:00','14:00',1);add('Sat','bar','bar','14:00','17:00',2);add('Sat','bar','bar','17:00','22:30',3);
    add('Sun','restaurant','floor','11:00','12:00',1);add('Sun','restaurant','floor','12:00','18:00',2);add('Sun','restaurant','pots','12:00','18:00',1);add('Sun','bar','bar','11:00','18:00',1);
    return c;
  }
  const defaultSiteHours=()=>({Mon:{open:'11:30',close:'22:30'},Tue:{open:'11:00',close:'22:30'},Wed:{open:'11:30',close:'22:30'},Thu:{open:'11:30',close:'22:30'},Fri:{open:'11:30',close:'22:30'},Sat:{open:'11:00',close:'22:30'},Sun:{open:'11:00',close:'18:00'}});
  function starterStaff(){
    const a=dayMap('full');
    const mk=(name,level='floor',manager=false,type='zeroHours',target=0,bar=false)=>({id:uid(),name,level,isManager:manager,contractType:type,targetHours:target,isBarStaff:bar,wantedDays:null,preferredMinShift:0,maxDays:5,availableDays:clone(a)});
    return [mk('Mark','floor',true,'contracted',42),mk('Fran','floor',true,'contracted',30),mk('George','floor',true,'contracted',0),mk('Tyler','floor',true,'contracted',40,true),mk('Callum','floor',false,'zeroHours',0,true),mk('Lily'),mk('Harvey','running'),mk('Lachie'),mk('Jacob','running'),mk('John','pots'),mk('Lyla','pots'),mk('Liam','floor'),mk('Finn','floor',false,'zeroHours',0,true),mk('Sophie','floor',false,'zeroHours',0,true),mk('Libby','floor',false,'zeroHours',0,true)];
  }
  function importLegacyStaff(){
    try{
      const raw=localStorage.getItem(LEGACY); if(!raw)return null;
      const x=JSON.parse(raw); if(!Array.isArray(x.staff)||!x.staff.length)return null;
      return x.staff.map(s=>({id:s.id||uid(),name:s.name||'Staff',level:s.level==='bar'?'floor':(s.level||'pots'),isManager:!!s.isManager,contractType:s.contractType||((s.contractedHours||0)>0?'contracted':'zeroHours'),targetHours:Number(s.contractedHours)||0,isBarStaff:!!s.isBarStaff,wantedDays:s.wantedShiftsPerWeek==null?null:Number(s.wantedShiftsPerWeek),preferredMinShift:0,maxDays:5,availableDays:Array.isArray(s.availableDays)?Object.fromEntries(DAYS.map(d=>[d,s.availableDays.includes(d)?'full':'none'])):{...dayMap('full'),...(s.availableDays||{})}}));
    }catch(e){console.warn('Legacy roster import failed',e);return null}
  }
  function initial(){
    try{const raw=localStorage.getItem(STORAGE);if(raw){const s=JSON.parse(raw);if(s&&s.coverage&&s.staff)return s}}catch{}
    const legacy=importLegacyStaff();
    return {coverage:defaultCoverage(),siteHours:defaultSiteHours(),staff:legacy||starterStaff(),staffSource:legacy?'Imported from current V2':'Starter roster',rules:{splitGap:2.5,maxContinuous:10,maxOT:2,twoOff:true}};
  }
  let state=initial();
  function save(){localStorage.setItem(STORAGE,JSON.stringify(state))}

  function render(){renderTabs();renderCoverage();renderStaff();save()}
  function renderTabs(){const el=document.getElementById('dayTabs');el.innerHTML='';DAYS.forEach(d=>{const b=document.createElement('button');b.className='daytab'+(d===activeDay?' active':'');b.textContent=d;b.onclick=()=>{activeDay=d;renderTabs();renderCoverage()};el.appendChild(b)})}
  function renderCoverage(){
    document.getElementById('siteOpen').value=state.siteHours[activeDay].open;document.getElementById('siteClose').value=state.siteHours[activeDay].close;
    const root=document.getElementById('coverageEditor');root.innerHTML='';
    ['restaurant','bar'].forEach(area=>{
      const wrap=document.createElement('div');wrap.innerHTML=`<div class="areaHead"><div class="areaTitle">${area==='restaurant'?'Restaurant':'Bar'}</div><button class="btn small">+ requirement</button></div><div class="reqs"></div>`;
      wrap.querySelector('button').onclick=()=>{state.coverage[activeDay][area].push({id:uid(),role:area==='bar'?'bar':'floor',start:state.siteHours[activeDay].open,end:state.siteHours[activeDay].close,count:1});renderCoverage();save()};
      const list=wrap.querySelector('.reqs');state.coverage[activeDay][area].forEach(r=>{
        const row=document.createElement('div');row.className='req';
        const roles=area==='bar'?['bar']:['floor','running','pots'];
        row.innerHTML=`<select class="role">${roles.map(x=>`<option value="${x}" ${x===r.role?'selected':''}>${x==='bar'?'Bar FOH':x[0].toUpperCase()+x.slice(1)}</option>`).join('')}</select><input class="start" type="time" value="${r.start}"><input class="end" type="time" value="${r.end}"><input class="count" type="number" min="0" max="10" value="${r.count}"><button class="remove">×</button>`;
        row.querySelector('.role').onchange=e=>{r.role=e.target.value;save()};row.querySelector('.start').onchange=e=>{r.start=e.target.value;save()};row.querySelector('.end').onchange=e=>{r.end=e.target.value;save()};row.querySelector('.count').onchange=e=>{r.count=Math.max(0,Number(e.target.value)||0);save()};row.querySelector('.remove').onclick=()=>{state.coverage[activeDay][area]=state.coverage[activeDay][area].filter(x=>x.id!==r.id);renderCoverage();save()};list.appendChild(row)
      });root.appendChild(wrap)
    });
  }
  const cycleAvail=v=>({full:'am',am:'pm',pm:'none',none:'full'})[v||'full'];
  function renderStaff(){
    document.getElementById('staffSource').textContent=state.staffSource||'';const root=document.getElementById('staffList');root.innerHTML='';
    state.staff.forEach(s=>{
      const row=document.createElement('div');row.className='staffRow';
      row.innerHTML=`<div class="staffTop"><input class="name" value="${esc(s.name)}"><select class="level">${LEVELS.map(l=>`<option ${s.level===l?'selected':''}>${l}</option>`).join('')}</select><label class="checkWrap"><input class="mgr" type="checkbox" ${s.isManager?'checked':''}><br>MGR</label><label class="checkWrap"><input class="barpref" type="checkbox" ${s.isBarStaff?'checked':''}><br>BAR</label><select class="contractType"><option value="zeroHours" ${s.contractType==='zeroHours'?'selected':''}>Zero-hours</option><option value="contracted" ${s.contractType==='contracted'?'selected':''}>Contracted</option></select><input class="target" type="number" min="0" step="0.5" value="${s.targetHours||''}" placeholder="hrs"><button class="icon removeStaff">×</button></div><div class="staffMeta"><label>Preferred min shift (soft)<input class="minshift" type="number" min="0" step="0.5" value="${s.preferredMinShift||''}" placeholder="Any"></label><label>Max workdays<input class="maxdays" type="number" min="1" max="7" value="${s.maxDays??5}"></label><label>Wanted days/wk (soft)<input class="wanteddays" type="number" min="0" max="7" value="${s.wantedDays??''}" placeholder="Any"></label></div><div class="avail"></div>`;
      const q=(x)=>row.querySelector(x);q('.name').onchange=e=>{s.name=e.target.value.trim()||s.name;save()};q('.level').onchange=e=>{s.level=e.target.value;save()};q('.mgr').onchange=e=>{s.isManager=e.target.checked;save()};q('.barpref').onchange=e=>{s.isBarStaff=e.target.checked;save()};q('.contractType').onchange=e=>{s.contractType=e.target.value;save()};q('.target').onchange=e=>{s.targetHours=Number(e.target.value)||0;save()};q('.minshift').onchange=e=>{s.preferredMinShift=Number(e.target.value)||0;save()};q('.maxdays').onchange=e=>{s.maxDays=Math.min(7,Math.max(1,Number(e.target.value)||5));save()};q('.wanteddays').onchange=e=>{s.wantedDays=e.target.value===''?null:Number(e.target.value);save()};q('.removeStaff').onclick=()=>{state.staff=state.staff.filter(x=>x.id!==s.id);renderStaff();save()};
      const av=q('.avail');DAYS.forEach(d=>{let v=s.availableDays?.[d]||'full';const b=document.createElement('button');b.className=v;b.textContent=d[0];b.title=`${d}: ${v}`;b.onclick=()=>{s.availableDays=s.availableDays||dayMap('full');s.availableDays[d]=cycleAvail(s.availableDays[d]);renderStaff();save()};av.appendChild(b)});root.appendChild(row)
    })
  }
  function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

  function coverageProfile(day,area,role){
    const rows=state.coverage[day][area].filter(r=>r.role===role&&r.count>0);if(!rows.length)return null;
    let start=Math.min(...rows.map(r=>toMin(r.start))),end=Math.max(...rows.map(r=>toMin(r.end)));if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return null;
    start=Math.floor(start/30)*30;end=Math.ceil(end/30)*30;const seg=[];for(let t=start;t<end;t+=30){let need=0;rows.forEach(r=>{let a=toMin(r.start),b=toMin(r.end);if(a<=t&&b>=t+30)need=Math.max(need,Number(r.count)||0)});seg.push({start:t,end:t+30,need})}return {rows,start,end,seg}
  }
  function splitRun(start,end,boundaries,maxHours){
    const max=maxHours*60;if(end-start<=max)return [[start,end]];const out=[];let cur=start;
    while(end-cur>max){const target=cur+max*0.7;let opts=boundaries.filter(x=>x>cur+150&&x<end-150&&x<=cur+max);let cut=opts.sort((a,b)=>Math.abs(a-target)-Math.abs(b-target))[0]||cur+max;out.push([cur,cut]);cur=cut}out.push([cur,end]);return out
  }
  function generateShifts(){
    const shifts=[];DAYS.forEach(day=>['restaurant','bar'].forEach(area=>{const roles=area==='bar'?['bar']:['floor','running','pots'];roles.forEach(role=>{const p=coverageProfile(day,area,role);if(!p)return;const maxNeed=Math.max(0,...p.seg.map(x=>x.need));const boundaries=[...new Set(p.rows.flatMap(r=>[toMin(r.start),toMin(r.end)]).filter(Number.isFinite))];for(let layer=1;layer<=maxNeed;layer++){let run=null;for(const s of [...p.seg,{start:p.end,end:p.end,need:0}]){if(s.need>=layer&&!run)run=s.start;if(s.need<layer&&run!=null){splitRun(run,s.start,boundaries,state.rules.maxContinuous).forEach(([a,b])=>shifts.push({id:uid(),day,area,role,start:a,end:b,layer,staffId:null}));run=null}}}})}));return shifts
  }
  const levelOk=(s,shift)=>shift.area==='bar'?LEVELS.indexOf(s.level)>=LEVELS.indexOf('floor'):LEVELS.indexOf(s.level)>=LEVELS.indexOf(shift.role);
  function availOk(s,shift){const v=s.availableDays?.[shift.day]||'full';if(v==='none')return false;if(v==='full')return true;if(v==='am')return shift.end<=17*60;if(v==='pm')return shift.start>=17*60;return true}
  const assignmentHours=(assign,id)=>assign.filter(x=>x.staffId===id).reduce((z,x)=>z+hours(x.start,x.end),0);
  const workedDays=(assign,id)=>new Set(assign.filter(x=>x.staffId===id).map(x=>x.day));
  function dayShifts(assign,id,day){return assign.filter(x=>x.staffId===id&&x.day===day).sort((a,b)=>a.start-b.start)}
  function twoOffOk(days){for(let i=0;i<DAYS.length;i++){if(!days.has(DAYS[i])&&!days.has(DAYS[(i+1)%DAYS.length]))return true}return false}
  function canAssign(s,shift,assign){
    if(!levelOk(s,shift)||!availOk(s,shift))return false;const ds=dayShifts(assign,s.id,shift.day);for(const x of ds){if(shift.start<x.end&&x.start<shift.end)return false;let gap=shift.start>=x.end?shift.start-x.end:x.start-shift.end;if(gap>0&&gap<state.rules.splitGap*60)return false}
    const all=[...ds,shift].sort((a,b)=>a.start-b.start);let continuousStart=null,lastEnd=null;for(const x of all){if(continuousStart==null){continuousStart=x.start;lastEnd=x.end;continue}if(x.start===lastEnd){lastEnd=x.end;if((lastEnd-continuousStart)/60>state.rules.maxContinuous+.001)return false}else{continuousStart=x.start;lastEnd=x.end}}
    const days=workedDays(assign,s.id);if(!days.has(shift.day)){if(days.size>=(s.maxDays??5))return false;const next=new Set(days);next.add(shift.day);if(state.rules.twoOff&&!twoOffOk(next))return false}if(s.contractType==='contracted'&&s.targetHours>0&&assignmentHours(assign,s.id)+hours(shift.start,shift.end)>s.targetHours+state.rules.maxOT+.001)return false;return true
  }
  function scoreStaff(s,shift,assign){
    const dur=hours(shift.start,shift.end),h=assignmentHours(assign,s.id),days=workedDays(assign,s.id),same=days.has(shift.day),ds=dayShifts(assign,s.id,shift.day);let score=0;
    if(s.contractType==='contracted'&&s.targetHours>0){const deficit=Math.max(0,s.targetHours-h);score-=Math.min(deficit,dur)*1000;score+=Math.max(0,h+dur-s.targetHours)*80}else score+=h*3;
    if(same)score-=180; else score+=days.size*25;
    if(ds.length){let minGap=Math.min(...ds.map(x=>Math.max(0,shift.start>=x.end?shift.start-x.end:x.start-shift.end)));if(minGap===0)score-=120;else score+=220}
    if(s.preferredMinShift>0&&dur<s.preferredMinShift&&!same)score+=(s.preferredMinShift-dur)*160;
    if(s.wantedDays!=null&&!same&&days.size>=s.wantedDays)score+=350;
    const di=DAYS.indexOf(shift.day),prev=DAYS[(di+6)%7],next=DAYS[(di+1)%7],prevLate=assign.some(x=>x.staffId===s.id&&x.day===prev&&x.end>=21*60),nextEarly=assign.some(x=>x.staffId===s.id&&x.day===next&&x.start<12*60);if(shift.start<12*60&&prevLate)score+=500;if(shift.end>=21*60&&nextEarly)score+=500;
    if(shift.area==='bar')score+=s.isBarStaff?-140:90;else score+=s.isBarStaff?70:-60;
    return score
  }
  function assignManagers(shifts,assign,warnings){
    const managers=state.staff.filter(s=>s.isManager);
    for(const day of DAYS){const open=toMin(state.siteHours[day].open),close=toMin(state.siteHours[day].close);const daySh=shifts.filter(x=>x.day===day);
      const ensure=(kind,time)=>{if(time==null||!daySh.length)return;const covering=daySh.filter(x=>kind==='open'?x.start<=time&&x.end>time:x.start<time&&x.end>=time);if(!covering.length){warnings.push(`${day}: no generated shift covers site ${kind}`);return}if(covering.some(x=>{let s=state.staff.find(q=>q.id===x.staffId);return s?.isManager}))return;
        let best=null;for(const sh of covering){if(sh.staffId)continue;for(const m of managers){if(!canAssign(m,sh,assign))continue;let sc=scoreStaff(m,sh,assign)+(sh.area==='restaurant'?-20:0);if(!best||sc<best.sc)best={sh,m,sc}}}if(best){best.sh.staffId=best.m.id;assign.push(best.sh)}else warnings.push(`${day}: could not place a manager for site ${kind}`)};
      ensure('open',open);ensure('close',close)
    }
  }
  function assignShifts(shifts){
    const assigned=[],warnings=[];assignManagers(shifts,assigned,warnings);
    const remaining=shifts.filter(x=>!x.staffId).sort((a,b)=>{const pa=a.area==='bar'||a.role==='floor'?0:a.role==='running'?1:2,pb=b.area==='bar'||b.role==='floor'?0:b.role==='running'?1:2;return pa-pb||(b.end-b.start)-(a.end-a.start)});
    for(const sh of remaining){let candidates=state.staff.filter(s=>canAssign(s,sh,assigned)).sort((a,b)=>scoreStaff(a,sh,assigned)-scoreStaff(b,sh,assigned));if(candidates.length){sh.staffId=candidates[0].id;assigned.push(sh)}}
    for(const day of DAYS){for(const kind of ['open','close']){const time=toMin(state.siteHours[day][kind]);if(time==null)continue;const ok=assigned.some(x=>x.day===day&&(kind==='open'?x.start<=time&&x.end>time:x.start<time&&x.end>=time)&&state.staff.find(s=>s.id===x.staffId)?.isManager);if(!ok&&shifts.some(x=>x.day===day))warnings.push(`${day}: no manager covering site ${kind}`)}}
    return {shifts,warnings}
  }
  function mergeDisplay(shifts){
    const out=[],groups={};for(const x of shifts){const key=`${x.day}|${x.area}|${x.role}|${x.staffId||'_'}`;(groups[key]??=[]).push(x)}for(const arr of Object.values(groups)){arr.sort((a,b)=>a.start-b.start);let cur=null;for(const x of arr){if(cur&&cur.end===x.start){cur.end=x.end;cur.parts.push(x.id)}else{cur={...x,parts:[x.id]};out.push(cur)}}}return out.sort((a,b)=>DAYS.indexOf(a.day)-DAYS.indexOf(b.day)||a.start-b.start||a.area.localeCompare(b.area))
  }
  function validateCoverage(shifts){
    let missing=0;for(const day of DAYS)for(const area of ['restaurant','bar']){const roles=area==='bar'?['bar']:['floor','running','pots'];for(const role of roles){const p=coverageProfile(day,area,role);if(!p)continue;for(const seg of p.seg){if(!seg.need)continue;const n=shifts.filter(x=>x.day===day&&x.area===area&&x.role===role&&x.start<=seg.start&&x.end>=seg.end&&x.staffId).length;missing+=Math.max(0,seg.need-n)*.5}}}return missing
  }
  function generate(){
    const shifts=generateShifts();const res=assignShifts(shifts);const display=mergeDisplay(shifts);const missingHours=validateCoverage(shifts);const total=shifts.reduce((z,x)=>z+hours(x.start,x.end),0);const filled=shifts.filter(x=>x.staffId).reduce((z,x)=>z+hours(x.start,x.end),0);const zero=shifts.filter(x=>x.staffId&&state.staff.find(s=>s.id===x.staffId)?.contractType==='zeroHours').reduce((z,x)=>z+hours(x.start,x.end),0);const contracted=filled-zero;const unfilled=shifts.filter(x=>!x.staffId).length;
    const splitDays=[];for(const s of state.staff)for(const d of DAYS){const a=dayShifts(shifts,s.id,d);if(a.length>1&&a.some((x,i)=>i&&x.start>a[i-1].end))splitDays.push(`${s.name} ${d}`)}
    lastResult={...res,display,metrics:{total,filled,zero,contracted,unfilled,missingHours,splits:splitDays.length}};renderResults();document.getElementById('download').disabled=false
  }
  function renderResults(){
    const r=lastResult;if(!r)return;const m=r.metrics;document.getElementById('resultsPanel').style.display='block';document.getElementById('resultHint').textContent=`Generated ${r.shifts.length} coverage-backed shift segments. Adjacent segments assigned to the same person are shown as one continuous shift.`;
    const metricData=[['Required labour',m.total.toFixed(1)+'h'],['Filled labour',m.filled.toFixed(1)+'h'],['Zero-hours',m.zero.toFixed(1)+'h'],['Contracted used',m.contracted.toFixed(1)+'h'],['Unfilled shifts',m.unfilled],['Split days',m.splits]];document.getElementById('metrics').innerHTML=metricData.map(([k,v])=>`<div class="metric"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
    const w=document.getElementById('warnings');let msgs=[...new Set(r.warnings)];if(m.missingHours>0)msgs.push(`${m.missingHours.toFixed(1)} staff-hours of required coverage remain unfilled.`);w.innerHTML=msgs.length?msgs.map(x=>`<div class="warn">⚠ ${esc(x)}</div>`).join(''):`<div class="ok">✓ All coverage blocks are staffed and site opening/closing has manager coverage.</div>`;
    const grid=document.getElementById('rotaGrid');grid.innerHTML='';DAYS.forEach(day=>{const col=document.createElement('div');col.className='dayResult';col.innerHTML=`<h3>${day}</h3>`;['restaurant','bar'].forEach(area=>{col.insertAdjacentHTML('beforeend',`<div class="areaLabel">${area}</div>`);const arr=r.display.filter(x=>x.day===day&&x.area===area);if(!arr.length)col.insertAdjacentHTML('beforeend','<div class="role">No shifts</div>');arr.forEach(x=>{const s=state.staff.find(q=>q.id===x.staffId);col.insertAdjacentHTML('beforeend',`<div class="shift ${area==='bar'?'bar':''} ${x.staffId?'':'unfilled'}"><div class="time">${pretty(x.start)}–${pretty(x.end)}</div><div class="who">${s?esc(s.name):'— UNFILLED —'}</div><div class="role">${x.role==='bar'?'Bar FOH':x.role}</div></div>`)})});grid.appendChild(col)})
  }
  function download(){if(!lastResult)return;let rows={restaurant:'',bar:''};for(const area of ['restaurant','bar']){const people=state.staff.filter(s=>lastResult.display.some(x=>x.area===area&&x.staffId===s.id));rows[area]=people.map(s=>`<tr><td><b>${esc(s.name)}</b></td>${DAYS.map(d=>{let a=lastResult.display.filter(x=>x.area===area&&x.day===d&&x.staffId===s.id).sort((x,y)=>x.start-y.start);return `<td>${a.length?a.map(x=>`${pretty(x.start)}-${pretty(x.end)}`).join(' / '):'—'}</td>`}).join('')}</tr>`).join('')}
    const html=`<!doctype html><meta charset="utf-8"><title>Cookfellas Smart Rota V2</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:24px;color:#16211B}h1,h2{font-family:Georgia,serif}table{border-collapse:collapse;width:100%;font-size:12px;margin-bottom:22px}th,td{border:1px solid #999;padding:6px}th{background:#EFEBE2}</style><h1>Cookfella's Bar & Eatery — Smart Rota V2</h1>${['restaurant','bar'].map(a=>`<h2>${a[0].toUpperCase()+a.slice(1)}</h2><table><thead><tr><th>Staff</th>${DAYS.map(d=>`<th>${d}</th>`).join('')}</tr></thead><tbody>${rows[a]}</tbody></table>`).join('')}<p>Generated from coverage requirements · V2 Smart 0.1</p>`;const blob=new Blob([html],{type:'text/html'}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='cookfellas-smart-rota-v2.html';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)
  }

  document.getElementById('siteOpen').onchange=e=>{state.siteHours[activeDay].open=e.target.value;save()};document.getElementById('siteClose').onchange=e=>{state.siteHours[activeDay].close=e.target.value;save()};
  document.getElementById('splitGap').value=state.rules.splitGap;document.getElementById('maxContinuous').value=state.rules.maxContinuous;document.getElementById('maxOT').value=state.rules.maxOT;document.getElementById('twoOff').checked=state.rules.twoOff!==false;
  document.getElementById('splitGap').onchange=e=>{state.rules.splitGap=Number(e.target.value)||0;save()};document.getElementById('maxContinuous').onchange=e=>{state.rules.maxContinuous=Number(e.target.value)||10;save()};document.getElementById('maxOT').onchange=e=>{state.rules.maxOT=Number(e.target.value)||0;save()};document.getElementById('twoOff').onchange=e=>{state.rules.twoOff=e.target.checked;save()};
  document.getElementById('generate').onclick=generate;document.getElementById('download').onclick=download;document.getElementById('resetCoverage').onclick=()=>{if(confirm('Reset the V2 coverage requirements to the starter model?')){state.coverage=defaultCoverage();state.siteHours=defaultSiteHours();render()}};
  document.getElementById('importLegacy').onclick=()=>{const s=importLegacyStaff();if(!s)return alert('No current V2 roster was found in this browser.');state.staff=s;state.staffSource='Imported from current V2';render()};
  document.getElementById('addStaff').onclick=()=>{state.staff.push({id:uid(),name:'New staff',level:'floor',isManager:false,contractType:'zeroHours',targetHours:0,isBarStaff:false,wantedDays:null,preferredMinShift:0,maxDays:5,availableDays:dayMap('full')});renderStaff();save()};
  render();
})();
