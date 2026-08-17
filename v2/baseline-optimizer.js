(() => {
  'use strict';

  const KEY='cookfellas-smart-v2-config';
  const DAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const LEVELS=['pots','running','floor'];
  const PREFERRED_MAX_HOURS=8.5;
  const HARD_MAX_HOURS=10;
  const button=document.getElementById('generate');
  const download=document.getElementById('download');
  if(!button)return;

  const toMin=t=>{if(!t)return null;const [h,m]=String(t).split(':').map(Number);return h*60+m};
  const pretty=m=>{const h=Math.floor(m/60),n=m%60,hh=h>12?h-12:h===0?12:h;return `${hh}${n?':'+String(n).padStart(2,'0'):''}`};
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const readState=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch{return null}};
  const potsSegment=(day,t)=>day==='Sat'?(t<17*60?'sat-11-5':'sat-5-close'):'whole';

  function buildLanes(state){
    const lanes=[];
    for(const day of DAYS){
      const site=state.siteHours?.[day];
      if(!site)continue;
      const open=toMin(site.open),close=toMin(site.close);
      if(open==null||close==null||close<=open)continue;
      for(const area of ['restaurant','bar']){
        const roles=area==='bar'?['bar']:['floor','running','pots'];
        for(const role of roles){
          const rows=(state.coverage?.[day]?.[area]||[]).filter(r=>r.role===role&&Number(r.count)>0);
          if(!rows.length)continue;
          const blocks=[];
          for(let t=open;t<close;t+=30){
            let need=0;
            for(const r of rows){
              const a=toMin(r.start),b=toMin(r.end);
              if(a!=null&&b!=null&&a<=t&&b>=t+30)need=Math.max(need,Number(r.count)||0);
            }
            blocks.push({start:t,end:t+30,need});
          }
          if(blocks.some(b=>b.need>0))lanes.push({day,area,role,blocks});
        }
      }
    }
    return lanes;
  }

  function requiredHours(lanes){
    let total=0;
    for(const lane of lanes)for(const b of lane.blocks)total+=b.need*.5;
    return total;
  }

  function skillOk(staff,position){
    const level=LEVELS.includes(staff.level)?staff.level:'pots';
    if(position.area==='bar')return level==='floor';
    const need=position.role==='floor'?'floor':position.role==='running'?'running':'pots';
    return LEVELS.indexOf(level)>=LEVELS.indexOf(need);
  }

  function availabilityOk(staff,position){
    const v=staff.availableDays?.[position.day]||'full';
    if(v==='none')return false;
    if(v==='am')return position.end<=17*60;
    if(v==='pm')return position.start>=17*60;
    return true;
  }

  function targetOf(staff){
    return staff.contractType==='contracted'?Math.max(0,Number(staff.targetHours)||0):0;
  }

  function hourPenalty(staff,h){
    const target=targetOf(staff);
    if(target>0){
      const under=Math.max(0,target-h);
      const over=Math.max(0,h-target);
      return under*300 + over*1500;
    }
    return h*60;
  }

  function proposedRunHours(staffId,position,runState){
    const prev=runState.get(staffId);
    if(prev&&prev.lastEnd===position.start)return (position.end-prev.runStart)/60;
    return .5;
  }

  function shiftLengthOk(staff,position,dayHours,runState){
    const nextDay=(dayHours.get(staff.id)||0)+.5;
    const nextRun=proposedRunHours(staff.id,position,runState);
    return nextDay<=HARD_MAX_HOURS+1e-9&&nextRun<=HARD_MAX_HOURS+1e-9;
  }

  function liveShiftPenalty(staff,position,dayHours,runState){
    const nextDay=(dayHours.get(staff.id)||0)+.5;
    const nextRun=proposedRunHours(staff.id,position,runState);
    const dayOver=Math.max(0,nextDay-PREFERRED_MAX_HOURS);
    const runOver=Math.max(0,nextRun-PREFERRED_MAX_HOURS);
    return dayOver*900+runOver*900;
  }

  function incrementalCost(staff,weeklyHours,position,prevByLane,dayHours,runState){
    const current=weeklyHours.get(staff.id)||0;
    let cost=hourPenalty(staff,current+.5)-hourPenalty(staff,current);
    cost+=liveShiftPenalty(staff,position,dayHours,runState);
    const laneKey=`${position.area}|${position.role}`;
    if((prevByLane.get(laneKey)||[]).includes(staff.id))cost-=5;
    return cost;
  }

  function solveBlock(state,positions,weeklyHours,prevByLane,managerRequired,dayHours,runState){
    const staff=state.staff||[];
    if(positions.length>staff.length)return {ok:false,problem:`Needs ${positions.length} people at once but only ${staff.length} are on the roster.`};

    const enriched=positions.map((p,originalIndex)=>{
      const base=staff.map((s,staffIndex)=>({s,staffIndex})).filter(x=>
        skillOk(x.s,p)&&
        availabilityOk(x.s,p)&&
        (!p.lockedStaffId||x.s.id===p.lockedStaffId)&&
        !(p.forbiddenStaffIds||[]).includes(x.s.id)
      );
      return {
        ...p,
        originalIndex,
        baseEligibleCount:base.length,
        eligible:base.filter(x=>shiftLengthOk(x.s,p,dayHours,runState))
      };
    });

    const impossible=enriched.find(p=>p.eligible.length===0);
    if(impossible){
      const role=impossible.area==='bar'?'Bar FOH':impossible.role;
      if(impossible.baseEligibleCount>0){
        return {ok:false,problem:`The ${HARD_MAX_HOURS}h hard daily/continuous shift maximum leaves no valid ${role} assignment for this block.`};
      }
      if(impossible.role==='pots'&&impossible.lockedStaffId){
        return {ok:false,problem:'The person assigned to the full pots shift cannot cover this pots block under the current availability/skills.'};
      }
      if(impossible.role==='pots'&&impossible.day==='Sat'&&impossible.potsSegment==='sat-5-close'){
        return {ok:false,problem:'Saturday requires a different person for the 5pm–close pots shift from the 11am–5pm pots shift.'};
      }
      return {ok:false,problem:`No available, skill-eligible ${role} staff exist for this required position.`};
    }

    enriched.sort((a,b)=>a.eligible.length-b.eligible.length||a.area.localeCompare(b.area)||a.role.localeCompare(b.role));

    const memo=new Map();
    function dfs(i,usedMask,hasManager){
      if(i===enriched.length)return (!managerRequired||hasManager)?{cost:0,picks:[]}:null;
      const key=`${i}|${usedMask}|${hasManager?1:0}`;
      if(memo.has(key))return memo.get(key);

      const p=enriched[i];
      const candidates=p.eligible.slice().sort((a,b)=>{
        const ca=incrementalCost(a.s,weeklyHours,p,prevByLane,dayHours,runState);
        const cb=incrementalCost(b.s,weeklyHours,p,prevByLane,dayHours,runState);
        return ca-cb||String(a.s.name).localeCompare(String(b.s.name));
      });

      let best=null;
      for(const c of candidates){
        const bit=1<<c.staffIndex;
        if(usedMask&bit)continue;
        const own=incrementalCost(c.s,weeklyHours,p,prevByLane,dayHours,runState);
        const tail=dfs(i+1,usedMask|bit,hasManager||!!c.s.isManager);
        if(!tail)continue;
        const total=own+tail.cost;
        if(!best||total<best.cost){
          best={cost:total,picks:[{originalIndex:p.originalIndex,staffId:c.s.id},...tail.picks]};
        }
      }
      memo.set(key,best);
      return best;
    }

    const solved=dfs(0,0,false);
    if(!solved){
      if(managerRequired)return {ok:false,problem:'The available staff can cover the skills, but no valid assignment also provides an available manager at this opening/closing block within the shift-length rules.'};
      return {ok:false,problem:'The available staff cannot cover all required positions without double-booking somebody in this half-hour.'};
    }

    const picked=new Map(solved.picks.map(x=>[x.originalIndex,x.staffId]));
    return {ok:true,assignment:positions.map((p,index)=>({...p,staffId:picked.get(index)}))};
  }

  function scheduleDay(state,lanes,day,weeklyHours){
    const dayLanes=lanes.filter(l=>l.day===day);
    const site=state.siteHours?.[day];
    const open=toMin(site?.open),close=toMin(site?.close);
    const times=[...new Set(dayLanes.flatMap(l=>l.blocks.filter(b=>b.need>0).map(b=>b.start)))].sort((a,b)=>a-b);
    const pieces=[];
    const prevByLane=new Map();
    const potsLocks=new Map();
    const dayHours=new Map();
    const runState=new Map();

    for(const t of times){
      const positions=[];
      for(const lane of dayLanes){
        const block=lane.blocks.find(b=>b.start===t);
        if(!block||block.need<=0)continue;
        for(let slot=0;slot<block.need;slot++){
          const segment=lane.role==='pots'?potsSegment(day,t):null;
          const lockKey=`${lane.area}|${lane.role}|${segment||'normal'}|${slot}`;
          const saturdayEarlyPotsIds=day==='Sat'&&lane.role==='pots'&&segment==='sat-5-close'
            ? [...potsLocks.entries()].filter(([k])=>k.includes('|pots|sat-11-5|')).map(([,id])=>id)
            : [];
          positions.push({
            day,area:lane.area,role:lane.role,start:t,end:t+30,slot,
            potsSegment:segment,
            lockedStaffId:lane.role==='pots'?(potsLocks.get(lockKey)||null):null,
            forbiddenStaffIds:saturdayEarlyPotsIds
          });
        }
      }

      const managerRequired=(t===open)||(t+30===close);
      const solved=solveBlock(state,positions,weeklyHours,prevByLane,managerRequired,dayHours,runState);
      if(!solved.ok)return {ok:false,problem:`${day} ${pretty(t)}–${pretty(t+30)}: ${solved.problem}`};

      const nextByLane=new Map();
      for(const x of solved.assignment){
        if(x.role==='pots'){
          const lockKey=`${x.area}|${x.role}|${x.potsSegment||'whole'}|${x.slot}`;
          if(!potsLocks.has(lockKey))potsLocks.set(lockKey,x.staffId);
        }
        pieces.push(x);
        weeklyHours.set(x.staffId,(weeklyHours.get(x.staffId)||0)+.5);
        dayHours.set(x.staffId,(dayHours.get(x.staffId)||0)+.5);
        const prevRun=runState.get(x.staffId);
        if(prevRun&&prevRun.lastEnd===x.start)runState.set(x.staffId,{runStart:prevRun.runStart,lastEnd:x.end});
        else runState.set(x.staffId,{runStart:x.start,lastEnd:x.end});
        const key=`${x.area}|${x.role}`;
        if(!nextByLane.has(key))nextByLane.set(key,[]);
        nextByLane.get(key).push(x.staffId);
      }
      prevByLane.clear();
      for(const [key,ids] of nextByLane)prevByLane.set(key,ids);
    }
    return {ok:true,pieces};
  }

  function blockKey(x){return `${x.day}|${x.start}`}

  function managerRequiredForPiece(state,x){
    const site=state.siteHours?.[x.day];
    const open=toMin(site?.open),close=toMin(site?.close);
    return x.start===open||x.end===close;
  }

  function hoursFromPieces(state,pieces){
    const map=new Map((state.staff||[]).map(s=>[s.id,0]));
    for(const x of pieces)map.set(x.staffId,(map.get(x.staffId)||0)+.5);
    return map;
  }

  function dayStats(pieces,staffId,day,omitPiece=null,addStart=null){
    const starts=new Set();
    for(const p of pieces){
      if(p===omitPiece||p.staffId!==staffId||p.day!==day)continue;
      starts.add(p.start);
    }
    if(addStart!=null)starts.add(addStart);
    const sorted=[...starts].sort((a,b)=>a-b);
    let longestBlocks=0,currentBlocks=0,prev=null;
    for(const start of sorted){
      if(prev!=null&&start===prev+30)currentBlocks++;
      else currentBlocks=1;
      if(currentBlocks>longestBlocks)longestBlocks=currentBlocks;
      prev=start;
    }
    return {totalHours:sorted.length*.5,longestHours:longestBlocks*.5};
  }

  function dayQualityPenalty(stats){
    const totalOver=Math.max(0,stats.totalHours-PREFERRED_MAX_HOURS);
    const runOver=Math.max(0,stats.longestHours-PREFERRED_MAX_HOURS);
    return totalOver*900+runOver*900;
  }

  function rebalanceWeek(state,pieces){
    const staff=state.staff||[];
    const staffById=new Map(staff.map(s=>[s.id,s]));
    const grouped=new Map();
    for(const x of pieces){const k=blockKey(x);if(!grouped.has(k))grouped.set(k,[]);grouped.get(k).push(x)}

    const hrs=hoursFromPieces(state,pieces);
    let changed=true,passes=0;
    while(changed&&passes<12){
      changed=false;passes++;
      for(const x of pieces){
        if(x.role==='pots')continue;
        const from=staffById.get(x.staffId);if(!from)continue;
        const block=grouped.get(blockKey(x))||[];
        const used=new Set(block.map(q=>q.staffId));
        const managerRequired=managerRequiredForPiece(state,x);
        const otherManager=block.some(q=>q!==x&&staffById.get(q.staffId)?.isManager);

        let bestId=null,bestDelta=0;
        for(const to of staff){
          if(to.id===from.id||used.has(to.id)||!skillOk(to,x)||!availabilityOk(to,x))continue;
          if(managerRequired&&from.isManager&&!otherManager&&!to.isManager)continue;

          const toAfter=dayStats(pieces,to.id,x.day,null,x.start);
          if(toAfter.totalHours>HARD_MAX_HOURS+1e-9||toAfter.longestHours>HARD_MAX_HOURS+1e-9)continue;

          const fromH=hrs.get(from.id)||0,toH=hrs.get(to.id)||0;
          const fromBefore=dayStats(pieces,from.id,x.day);
          const toBefore=dayStats(pieces,to.id,x.day);
          const fromAfter=dayStats(pieces,from.id,x.day,x);
          const before=hourPenalty(from,fromH)+hourPenalty(to,toH)+dayQualityPenalty(fromBefore)+dayQualityPenalty(toBefore);
          const after=hourPenalty(from,fromH-.5)+hourPenalty(to,toH+.5)+dayQualityPenalty(fromAfter)+dayQualityPenalty(toAfter);
          const delta=after-before;
          if(delta<bestDelta-0.001){bestDelta=delta;bestId=to.id}
        }
        if(bestId){
          hrs.set(from.id,(hrs.get(from.id)||0)-.5);
          hrs.set(bestId,(hrs.get(bestId)||0)+.5);
          x.staffId=bestId;
          changed=true;
        }
      }
    }
    return {pieces,hours:hrs};
  }

  function mergePieces(pieces){
    const groups=new Map();
    for(const x of pieces){
      const segment=x.role==='pots'?(x.potsSegment||'whole'):'normal';
      const key=`${x.day}|${x.staffId}|${x.area}|${x.role}|${segment}`;
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(x);
    }
    const out=[];
    for(const arr of groups.values()){
      arr.sort((a,b)=>a.start-b.start);
      let cur=null;
      for(const x of arr){
        if(cur&&cur.end===x.start)cur.end=x.end;
        else{cur={...x};out.push(cur)}
      }
    }
    return out.sort((a,b)=>DAYS.indexOf(a.day)-DAYS.indexOf(b.day)||a.start-b.start||a.area.localeCompare(b.area));
  }

  function managerCheck(state,pieces){
    const staffById=new Map((state.staff||[]).map(s=>[s.id,s]));
    const problems=[];
    for(const day of DAYS){
      const site=state.siteHours?.[day];
      const open=toMin(site?.open),close=toMin(site?.close);
      if(open==null||close==null)continue;
      const dayPieces=pieces.filter(x=>x.day===day);
      const openMgr=dayPieces.some(x=>x.start<=open&&x.end>=open+30&&staffById.get(x.staffId)?.isManager&&availabilityOk(staffById.get(x.staffId),x));
      const closeMgr=dayPieces.some(x=>x.start<=close-30&&x.end>=close&&staffById.get(x.staffId)?.isManager&&availabilityOk(staffById.get(x.staffId),x));
      if(dayPieces.some(x=>x.start===open)&&!openMgr)problems.push(`${day}: no available manager at staffing start`);
      if(dayPieces.some(x=>x.end===close)&&!closeMgr)problems.push(`${day}: no available manager at close`);
    }
    return problems;
  }

  function availabilityCheck(state,pieces){
    const staffById=new Map((state.staff||[]).map(s=>[s.id,s]));
    const problems=[];
    for(const x of pieces){
      const s=staffById.get(x.staffId);
      if(s&&!availabilityOk(s,x))problems.push(`${x.day} ${pretty(x.start)}–${pretty(x.end)}: ${s.name} is unavailable`);
    }
    return problems;
  }

  function potsWholeShiftCheck(pieces){
    const groups=new Map();
    for(const x of pieces){
      if(x.role!=='pots')continue;
      const key=`${x.day}|${x.area}|${x.potsSegment||'whole'}|${x.slot??0}`;
      if(!groups.has(key))groups.set(key,new Set());
      groups.get(key).add(x.staffId);
    }
    const problems=[];
    for(const [key,ids] of groups){
      if(ids.size>1)problems.push(`${key}: pots shift is split between multiple people`);
    }
    const satEarly=new Set(pieces.filter(x=>x.day==='Sat'&&x.role==='pots'&&x.potsSegment==='sat-11-5').map(x=>x.staffId));
    const satLate=new Set(pieces.filter(x=>x.day==='Sat'&&x.role==='pots'&&x.potsSegment==='sat-5-close').map(x=>x.staffId));
    for(const id of satEarly)if(satLate.has(id))problems.push('Saturday pots 11–5 and 5–close must be worked by two different people');
    return problems;
  }

  function shiftLengthCheck(state,pieces){
    const staffById=new Map((state.staff||[]).map(s=>[s.id,s]));
    const problems=[];
    const preferred=[];
    for(const [id,s] of staffById){
      for(const day of DAYS){
        const stats=dayStats(pieces,id,day);
        if(stats.totalHours>HARD_MAX_HOURS+1e-9||stats.longestHours>HARD_MAX_HOURS+1e-9){
          problems.push(`${s.name} ${day}: ${stats.totalHours.toFixed(1)}h worked / ${stats.longestHours.toFixed(1)}h continuous exceeds the ${HARD_MAX_HOURS}h hard maximum`);
        }else if(stats.totalHours>PREFERRED_MAX_HOURS+1e-9||stats.longestHours>PREFERRED_MAX_HOURS+1e-9){
          preferred.push(`${s.name} ${day} ${stats.totalHours.toFixed(1)}h total${stats.longestHours!==stats.totalHours?` (${stats.longestHours.toFixed(1)}h continuous)`:''}`);
        }
      }
    }
    return {problems,preferred};
  }

  function renderFailure(problem){
    if(download)download.disabled=true;
    const panel=document.getElementById('resultsPanel');panel.style.display='block';
    document.getElementById('resultHint').textContent=`No rota published. Coverage, skills, roster availability, whole-shift pots, manager cover and the ${HARD_MAX_HOURS}h hard shift limit are hard rules.`;
    document.getElementById('metrics').innerHTML='<div class="metric"><div class="k">Rota status</div><div class="v">INVALID</div></div>';
    document.getElementById('warnings').innerHTML=`<div class="warn"><strong>Core-rule failure:</strong> ${esc(problem)}</div>`;
    document.getElementById('rotaGrid').innerHTML='';
    panel.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function renderSuccess(state,lanes,assign,weeklyHours,preferredLong=[]){
    const panel=document.getElementById('resultsPanel');panel.style.display='block';
    const required=requiredHours(lanes);
    const contracted=(state.staff||[]).filter(s=>s.contractType==='contracted'&&targetOf(s)>0);
    const contractedUsed=contracted.reduce((z,s)=>z+(weeklyHours.get(s.id)||0),0);
    const contractedTarget=contracted.reduce((z,s)=>z+targetOf(s),0);
    const overtime=contracted.reduce((z,s)=>z+Math.max(0,(weeklyHours.get(s.id)||0)-targetOf(s)),0);
    const deficit=contracted.reduce((z,s)=>z+Math.max(0,targetOf(s)-(weeklyHours.get(s.id)||0)),0);
    const zeroUsed=(state.staff||[]).filter(s=>s.contractType!=='contracted'||targetOf(s)===0).reduce((z,s)=>z+(weeklyHours.get(s.id)||0),0);

    document.getElementById('resultHint').textContent=`Core mode: coverage, skills, availability, whole-shift pots, manager opening/closing cover and a ${HARD_MAX_HOURS}h hard daily/continuous maximum are hard. ${PREFERRED_MAX_HOURS}h is the preferred maximum.`;
    document.getElementById('metrics').innerHTML=[
      ['Required labour',required.toFixed(1)+'h'],
      ['Unfilled coverage','0.0h'],
      ['Contracted used',contractedUsed.toFixed(1)+'h'],
      ['Contract targets',contractedTarget.toFixed(1)+'h'],
      ['Contract deficit',deficit.toFixed(1)+'h'],
      ['Contract overtime',overtime.toFixed(1)+'h'],
      ['Other / zero-hours',zeroUsed.toFixed(1)+'h'],
      ['Preferred max',PREFERRED_MAX_HOURS.toFixed(1)+'h'],
      ['Hard max',HARD_MAX_HOURS.toFixed(1)+'h'],
      ['Active rule groups','6']
    ].map(([k,v])=>`<div class="metric"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');

    const targetNotes=contracted.map(s=>{
      const used=weeklyHours.get(s.id)||0,target=targetOf(s),diff=used-target;
      return `${esc(s.name)} ${used.toFixed(1)} / ${target.toFixed(1)}h${Math.abs(diff)<.01?' ✓':diff>0?` (+${diff.toFixed(1)})`:` (${diff.toFixed(1)})`}`;
    }).join(' · ');
    const longNote=preferredLong.length
      ? `<div class="warn"><strong>Preferred ${PREFERRED_MAX_HOURS}h maximum exceeded where needed:</strong> ${preferredLong.map(esc).join(' · ')}</div>`
      : `<div class="ok">✓ SHIFT LENGTH TARGET PASSED — no one exceeds the preferred ${PREFERRED_MAX_HOURS}h daily/continuous maximum.</div>`;
    document.getElementById('warnings').innerHTML=`<div class="ok">✓ CORE RULES PASSED — coverage, skills, availability, pots rules, manager cover and the ${HARD_MAX_HOURS}h hard maximum all pass.</div><div class="ok">Contracted: ${targetNotes||'none configured'}</div>${longNote}`;

    const grid=document.getElementById('rotaGrid');grid.innerHTML='';
    for(const day of DAYS){
      const col=document.createElement('div');col.className='dayResult';col.innerHTML=`<h3>${day}</h3>`;
      for(const area of ['restaurant','bar']){
        col.insertAdjacentHTML('beforeend',`<div class="areaLabel">${area}</div>`);
        const arr=assign.filter(x=>x.day===day&&x.area===area);
        if(!arr.length)col.insertAdjacentHTML('beforeend','<div class="role">No shifts</div>');
        for(const x of arr){
          const s=state.staff.find(q=>q.id===x.staffId);
          const role=x.role==='bar'?'Bar FOH':x.role;
          col.insertAdjacentHTML('beforeend',`<div class="shift ${area==='bar'?'bar':''}"><div class="time">${pretty(x.start)}–${pretty(x.end)}</div><div class="who">${esc(s?.name||'Staff')}${s?.isManager?' · MGR':''}</div><div class="role">${esc(role)}</div></div>`);
        }
      }
      grid.appendChild(col);
    }
    if(download)download.disabled=false;
    panel.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function generate(){
    const state=readState();
    if(!state?.coverage||!Array.isArray(state.staff)||!state.staff.length){alert('No staff roster or coverage requirements found.');return}
    const lanes=buildLanes(state),weeklyHours=new Map(),pieces=[];
    for(const day of DAYS){
      const result=scheduleDay(state,lanes,day,weeklyHours);
      if(!result.ok){renderFailure(result.problem);return}
      pieces.push(...result.pieces);
    }

    const balanced=rebalanceWeek(state,pieces);
    const lengths=shiftLengthCheck(state,balanced.pieces);
    const problems=[...availabilityCheck(state,balanced.pieces),...managerCheck(state,balanced.pieces),...potsWholeShiftCheck(balanced.pieces),...lengths.problems];
    if(problems.length){renderFailure(problems.join(' · '));return}
    const merged=mergePieces(balanced.pieces);
    renderSuccess(state,lanes,merged,balanced.hours,lengths.preferred);
  }

  button.onclick=generate;
})();