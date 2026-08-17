(() => {
  'use strict';

  const KEY='cookfellas-smart-v2-config';
  const DAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const LEVELS=['pots','running','floor'];
  const CORE=new Set(['mark','fran','tyler']);
  const button=document.getElementById('generate');
  const download=document.getElementById('download');
  if(!button||typeof button.onclick!=='function')return;

  const previousGenerate=button.onclick;
  const toMin=t=>{if(!t)return null;const [h,m]=String(t).split(':').map(Number);return h*60+m};
  const pretty=m=>{const h=Math.floor(m/60),n=m%60,hh=h>12?h-12:h===0?12:h;return `${hh}${n?':'+String(n).padStart(2,'0'):''}`};
  const hours=(a,b)=>(b-a)/60;
  const name=s=>String(s?.name||'').trim().toLowerCase();
  const isCore=s=>CORE.has(name(s));
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uid=()=>Math.random().toString(36).slice(2,10);
  const readState=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch{return null}};
  const overlaps=(a,b,c,d)=>a<d&&c<b;

  function isInvalidResult(){
    return [...document.querySelectorAll('#metrics .v')].some(x=>/INVALID|NOT FULLY STAFFED/i.test(x.textContent||''));
  }

  function profile(state,day,area,role){
    const rows=(state.coverage?.[day]?.[area]||[]).filter(r=>r.role===role&&Number(r.count)>0);
    if(!rows.length)return null;
    let start=Math.min(...rows.map(r=>toMin(r.start)).filter(Number.isFinite));
    let end=Math.max(...rows.map(r=>toMin(r.end)).filter(Number.isFinite));
    if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return null;
    start=Math.floor(start/30)*30;end=Math.ceil(end/30)*30;
    const blocks=[];
    for(let t=start;t<end;t+=30){
      let need=0;
      for(const r of rows){const a=toMin(r.start),b=toMin(r.end);if(a<=t&&b>=t+30)need=Math.max(need,Number(r.count)||0)}
      blocks.push({start:t,end:t+30,need});
    }
    return {rows,start,end,blocks};
  }

  function splitLongRun(start,end,maxHours){
    const max=Math.max(1,Number(maxHours)||10)*60;
    if(end-start<=max)return [[start,end]];
    const out=[];let cur=start;
    while(end-cur>max){
      // For an 11-hour all-day requirement, prefer a useful long 9.5h piece
      // rather than treating a 5pm coverage boundary as a shift boundary.
      let cut=Math.min(cur+570,cur+max);
      if(end-cut<60)cut=end-60;
      cut=Math.round(cut/30)*30;
      if(cut<=cur)cut=cur+max;
      out.push([cur,cut]);cur=cut;
    }
    out.push([cur,end]);return out;
  }

  function buildRequiredShifts(state){
    const shifts=[];
    for(const day of DAYS)for(const area of ['restaurant','bar']){
      const roles=area==='bar'?['bar']:['floor','running','pots'];
      for(const role of roles){
        const p=profile(state,day,area,role);if(!p)continue;
        const maxNeed=Math.max(0,...p.blocks.map(b=>b.need));
        for(let layer=1;layer<=maxNeed;layer++){
          let run=null;
          for(let i=0;i<=p.blocks.length;i++){
            const b=p.blocks[i],needed=!!b&&b.need>=layer;
            if(needed&&run==null)run=b.start;
            if(!needed&&run!=null){
              const finish=b?b.start:p.end;
              for(const [a,z] of splitLongRun(run,finish,state.rules?.maxContinuous||10)){
                shifts.push({id:uid(),day,area,role,start:a,end:z,layer,staffId:null});
              }
              run=null;
            }
          }
        }
      }
    }
    return shifts;
  }

  function skillOk(s,sh){
    if(sh.area==='bar')return LEVELS.indexOf(s.level)>=LEVELS.indexOf('floor');
    return LEVELS.indexOf(s.level)>=LEVELS.indexOf(sh.role);
  }
  function availOk(s,sh){
    const v=s.availableDays?.[sh.day]||'full';
    if(v==='none')return false;if(v==='full')return true;
    if(v==='am')return sh.end<=17*60;
    if(v==='pm')return sh.start>=17*60;
    return true;
  }
  const personShifts=(assign,id)=>assign.filter(x=>x.staffId===id).sort((a,b)=>DAYS.indexOf(a.day)-DAYS.indexOf(b.day)||a.start-b.start);
  const personHours=(assign,id)=>personShifts(assign,id).reduce((z,x)=>z+hours(x.start,x.end),0);
  const personDays=(assign,id)=>new Set(personShifts(assign,id).map(x=>x.day));
  function twoOffOk(days){for(let i=0;i<DAYS.length;i++)if(!days.has(DAYS[i])&&!days.has(DAYS[(i+1)%7]))return true;return false}

  function canAssign(state,s,sh,assign){
    if(!skillOk(s,sh)||!availOk(s,sh))return false;
    const same=assign.filter(x=>x.staffId===s.id&&x.day===sh.day).sort((a,b)=>a.start-b.start);
    for(const x of same){
      if(overlaps(sh.start,sh.end,x.start,x.end))return false;
      const gap=sh.start>=x.end?sh.start-x.end:x.start-sh.end;
      if(gap>0&&gap<(Number(state.rules?.splitGap)||0)*60)return false;
    }
    const all=[...same,sh].sort((a,b)=>a.start-b.start);let runStart=null,lastEnd=null;
    for(const x of all){
      if(runStart==null||x.start!==lastEnd){runStart=x.start;lastEnd=x.end}else lastEnd=x.end;
      if((lastEnd-runStart)/60>(Number(state.rules?.maxContinuous)||10)+.001)return false;
    }
    const days=personDays(assign,s.id);
    if(!days.has(sh.day)){
      if(days.size>=(s.maxDays??5))return false;
      const next=new Set(days);next.add(sh.day);
      if(state.rules?.twoOff!==false&&!twoOffOk(next))return false;
    }
    if(s.contractType==='contracted'&&Number(s.targetHours)>0){
      const cap=Number(s.targetHours)+(Number(state.rules?.maxOT)||0);
      if(personHours(assign,s.id)+hours(sh.start,sh.end)>cap+.001)return false;
    }
    return true;
  }

  function eventCover(sh,state,kind){
    const t=toMin(state.siteHours?.[sh.day]?.[kind]);if(t==null)return false;
    return kind==='open'?sh.start<=t&&sh.end>t:sh.start<t&&sh.end>=t;
  }
  function managerEventSatisfied(assign,state,day,kind){
    return assign.some(sh=>sh.day===day&&sh.staffId&&eventCover(sh,state,kind)&&state.staff.find(s=>s.id===sh.staffId)?.isManager);
  }
  function eventsStillPossible(assign,remaining,state){
    for(const day of DAYS)for(const kind of ['open','close']){
      if(managerEventSatisfied(assign,state,day,kind))continue;
      const possibles=remaining.filter(sh=>sh.day===day&&eventCover(sh,state,kind));
      let ok=false;
      for(const sh of possibles){
        for(const s of state.staff){if(s.isManager&&canAssign(state,s,sh,assign)){ok=true;break}}
        if(ok)break;
      }
      if(!ok)return false;
    }
    return true;
  }

  function staticEligibleCount(state,sh){return state.staff.filter(s=>skillOk(s,sh)&&availOk(s,sh)).length}
  function peakWeight(sh){
    if(sh.day==='Sat'&&sh.start<21*60&&sh.end>17*60)return 4;
    if(sh.day==='Fri'&&sh.start<21*60&&sh.end>17*60)return 3;
    if(sh.day==='Sat')return 2;
    return 1;
  }
  function candidateScore(state,s,sh,assign){
    const dur=hours(sh.start,sh.end),worked=personHours(assign,s.id),def=Math.max(0,Number(s.targetHours||0)-worked);
    let q=0;
    if(s.contractType==='contracted')q+=Number(s.targetHours)>0?Math.min(def,dur)*1000:dur*80;else q-=dur*900;
    if(sh.area==='bar')q+=s.isBarStaff?220:-40;else q+=s.isBarStaff?-35:45;
    if(sh.role==='pots'&&s.level==='floor')q-=600;
    if(sh.role==='running'&&s.level==='floor')q-=100;
    const same=assign.filter(x=>x.staffId===s.id&&x.day===sh.day);
    if(same.some(x=>x.end===sh.start||x.start===sh.end))q+=500;
    else if(same.length)q-=120;
    else q+=120;
    if(s.isManager&&(eventCover(sh,state,'open')||eventCover(sh,state,'close')))q+=1800;
    if(s.isManager&&(sh.day==='Fri'||sh.day==='Sat')&&sh.start<21*60&&sh.end>17*60)q+=500;
    if(isCore(s)&&sh.day==='Sat'&&sh.start<21*60&&sh.end>17*60)q+=3200;
    return q;
  }

  function chooseNext(state,unassigned,assign){
    let bestIndex=-1,bestCandidates=null,bestKey=null;
    for(let i=0;i<unassigned.length;i++){
      const sh=unassigned[i];
      const c=state.staff.filter(s=>canAssign(state,s,sh,assign));
      if(!c.length)return {index:i,candidates:[]};
      const unsatEvent=(eventCover(sh,state,'open')&&!managerEventSatisfied(assign,state,sh.day,'open'))||(eventCover(sh,state,'close')&&!managerEventSatisfied(assign,state,sh.day,'close'));
      const key=[c.length,unsatEvent?0:1,-peakWeight(sh),-hours(sh.start,sh.end),staticEligibleCount(state,sh)];
      if(!bestKey||key.some((v,k)=>v!==bestKey[k]&&v<bestKey[k]&&key.slice(0,k).every((x,j)=>x===bestKey[j]))){bestKey=key;bestIndex=i;bestCandidates=c}
    }
    bestCandidates.sort((a,b)=>candidateScore(state,b,unassigned[bestIndex],assign)-candidateScore(state,a,unassigned[bestIndex],assign));
    return {index:bestIndex,candidates:bestCandidates};
  }

  function completeManagerEvents(assign,state){
    for(const day of DAYS)for(const kind of ['open','close'])if(!managerEventSatisfied(assign,state,day,kind))return false;
    return true;
  }

  function solve(state,baseShifts){
    const unassigned=baseShifts.map(x=>({...x,staffId:null}));
    // Hardest days/roles first before the dynamic MRV pass. This prevents
    // easy weekday hours consuming staff needed for Fri/Sat or scarce roles.
    unassigned.sort((a,b)=>staticEligibleCount(state,a)-staticEligibleCount(state,b)||peakWeight(b)-peakWeight(a)||hours(b.start,b.end)-hours(a.start,a.end));
    const assign=[];let nodes=0;const started=performance.now();const NODE_LIMIT=450000,TIME_LIMIT=2200;

    function dfs(left){
      if(++nodes>NODE_LIMIT||performance.now()-started>TIME_LIMIT)return null;
      if(!left.length)return completeManagerEvents(assign,state)?assign.map(x=>({...x})):null;
      if(!eventsStillPossible(assign,left,state))return null;
      const {index,candidates}=chooseNext(state,left,assign);if(!candidates.length)return null;
      const sh=left[index],next=left.slice(0,index).concat(left.slice(index+1));
      for(const s of candidates){
        const placed={...sh,staffId:s.id};assign.push(placed);
        const result=dfs(next);if(result)return result;
        assign.pop();
      }
      return null;
    }
    const result=dfs(unassigned);
    return {result,nodes,elapsed:performance.now()-started};
  }

  function mergeDisplay(assign){
    const out=[],groups={};
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
  function managerAt(assign,state,day,t){return new Set(assign.filter(x=>x.day===day&&x.staffId&&x.start<=t&&x.end>t&&state.staff.find(s=>s.id===x.staffId)?.isManager).map(x=>x.staffId)).size}
  function coreSat(assign,state){return state.staff.filter(isCore).filter(s=>assign.some(x=>x.staffId===s.id&&x.day==='Sat'&&x.start<21*60&&x.end>17*60)).length}

  function renderSolution(state,assign,meta){
    const display=mergeDisplay(assign),required=assign.reduce((z,x)=>z+hours(x.start,x.end),0);
    const zh=assign.filter(x=>state.staff.find(s=>s.id===x.staffId)?.contractType==='zeroHours').reduce((z,x)=>z+hours(x.start,x.end),0);
    const contracted=required-zh,splits=splitCount(assign,state);
    const panel=document.getElementById('resultsPanel');if(panel)panel.style.display='block';
    const hint=document.getElementById('resultHint');if(hint)hint.textContent='Full required coverage found by the global feasibility solver. Coverage is locked first; staffing efficiency and shift quality are secondary.';
    const metrics=document.getElementById('metrics');if(metrics)metrics.innerHTML=[['Required labour',required.toFixed(1)+'h'],['Scheduled labour',required.toFixed(1)+'h'],['Zero-hours',zh.toFixed(1)+'h'],['Contracted used',contracted.toFixed(1)+'h'],['Unfilled coverage','0.0h'],['Split days',splits]].map(([k,v])=>`<div class="metric"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
    const warnings=document.getElementById('warnings');if(warnings){
      const core=coreSat(assign,state),fri=managerAt(assign,state,'Fri',18*60),sat=managerAt(assign,state,'Sat',18*60);
      warnings.innerHTML=`<div class="ok">✓ FULL COVERAGE GATE PASSED — every required staffing block is covered.</div><div class="warn">Global feasibility search: ${meta.nodes.toLocaleString()} nodes in ${Math.round(meta.elapsed)}ms.</div><div class="warn">Manager presence at 6pm: Fri ${fri}, Sat ${sat}. Saturday Mark/Fran/Tyler present: ${core}/3.</div>`;
    }
    const grid=document.getElementById('rotaGrid');if(!grid)return;grid.innerHTML='';
    for(const day of DAYS){
      const col=document.createElement('div');col.className='dayResult';col.innerHTML=`<h3>${day}</h3>`;
      for(const area of ['restaurant','bar']){
        col.insertAdjacentHTML('beforeend',`<div class="areaLabel">${area}</div>`);
        const arr=display.filter(x=>x.day===day&&x.area===area);
        if(!arr.length)col.insertAdjacentHTML('beforeend','<div class="role">No shifts</div>');
        for(const x of arr){const s=state.staff.find(q=>q.id===x.staffId);col.insertAdjacentHTML('beforeend',`<div class="shift ${area==='bar'?'bar':''}"><div class="time">${pretty(x.start)}–${pretty(x.end)}</div><div class="who">${esc(s?.name||'')}</div><div class="role">${x.role==='bar'?'Bar FOH':esc(x.role)}</div></div>`)}
      }
      grid.appendChild(col);
    }
    if(download)download.disabled=false;panel?.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function appendSearchFailure(meta){
    const warnings=document.getElementById('warnings');if(!warnings)return;
    warnings.insertAdjacentHTML('beforeend',`<div class="warn">Global feasibility search also failed after ${meta.nodes.toLocaleString()} nodes (${Math.round(meta.elapsed)}ms). This still does not relax required coverage; Save remains disabled.</div>`);
  }

  button.onclick=function(e){
    previousGenerate.call(this,e);
    if(!isInvalidResult())return;
    const state=readState();if(!state?.staff||!state?.coverage)return;
    const required=buildRequiredShifts(state);
    const meta=solve(state,required);
    if(meta.result)renderSolution(state,meta.result,meta);else appendSearchFailure(meta);
  };
})();
