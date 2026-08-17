(() => {
  'use strict';

  const KEY='cookfellas-smart-v2-config';
  const DAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const LEVELS=['pots','running','floor'];
  const button=document.getElementById('generate');
  const download=document.getElementById('download');
  if(!button)return;

  const toMin=t=>{if(!t)return null;const [h,m]=String(t).split(':').map(Number);return h*60+m};
  const pretty=m=>{const h=Math.floor(m/60),n=m%60,hh=h>12?h-12:h===0?12:h;return `${hh}${n?':'+String(n).padStart(2,'0'):''}`};
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const readState=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch{return null}};

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

  function targetOf(staff){
    return staff.contractType==='contracted'?Math.max(0,Number(staff.targetHours)||0):0;
  }

  // Contract targets are objectives, not hard caps. Being below target is costly,
  // but avoidable overtime is much more costly than using an eligible zero-hours
  // person once a contracted worker has reached target.
  function hourPenalty(staff,h){
    const target=targetOf(staff);
    if(target>0){
      const under=Math.max(0,target-h);
      const over=Math.max(0,h-target);
      return under*300 + over*1500;
    }
    // Zero-hours staff, plus contracted entries with no target configured.
    return h*60;
  }

  function incrementalCost(staff,weeklyHours,position,prevByLane){
    const current=weeklyHours.get(staff.id)||0;
    let cost=hourPenalty(staff,current+.5)-hourPenalty(staff,current);
    const laneKey=`${position.area}|${position.role}`;
    if((prevByLane.get(laneKey)||[]).includes(staff.id))cost-=5; // tie-break only
    return cost;
  }

  function solveBlock(state,positions,weeklyHours,prevByLane,managerRequired){
    const staff=state.staff||[];
    if(positions.length>staff.length)return {ok:false,problem:`Needs ${positions.length} people at once but only ${staff.length} are on the roster.`};

    const enriched=positions.map((p,originalIndex)=>({
      ...p,
      originalIndex,
      eligible:staff.map((s,staffIndex)=>({s,staffIndex})).filter(x=>skillOk(x.s,p))
    }));

    const impossible=enriched.find(p=>p.eligible.length===0);
    if(impossible)return {ok:false,problem:`No eligible ${impossible.area==='bar'?'Bar FOH':impossible.role} staff exist for this required position.`};

    // Most constrained positions first keeps the matching search small.
    enriched.sort((a,b)=>a.eligible.length-b.eligible.length||a.area.localeCompare(b.area)||a.role.localeCompare(b.role));

    const memo=new Map();
    function dfs(i,usedMask,hasManager){
      if(i===enriched.length)return (!managerRequired||hasManager)?{cost:0,picks:[]}:null;
      const key=`${i}|${usedMask}|${hasManager?1:0}`;
      if(memo.has(key))return memo.get(key);

      const p=enriched[i];
      const candidates=p.eligible.slice().sort((a,b)=>{
        const ca=incrementalCost(a.s,weeklyHours,p,prevByLane);
        const cb=incrementalCost(b.s,weeklyHours,p,prevByLane);
        return ca-cb||String(a.s.name).localeCompare(String(b.s.name));
      });

      let best=null;
      for(const c of candidates){
        const bit=1<<c.staffIndex;
        if(usedMask&bit)continue;
        const own=incrementalCost(c.s,weeklyHours,p,prevByLane);
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
      if(managerRequired)return {ok:false,problem:'Required staffing can be skill-matched, but no valid assignment also provides a manager on site at this opening/closing block.'};
      return {ok:false,problem:'Required positions cannot all be skill-matched without double-booking somebody in the same half-hour.'};
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

    for(const t of times){
      const positions=[];
      for(const lane of dayLanes){
        const block=lane.blocks.find(b=>b.start===t);
        if(!block||block.need<=0)continue;
        for(let slot=0;slot<block.need;slot++)positions.push({day,area:lane.area,role:lane.role,start:t,end:t+30,slot});
      }

      const managerRequired=(t===open)||(t+30===close);
      const solved=solveBlock(state,positions,weeklyHours,prevByLane,managerRequired);
      if(!solved.ok)return {ok:false,problem:`${day} ${pretty(t)}–${pretty(t+30)}: ${solved.problem}`};

      const nextByLane=new Map();
      for(const x of solved.assignment){
        pieces.push(x);
        weeklyHours.set(x.staffId,(weeklyHours.get(x.staffId)||0)+.5);
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

  function assignmentPenalty(state,pieces){
    const hrs=hoursFromPieces(state,pieces);
    return (state.staff||[]).reduce((sum,s)=>sum+hourPenalty(s,hrs.get(s.id)||0),0);
  }

  // Local weekly repair: once the first valid week exists, move individual
  // half-hours when that improves the contract-target objective, while retaining
  // skills, no double-booking and manager open/close cover.
  function rebalanceWeek(state,pieces){
    const staff=state.staff||[];
    const staffById=new Map(staff.map(s=>[s.id,s]));
    const grouped=new Map();
    for(const x of pieces){const k=blockKey(x);if(!grouped.has(k))grouped.set(k,[]);grouped.get(k).push(x)}

    let hrs=hoursFromPieces(state,pieces);
    let changed=true,passes=0;
    while(changed&&passes<12){
      changed=false;passes++;
      for(const x of pieces){
        const from=staffById.get(x.staffId);if(!from)continue;
        const block=grouped.get(blockKey(x))||[];
        const used=new Set(block.map(q=>q.staffId));
        const managerRequired=managerRequiredForPiece(state,x);
        const otherManager=block.some(q=>q!==x&&staffById.get(q.staffId)?.isManager);

        let bestId=null,bestDelta=0;
        for(const to of staff){
          if(to.id===from.id||used.has(to.id)||!skillOk(to,x))continue;
          if(managerRequired&&from.isManager&&!otherManager&&!to.isManager)continue;

          const fromH=hrs.get(from.id)||0,toH=hrs.get(to.id)||0;
          const before=hourPenalty(from,fromH)+hourPenalty(to,toH);
          const after=hourPenalty(from,fromH-.5)+hourPenalty(to,toH+.5);
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
    return {pieces,hours:hrs,penalty:assignmentPenalty(state,pieces)};
  }

  function mergePieces(pieces){
    const groups=new Map();
    for(const x of pieces){
      const key=`${x.day}|${x.staffId}|${x.area}|${x.role}`;
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
      const openMgr=dayPieces.some(x=>x.start<=open&&x.end>=open+30&&staffById.get(x.staffId)?.isManager);
      const closeMgr=dayPieces.some(x=>x.start<=close-30&&x.end>=close&&staffById.get(x.staffId)?.isManager);
      if(dayPieces.some(x=>x.start===open)&&!openMgr)problems.push(`${day}: no manager at staffing start`);
      if(dayPieces.some(x=>x.end===close)&&!closeMgr)problems.push(`${day}: no manager at close`);
    }
    return problems;
  }

  function renderFailure(problem){
    if(download)download.disabled=true;
    const panel=document.getElementById('resultsPanel');panel.style.display='block';
    document.getElementById('resultHint').textContent='No rota published. Coverage, skill eligibility and mandatory manager opening/closing cover are hard rules.';
    document.getElementById('metrics').innerHTML='<div class="metric"><div class="k">Rota status</div><div class="v">INVALID</div></div>';
    document.getElementById('warnings').innerHTML=`<div class="warn"><strong>Core-rule failure:</strong> ${esc(problem)}</div>`;
    document.getElementById('rotaGrid').innerHTML='';
    panel.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function renderSuccess(state,lanes,assign,weeklyHours){
    const panel=document.getElementById('resultsPanel');panel.style.display='block';
    const required=requiredHours(lanes);
    const contracted=(state.staff||[]).filter(s=>s.contractType==='contracted'&&targetOf(s)>0);
    const contractedUsed=contracted.reduce((z,s)=>z+(weeklyHours.get(s.id)||0),0);
    const contractedTarget=contracted.reduce((z,s)=>z+targetOf(s),0);
    const overtime=contracted.reduce((z,s)=>z+Math.max(0,(weeklyHours.get(s.id)||0)-targetOf(s)),0);
    const deficit=contracted.reduce((z,s)=>z+Math.max(0,targetOf(s)-(weeklyHours.get(s.id)||0)),0);
    const zeroUsed=(state.staff||[]).filter(s=>s.contractType!=='contracted'||targetOf(s)===0).reduce((z,s)=>z+(weeklyHours.get(s.id)||0),0);

    document.getElementById('resultHint').textContent='Core mode: full coverage, skills and manager opening/closing cover are hard. Contract targets are balanced globally before avoidable overtime or zero-hours allocation.';
    document.getElementById('metrics').innerHTML=[
      ['Required labour',required.toFixed(1)+'h'],
      ['Unfilled coverage','0.0h'],
      ['Contracted used',contractedUsed.toFixed(1)+'h'],
      ['Contract targets',contractedTarget.toFixed(1)+'h'],
      ['Contract deficit',deficit.toFixed(1)+'h'],
      ['Contract overtime',overtime.toFixed(1)+'h'],
      ['Other / zero-hours',zeroUsed.toFixed(1)+'h']
    ].map(([k,v])=>`<div class="metric"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');

    const targetNotes=contracted.map(s=>{
      const used=weeklyHours.get(s.id)||0,target=targetOf(s),diff=used-target;
      return `${esc(s.name)} ${used.toFixed(1)} / ${target.toFixed(1)}h${Math.abs(diff)<.01?' ✓':diff>0?` (+${diff.toFixed(1)})`:` (${diff.toFixed(1)})`}`;
    }).join(' · ');
    document.getElementById('warnings').innerHTML=`<div class="ok">✓ CORE RULES PASSED — every required half-hour is skill-covered and manager open/close cover is present.</div><div class="ok">Contracted: ${targetNotes||'no positive targets configured'}</div>`;

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
    if(state.staff.length>30){alert('Core optimiser currently supports up to 30 staff.');return}

    const lanes=buildLanes(state),weeklyHours=new Map(),pieces=[];
    for(const day of DAYS){
      const result=scheduleDay(state,lanes,day,weeklyHours);
      if(!result.ok){renderFailure(result.problem);return}
      pieces.push(...result.pieces);
    }

    const balanced=rebalanceWeek(state,pieces);
    const merged=mergePieces(balanced.pieces);
    const managerProblems=managerCheck(state,merged);
    if(managerProblems.length){renderFailure(managerProblems.join(' · '));return}
    renderSuccess(state,lanes,merged,balanced.hours);
  }

  button.onclick=generate;
})();
