(() => {
  'use strict';

  const KEY='cookfellas-smart-v2-config';
  const DAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const LEVELS=['pots','running','floor'];
  const CORE=new Set(['mark','fran','tyler']);
  const button=document.getElementById('generate');
  if(!button||typeof button.onclick!=='function')return;
  const previousGenerate=button.onclick;

  const staffName=s=>String(s?.name||'').trim().toLowerCase();
  const isCore=s=>CORE.has(staffName(s));
  const hours=(a,b)=>(b-a)/60;

  function readState(){try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch{return null}}
  function timeToMin(text){
    const m=String(text||'').trim().match(/^(\d{1,2})(?::(\d{2}))?$/);if(!m)return null;
    let h=Number(m[1]),n=Number(m[2]||0);
    if(h<=10)h+=12;
    return h*60+n;
  }
  function parseRange(text){
    const p=String(text||'').replace(/–/g,'-').split('-').map(x=>x.trim());
    if(p.length!==2)return [null,null];return [timeToMin(p[0]),timeToMin(p[1])];
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
    const out=[];
    for(const card of grid.querySelectorAll('.dayResult')){
      const day=card.querySelector('h3')?.textContent?.trim();if(!DAYS.includes(day))continue;
      let area=null;
      for(const el of card.children){
        if(el.classList.contains('areaLabel')){area=el.textContent.trim().toLowerCase();continue}
        if(!area||!el.classList.contains('shift'))continue;
        const [start,end]=parseRange(el.querySelector('.time')?.textContent);if(start==null||end==null||end<=start)continue;
        const who=el.querySelector('.who')?.textContent?.trim()||'';
        const staff=/unfilled/i.test(who)?null:state.staff.find(s=>s.name===who)||null;
        out.push({day,area,start,end,role:el.querySelector('.role')?.textContent?.trim()||'',staffId:staff?.id||null,el});
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
  function canAssign(state,s,sh,assign){
    if(!skillOk(s,sh)||!availOk(s,sh))return false;
    const ds=assign.filter(x=>x.staffId===s.id&&x.day===sh.day).sort((a,b)=>a.start-b.start);
    for(const x of ds){
      if(sh.start<x.end&&x.start<sh.end)return false;
      const gap=sh.start>=x.end?sh.start-x.end:x.start-sh.end;
      if(gap>0&&gap<(Number(state.rules?.splitGap)||0)*60)return false;
    }
    const all=[...ds,sh].sort((a,b)=>a.start-b.start);let runStart=null,lastEnd=null;
    for(const x of all){
      if(runStart==null){runStart=x.start;lastEnd=x.end;continue}
      if(x.start===lastEnd){lastEnd=x.end;if((lastEnd-runStart)/60>(Number(state.rules?.maxContinuous)||10)+.001)return false}
      else{runStart=x.start;lastEnd=x.end}
    }
    const days=personDays(assign,s.id);
    if(!days.has(sh.day)){
      if(days.size>=(s.maxDays??5))return false;
      const next=new Set(days);next.add(sh.day);
      if(state.rules?.twoOff!==false&&!twoOffOk(next))return false;
    }
    if(s.contractType==='contracted'&&Number(s.targetHours)>0&&personHours(assign,s.id)+hours(sh.start,sh.end)>Number(s.targetHours)+(Number(state.rules?.maxOT)||0)+.001)return false;
    return true;
  }

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
  function managerPeakScore(state,assign){
    let score=0;
    for(const day of ['Fri','Sat'])for(let t=17*60;t<21*60;t+=30){
      const managers=new Set(assign.filter(x=>x.day===day&&x.staffId&&x.start<=t&&x.end>=t+30&&state.staff.find(s=>s.id===x.staffId)?.isManager).map(x=>x.staffId));
      score+=Math.min(3,managers.size);
    }
    return score;
  }
  function coreSaturdayCount(state,assign){
    return state.staff.filter(isCore).filter(s=>assign.some(x=>x.staffId===s.id&&x.day==='Sat'&&x.start<21*60&&x.end>17*60)).length;
  }
  function zeroHours(state,assign){return assign.filter(x=>x.staffId&&state.staff.find(s=>s.id===x.staffId)?.contractType==='zeroHours').reduce((z,x)=>z+hours(x.start,x.end),0)}
  function missingHours(assign){return assign.filter(x=>!x.staffId).reduce((z,x)=>z+hours(x.start,x.end),0)}
  function deficit(state,assign){return state.staff.filter(s=>s.contractType==='contracted'&&Number(s.targetHours)>0).reduce((z,s)=>z+Math.max(0,Number(s.targetHours)-personHours(assign,s.id)),0)}
  function quality(state,assign){return {missing:missingHours(assign),manager:managerPeakScore(state,assign),core:coreSaturdayCount(state,assign),zero:zeroHours(state,assign),deficit:deficit(state,assign)}}
  function better(a,b){
    if(a.missing!==b.missing)return a.missing<b.missing;
    if(a.manager!==b.manager)return a.manager>b.manager;
    if(a.core!==b.core)return a.core>b.core;
    if(Math.abs(a.zero-b.zero)>.001)return a.zero<b.zero;
    if(Math.abs(a.deficit-b.deficit)>.001)return a.deficit<b.deficit;
    return false;
  }
  function safe(state,assign,baseline){
    if(!openCloseValid(state,assign))return false;
    const q=quality(state,assign);
    return q.manager>=baseline.manager&&q.core>=baseline.core;
  }

  function contractedOrder(state,assign,sh){
    return state.staff.filter(s=>s.contractType==='contracted'&&canAssign(state,s,sh,assign)).sort((a,b)=>{
      const da=Math.max(0,Number(a.targetHours||0)-personHours(assign,a.id));
      const db=Math.max(0,Number(b.targetHours||0)-personHours(assign,b.id));
      if(a.isManager!==b.isManager&&(['Fri','Sat'].includes(sh.day)&&sh.start<21*60&&sh.end>17*60))return a.isManager?-1:1;
      return db-da;
    });
  }
  function replacementOrder(state,assign,sh,excludeId){
    return state.staff.filter(s=>s.id!==excludeId&&canAssign(state,s,sh,assign)).sort((a,b)=>{
      if(a.contractType!==b.contractType)return a.contractType==='contracted'?-1:1;
      const da=Math.max(0,Number(a.targetHours||0)-personHours(assign,a.id));
      const db=Math.max(0,Number(b.targetHours||0)-personHours(assign,b.id));
      if(a.isManager!==b.isManager&&(['Fri','Sat'].includes(sh.day)&&sh.start<21*60&&sh.end>17*60))return a.isManager?-1:1;
      return db-da;
    });
  }

  function applyChange(assign,changes){for(const [sh,id] of changes)sh.staffId=id}
  function snapshot(changes){return changes.map(([sh])=>[sh,sh.staffId])}
  function restore(snap){for(const [sh,id] of snap)sh.staffId=id}

  function fillUnfilled(state,assign){
    let changed=false;
    for(let pass=0;pass<4;pass++){
      let passChanged=false;
      const targets=assign.filter(x=>!x.staffId).sort((a,b)=>hours(b.start,b.end)-hours(a.start,a.end));
      for(const target of targets){
        const before=quality(state,assign);
        const direct=contractedOrder(state,assign,target)[0];
        if(direct){
          const snap=snapshot([[target,direct.id]]);applyChange(assign,[[target,direct.id]]);
          const after=quality(state,assign);
          if(safe(state,assign,before)&&better(after,before)){passChanged=changed=true;continue}
          restore(snap);
        }
        const contracted=state.staff.filter(s=>s.contractType==='contracted'&&skillOk(s,target)&&availOk(s,target)).sort((a,b)=>Math.max(0,Number(b.targetHours||0)-personHours(assign,b.id))-Math.max(0,Number(a.targetHours||0)-personHours(assign,a.id)));
        let done=false;
        for(const c of contracted){
          const olds=assign.filter(x=>x.staffId===c.id&&x!==target).sort((a,b)=>hours(a.start,a.end)-hours(b.start,b.end));
          for(const old of olds){
            const base=assign.filter(x=>x!==old&&x!==target);
            if(!canAssign(state,c,target,base))continue;
            const tempTarget={...target,staffId:c.id};
            const repl=replacementOrder(state,[...base,tempTarget],old,c.id)[0];if(!repl)continue;
            const snap=snapshot([[target,c.id],[old,repl.id]]);applyChange(assign,[[target,c.id],[old,repl.id]]);
            const after=quality(state,assign);
            if(safe(state,assign,before)&&better(after,before)){done=passChanged=changed=true;break}
            restore(snap);
          }
          if(done)break;
        }
      }
      if(!passChanged)break;
    }
    return changed;
  }

  function reduceZeroHours(state,assign){
    let changed=false;
    for(let pass=0;pass<6;pass++){
      let passChanged=false;
      const targets=assign.filter(x=>x.staffId&&state.staff.find(s=>s.id===x.staffId)?.contractType==='zeroHours').sort((a,b)=>hours(b.start,b.end)-hours(a.start,a.end));
      for(const target of targets){
        const before=quality(state,assign);
        const direct=contractedOrder(state,assign,target).find(s=>s.id!==target.staffId);
        if(direct){
          const snap=snapshot([[target,direct.id]]);applyChange(assign,[[target,direct.id]]);
          const after=quality(state,assign);
          if(safe(state,assign,before)&&better(after,before)){passChanged=changed=true;continue}
          restore(snap);
        }
        let done=false;
        const contracted=state.staff.filter(s=>s.contractType==='contracted'&&skillOk(s,target)&&availOk(s,target)).sort((a,b)=>Math.max(0,Number(b.targetHours||0)-personHours(assign,b.id))-Math.max(0,Number(a.targetHours||0)-personHours(assign,a.id)));
        for(const c of contracted){
          const olds=assign.filter(x=>x.staffId===c.id&&x!==target).sort((a,b)=>hours(a.start,a.end)-hours(b.start,b.end));
          for(const old of olds){
            const base=assign.filter(x=>x!==old&&x!==target);
            if(!canAssign(state,c,target,base))continue;
            const tempTarget={...target,staffId:c.id};
            for(const r of replacementOrder(state,[...base,tempTarget],old,c.id)){
              const snap=snapshot([[target,c.id],[old,r.id]]);applyChange(assign,[[target,c.id],[old,r.id]]);
              const after=quality(state,assign);
              if(safe(state,assign,before)&&better(after,before)){done=passChanged=changed=true;break}
              restore(snap);
            }
            if(done)break;
          }
          if(done)break;
        }
      }
      if(!passChanged)break;
    }
    return changed;
  }

  function improveManagerPeak(state,assign){
    let changed=false;
    const targets=assign.filter(x=>x.staffId&&['Fri','Sat'].includes(x.day)&&x.start<21*60&&x.end>17*60&&!state.staff.find(s=>s.id===x.staffId)?.isManager);
    for(const target of targets){
      const before=quality(state,assign);
      const managers=state.staff.filter(s=>s.isManager&&s.contractType==='contracted'&&canAssign(state,s,target,assign.filter(x=>x!==target))).sort((a,b)=>Math.max(0,Number(b.targetHours||0)-personHours(assign,b.id))-Math.max(0,Number(a.targetHours||0)-personHours(assign,a.id)));
      for(const m of managers){
        const snap=snapshot([[target,m.id]]);applyChange(assign,[[target,m.id]]);
        const after=quality(state,assign);
        if(openCloseValid(state,assign)&&after.missing<=before.missing&&after.zero<=before.zero+.001&&after.manager>before.manager&&after.core>=before.core){changed=true;break}
        restore(snap);
      }
    }
    return changed;
  }

  function writeName(sh,state){
    const who=sh.el.querySelector('.who');if(!who)return;
    const s=state.staff.find(x=>x.id===sh.staffId);
    who.textContent=s?s.name:'— UNFILLED —';
    sh.el.classList.toggle('unfilled',!s);
  }
  function updateMetricsAndWarnings(state,assign){
    const total=assign.reduce((z,x)=>z+hours(x.start,x.end),0),missing=missingHours(assign),filled=total-missing,zero=zeroHours(state,assign),contracted=filled-zero;
    const splits=[];for(const s of state.staff)for(const d of DAYS){const a=assign.filter(x=>x.staffId===s.id&&x.day===d).sort((x,y)=>x.start-y.start);if(a.some((x,i)=>i&&x.start>a[i-1].end))splits.push(`${s.name} ${d}`)}
    const values=[total.toFixed(1)+'h',filled.toFixed(1)+'h',zero.toFixed(1)+'h',contracted.toFixed(1)+'h',assign.filter(x=>!x.staffId).length,splits.length];
    document.querySelectorAll('#metrics .metric .v').forEach((el,i)=>{if(i<values.length)el.textContent=values[i]});
    const warnings=[];
    if(!openCloseValid(state,assign))warnings.push('Manager opening/closing coverage could not be preserved.');
    if(missing>0)warnings.push(`${missing.toFixed(1)} staff-hours of required coverage remain unfilled.`);
    for(const s of state.staff.filter(isCore))if(!assign.some(x=>x.staffId===s.id&&x.day==='Sat'&&x.start<21*60&&x.end>17*60))warnings.push(`Saturday 5–9 preference not achieved for ${s.name}`);
    const peak=managerPeakScore(state,assign);warnings.push(`Important-time manager coverage score: ${peak}.`);
    document.getElementById('warnings').innerHTML=warnings.length?warnings.map(x=>`<div class="warn">⚠ ${x}</div>`):'<div class="ok">✓ All coverage is staffed with protected manager coverage and contracted-hours efficiency.</div>';
    const hint=document.getElementById('resultHint');if(hint)hint.textContent='Generated with scarcity-first assignment, repair swaps, protected manager coverage and a contracted-hours efficiency pass.';
  }

  function optimise(){
    const state=readState();if(!state?.staff)return;
    const assign=parseRendered(state);if(!assign.length)return;
    fillUnfilled(state,assign);
    improveManagerPeak(state,assign);
    reduceZeroHours(state,assign);
    fillUnfilled(state,assign);
    for(const sh of assign)writeName(sh,state);
    updateMetricsAndWarnings(state,assign);
  }

  button.onclick=function(e){
    const result=previousGenerate.call(this,e);
    setTimeout(optimise,0);
    return result;
  };
})();
