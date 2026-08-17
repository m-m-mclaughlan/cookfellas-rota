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

  function contractedDeficit(staff,weeklyHours){
    if(staff.contractType!=='contracted')return 0;
    const target=Math.max(0,Number(staff.targetHours)||0);
    if(!target)return 0;
    return Math.max(0,target-(weeklyHours.get(staff.id)||0));
  }

  function candidateScore(staff,position,weeklyHours,prevByLane,managerRequired){
    const laneKey=`${position.area}|${position.role}`;
    const prev=new Set(prevByLane.get(laneKey)||[]);
    const deficit=contractedDeficit(staff,weeklyHours);
    let score=0;
    if(deficit>0)score+=100000+deficit*100;
    if(prev.has(staff.id))score+=15000;
    if(managerRequired&&staff.isManager)score+=5000;
    score-=(weeklyHours.get(staff.id)||0)*2;
    return score;
  }

  function solveBlock(state,positions,weeklyHours,prevByLane,managerRequired){
    const staff=state.staff||[];
    const enriched=positions.map((p,index)=>{
      const eligible=staff.filter(s=>skillOk(s,p));
      return {...p,index,eligible};
    });

    const impossible=enriched.find(p=>p.eligible.length===0);
    if(impossible){
      return {ok:false,problem:`No eligible ${impossible.area==='bar'?'Bar FOH':impossible.role} staff exist for this required position.`};
    }

    enriched.sort((a,b)=>a.eligible.length-b.eligible.length||a.area.localeCompare(b.area)||a.role.localeCompare(b.role));
    const used=new Set();
    const picked=new Map();

    function managerStillPossible(from){
      for(let i=from;i<enriched.length;i++){
        if(enriched[i].eligible.some(s=>s.isManager&&!used.has(s.id)))return true;
      }
      return false;
    }

    function dfs(i,hasManager){
      if(i===enriched.length)return !managerRequired||hasManager;
      if(managerRequired&&!hasManager&&!managerStillPossible(i))return false;
      const p=enriched[i];
      const candidates=p.eligible
        .filter(s=>!used.has(s.id))
        .sort((a,b)=>candidateScore(b,p,weeklyHours,prevByLane,managerRequired)-candidateScore(a,p,weeklyHours,prevByLane,managerRequired)||String(a.name).localeCompare(String(b.name)));

      for(const s of candidates){
        used.add(s.id);picked.set(p.index,s.id);
        if(dfs(i+1,hasManager||!!s.isManager))return true;
        picked.delete(p.index);used.delete(s.id);
      }
      return false;
    }

    if(!dfs(0,false)){
      if(managerRequired){
        return {ok:false,problem:'Required staffing can be skill-matched, but no valid assignment also provides a manager on site at this opening/closing block.'};
      }
      return {ok:false,problem:'Required positions cannot all be skill-matched without double-booking somebody in the same half-hour.'};
    }

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

      if(positions.length>(state.staff||[]).length){
        return {ok:false,problem:`${day} ${pretty(t)}–${pretty(t+30)} needs ${positions.length} people at once but only ${(state.staff||[]).length} are on the roster.`};
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
    document.getElementById('resultHint').textContent='No rota published. Coverage, skill eligibility and mandatory manager opening/closing cover are active hard rules.';
    document.getElementById('metrics').innerHTML='<div class="metric"><div class="k">Rota status</div><div class="v">INVALID</div></div>';
    document.getElementById('warnings').innerHTML=`<div class="warn"><strong>Core-rule failure:</strong> ${esc(problem)}</div>`;
    document.getElementById('rotaGrid').innerHTML='';
    panel.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function renderSuccess(state,lanes,assign,weeklyHours){
    const panel=document.getElementById('resultsPanel');panel.style.display='block';
    const required=requiredHours(lanes);
    const contracted=(state.staff||[]).filter(s=>s.contractType==='contracted');
    const contractedUsed=contracted.reduce((z,s)=>z+(weeklyHours.get(s.id)||0),0);
    const contractedTarget=contracted.reduce((z,s)=>z+(Math.max(0,Number(s.targetHours)||0)),0);
    const zeroUsed=(state.staff||[]).filter(s=>s.contractType!=='contracted').reduce((z,s)=>z+(weeklyHours.get(s.id)||0),0);
    const managerProblems=managerCheck(state,assign);

    document.getElementById('resultHint').textContent='Core mode: full coverage, skills and manager opening/closing cover are enforced. Contracted staff are prioritised toward their target hours. Other roster constraints remain inactive.';
    document.getElementById('metrics').innerHTML=[
      ['Required labour',required.toFixed(1)+'h'],
      ['Unfilled coverage','0.0h'],
      ['Contracted used',contractedUsed.toFixed(1)+'h'],
      ['Contract targets',contractedTarget.toFixed(1)+'h'],
      ['Zero-hours used',zeroUsed.toFixed(1)+'h'],
      ['Active rule groups','3']
    ].map(([k,v])=>`<div class="metric"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');

    const targetNotes=contracted.map(s=>{
      const used=weeklyHours.get(s.id)||0,target=Math.max(0,Number(s.targetHours)||0);
      return `${esc(s.name)} ${used.toFixed(1)}${target?` / ${target.toFixed(1)}h`:'h'}`;
    }).join(' · ');
    document.getElementById('warnings').innerHTML=`<div class="ok">✓ CORE RULES PASSED — every required half-hour is skill-covered and manager open/close cover is present.</div>${managerProblems.map(x=>`<div class="warn">⚠ ${esc(x)}</div>`).join('')}<div class="ok">Contracted: ${targetNotes||'none configured'}</div>`;

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
    const merged=mergePieces(pieces);
    const managerProblems=managerCheck(state,merged);
    if(managerProblems.length){renderFailure(managerProblems.join(' · '));return}
    renderSuccess(state,lanes,merged,weeklyHours);
  }

  button.onclick=generate;
})();
