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
      groups.push({members:[fran,tyler],shared:true});
      grouped.add(fran.id);grouped.add(tyler.id);
    }
    const rest=staff.filter(s=>!grouped.has(s.id)).sort((a,b)=>
      Number(b.isManager)-Number(a.isManager)||targetOf(b)-targetOf(a)||String(a.name).localeCompare(String(b.name))
    );
    for(const s of rest)groups.push({members:[s],shared:false});
    return groups;
  }

  function buildBeam(state){
    const groups=buildGroups(state);
    let beam=[{score:0,choices:[]}];
    const WIDTH=320;
    for(const group of groups){
      const options=PAIRS.map(pair=>({
        pair,
        cost:group.members.reduce((z,s)=>z+pairCost(state,s,pair),0)
      })).sort((a,b)=>a.cost-b.cost);
      const next=[];
      for(const item of beam){
        for(const option of options){
          next.push({score:item.score+option.cost,choices:[...item.choices,{group,pair:option.pair}]});
        }
      }
      next.sort((a,b)=>a.score-b.score);
      beam=next.slice(0,WIDTH);
    }
    return beam;
  }

  function offMapFromCandidate(candidate){
    const map=new Map();
    for(const choice of candidate.choices){
      for(const s of choice.group.members)map.set(s.id,choice.pair);
    }
    return map;
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
        for(let i=0;i<need;i++)positions.push({day,area,role,start:t,end:t+30});
      }
    }
    return positions;
  }

  function blockFeasible(state,offMap,day,t){
    const staff=state.staff||[];
    const positions=positionsForBlock(state,day,t);
    if(!positions.length)return true;
    const site=state.siteHours?.[day];
    const open=toMin(site?.open),close=toMin(site?.close);
    const managerRequired=t===open||t+30===close;

    const enriched=positions.map(p=>({
      p,
      eligible:staff.filter(s=>!isOff(offMap,s,day)&&availabilityOk(s,p)&&skillOk(s,p))
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

  function planFeasible(state,offMap){
    for(const day of DAYS){
      const site=state.siteHours?.[day];
      const open=toMin(site?.open),close=toMin(site?.close);
      if(open==null||close==null||close<=open)continue;
      for(let t=open;t<close;t+=30){
        if(!blockFeasible(state,offMap,day,t))return false;
      }
    }
    return true;
  }

  function choosePlan(state){
    const beam=buildBeam(state);
    for(const candidate of beam){
      const offMap=offMapFromCandidate(candidate);
      if(planFeasible(state,offMap))return {candidate,offMap};
    }
    return null;
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
    document.getElementById('resultHint').textContent='No rota published. The mandatory consecutive-days-off rule cannot be combined with the current coverage, skills, availability and manager requirements.';
    document.getElementById('metrics').innerHTML='<div class="metric"><div class="k">Rota status</div><div class="v">INVALID</div></div>';
    document.getElementById('warnings').innerHTML='<div class="warn"><strong>Two-days-off failure:</strong> No feasible set of consecutive off-day pairs was found. Fran and Tyler must also share the same pair.</div>';
    document.getElementById('rotaGrid').innerHTML='';
    panel.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function appendPlanSummary(state,offMap){
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
    warnings.insertAdjacentHTML('beforeend',`<div class="ok">✓ TWO CONSECUTIVE DAYS OFF PASSED — ${shared}</div><div class="ok">Reserved off pairs: ${all}</div>`);

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

    if(download&&!download.disabled)appendPlanSummary(state,plan.offMap);
  };
})();
