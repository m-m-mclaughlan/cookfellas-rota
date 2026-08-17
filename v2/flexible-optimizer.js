(() => {
  'use strict';

  const KEY='cookfellas-smart-v2-config';
  const DAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const LEVELS=['pots','running','floor'];
  const CORE=new Set(['mark','fran','tyler']);
  const button=document.getElementById('generate');
  if(!button)return;

  const uid=()=>Math.random().toString(36).slice(2,10);
  const toMin=t=>{if(!t)return null;const [h,m]=String(t).split(':').map(Number);return h*60+m};
  const pretty=m=>{const h=Math.floor(m/60),n=m%60,hh=h>12?h-12:h===0?12:h;return `${hh}${n?':'+String(n).padStart(2,'0'):''}`};
  const hours=(a,b)=>(b-a)/60;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const staffName=s=>String(s?.name||'').trim().toLowerCase();
  const isCore=s=>CORE.has(staffName(s));
  const overlaps=(a,b,c,d)=>a<d&&c<b;

  function readState(){try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch{return null}}
  function writeState(state){localStorage.setItem(KEY,JSON.stringify(state))}

  function ensureFlexRules(){
    const state=readState();if(!state)return;
    state.rules=state.rules||{};
    if(state.rules.flexOverstaff==null)state.rules.flexOverstaff=1;
    if(state.rules.flexBudget==null)state.rules.flexBudget=4;
    if(state.rules.minGeneratedShift==null)state.rules.minGeneratedShift=3;
    writeState(state);
    const over=document.getElementById('flexOverstaff');
    const budget=document.getElementById('flexBudget');
    const minShift=document.getElementById('minGeneratedShift');
    if(over){over.value=state.rules.flexOverstaff;over.onchange=e=>{const s=readState();if(!s)return;s.rules=s.rules||{};s.rules.flexOverstaff=Math.max(0,Math.min(2,Number(e.target.value)||0));writeState(s)}}
    if(budget){budget.value=state.rules.flexBudget;budget.onchange=e=>{const s=readState();if(!s)return;s.rules=s.rules||{};s.rules.flexBudget=Math.max(0,Number(e.target.value)||0);writeState(s)}}
    if(minShift){minShift.value=state.rules.minGeneratedShift;minShift.onchange=e=>{const s=readState();if(!s)return;s.rules=s.rules||{};s.rules.minGeneratedShift=Math.max(1,Number(e.target.value)||3);writeState(s)}}
  }

  function coverageProfile(state,day,area,role){
    const rows=(state.coverage?.[day]?.[area]||[]).filter(r=>r.role===role&&Number(r.count)>0);
    const site=state.siteHours?.[day];if(!site||!rows.length)return null;
    const start=toMin(site.open),end=toMin(site.close);if(start==null||end==null||end<=start)return null;
    const blocks=[];
    for(let t=start;t<end;t+=30){
      let need=0;
      for(const r of rows){const a=toMin(r.start),b=toMin(r.end);if(a<=t&&b>=t+30)need=Math.max(need,Number(r.count)||0)}
      blocks.push({start:t,end:t+30,need});
    }
    return {day,area,role,start,end,blocks};
  }

  function buildLanes(state){
    const lanes=[];
    for(const day of DAYS)for(const area of ['restaurant','bar']){
      const roles=area==='bar'?['bar']:['floor','running','pots'];
      for(const role of roles){const p=coverageProfile(state,day,area,role);if(p&&p.blocks.some(b=>b.need>0)){p.key=`${day}|${area}|${role}`;p.cover=p.blocks.map(()=>0);lanes.push(p)}}
    }
    return lanes;
  }

  function roleOk(s,lane){
    if(lane.area==='bar')return LEVELS.indexOf(s.level)>=LEVELS.indexOf('floor');
    return LEVELS.indexOf(s.level)>=LEVELS.indexOf(lane.role);
  }
  function availabilityWindow(s,day){
    const v=s.availableDays?.[day]||'full';
    if(v==='none')return null;
    if(v==='am')return [0,17*60];
    if(v==='pm')return [17*60,24*60];
    return [0,24*60];
  }
  function availOk(s,shift){const w=availabilityWindow(s,shift.day);return !!w&&shift.start>=w[0]&&shift.end<=w[1]}
  const personShifts=(assign,id)=>assign.filter(x=>x.staffId===id).sort((a,b)=>DAYS.indexOf(a.day)-DAYS.indexOf(b.day)||a.start-b.start);
  const personHours=(assign,id)=>personShifts(assign,id).reduce((z,x)=>z+hours(x.start,x.end),0);
  const personDays=(assign,id)=>new Set(personShifts(assign,id).map(x=>x.day));
  function twoOffOk(days){for(let i=0;i<DAYS.length;i++)if(!days.has(DAYS[i])&&!days.has(DAYS[(i+1)%7]))return true;return false}

  function canAssign(state,s,shift,assign){
    if(!roleOk(s,shift)||!availOk(s,shift))return false;
    const ds=assign.filter(x=>x.staffId===s.id&&x.day===shift.day).sort((a,b)=>a.start-b.start);
    for(const x of ds){
      if(overlaps(shift.start,shift.end,x.start,x.end))return false;
      const gap=shift.start>=x.end?shift.start-x.end:x.start-shift.end;
      if(gap>0&&gap<(Number(state.rules?.splitGap)||0)*60)return false;
    }
    const all=[...ds,shift].sort((a,b)=>a.start-b.start);let runStart=null,lastEnd=null;
    for(const x of all){
      if(runStart==null||x.start!==lastEnd){runStart=x.start;lastEnd=x.end}else lastEnd=x.end;
      if((lastEnd-runStart)/60>(Number(state.rules?.maxContinuous)||10)+.001)return false;
    }
    const days=personDays(assign,s.id);
    if(!days.has(shift.day)){
      if(days.size>=(s.maxDays??5))return false;
      const next=new Set(days);next.add(shift.day);
      if(state.rules?.twoOff!==false&&!twoOffOk(next))return false;
    }
    if(s.contractType==='contracted'&&Number(s.targetHours)>0){
      if(personHours(assign,s.id)+hours(shift.start,shift.end)>Number(s.targetHours)+(Number(state.rules?.maxOT)||0)+.001)return false;
    }
    return true;
  }

  function blockPriority(day,start){
    let p=1;
    if((day==='Fri'||day==='Sat')&&start>=17*60&&start<21*60)p+=day==='Sat'?2.4:1.6;
    if(day==='Sat'&&start>=12*60&&start<17*60)p+=.5;
    return p;
  }

  function laneStats(lane,start,end,flexOverstaff){
    let gain=0,weighted=0,extra=0;
    for(let i=0;i<lane.blocks.length;i++){
      const b=lane.blocks[i];if(b.start<start||b.end>end)continue;
      const before=lane.cover[i],need=b.need;
      if(before+1>need+flexOverstaff)return null;
      if(before<need){gain+=.5;weighted+=.5*blockPriority(lane.day,b.start)}
      else extra+=.5;
    }
    return {gain,weighted,extra};
  }

  function assignmentTouches(assign,s,shift){return assign.some(x=>x.staffId===s.id&&x.day===shift.day&&(x.end===shift.start||shift.end===x.start))}
  function assignmentSameDay(assign,s,shift){return assign.some(x=>x.staffId===s.id&&x.day===shift.day)}
  function managerCovers(assign,state,day,kind){
    const t=toMin(state.siteHours?.[day]?.[kind]);if(t==null)return false;
    return assign.some(x=>x.day===day&&x.staffId&&state.staff.find(s=>s.id===x.staffId)?.isManager&&(kind==='open'?x.start<=t&&x.end>t:x.start<t&&x.end>=t));
  }
  function managerPeakCount(assign,state,day,t){return new Set(assign.filter(x=>x.day===day&&x.staffId&&x.start<=t&&x.end>=t+30&&state.staff.find(s=>s.id===x.staffId)?.isManager).map(x=>x.staffId)).size}
  function hasCoreSaturday(assign,s){return assign.some(x=>x.staffId===s.id&&x.day==='Sat'&&x.start<21*60&&x.end>17*60)}

  function scoreCandidate(state,lane,shift,s,assign,stats,extraUsed){
    const dur=hours(shift.start,shift.end),h=personHours(assign,s.id),def=Math.max(0,Number(s.targetHours||0)-h);
    let score=stats.weighted*1000 + stats.gain*220;
    score-=stats.extra*520;
    if(extraUsed+stats.extra>Number(state.rules?.flexBudget||0)+.001)return -Infinity;
    if(lane.area==='bar')score+=s.isBarStaff?120:-45;else score+=s.isBarStaff?-35:45;
    if(s.contractType==='contracted'){
      if(Number(s.targetHours)>0)score+=Math.min(def,dur)*180;
      else score+=dur*20;
    }else score-=dur*240;
    if(assignmentTouches(assign,s,shift))score+=180;
    else if(assignmentSameDay(assign,s,shift))score-=120;
    else score-=35;
    if(dur<4)score-=(4-dur)*90;
    if(dur>=6&&dur<=9.5)score+=70;
    if(s.isManager&&(lane.day==='Fri'||lane.day==='Sat')&&shift.start<21*60&&shift.end>17*60)score+=180;
    if(isCore(s)&&lane.day==='Sat'&&shift.start<21*60&&shift.end>17*60&&!hasCoreSaturday(assign,s))score+=1800;
    if(s.isManager){
      const open=toMin(state.siteHours?.[lane.day]?.open),close=toMin(state.siteHours?.[lane.day]?.close);
      if(open!=null&&shift.start<=open&&shift.end>open&&!managerCovers(assign,state,lane.day,'open'))score+=2500;
      if(close!=null&&shift.start<close&&shift.end>=close&&!managerCovers(assign,state,lane.day,'close'))score+=2500;
    }
    return score;
  }

  function candidateRanges(state,lane,targetStart,s,assign,extraUsed){
    const out=[],step=30,max=(Number(state.rules?.maxContinuous)||10)*60,min=(Number(state.rules?.minGeneratedShift)||3)*60;
    const flexOverstaff=Math.max(0,Number(state.rules?.flexOverstaff)||0);
    for(let start=lane.start;start<=targetStart;start+=step){
      for(let end=targetStart+30;end<=lane.end;end+=step){
        const dur=end-start;if(dur<min||dur>max)continue;
        const sh={id:uid(),day:lane.day,area:lane.area,role:lane.role,start,end,staffId:s.id,laneKey:lane.key};
        if(!canAssign(state,s,sh,assign))continue;
        const stats=laneStats(lane,start,end,flexOverstaff);if(!stats||stats.gain<=0)continue;
        const score=scoreCandidate(state,lane,sh,s,assign,stats,extraUsed);if(Number.isFinite(score))out.push({shift:sh,stats,score});
      }
    }
    return out;
  }

  function addAssignment(lanes,assign,pick){
    const lane=lanes.find(l=>l.key===pick.shift.laneKey);if(!lane)return;
    for(let i=0;i<lane.blocks.length;i++){const b=lane.blocks[i];if(b.start>=pick.shift.start&&b.end<=pick.shift.end)lane.cover[i]++}
    assign.push(pick.shift);
  }

  function totalExtra(lanes){
    let x=0;for(const l of lanes)for(let i=0;i<l.blocks.length;i++)x+=Math.max(0,l.cover[i]-l.blocks[i].need)*.5;return x;
  }
  function missingHours(lanes){let x=0;for(const l of lanes)for(let i=0;i<l.blocks.length;i++)x+=Math.max(0,l.blocks[i].need-l.cover[i])*.5;return x}
  function requiredHours(lanes){let x=0;for(const l of lanes)for(const b of l.blocks)x+=b.need*.5;return x}

  function chooseBestForTime(state,lanes,assign,staff,time,day,extraUsed){
    let best=null;
    for(const lane of lanes){
      if(lane.day!==day||!roleOk(staff,lane))continue;
      const block=lane.blocks.find(b=>b.start<=time&&b.end>time);if(!block)continue;
      for(const p of candidateRanges(state,lane,block.start,staff,assign,extraUsed))if(!best||p.score>best.score)best=p;
    }
    return best;
  }

  function seedManagers(state,lanes,assign){
    for(const day of DAYS){
      for(const kind of ['open','close']){
        if(managerCovers(assign,state,day,kind))continue;
        const t=toMin(state.siteHours?.[day]?.[kind]);if(t==null)continue;
        const target=kind==='close'?t-30:t;
        let best=null;
        for(const s of state.staff.filter(x=>x.isManager)){
          const p=chooseBestForTime(state,lanes,assign,s,target,day,totalExtra(lanes));
          if(p&&(!best||p.score>best.score))best=p;
        }
        if(best)addAssignment(lanes,assign,best);
      }
    }
  }

  function seedSaturdayCore(state,lanes,assign){
    for(const s of state.staff.filter(isCore)){
      if(hasCoreSaturday(assign,s))continue;
      const p=chooseBestForTime(state,lanes,assign,s,18*60,'Sat',totalExtra(lanes));
      if(p)addAssignment(lanes,assign,p);
    }
  }

  function targetScarcity(state,lane,block,assign){
    const probe={day:lane.day,area:lane.area,role:lane.role,start:block.start,end:block.end};
    let n=0;for(const s of state.staff){if(roleOk(s,lane)&&availOk(s,probe))n++}
    const peak=blockPriority(lane.day,block.start);
    return {n,peak};
  }

  function nextTarget(state,lanes,assign,blocked){
    let best=null;
    for(const lane of lanes)for(let i=0;i<lane.blocks.length;i++){
      const b=lane.blocks[i],def=b.need-lane.cover[i];if(def<=0||blocked.has(`${lane.key}|${i}`))continue;
      const sc=targetScarcity(state,lane,b,assign);
      const cand={lane,block:b,index:i,eligible:sc.n,peak:sc.peak};
      if(!best||cand.eligible<best.eligible||(cand.eligible===best.eligible&&cand.peak>best.peak))best=cand;
    }
    return best;
  }

  function fillDemand(state,lanes,assign){
    let guard=0;const blocked=new Set();
    while(guard++<400){
      const target=nextTarget(state,lanes,assign,blocked);if(!target)break;
      let best=null;const extraUsed=totalExtra(lanes);
      for(const s of state.staff){
        if(!roleOk(s,target.lane))continue;
        for(const p of candidateRanges(state,target.lane,target.block.start,s,assign,extraUsed)){
          if(!best||p.score>best.score)best=p;
        }
      }
      if(!best){blocked.add(`${target.lane.key}|${target.index}`);continue}
      addAssignment(lanes,assign,best);
      blocked.clear();
    }
  }

  function mergeDisplay(assign){
    const out=[];
    const groups={};
    for(const x of assign){const k=`${x.day}|${x.area}|${x.staffId}`;(groups[k]??=[]).push(x)}
    for(const arr of Object.values(groups)){
      arr.sort((a,b)=>a.start-b.start);let cur=null;
      for(const x of arr){
        if(cur&&cur.end===x.start){cur.end=x.end;cur.role=[...new Set(String(cur.role).split(' / ').concat([x.role]))].join(' / ')}
        else{cur={...x};out.push(cur)}
      }
    }
    return out.sort((a,b)=>DAYS.indexOf(a.day)-DAYS.indexOf(b.day)||a.start-b.start||a.area.localeCompare(b.area));
  }

  function splitCount(assign,state){let n=0;for(const s of state.staff)for(const d of DAYS){const a=personShifts(assign,s.id).filter(x=>x.day===d);if(a.some((x,i)=>i&&x.start>a[i-1].end))n++}return n}
  function scheduledHours(assign){return assign.reduce((z,x)=>z+hours(x.start,x.end),0)}
  function zeroHours(assign,state){return assign.filter(x=>state.staff.find(s=>s.id===x.staffId)?.contractType==='zeroHours').reduce((z,x)=>z+hours(x.start,x.end),0)}

  function render(state,lanes,assign){
    const display=mergeDisplay(assign);
    const required=requiredHours(lanes),missing=missingHours(lanes),scheduled=scheduledHours(assign),extra=Math.max(0,scheduled-(required-missing));
    const zero=zeroHours(assign,state),contracted=scheduled-zero,splits=splitCount(assign,state);
    const panel=document.getElementById('resultsPanel');panel.style.display='block';
    document.getElementById('resultHint').textContent='Coverage times are treated as demand windows, not fixed shift boundaries. Smart 0.5 builds flexible shifts across those windows and may use a small amount of paid overlap when it improves the overall rota.';
    const metricData=[['Required labour',required.toFixed(1)+'h'],['Scheduled labour',scheduled.toFixed(1)+'h'],['Zero-hours',zero.toFixed(1)+'h'],['Contracted used',contracted.toFixed(1)+'h'],['Unfilled coverage',missing.toFixed(1)+'h'],['Extra flex',extra.toFixed(1)+'h'],['Split days',splits]];
    document.getElementById('metrics').innerHTML=metricData.map(([k,v])=>`<div class="metric"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');

    const warnings=[];
    if(missing>0)warnings.push(`${missing.toFixed(1)} staff-hours of required coverage remain unfilled.`);
    for(const day of DAYS)for(const kind of ['open','close'])if(!managerCovers(assign,state,day,kind))warnings.push(`${day}: no manager covering site ${kind}.`);
    for(const s of state.staff.filter(isCore))if(!hasCoreSaturday(assign,s))warnings.push(`Saturday 5–9 preference not achieved for ${s.name}.`);
    const friPeak=Math.max(...[17,18,19,20].map(h=>managerPeakCount(assign,state,'Fri',h*60)));
    const satPeak=Math.max(...[17,18,19,20].map(h=>managerPeakCount(assign,state,'Sat',h*60)));
    warnings.push(`Flexible shift mode used ${extra.toFixed(1)}h of extra overlap/shoulder cover (budget ${Number(state.rules?.flexBudget||0).toFixed(1)}h).`);
    warnings.push(`Peak manager presence: Fri ${friPeak}, Sat ${satPeak}.`);
    document.getElementById('warnings').innerHTML=warnings.length?warnings.map(x=>`<div class="warn">⚠ ${esc(x)}</div>`).join(''):'<div class="ok">✓ Full coverage with protected manager presence and no extra flex required.</div>';

    const grid=document.getElementById('rotaGrid');grid.innerHTML='';
    for(const day of DAYS){
      const col=document.createElement('div');col.className='dayResult';col.innerHTML=`<h3>${day}</h3>`;
      for(const area of ['restaurant','bar']){
        col.insertAdjacentHTML('beforeend',`<div class="areaLabel">${area}</div>`);
        const arr=display.filter(x=>x.day===day&&x.area===area);
        if(!arr.length)col.insertAdjacentHTML('beforeend','<div class="role">No shifts</div>');
        for(const x of arr){const s=state.staff.find(q=>q.id===x.staffId);col.insertAdjacentHTML('beforeend',`<div class="shift ${area==='bar'?'bar':''}"><div class="time">${pretty(x.start)}–${pretty(x.end)}</div><div class="who">${esc(s?.name||'')}</div><div class="role">${x.role==='bar'?'Bar FOH':esc(x.role)}</div></div>`)}
        for(const lane of lanes.filter(l=>l.day===day&&l.area===area)){
          const maxNeed=Math.max(0,...lane.blocks.map(b=>b.need));
          for(let layer=1;layer<=maxNeed;layer++){
            let start=null;
            for(let i=0;i<=lane.blocks.length;i++){
              const b=lane.blocks[i];
              const miss=!!b&&b.need>=layer&&lane.cover[i]<layer;
              if(miss&&start==null)start=b.start;
              if(!miss&&start!=null){
                const end=b?b.start:lane.end;
                col.insertAdjacentHTML('beforeend',`<div class="shift ${area==='bar'?'bar':''} unfilled"><div class="time">${pretty(start)}–${pretty(end)}</div><div class="who">— UNFILLED —</div><div class="role">${lane.role==='bar'?'Bar FOH':esc(lane.role)}</div></div>`);
                start=null;
              }
            }
          }
        }
      }
      grid.appendChild(col);
    }
    document.getElementById('download').disabled=false;
    panel.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function generate(){
    const state=readState();if(!state?.coverage||!Array.isArray(state.staff)){alert('Could not read the V2 rota settings.');return}
    state.rules=state.rules||{};
    if(state.rules.flexOverstaff==null)state.rules.flexOverstaff=1;
    if(state.rules.flexBudget==null)state.rules.flexBudget=4;
    if(state.rules.minGeneratedShift==null)state.rules.minGeneratedShift=3;
    writeState(state);
    const lanes=buildLanes(state),assign=[];
    seedManagers(state,lanes,assign);
    seedSaturdayCore(state,lanes,assign);
    fillDemand(state,lanes,assign);
    render(state,lanes,assign);
  }

  ensureFlexRules();
  button.onclick=generate;
})();