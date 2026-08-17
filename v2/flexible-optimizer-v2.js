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
  const name=s=>String(s?.name||'').trim().toLowerCase();
  const isCore=s=>CORE.has(name(s));
  const overlaps=(a,b,c,d)=>a<d&&c<b;
  const readState=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch{return null}};
  const writeState=s=>localStorage.setItem(KEY,JSON.stringify(s));

  function ensureRules(){
    const s=readState();if(!s)return;
    s.rules=s.rules||{};
    if(s.rules.flexOverstaff==null)s.rules.flexOverstaff=1;
    if(s.rules.flexBudget==null)s.rules.flexBudget=4;
    if(s.rules.minGeneratedShift==null)s.rules.minGeneratedShift=3;
    writeState(s);
    for(const [id,key,lo,hi,fallback] of [
      ['flexOverstaff','flexOverstaff',0,2,1],
      ['flexBudget','flexBudget',0,99,4],
      ['minGeneratedShift','minGeneratedShift',1,10,3]
    ]){
      const el=document.getElementById(id);if(!el)continue;el.value=s.rules[key];
      el.onchange=e=>{const n=readState();if(!n)return;n.rules=n.rules||{};n.rules[key]=Math.max(lo,Math.min(hi,Number(e.target.value)||fallback));writeState(n)};
    }
  }

  function profile(state,day,area,role){
    const rows=(state.coverage?.[day]?.[area]||[]).filter(r=>r.role===role&&Number(r.count)>0);
    const site=state.siteHours?.[day];if(!site||!rows.length)return null;
    const start=toMin(site.open),end=toMin(site.close);if(start==null||end==null||end<=start)return null;
    const blocks=[];
    for(let t=start;t<end;t+=30){
      let need=0;
      for(const r of rows){const a=toMin(r.start),b=toMin(r.end);if(a<=t&&b>=t+30)need=Math.max(need,Number(r.count)||0)}
      blocks.push({start:t,end:t+30,need});
    }
    return {key:`${day}|${area}|${role}`,day,area,role,start,end,blocks,cover:blocks.map(()=>0)};
  }

  function buildLanes(state){
    const out=[];
    for(const day of DAYS)for(const area of ['restaurant','bar']){
      const roles=area==='bar'?['bar']:['floor','running','pots'];
      for(const role of roles){const p=profile(state,day,area,role);if(p&&p.blocks.some(b=>b.need>0))out.push(p)}
    }
    return out;
  }

  function roleOk(s,lane){
    if(lane.area==='bar')return LEVELS.indexOf(s.level)>=LEVELS.indexOf('floor');
    return LEVELS.indexOf(s.level)>=LEVELS.indexOf(lane.role);
  }
  function preferredRolePenalty(s,lane){
    const li=LEVELS.indexOf(s.level),ri=LEVELS.indexOf(lane.area==='bar'?'floor':lane.role);
    if(li<ri)return 9999;
    if(lane.area==='restaurant'&&lane.role==='pots'&&s.level==='floor')return 900;
    if(lane.area==='restaurant'&&lane.role==='running'&&s.level==='floor')return 180;
    return 0;
  }
  function availabilityWindow(s,day){
    const v=s.availableDays?.[day]||'full';if(v==='none')return null;if(v==='am')return [0,17*60];if(v==='pm')return [17*60,24*60];return [0,24*60];
  }
  function availOk(s,sh){const w=availabilityWindow(s,sh.day);return !!w&&sh.start>=w[0]&&sh.end<=w[1]}
  const personShifts=(a,id)=>a.filter(x=>x.staffId===id).sort((x,y)=>DAYS.indexOf(x.day)-DAYS.indexOf(y.day)||x.start-y.start);
  const personHours=(a,id)=>personShifts(a,id).reduce((z,x)=>z+hours(x.start,x.end),0);
  const personDays=(a,id)=>new Set(personShifts(a,id).map(x=>x.day));
  function twoOffOk(days){for(let i=0;i<DAYS.length;i++)if(!days.has(DAYS[i])&&!days.has(DAYS[(i+1)%7]))return true;return false}

  function canAssign(state,s,sh,assign,ignoreId=null){
    if(!roleOk(s,sh)||!availOk(s,sh))return false;
    const base=ignoreId?assign.filter(x=>x.id!==ignoreId):assign;
    const ds=base.filter(x=>x.staffId===s.id&&x.day===sh.day).sort((a,b)=>a.start-b.start);
    for(const x of ds){
      if(overlaps(sh.start,sh.end,x.start,x.end))return false;
      const gap=sh.start>=x.end?sh.start-x.end:x.start-sh.end;
      if(gap>0&&gap<(Number(state.rules?.splitGap)||0)*60)return false;
    }
    const all=[...ds,sh].sort((a,b)=>a.start-b.start);let runStart=null,lastEnd=null;
    for(const x of all){
      if(runStart==null||x.start!==lastEnd){runStart=x.start;lastEnd=x.end}else lastEnd=x.end;
      if((lastEnd-runStart)/60>(Number(state.rules?.maxContinuous)||10)+.001)return false;
    }
    const days=personDays(base,s.id);
    if(!days.has(sh.day)){
      if(days.size>=(s.maxDays??5))return false;
      const next=new Set(days);next.add(sh.day);if(state.rules?.twoOff!==false&&!twoOffOk(next))return false;
    }
    if(s.contractType==='contracted'&&Number(s.targetHours)>0&&personHours(base,s.id)+hours(sh.start,sh.end)>Number(s.targetHours)+(Number(state.rules?.maxOT)||0)+.001)return false;
    return true;
  }

  function priority(day,t){
    if(day==='Sat'&&t>=17*60&&t<21*60)return 4.5;
    if(day==='Fri'&&t>=17*60&&t<21*60)return 3.2;
    if(day==='Sat'&&t>=12*60&&t<17*60)return 1.7;
    return 1;
  }

  function laneStats(lane,start,end,flexOverstaff){
    let gain=0,weighted=0,extra=0;
    for(let i=0;i<lane.blocks.length;i++){
      const b=lane.blocks[i];if(b.start<start||b.end>end)continue;
      const before=lane.cover[i],need=b.need;if(before+1>need+flexOverstaff)return null;
      if(before<need){gain+=.5;weighted+=.5*priority(lane.day,b.start)}else extra+=.5;
    }
    return {gain,weighted,extra};
  }

  function orphanPenalty(lane,start,end,minHours){
    const sim=lane.cover.slice();
    for(let i=0;i<lane.blocks.length;i++){const b=lane.blocks[i];if(b.start>=start&&b.end<=end)sim[i]++}
    const maxNeed=Math.max(0,...lane.blocks.map(b=>b.need));let penalty=0;
    for(let layer=1;layer<=maxNeed;layer++){
      let run=null;
      for(let i=0;i<=lane.blocks.length;i++){
        const b=lane.blocks[i];const miss=!!b&&b.need>=layer&&sim[i]<layer;
        if(miss&&run==null)run=b.start;
        if(!miss&&run!=null){const finish=b?b.start:lane.end,dur=hours(run,finish);if(dur<minHours)penalty+=4200+(minHours-dur)*1200;run=null}
      }
    }
    return penalty;
  }

  function assignmentTouches(a,s,sh){return a.some(x=>x.staffId===s.id&&x.day===sh.day&&(x.end===sh.start||sh.end===x.start))}
  function assignmentSameDay(a,s,sh){return a.some(x=>x.staffId===s.id&&x.day===sh.day)}
  function managerCovers(a,state,day,kind){
    const t=toMin(state.siteHours?.[day]?.[kind]);if(t==null)return false;
    return a.some(x=>x.day===day&&x.staffId&&state.staff.find(s=>s.id===x.staffId)?.isManager&&(kind==='open'?x.start<=t&&x.end>t:x.start<t&&x.end>=t));
  }
  function managerAt(a,state,day,t){return new Set(a.filter(x=>x.day===day&&x.staffId&&x.start<=t&&x.end>t&&state.staff.find(s=>s.id===x.staffId)?.isManager).map(x=>x.staffId)).size}
  function coreSat(a,s){return a.some(x=>x.staffId===s.id&&x.day==='Sat'&&x.start<21*60&&x.end>17*60)}

  function score(state,lane,sh,s,assign,stats,extraUsed,purpose='normal'){
    const dur=hours(sh.start,sh.end),h=personHours(assign,s.id),def=Math.max(0,Number(s.targetHours||0)-h);
    if(extraUsed+stats.extra>Number(state.rules?.flexBudget||0)+.001)return -Infinity;
    let q=stats.weighted*1000+stats.gain*180-stats.extra*650;
    q-=orphanPenalty(lane,sh.start,sh.end,Number(state.rules?.minGeneratedShift)||3);
    q-=preferredRolePenalty(s,lane);
    if(lane.area==='bar')q+=s.isBarStaff?180:-60;else q+=s.isBarStaff?-50:65;
    if(s.contractType==='contracted')q+=Number(s.targetHours)>0?Math.min(def,dur)*240:dur*35;else q-=dur*260;
    if(assignmentTouches(assign,s,sh))q+=180;else if(assignmentSameDay(assign,s,sh))q-=100;else q-=25;
    if(dur<4)q-=(4-dur)*120;if(dur>=6&&dur<=9)q+=120;if(dur>9)q-=60*(dur-9);
    if(s.isManager&&(lane.day==='Fri'||lane.day==='Sat')&&sh.start<21*60&&sh.end>17*60)q+=400;
    if(isCore(s)&&lane.day==='Sat'&&sh.start<21*60&&sh.end>17*60&&!coreSat(assign,s))q+=3500;
    if(purpose==='core')q+=isCore(s)?4500:0;
    if(purpose==='peak'&&s.isManager)q+=2500;
    if(purpose==='open'||purpose==='close'){
      const t=toMin(state.siteHours?.[lane.day]?.[purpose]);
      if(t!=null&&(purpose==='open'?sh.start<=t&&sh.end>t:sh.start<t&&sh.end>=t))q+=3200;
    }
    return q;
  }

  function ranges(state,lane,targetStart,s,assign,extraUsed,purpose='normal'){
    const out=[],step=30,max=(Number(state.rules?.maxContinuous)||10)*60,min=(Number(state.rules?.minGeneratedShift)||3)*60,flex=Math.max(0,Number(state.rules?.flexOverstaff)||0);
    for(let start=lane.start;start<=targetStart;start+=step)for(let end=targetStart+30;end<=lane.end;end+=step){
      const dur=end-start;if(dur<min||dur>max)continue;
      const sh={id:uid(),day:lane.day,area:lane.area,role:lane.role,start,end,staffId:s.id,laneKey:lane.key};
      if(!canAssign(state,s,sh,assign))continue;
      const stats=laneStats(lane,start,end,flex);if(!stats||stats.gain<=0)continue;
      const sc=score(state,lane,sh,s,assign,stats,extraUsed,purpose);if(Number.isFinite(sc))out.push({shift:sh,stats,score:sc});
    }
    return out;
  }

  function add(lanes,assign,pick){
    const lane=lanes.find(l=>l.key===pick.shift.laneKey);if(!lane)return false;
    for(let i=0;i<lane.blocks.length;i++){const b=lane.blocks[i];if(b.start>=pick.shift.start&&b.end<=pick.shift.end)lane.cover[i]++}
    assign.push(pick.shift);return true;
  }
  function totalExtra(lanes){let x=0;for(const l of lanes)for(let i=0;i<l.blocks.length;i++)x+=Math.max(0,l.cover[i]-l.blocks[i].need)*.5;return x}
  function missing(lanes){let x=0;for(const l of lanes)for(let i=0;i<l.blocks.length;i++)x+=Math.max(0,l.blocks[i].need-l.cover[i])*.5;return x}
  function required(lanes){let x=0;for(const l of lanes)for(const b of l.blocks)x+=b.need*.5;return x}

  function bestAt(state,lanes,assign,s,day,time,purpose='normal',floorOnly=false){
    let best=null;
    for(const lane of lanes){
      if(lane.day!==day||!roleOk(s,lane))continue;
      if(floorOnly&&!(lane.role==='floor'||lane.role==='bar'))continue;
      const block=lane.blocks.find(b=>b.start<=time&&b.end>time);if(!block||lane.cover[lane.blocks.indexOf(block)]>=block.need)continue;
      for(const p of ranges(state,lane,block.start,s,assign,totalExtra(lanes),purpose))if(!best||p.score>best.score)best=p;
    }
    return best;
  }

  function seedSaturdayCore(state,lanes,assign){
    const order=['tyler','mark','fran'];
    for(const n of order){const s=state.staff.find(x=>name(x)===n);if(!s||coreSat(assign,s))continue;const p=bestAt(state,lanes,assign,s,'Sat',18*60,'core',true);if(p)add(lanes,assign,p)}
  }

  function seedPeakManagers(state,lanes,assign){
    for(const day of ['Sat','Fri']){
      const target=day==='Sat'?3:2;
      let guard=0;
      while(managerAt(assign,state,day,18*60)<target&&guard++<6){
        let best=null;
        for(const s of state.staff.filter(x=>x.isManager)){
          if(assign.some(x=>x.staffId===s.id&&x.day===day&&x.start<=18*60&&x.end>18*60))continue;
          const p=bestAt(state,lanes,assign,s,day,18*60,'peak',true);if(p&&(!best||p.score>best.score))best=p;
        }
        if(!best)break;add(lanes,assign,best);
      }
    }
  }

  function seedOpenClose(state,lanes,assign){
    const dayOrder=['Sat','Fri','Sun','Mon','Tue','Wed','Thu'];
    for(const day of dayOrder)for(const kind of ['close','open']){
      if(managerCovers(assign,state,day,kind))continue;
      const t=toMin(state.siteHours?.[day]?.[kind]);if(t==null)continue;
      const probe=kind==='close'?t-30:t;let best=null;
      for(const s of state.staff.filter(x=>x.isManager)){
        const p=bestAt(state,lanes,assign,s,day,probe,kind,true);if(p&&(!best||p.score>best.score))best=p;
      }
      if(best)add(lanes,assign,best);
    }
  }

  function targetScarcity(state,lane,block){
    const probe={day:lane.day,area:lane.area,role:lane.role,start:block.start,end:block.end};let n=0;
    for(const s of state.staff)if(roleOk(s,lane)&&availOk(s,probe))n++;
    return {n,peak:priority(lane.day,block.start)};
  }
  function nextTarget(state,lanes,blocked){
    let best=null;
    for(const lane of lanes)for(let i=0;i<lane.blocks.length;i++){
      const b=lane.blocks[i];if(b.need<=lane.cover[i]||blocked.has(`${lane.key}|${i}`))continue;
      const z=targetScarcity(state,lane,b),cand={lane,block:b,index:i,eligible:z.n,peak:z.peak};
      if(!best||cand.eligible<best.eligible||(cand.eligible===best.eligible&&cand.peak>best.peak))best=cand;
    }
    return best;
  }

  function fill(state,lanes,assign){
    const blocked=new Set();let guard=0;
    while(guard++<500){
      const target=nextTarget(state,lanes,blocked);if(!target)break;let best=null;
      for(const s of state.staff){
        if(!roleOk(s,target.lane))continue;
        for(const p of ranges(state,target.lane,target.block.start,s,assign,totalExtra(lanes),'normal'))if(!best||p.score>best.score)best=p;
      }
      if(!best){blocked.add(`${target.lane.key}|${target.index}`);continue}
      add(lanes,assign,best);blocked.clear();
    }
  }

  function repairEdges(state,lanes,assign){
    let changed=true,passes=0;
    while(changed&&passes++<5){
      changed=false;
      for(const lane of lanes){
        for(let i=0;i<lane.blocks.length;i++){
          const b=lane.blocks[i];if(lane.cover[i]>=b.need)continue;
          const adjacent=assign.filter(x=>x.laneKey===lane.key&&(x.end===b.start||x.start===b.end));
          let best=null;
          for(const old of adjacent){
            const s=state.staff.find(x=>x.id===old.staffId);if(!s)continue;
            const sh={...old,start:Math.min(old.start,b.start),end:Math.max(old.end,b.end)};
            if(hours(sh.start,sh.end)>(Number(state.rules?.maxContinuous)||10)+.001)continue;
            if(!canAssign(state,s,sh,assign,old.id))continue;
            const flex=Math.max(0,Number(state.rules?.flexOverstaff)||0),stats=laneStats(lane,sh.start,sh.end,flex);if(!stats)continue;
            const sc=score(state,lane,sh,s,assign.filter(x=>x.id!==old.id),stats,totalExtra(lanes),'normal');
            if(!best||sc>best.sc)best={old,sh,sc};
          }
          if(best){
            const old=best.old;
            for(let j=0;j<lane.blocks.length;j++){const z=lane.blocks[j];if(z.start>=old.start&&z.end<=old.end)lane.cover[j]--}
            old.start=best.sh.start;old.end=best.sh.end;
            for(let j=0;j<lane.blocks.length;j++){const z=lane.blocks[j];if(z.start>=old.start&&z.end<=old.end)lane.cover[j]++}
            changed=true;
          }
        }
      }
    }
  }

  function merge(assign){
    const out=[],groups={};for(const x of assign){const k=`${x.day}|${x.area}|${x.staffId}`;(groups[k]??=[]).push(x)}
    for(const arr of Object.values(groups)){
      arr.sort((a,b)=>a.start-b.start);let cur=null;
      for(const x of arr){if(cur&&cur.end===x.start){cur.end=x.end;cur.role=[...new Set(String(cur.role).split(' / ').concat([x.role]))].join(' / ')}else{cur={...x};out.push(cur)}}
    }
    return out.sort((a,b)=>DAYS.indexOf(a.day)-DAYS.indexOf(b.day)||a.start-b.start||a.area.localeCompare(b.area));
  }
  function splitCount(assign,state){let n=0;for(const s of state.staff)for(const d of DAYS){const a=personShifts(assign,s.id).filter(x=>x.day===d);if(a.some((x,i)=>i&&x.start>a[i-1].end))n++}return n}
  const scheduled=a=>a.reduce((z,x)=>z+hours(x.start,x.end),0);
  const zero=(a,state)=>a.filter(x=>state.staff.find(s=>s.id===x.staffId)?.contractType==='zeroHours').reduce((z,x)=>z+hours(x.start,x.end),0);

  function render(state,lanes,assign){
    const display=merge(assign),req=required(lanes),miss=missing(lanes),sched=scheduled(assign),extra=totalExtra(lanes),zh=zero(assign,state),contracted=sched-zh,splits=splitCount(assign,state);
    const panel=document.getElementById('resultsPanel');panel.style.display='block';
    document.getElementById('resultHint').textContent='Smart 0.5.1 treats requirement times as a demand curve, reserves important management first, and heavily penalises tiny leftover gaps when choosing longer shifts.';
    const metricData=[['Required labour',req.toFixed(1)+'h'],['Scheduled labour',sched.toFixed(1)+'h'],['Zero-hours',zh.toFixed(1)+'h'],['Contracted used',contracted.toFixed(1)+'h'],['Unfilled coverage',miss.toFixed(1)+'h'],['Extra flex',extra.toFixed(1)+'h'],['Split days',splits]];
    document.getElementById('metrics').innerHTML=metricData.map(([k,v])=>`<div class="metric"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
    const warnings=[];if(miss>0)warnings.push(`${miss.toFixed(1)} staff-hours of required coverage remain unfilled.`);
    for(const day of DAYS)for(const kind of ['open','close'])if(!managerCovers(assign,state,day,kind))warnings.push(`${day}: no manager covering site ${kind}.`);
    for(const s of state.staff.filter(isCore))if(!coreSat(assign,s))warnings.push(`Saturday 5–9 preference not achieved for ${s.name}.`);
    warnings.push(`Extra overlap/shoulder cover: ${extra.toFixed(1)}h of ${Number(state.rules?.flexBudget||0).toFixed(1)}h budget.`);
    warnings.push(`Manager presence at 6pm: Fri ${managerAt(assign,state,'Fri',18*60)}, Sat ${managerAt(assign,state,'Sat',18*60)}.`);
    document.getElementById('warnings').innerHTML=warnings.map(x=>`<div class="warn">⚠ ${esc(x)}</div>`).join('');

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
              const b=lane.blocks[i],missBlock=!!b&&b.need>=layer&&lane.cover[i]<layer;
              if(missBlock&&start==null)start=b.start;
              if(!missBlock&&start!=null){const end=b?b.start:lane.end;col.insertAdjacentHTML('beforeend',`<div class="shift ${area==='bar'?'bar':''} unfilled"><div class="time">${pretty(start)}–${pretty(end)}</div><div class="who">— UNFILLED —</div><div class="role">${lane.role==='bar'?'Bar FOH':esc(lane.role)}</div></div>`);start=null}
            }
          }
        }
      }
      grid.appendChild(col);
    }
    document.getElementById('download').disabled=false;panel.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function generate(){
    const state=readState();if(!state?.coverage||!Array.isArray(state.staff)){alert('Could not read the V2 rota settings.');return}
    state.rules=state.rules||{};if(state.rules.flexOverstaff==null)state.rules.flexOverstaff=1;if(state.rules.flexBudget==null)state.rules.flexBudget=4;if(state.rules.minGeneratedShift==null)state.rules.minGeneratedShift=3;writeState(state);
    const lanes=buildLanes(state),assign=[];
    seedSaturdayCore(state,lanes,assign);
    seedPeakManagers(state,lanes,assign);
    seedOpenClose(state,lanes,assign);
    fill(state,lanes,assign);
    repairEdges(state,lanes,assign);
    fill(state,lanes,assign);
    render(state,lanes,assign);
  }

  ensureRules();button.onclick=generate;
})();