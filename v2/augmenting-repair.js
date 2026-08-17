(() => {
  'use strict';

  const KEY='cookfellas-smart-v2-config';
  const DAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const LEVELS=['pots','running','floor'];
  const CORE=new Set(['mark','fran','tyler']);
  const button=document.getElementById('generate');
  if(!button||typeof button.onclick!=='function')return;
  const previousGenerate=button.onclick;

  const hours=(a,b)=>(b-a)/60;
  const staffName=s=>String(s?.name||'').trim().toLowerCase();
  const isCore=s=>CORE.has(staffName(s));
  const readState=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch{return null}};

  function timeToMin(text){
    const m=String(text||'').trim().match(/^(\d{1,2})(?::(\d{2}))?$/);if(!m)return null;
    let h=Number(m[1]),n=Number(m[2]||0);if(h<=10)h+=12;return h*60+n;
  }
  function parseRange(text){
    const p=String(text||'').replace(/–/g,'-').split('-').map(x=>x.trim());
    return p.length===2?[timeToMin(p[0]),timeToMin(p[1])]:[null,null];
  }
  function roleLevel(role,area){
    if(area==='bar')return 'floor';
    const roles=String(role||'').toLowerCase().split('/').map(x=>x.trim());
    if(roles.includes('floor'))return 'floor';
    if(roles.includes('running'))return 'running';
    return 'pots';
  }
  function parseRendered(state){
    const grid=document.getElementById('rotaGrid');if(!grid)return [];
    const out=[];let seq=0;
    for(const card of grid.querySelectorAll('.dayResult')){
      const day=card.querySelector('h3')?.textContent?.trim();if(!DAYS.includes(day))continue;
      let area=null;
      for(const el of card.children){
        if(el.classList.contains('areaLabel')){area=el.textContent.trim().toLowerCase();continue}
        if(!area||!el.classList.contains('shift'))continue;
        const [start,end]=parseRange(el.querySelector('.time')?.textContent);if(start==null||end==null||end<=start)continue;
        const who=el.querySelector('.who')?.textContent?.trim()||'';
        const s=/unfilled/i.test(who)?null:state.staff.find(x=>x.name===who)||null;
        out.push({key:seq++,day,area,start,end,role:el.querySelector('.role')?.textContent?.trim()||'',staffId:s?.id||null,el});
      }
    }
    return out;
  }

  function availOk(s,sh){
    const v=s.availableDays?.[sh.day]||'full';
    if(v==='none')return false;if(v==='full')return true;
    if(v==='am')return sh.end<=17*60;if(v==='pm')return sh.start>=17*60;return true;
  }
  function skillOk(s,sh){return LEVELS.indexOf(s.level)>=LEVELS.indexOf(roleLevel(sh.role,sh.area))}
  const personShifts=(assign,id)=>assign.filter(x=>x.staffId===id).sort((a,b)=>DAYS.indexOf(a.day)-DAYS.indexOf(b.day)||a.start-b.start);
  const personHours=(assign,id)=>personShifts(assign,id).reduce((z,x)=>z+hours(x.start,x.end),0);
  const personDays=(assign,id)=>new Set(personShifts(assign,id).map(x=>x.day));
  function twoOffOk(days){for(let i=0;i<DAYS.length;i++)if(!days.has(DAYS[i])&&!days.has(DAYS[(i+1)%7]))return true;return false}

  function personValid(state,assign,s){
    const all=personShifts(assign,s.id);
    for(const sh of all)if(!skillOk(s,sh)||!availOk(s,sh))return false;
    const days=personDays(assign,s.id);if(days.size>(s.maxDays??5))return false;
    if(state.rules?.twoOff!==false&&!twoOffOk(days))return false;
    if(s.contractType==='contracted'&&Number(s.targetHours)>0&&personHours(assign,s.id)>Number(s.targetHours)+(Number(state.rules?.maxOT)||0)+.001)return false;
    for(const day of DAYS){
      const ds=all.filter(x=>x.day===day).sort((a,b)=>a.start-b.start);let runStart=null,lastEnd=null;
      for(let i=0;i<ds.length;i++){
        const sh=ds[i];
        if(i){const prev=ds[i-1];if(sh.start<prev.end)return false;const gap=sh.start-prev.end;if(gap>0&&gap<(Number(state.rules?.splitGap)||0)*60)return false}
        if(runStart==null||sh.start!==lastEnd){runStart=sh.start;lastEnd=sh.end}else lastEnd=sh.end;
        if((lastEnd-runStart)/60>(Number(state.rules?.maxContinuous)||10)+.001)return false;
      }
    }
    return true;
  }
  function allPeopleValid(state,assign){for(const s of state.staff)if(!personValid(state,assign,s))return false;return true}
  function covers(sh,t,kind){return kind==='open'?sh.start<=t&&sh.end>t:sh.start<t&&sh.end>=t}
  function openCloseValid(state,assign){
    for(const day of DAYS){
      if(!assign.some(x=>x.day===day))continue;
      for(const kind of ['open','close']){
        const raw=state.siteHours?.[day]?.[kind];if(!raw)continue;
        const [h,m]=raw.split(':').map(Number),t=h*60+m;
        if(!assign.some(x=>x.day===day&&x.staffId&&covers(x,t,kind)&&state.staff.find(s=>s.id===x.staffId)?.isManager))return false;
      }
    }
    return true;
  }
  function managerPeak(state,assign){
    let score=0;
    for(const day of ['Fri','Sat'])for(let t=17*60;t<21*60;t+=30){
      const managers=new Set(assign.filter(x=>x.day===day&&x.staffId&&x.start<=t&&x.end>=t+30&&state.staff.find(s=>s.id===x.staffId)?.isManager).map(x=>x.staffId));
      score+=Math.min(3,managers.size);
    }
    return score;
  }
  function coreSaturday(state,assign){return state.staff.filter(isCore).filter(s=>assign.some(x=>x.staffId===s.id&&x.day==='Sat'&&x.start<21*60&&x.end>17*60)).length}
  function zeroHours(state,assign){return assign.filter(x=>x.staffId&&state.staff.find(s=>s.id===x.staffId)?.contractType==='zeroHours').reduce((z,x)=>z+hours(x.start,x.end),0)}
  function missing(assign){return assign.filter(x=>!x.staffId).reduce((z,x)=>z+hours(x.start,x.end),0)}
  function deficit(state,assign){return state.staff.filter(s=>s.contractType==='contracted'&&Number(s.targetHours)>0).reduce((z,s)=>z+Math.max(0,Number(s.targetHours)-personHours(assign,s.id)),0)}
  function splitCount(state,assign){let n=0;for(const s of state.staff)for(const d of DAYS){const a=assign.filter(x=>x.staffId===s.id&&x.day===d).sort((x,y)=>x.start-y.start);if(a.some((x,i)=>i&&x.start>a[i-1].end))n++}return n}
  function quality(state,assign){return {missing:missing(assign),zero:zeroHours(state,assign),deficit:deficit(state,assign),manager:managerPeak(state,assign),core:coreSaturday(state,assign),splits:splitCount(state,assign)}}
  function better(a,b){
    if(Math.abs(a.missing-b.missing)>.001)return a.missing<b.missing;
    if(Math.abs(a.zero-b.zero)>.001)return a.zero<b.zero;
    if(Math.abs(a.deficit-b.deficit)>.001)return a.deficit<b.deficit;
    if(a.manager!==b.manager)return a.manager>b.manager;
    if(a.core!==b.core)return a.core>b.core;
    if(a.splits!==b.splits)return a.splits<b.splits;
    return false;
  }
  function acceptable(state,assign,floor){
    if(!allPeopleValid(state,assign)||!openCloseValid(state,assign))return false;
    const q=quality(state,assign);return q.manager>=floor.manager&&q.core>=floor.core;
  }
  const cloneAssign=a=>a.map(x=>({...x}));
  const poolCount=(state,sh)=>state.staff.filter(s=>skillOk(s,sh)&&availOk(s,sh)).length;

  function candidateStaff(state,assign,sh,preferContracted=true,exclude=new Set()){
    return state.staff.filter(s=>!exclude.has(s.id)&&skillOk(s,sh)&&availOk(s,sh)).sort((a,b)=>{
      if(preferContracted&&a.contractType!==b.contractType)return a.contractType==='contracted'?-1:1;
      const da=Math.max(0,Number(a.targetHours||0)-personHours(assign,a.id));
      const db=Math.max(0,Number(b.targetHours||0)-personHours(assign,b.id));
      if(da!==db)return db-da;
      if(a.isManager!==b.isManager&&['Fri','Sat'].includes(sh.day)&&sh.start<21*60&&sh.end>17*60)return a.isManager?-1:1;
      return personHours(assign,a.id)-personHours(assign,b.id);
    });
  }

  function evictionSets(assign,staffId,targetKey){
    const owned=assign.filter(x=>x.staffId===staffId&&x.key!==targetKey);
    const sets=[];
    for(const sh of owned)sets.push([sh.key]);
    for(const day of DAYS){
      const keys=owned.filter(x=>x.day===day).map(x=>x.key);
      if(keys.length>1)sets.push(keys);
    }
    const uniq=new Map();for(const s of sets){const k=[...s].sort((a,b)=>a-b).join(',');uniq.set(k,s)}
    return [...uniq.values()].sort((a,b)=>a.length-b.length);
  }

  function rehomeBundle(state,assign,keys,depth,floor,seen,budget,blockedStaff){
    if(!keys.length)return acceptable(state,assign,floor)?assign:null;
    const ordered=[...keys].sort((ka,kb)=>{
      const a=assign.find(x=>x.key===ka),b=assign.find(x=>x.key===kb);
      return (a?poolCount(state,a):99)-(b?poolCount(state,b):99);
    });
    const key=ordered[0],rest=ordered.slice(1),sh=assign.find(x=>x.key===key);if(!sh)return null;
    for(const r of candidateStaff(state,assign,sh,true,new Set([blockedStaff]))){
      const placed=searchPlace(state,assign,key,r.id,depth,floor,new Set(seen),budget);
      if(!placed)continue;
      const done=rehomeBundle(state,placed,rest,depth,floor,new Set(seen),budget,blockedStaff);
      if(done)return done;
    }
    return null;
  }

  function searchPlace(state,assign,targetKey,staffId,depth,floor,seen,budget){
    if(budget.n++>25000)return null;
    const sig=`${targetKey}:${staffId}:${depth}:${assign.map(x=>x.staffId||'_').join(',')}`;
    if(seen.has(sig))return null;seen.add(sig);
    let next=cloneAssign(assign);const target=next.find(x=>x.key===targetKey);if(!target)return null;target.staffId=staffId;
    const s=state.staff.find(x=>x.id===staffId);if(!s)return null;
    if(personValid(state,next,s))return acceptable(state,next,floor)?next:null;
    if(depth<=0)return null;

    for(const keys of evictionSets(next,staffId,targetKey)){
      let base=cloneAssign(next);
      for(const k of keys){const sh=base.find(x=>x.key===k);if(sh)sh.staffId=null}
      if(!personValid(state,base,s))continue;
      const repaired=rehomeBundle(state,base,keys,depth-1,floor,new Set(seen),budget,staffId);
      if(repaired&&acceptable(state,repaired,floor))return repaired;
    }
    return null;
  }

  function improve(state,start){
    let assign=cloneAssign(start);
    const floor={manager:managerPeak(state,assign),core:coreSaturday(state,assign)};
    for(let pass=0;pass<10;pass++){
      let best=null,bestQ=quality(state,assign);
      const targets=assign.filter(x=>!x.staffId||state.staff.find(s=>s.id===x.staffId)?.contractType==='zeroHours').sort((a,b)=>{
        const au=!a.staffId?0:1,bu=!b.staffId?0:1;if(au!==bu)return au-bu;
        const pa=poolCount(state,a),pb=poolCount(state,b);if(pa!==pb)return pa-pb;
        return hours(b.start,b.end)-hours(a.start,a.end);
      });
      for(const target of targets){
        const contracted=state.staff.filter(s=>s.contractType==='contracted'&&skillOk(s,target)&&availOk(s,target)).sort((a,b)=>{
          const da=Math.max(0,Number(a.targetHours||0)-personHours(assign,a.id));
          const db=Math.max(0,Number(b.targetHours||0)-personHours(assign,b.id));return db-da;
        });
        for(const c of contracted){
          if(target.staffId===c.id)continue;
          const cand=searchPlace(state,assign,target.key,c.id,5,floor,new Set(),{n:0});
          if(!cand)continue;
          const q=quality(state,cand);if(better(q,bestQ)){best=cand;bestQ=q}
        }
      }
      if(!best)break;
      assign=best;
    }
    return assign;
  }

  function writeBack(state,assign){
    for(const sh of assign){
      const who=sh.el.querySelector('.who');if(!who)continue;
      const s=state.staff.find(x=>x.id===sh.staffId);who.textContent=s?s.name:'— UNFILLED —';sh.el.classList.toggle('unfilled',!s);
    }
    const total=assign.reduce((z,x)=>z+hours(x.start,x.end),0),miss=missing(assign),filled=total-miss,zero=zeroHours(state,assign),contracted=filled-zero,splits=splitCount(state,assign);
    const values=[total.toFixed(1)+'h',filled.toFixed(1)+'h',zero.toFixed(1)+'h',contracted.toFixed(1)+'h',assign.filter(x=>!x.staffId).length,splits];
    document.querySelectorAll('#metrics .metric .v').forEach((el,i)=>{if(i<values.length)el.textContent=values[i]});
    const warnings=[];
    if(miss>0)warnings.push(`${miss.toFixed(1)} staff-hours of required coverage remain unfilled.`);
    for(const s of state.staff.filter(isCore))if(!assign.some(x=>x.staffId===s.id&&x.day==='Sat'&&x.start<21*60&&x.end>17*60))warnings.push(`Saturday 5–9 preference not achieved for ${s.name}`);
    warnings.push(`Fri/Sat important-time manager score protected at ${managerPeak(state,assign)}.`);
    warnings.push(`Zero-hours usage after bundled repair: ${zero.toFixed(1)}h.`);
    document.getElementById('warnings').innerHTML=warnings.map(x=>`<div class="warn">⚠ ${x}</div>`).join('');
    const hint=document.getElementById('resultHint');if(hint)hint.textContent='Generated with scarcity-first assignment and bundled multi-step repair, allowing whole day patterns to move while protecting important manager cover.';
  }

  function runRepair(){
    const state=readState();if(!state?.staff)return;
    const parsed=parseRendered(state);if(!parsed.length)return;
    const repaired=improve(state,parsed);writeBack(state,repaired);
  }

  button.onclick=function(e){
    const result=previousGenerate.call(this,e);
    setTimeout(runRepair,80);
    return result;
  };
})();
