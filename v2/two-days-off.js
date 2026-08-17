(() => {
  'use strict';

  const KEY='cookfellas-smart-v2-config';
  const DAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const PAIRS=[['Mon','Tue'],['Tue','Wed'],['Wed','Thu'],['Thu','Fri'],['Fri','Sat'],['Sat','Sun'],['Sun','Mon']];
  const LEVELS=['pots','running','floor'];
  const button=document.getElementById('generate');
  const download=document.getElementById('download');
  if(!button||typeof button.onclick!=='function')return;

  const baseGenerate=button.onclick;
  const toMin=t=>{if(!t)return null;const [h,m]=String(t).split(':').map(Number);return h*60+m};
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const readState=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch{return null}};
  const clone=x=>JSON.parse(JSON.stringify(x));
  const potsSegment=(day,t)=>day==='Sat'?(t<17*60?'sat-11-5':'sat-5-close'):'whole';

  function availabilityOk(staff,position){
    const v=staff.availableDays?.[position.day]||'full';
    if(v==='none')return false;
    if(v==='am')return position.end<=17*60;
    if(v==='pm')return position.start>=17*60;
    return true;
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

  function availableHoursOnDay(state,staff,day){
    const site=state.siteHours?.[day];
    const open=toMin(site?.open),close=toMin(site?.close);
    if(open==null||close==null||close<=open)return 0;
    const v=staff.availableDays?.[day]||'full';
    if(v==='none')return 0;
    if(v==='am')return Math.max(0,Math.min(close,17*60)-open)/60;
    if(v==='pm')return Math.max(0,close-Math.max(open,17*60))/60;
    return (close-open)/60;
  }

  function pairCost(state,staff,pair){
    const lost=pair.reduce((z,d)=>z+availableHoursOnDay(state,staff,d),0);
    const remaining=DAYS.filter(d=>!pair.includes(d)).reduce((z,d)=>z+availableHoursOnDay(state,staff,d),0);
    const target=targetOf(staff);
    const capacityShortfall=Math.max(0,target-remaining);
    let cost=lost*10+capacityShortfall*100000;
    if(staff.isManager)cost+=lost*2;
    return cost;
  }

  function buildGroups(state){
    const staff=state.staff||[];
    const fran=staff.find(s=>String(s.name).trim().toLowerCase()==='fran');
    const tyler=staff.find(s=>String(s.name).trim().toLowerCase()==='tyler');
    const grouped=new Set();
    const groups=[];
    if(fran&&tyler){
      groups.push({id:'fran-tyler',members:[fran,tyler],shared:true});
      grouped.add(fran.id);grouped.add(tyler.id);
    }
    const rest=staff.filter(s=>!grouped.has(s.id)).sort((a,b)=>
      Number(b.isManager)-Number(a.isManager)||targetOf(b)-targetOf(a)||String(a.name).localeCompare(String(b.name))
    );
    for(const s of rest)groups.push({id:String(s.id),members:[s],shared:false});
    return groups;
  }

  function isOff(offMap,staff,day){
    return (offMap.get(staff.id)||[]).includes(day);
  }

  function positionsForBlock(state,day,t){
    const positions=[];
    for(const area of ['restaurant','bar']){
      const roles=area==='bar'?['bar']:['floor','running','pots'];
      for(const role of roles){
        let need=0;
        for(const r of state.coverage?.[day]?.[area]||[]){
          if(r.role!==role||Number(r.count)<=0)continue;
          const a=toMin(r.start),b=toMin(r.end);
          if(a!=null&&b!=null&&a<=t&&b>=t+30)need=Math.max(need,Number(r.count)||0);
        }
        for(let slot=0;slot<need;slot++){
          const segment=role==='pots'?potsSegment(day,t):null;
          positions.push({
            day,area,role,start:t,end:t+30,slot,
            potsLockKey:role==='pots'?`${area}|${segment}|${slot}`:null
          });
        }
      }
    }
    return positions;
  }

  function potsLockOptionsForDay(state,offMap,day){
    const site=state.siteHours?.[day];
    const open=toMin(site?.open),close=toMin(site?.close);
    if(open==null||close==null||close<=open)return [new Map()];

    const requirements=new Map();
    for(let t=open;t<close;t+=30){
      for(const p of positionsForBlock(state,day,t)){
        if(p.role!=='pots')continue;
        if(!requirements.has(p.potsLockKey))requirements.set(p.potsLockKey,[]);
        requirements.get(p.potsLockKey).push(p);
      }
    }
    if(!requirements.size)return [new Map()];

    const staff=state.staff||[];
    const lockKeys=[...requirements.keys()].sort();
    const candidates=new Map();
    for(const lockKey of lockKeys){
      const reqs=requirements.get(lockKey);
      const eligible=staff.filter(s=>
        !isOff(offMap,s,day)&&reqs.every(p=>availabilityOk(s,p)&&skillOk(s,p))
      );
      if(!eligible.length)return [];
      candidates.set(lockKey,eligible);
    }

    const out=[];
    const used=new Set();
    const locks=new Map();
    function dfs(i){
      if(i===lockKeys.length){out.push(new Map(locks));return}
      const lockKey=lockKeys[i];
      for(const s of candidates.get(lockKey)){
        if(used.has(s.id))continue;
        used.add(s.id);locks.set(lockKey,s.id);
        dfs(i+1);
        locks.delete(lockKey);used.delete(s.id);
      }
    }
    dfs(0);
    return out;
  }

  function blockFeasible(state,offMap,day,t,potsLocks=new Map()){
    const staff=state.staff||[];
    const positions=positionsForBlock(state,day,t);
    if(!positions.length)return true;
    const site=state.siteHours?.[day];
    const open=toMin(site?.open),close=toMin(site?.close);
    const managerRequired=t===open||t+30===close;

    const enriched=positions.map(p=>({
      p,
      eligible:staff.filter(s=>{
        if(isOff(offMap,s,day)||!availabilityOk(s,p)||!skillOk(s,p))return false;
        if(p.role==='pots'&&potsLocks.has(p.potsLockKey)&&s.id!==potsLocks.get(p.potsLockKey))return false;
        return true;
      })
    })).sort((a,b)=>a.eligible.length-b.eligible.length);
    if(enriched.some(x=>x.eligible.length===0))return false;

    const used=new Set();
    function dfs(i,hasManager){
      if(i===enriched.length)return !managerRequired||hasManager;
      const x=enriched[i];
      for(const s of x.eligible){
        if(used.has(s.id))continue;
        used.add(s.id);
        if(dfs(i+1,hasManager||!!s.isManager))return true;
        used.delete(s.id);
      }
      return false;
    }
    return dfs(0,false);
  }

  function dayFeasible(state,offMap,day){
    const site=state.siteHours?.[day];
    const open=toMin(site?.open),close=toMin(site?.close);
    if(open==null||close==null||close<=open)return true;

    const potOptions=potsLockOptionsForDay(state,offMap,day);
    if(!potOptions.length)return false;

    for(const potsLocks of potOptions){
      let ok=true;
      for(let t=open;t<close;t+=30){
        if(!blockFeasible(state,offMap,day,t,potsLocks)){ok=false;break}
      }
      if(ok)return true;
    }
    return false;
  }

  function daysFeasible(state,offMap,days){
    for(const day of days)if(!dayFeasible(state,offMap,day))return false;
    return true;
  }

  function planFeasible(state,offMap){
    return daysFeasible(state,offMap,DAYS);
  }

  function setGroupPair(offMap,group,pair){
    for(const s of group.members)offMap.set(s.id,pair);
  }

  function clearGroupPair(offMap,group){
    for(const s of group.members)offMap.delete(s.id);
  }

  function pairPressure(state,offMap,pair){
    const staff=state.staff||[];
    let pressure=0;
    for(const day of pair){
      const site=state.siteHours?.[day];
      const open=toMin(site?.open),close=toMin(site?.close);
      if(open==null||close==null||close<=open)continue;
      for(let t=open;t<close;t+=30){
        const positions=positionsForBlock(state,day,t);
        if(!positions.length)continue;
        const available=staff.filter(s=>!isOff(offMap,s,day)&&availabilityOk(s,{day,start:t,end:t+30,area:'restaurant',role:'pots'}));
        const slack=available.length-positions.length;
        pressure+=100/Math.max(1,slack+1);
        if(t===open||t+30===close){
          const managers=staff.filter(s=>s.isManager&&!isOff(offMap,s,day)&&availabilityOk(s,{day,start:t,end:t+30,area:'restaurant',role:'floor'})).length;
          pressure+=400/Math.max(1,managers);
        }
      }
    }
    return pressure;
  }

  function choosePlan(state){
    const groups=buildGroups(state);
    const offMap=new Map();
    let nodes=0;
    const started=performance.now();
    const memo=new Set();

    function domainFor(group){
      const options=[];
      for(const pair of PAIRS){
        setGroupPair(offMap,group,pair);
        const feasible=daysFeasible(state,offMap,pair);
        if(feasible){
          const base=group.members.reduce((z,s)=>z+pairCost(state,s,pair),0);
          options.push({pair,score:base+pairPressure(state,offMap,pair)});
        }
        clearGroupPair(offMap,group);
      }
      options.sort((a,b)=>a.score-b.score||PAIRS.findIndex(p=>p===a.pair)-PAIRS.findIndex(p=>p===b.pair));
      return options;
    }

    function snapshotKey(remaining){
      const assigned=(state.staff||[]).map(s=>`${s.id}:${(offMap.get(s.id)||[]).join('-')}`).filter(x=>!x.endsWith(':')).sort().join('|');
      return remaining.map(g=>g.id).sort().join(',')+'//'+assigned;
    }

    function dfs(remaining){
      nodes++;
      if(!remaining.length)return planFeasible(state,offMap)?new Map(offMap):null;

      const key=snapshotKey(remaining);
      if(memo.has(key))return null;

      let selected=null,selectedOptions=null;
      for(const group of remaining){
        const options=domainFor(group);
        if(!options.length){memo.add(key);return null}
        if(!selectedOptions||options.length<selectedOptions.length){
          selected=group;selectedOptions=options;
          if(options.length===1)break;
        }
      }

      const nextRemaining=remaining.filter(g=>g!==selected);
      for(const option of selectedOptions){
        setGroupPair(offMap,selected,option.pair);
        const result=dfs(nextRemaining);
        if(result)return result;
        clearGroupPair(offMap,selected);
      }

      memo.add(key);
      return null;
    }

    const result=dfs(groups);
    return result?{offMap:result,nodes,ms:Math.round(performance.now()-started)}:null;
  }

  function applyPlan(state,offMap){
    const temp=clone(state);
    for(const s of temp.staff||[]){
      s.availableDays=s.availableDays||{};
      for(const day of offMap.get(s.id)||[])s.availableDays[day]='none';
    }
    return temp;
  }

  function renderPlanFailure(){
    if(download)download.disabled=true;
    const panel=document.getElementById('resultsPanel');
    if(!panel)return;
    panel.style.display='block';
    document.getElementById('resultHint').textContent='No rota published. A complete consecutive-days-off search could not find a schedule-compatible set of off-day pairs, including whole-shift pots cover and the two-person Saturday pots split.';
    document.getElementById('metrics').innerHTML='<div class="metric"><div class="k">Rota status</div><div class="v">INVALID</div></div>';
    document.getElementById('warnings').innerHTML='<div class="warn"><strong>Two-days-off failure:</strong> Every possible pair was searched under the current coverage, skills, availability, whole-shift pots and manager rules. Saturday pots requires different people for 11–5 and 5–close. Fran and Tyler must also share the same pair.</div>';
    document.getElementById('rotaGrid').innerHTML='';
    panel.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function appendPlanSummary(state,offMap,meta){
    const warnings=document.getElementById('warnings');
    if(!warnings)return;
    const staff=state.staff||[];
    const fran=staff.find(s=>String(s.name).trim().toLowerCase()==='fran');
    const tyler=staff.find(s=>String(s.name).trim().toLowerCase()==='tyler');
    const pairText=s=>{
      const p=offMap.get(s.id)||[];
      return `${esc(s.name)} ${p.join(' + ')}`;
    };
    const shared=fran&&tyler?`Fran &amp; Tyler: ${(offMap.get(fran.id)||[]).join(' + ')} (shared)`:'Fran/Tyler shared pair not applicable';
    const all=staff.map(pairText).join(' · ');
    warnings.insertAdjacentHTML('beforeend',`<div class="ok">✓ TWO CONSECUTIVE DAYS OFF PASSED — ${shared}</div><div class="ok">Reserved off pairs: ${all}</div><div class="ok">Off-day search: ${meta?.nodes||0} states checked in ${meta?.ms||0}ms.</div>`);

    const metricRoot=document.getElementById('metrics');
    if(metricRoot){
      metricRoot.insertAdjacentHTML('beforeend','<div class="metric"><div class="k">Two-day-off rule</div><div class="v">PASS</div></div>');
    }
  }

  button.onclick=()=>{
    const originalRaw=localStorage.getItem(KEY);
    const state=readState();
    if(!state?.staff?.length){baseGenerate();return}

    const plan=choosePlan(state);
    if(!plan){renderPlanFailure();return}

    try{
      const temp=applyPlan(state,plan.offMap);
      localStorage.setItem(KEY,JSON.stringify(temp));
      baseGenerate();
    }finally{
      if(originalRaw==null)localStorage.removeItem(KEY);
      else localStorage.setItem(KEY,originalRaw);
    }

    if(download&&!download.disabled)appendPlanSummary(state,plan.offMap,plan);
  };
})();