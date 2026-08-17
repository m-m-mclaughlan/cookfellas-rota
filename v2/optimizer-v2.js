(() => {
  'use strict';

  const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const LEVELS = ['pots','running','floor'];
  const KEY = 'cookfellas-smart-v2-config';
  const CORE_SAT = new Set(['mark','fran','tyler']);
  const generateButton = document.getElementById('generate');
  if (!generateButton) return;

  const toMin = t => { if (!t) return null; const [h,m] = t.split(':').map(Number); return h*60+m; };
  const pretty = m => { const h=Math.floor(m/60), n=m%60, hh=h>12?h-12:h===0?12:h; return `${hh}${n?':'+String(n).padStart(2,'0'):''}`; };
  const hours = (a,b) => (b-a)/60;
  const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const readState = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };
  const staffName = s => String(s?.name || '').trim().toLowerCase();
  const isCore = s => CORE_SAT.has(staffName(s));
  const overlaps = (shift,a,b) => shift.start < b && shift.end > a;
  const saturdayPeak = shift => shift.day === 'Sat' && overlaps(shift,17*60,21*60);
  const fridayPeak = shift => shift.day === 'Fri' && overlaps(shift,17*60,21*60);

  function coverageProfile(state,day,area,role){
    const rows=(state.coverage?.[day]?.[area]||[]).filter(r=>r.role===role&&Number(r.count)>0);
    if(!rows.length)return null;
    let start=Math.min(...rows.map(r=>toMin(r.start))), end=Math.max(...rows.map(r=>toMin(r.end)));
    if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return null;
    start=Math.floor(start/30)*30; end=Math.ceil(end/30)*30;
    const seg=[];
    for(let t=start;t<end;t+=30){
      let need=0;
      for(const r of rows){const a=toMin(r.start),b=toMin(r.end);if(a<=t&&b>=t+30)need=Math.max(need,Number(r.count)||0)}
      seg.push({start:t,end:t+30,need});
    }
    return {rows,start,end,seg};
  }

  function splitRun(start,end,boundaries,maxHours){
    const max=maxHours*60;
    if(end-start<=max)return [[start,end]];
    const out=[];let cur=start;
    while(end-cur>max){
      const target=cur+max*.7;
      const opts=boundaries.filter(x=>x>cur+150&&x<end-150&&x<=cur+max).sort((a,b)=>Math.abs(a-target)-Math.abs(b-target));
      const cut=opts[0]||cur+max;out.push([cur,cut]);cur=cut;
    }
    out.push([cur,end]);return out;
  }

  function generateShifts(state){
    const shifts=[];
    for(const day of DAYS)for(const area of ['restaurant','bar']){
      const roles=area==='bar'?['bar']:['floor','running','pots'];
      for(const role of roles){
        const p=coverageProfile(state,day,area,role);if(!p)continue;
        const maxNeed=Math.max(0,...p.seg.map(x=>x.need));
        const boundaries=[...new Set(p.rows.flatMap(r=>[toMin(r.start),toMin(r.end)]).filter(Number.isFinite))];
        for(let layer=1;layer<=maxNeed;layer++){
          let run=null;
          for(const s of [...p.seg,{start:p.end,end:p.end,need:0}]){
            if(s.need>=layer&&run==null)run=s.start;
            if(s.need<layer&&run!=null){
              for(const [a,b] of splitRun(run,s.start,boundaries,Number(state.rules?.maxContinuous)||10)){
                shifts.push({id:Math.random().toString(36).slice(2,10),day,area,role,start:a,end:b,layer,staffId:null});
              }
              run=null;
            }
          }
        }
      }
    }
    return shifts;
  }

  const levelOk=(s,shift)=>shift.area==='bar'
    ? LEVELS.indexOf(s.level)>=LEVELS.indexOf('floor')
    : LEVELS.indexOf(s.level)>=LEVELS.indexOf(shift.role);

  function availOk(s,shift){
    const v=s.availableDays?.[shift.day]||'full';
    if(v==='none')return false;
    if(v==='full')return true;
    if(v==='am')return shift.end<=17*60;
    if(v==='pm')return shift.start>=17*60;
    return true;
  }

  const assignmentHours=(assign,id)=>assign.filter(x=>x.staffId===id).reduce((z,x)=>z+hours(x.start,x.end),0);
  const workedDays=(assign,id)=>new Set(assign.filter(x=>x.staffId===id).map(x=>x.day));
  const dayShifts=(assign,id,day)=>assign.filter(x=>x.staffId===id&&x.day===day).sort((a,b)=>a.start-b.start);

  function twoOffOk(days){
    for(let i=0;i<DAYS.length;i++)if(!days.has(DAYS[i])&&!days.has(DAYS[(i+1)%DAYS.length]))return true;
    return false;
  }

  function canAssign(state,s,shift,assign){
    if(!levelOk(s,shift)||!availOk(s,shift))return false;
    const ds=dayShifts(assign,s.id,shift.day);
    for(const x of ds){
      if(shift.start<x.end&&x.start<shift.end)return false;
      const gap=shift.start>=x.end?shift.start-x.end:x.start-shift.end;
      if(gap>0&&gap<(Number(state.rules?.splitGap)||0)*60)return false;
    }
    const all=[...ds,shift].sort((a,b)=>a.start-b.start);let continuousStart=null,lastEnd=null;
    for(const x of all){
      if(continuousStart==null){continuousStart=x.start;lastEnd=x.end;continue}
      if(x.start===lastEnd){lastEnd=x.end;if((lastEnd-continuousStart)/60>(Number(state.rules?.maxContinuous)||10)+.001)return false}
      else{continuousStart=x.start;lastEnd=x.end}
    }
    const days=workedDays(assign,s.id);
    if(!days.has(shift.day)){
      if(days.size>=(s.maxDays??5))return false;
      const next=new Set(days);next.add(shift.day);
      if(state.rules?.twoOff!==false&&!twoOffOk(next))return false;
    }
    if(s.contractType==='contracted'&&Number(s.targetHours)>0){
      if(assignmentHours(assign,s.id)+hours(shift.start,shift.end)>Number(s.targetHours)+(Number(state.rules?.maxOT)||0)+.001)return false;
    }
    return true;
  }

  const basicEligible=(state,s,shift)=>levelOk(s,shift)&&availOk(s,shift);
  const basicPoolCount=(state,shift)=>state.staff.filter(s=>basicEligible(state,s,shift)).length;

  function peakRank(shift){
    if(saturdayPeak(shift))return 0;
    if(fridayPeak(shift))return 1;
    if(shift.day==='Sat')return 2;
    if(shift.day==='Sun')return 3;
    if(shift.day==='Fri')return 4;
    return 5;
  }

  function shiftCompare(state,a,b){
    const ea=basicPoolCount(state,a),eb=basicPoolCount(state,b);
    if(ea!==eb)return ea-eb;
    const pa=peakRank(a),pb=peakRank(b);if(pa!==pb)return pa-pb;
    const da=b.end-b.start-(a.end-a.start);if(da)return da;
    return DAYS.indexOf(a.day)-DAYS.indexOf(b.day)||a.start-b.start;
  }

  function hasSaturdayPeak(assign,s){return assign.some(x=>x.staffId===s.id&&saturdayPeak(x));}

  function scoreStaff(state,s,shift,assign){
    const dur=hours(shift.start,shift.end),h=assignmentHours(assign,s.id),days=workedDays(assign,s.id),same=days.has(shift.day),ds=dayShifts(assign,s.id,shift.day);let score=0;
    if(s.contractType==='contracted'&&Number(s.targetHours)>0){const deficit=Math.max(0,Number(s.targetHours)-h);score-=Math.min(deficit,dur)*1000;score+=Math.max(0,h+dur-Number(s.targetHours))*80}else score+=h*3;
    if(same)score-=180;else score+=days.size*25;
    if(ds.length){const minGap=Math.min(...ds.map(x=>Math.max(0,shift.start>=x.end?shift.start-x.end:x.start-shift.end)));if(minGap===0)score-=120;else score+=220}
    if(Number(s.preferredMinShift)>0&&dur<Number(s.preferredMinShift)&&!same)score+=(Number(s.preferredMinShift)-dur)*160;
    if(s.wantedDays!=null&&!same&&days.size>=Number(s.wantedDays))score+=350;
    const di=DAYS.indexOf(shift.day),prev=DAYS[(di+6)%7],next=DAYS[(di+1)%7];
    const prevLate=assign.some(x=>x.staffId===s.id&&x.day===prev&&x.end>=21*60),nextEarly=assign.some(x=>x.staffId===s.id&&x.day===next&&x.start<12*60);
    if(shift.start<12*60&&prevLate)score+=500;if(shift.end>=21*60&&nextEarly)score+=500;
    if(shift.area==='bar')score+=s.isBarStaff?-140:90;else score+=s.isBarStaff?70:-60;

    if(saturdayPeak(shift)){
      if(isCore(s))score+=hasSaturdayPeak(assign,s)?-700:-3200;
      else score+=420;
    }
    return score;
  }

  function managerCoverageValid(state,assign,allShifts){
    for(const day of DAYS){
      if(!allShifts.some(x=>x.day===day))continue;
      for(const kind of ['open','close']){
        const time=toMin(state.siteHours?.[day]?.[kind]);if(time==null)continue;
        const ok=assign.some(x=>x.day===day&&x.staffId&&(kind==='open'?x.start<=time&&x.end>time:x.start<time&&x.end>=time)&&state.staff.find(s=>s.id===x.staffId)?.isManager);
        if(!ok)return false;
      }
    }
    return true;
  }

  function assignManagers(state,shifts,assigned,warnings){
    const managers=state.staff.filter(s=>s.isManager);
    const reqs=[];
    for(const day of DAYS)for(const kind of ['open','close']){
      const time=toMin(state.siteHours?.[day]?.[kind]);if(time==null)continue;
      const covering=shifts.filter(x=>x.day===day&&(kind==='open'?x.start<=time&&x.end>time:x.start<time&&x.end>=time));
      if(!covering.length){if(shifts.some(x=>x.day===day))warnings.push(`${day}: no generated shift covers site ${kind}`);continue}
      const pool=new Set();for(const sh of covering)for(const m of managers)if(basicEligible(state,m,sh))pool.add(m.id);
      reqs.push({day,kind,time,covering,pool:pool.size,weekend:day==='Sat'?0:day==='Fri'?1:2});
    }
    reqs.sort((a,b)=>a.pool-b.pool||a.weekend-b.weekend||(a.kind==='close'?-1:1));

    for(const req of reqs){
      if(req.covering.some(x=>x.staffId&&state.staff.find(s=>s.id===x.staffId)?.isManager))continue;
      let best=null;
      for(const sh of req.covering){
        if(sh.staffId)continue;
        for(const m of managers){
          if(!canAssign(state,m,sh,assigned))continue;
          const sc=scoreStaff(state,m,sh,assigned)+(sh.area==='restaurant'?-20:0);
          if(!best||sc<best.sc)best={sh,m,sc};
        }
      }
      if(best){best.sh.staffId=best.m.id;assigned.push(best.sh)}else warnings.push(`${req.day}: could not place a manager for site ${req.kind}`);
    }
  }

  function directFill(state,target,assigned){
    const candidates=state.staff.filter(s=>canAssign(state,s,target,assigned)).sort((a,b)=>scoreStaff(state,a,target,assigned)-scoreStaff(state,b,target,assigned));
    if(!candidates.length)return false;
    target.staffId=candidates[0].id;assigned.push(target);return true;
  }

  function tryOneHopSwap(state,target,assigned,allShifts){
    const candidates=state.staff.filter(s=>basicEligible(state,s,target)).sort((a,b)=>{
      if(saturdayPeak(target)&&isCore(a)!==isCore(b))return isCore(a)?-1:1;
      return scoreStaff(state,a,target,assigned)-scoreStaff(state,b,target,assigned);
    });
    for(const s of candidates){
      const owned=assigned.filter(x=>x.staffId===s.id).sort((a,b)=>{
        const pa=saturdayPeak(a)?1:0,pb=saturdayPeak(b)?1:0;if(pa!==pb)return pa-pb;
        return basicPoolCount(state,b)-basicPoolCount(state,a);
      });
      for(const old of owned){
        const base=assigned.filter(x=>x!==old);
        if(!canAssign(state,s,target,base))continue;
        const targetSim={...target,staffId:s.id};
        const repl=state.staff.filter(r=>r.id!==s.id&&canAssign(state,r,old,[...base,targetSim])).sort((a,b)=>scoreStaff(state,a,old,[...base,targetSim])-scoreStaff(state,b,old,[...base,targetSim]));
        for(const r of repl){
          const oldSim={...old,staffId:r.id};
          if(!managerCoverageValid(state,[...base,targetSim,oldSim],allShifts))continue;
          old.staffId=r.id;target.staffId=s.id;assigned.push(target);return true;
        }
      }
    }
    return false;
  }

  function repairUnfilled(state,shifts,assigned){
    let changed=true,passes=0;
    while(changed&&passes++<3){
      changed=false;
      const unfilled=shifts.filter(x=>!x.staffId).sort((a,b)=>shiftCompare(state,a,b));
      for(const target of unfilled){
        if(directFill(state,target,assigned)){changed=true;continue}
        if(tryOneHopSwap(state,target,assigned,shifts)){changed=true;continue}
      }
    }
  }

  function promoteSaturdayCore(state,shifts,assigned){
    const core=state.staff.filter(isCore);
    for(const s of core){
      if(hasSaturdayPeak(assigned,s))continue;
      const peak=shifts.filter(saturdayPeak).sort((a,b)=>{
        const az=a.staffId&&state.staff.find(q=>q.id===a.staffId)?.contractType==='zeroHours'?0:1;
        const bz=b.staffId&&state.staff.find(q=>q.id===b.staffId)?.contractType==='zeroHours'?0:1;
        return az-bz||shiftCompare(state,a,b);
      });

      let placed=false;
      for(const target of peak){
        const occupant=state.staff.find(q=>q.id===target.staffId);
        if(!target.staffId||isCore(occupant))continue;
        const base=assigned.filter(x=>x!==target);
        if(!canAssign(state,s,target,base))continue;
        const sim={...target,staffId:s.id};
        if(!managerCoverageValid(state,[...base,sim],shifts))continue;
        target.staffId=s.id;placed=true;break;
      }
      if(placed)continue;

      const oldChoices=assigned.filter(x=>x.staffId===s.id&&!saturdayPeak(x)).sort((a,b)=>basicPoolCount(state,b)-basicPoolCount(state,a));
      for(const target of peak){
        const occupant=state.staff.find(q=>q.id===target.staffId);
        if(!occupant||isCore(occupant))continue;
        for(const old of oldChoices){
          const base=assigned.filter(x=>x!==target&&x!==old);
          if(!canAssign(state,s,target,base))continue;
          const targetSim={...target,staffId:s.id};
          if(!canAssign(state,occupant,old,[...base,targetSim]))continue;
          const oldSim={...old,staffId:occupant.id};
          if(!managerCoverageValid(state,[...base,targetSim,oldSim],shifts))continue;
          target.staffId=s.id;old.staffId=occupant.id;placed=true;break;
        }
        if(placed)break;
      }
    }
  }

  function assignShifts(state,shifts){
    const assigned=[],warnings=[];
    assignManagers(state,shifts,assigned,warnings);
    const remaining=shifts.filter(x=>!x.staffId).sort((a,b)=>shiftCompare(state,a,b));
    for(const sh of remaining)directFill(state,sh,assigned);

    repairUnfilled(state,shifts,assigned);
    promoteSaturdayCore(state,shifts,assigned);
    repairUnfilled(state,shifts,assigned);

    for(const day of DAYS)for(const kind of ['open','close']){
      const time=toMin(state.siteHours?.[day]?.[kind]);if(time==null)continue;
      const ok=assigned.some(x=>x.day===day&&x.staffId&&(kind==='open'?x.start<=time&&x.end>time:x.start<time&&x.end>=time)&&state.staff.find(s=>s.id===x.staffId)?.isManager);
      if(!ok&&shifts.some(x=>x.day===day))warnings.push(`${day}: no manager covering site ${kind}`);
    }

    for(const s of state.staff.filter(isCore)){
      const eligible=shifts.some(x=>saturdayPeak(x)&&basicEligible(state,s,x));
      if(eligible&&!hasSaturdayPeak(assigned,s))warnings.push(`Saturday 5–9 preference not achieved for ${s.name}`);
    }
    return {shifts,warnings};
  }

  function mergeDisplay(shifts){
    const out=[],groups={};
    for(const x of shifts){
      const key=x.staffId?`${x.day}|${x.area}|${x.staffId}`:`${x.day}|${x.area}|_${x.role}_${x.layer}_${x.id}`;
      (groups[key]??=[]).push(x);
    }
    for(const arr of Object.values(groups)){
      arr.sort((a,b)=>a.start-b.start);let cur=null;
      for(const x of arr){
        if(cur&&cur.staffId&&cur.end===x.start){
          cur.end=x.end;cur.parts.push(x.id);
          const roles=new Set(String(cur.role).split(' / ').concat([x.role]));cur.role=[...roles].join(' / ');
        }else{cur={...x,parts:[x.id]};out.push(cur)}
      }
    }
    return out.sort((a,b)=>DAYS.indexOf(a.day)-DAYS.indexOf(b.day)||a.start-b.start||a.area.localeCompare(b.area));
  }

  function validateCoverage(state,shifts){
    let missing=0;
    for(const day of DAYS)for(const area of ['restaurant','bar']){
      const roles=area==='bar'?['bar']:['floor','running','pots'];
      for(const role of roles){
        const p=coverageProfile(state,day,area,role);if(!p)continue;
        for(const seg of p.seg){
          if(!seg.need)continue;
          const n=shifts.filter(x=>x.day===day&&x.area===area&&x.role===role&&x.start<=seg.start&&x.end>=seg.end&&x.staffId).length;
          missing+=Math.max(0,seg.need-n)*.5;
        }
      }
    }
    return missing;
  }

  function renderResults(state,res){
    const shifts=res.shifts,display=mergeDisplay(shifts),missingHours=validateCoverage(state,shifts);
    const total=shifts.reduce((z,x)=>z+hours(x.start,x.end),0);
    const filled=shifts.filter(x=>x.staffId).reduce((z,x)=>z+hours(x.start,x.end),0);
    const zero=shifts.filter(x=>x.staffId&&state.staff.find(s=>s.id===x.staffId)?.contractType==='zeroHours').reduce((z,x)=>z+hours(x.start,x.end),0);
    const contracted=filled-zero,unfilled=shifts.filter(x=>!x.staffId).length;
    const splitDays=[];for(const s of state.staff)for(const d of DAYS){const a=dayShifts(shifts,s.id,d);if(a.length>1&&a.some((x,i)=>i&&x.start>a[i-1].end))splitDays.push(`${s.name} ${d}`)}

    const panel=document.getElementById('resultsPanel');panel.style.display='block';
    document.getElementById('resultHint').textContent=`Generated ${shifts.length} coverage-backed shift segments using scarcity-first assignment, repair swaps and Saturday management preference.`;
    const metricData=[['Required labour',total.toFixed(1)+'h'],['Filled labour',filled.toFixed(1)+'h'],['Zero-hours',zero.toFixed(1)+'h'],['Contracted used',contracted.toFixed(1)+'h'],['Unfilled shifts',unfilled],['Split days',splitDays.length]];
    document.getElementById('metrics').innerHTML=metricData.map(([k,v])=>`<div class="metric"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
    const msgs=[...new Set(res.warnings)];if(missingHours>0)msgs.push(`${missingHours.toFixed(1)} staff-hours of required coverage remain unfilled.`);
    document.getElementById('warnings').innerHTML=msgs.length?msgs.map(x=>`<div class="warn">⚠ ${esc(x)}</div>`).join(''):`<div class="ok">✓ All coverage blocks are staffed and site opening/closing has manager coverage.</div>`;

    const grid=document.getElementById('rotaGrid');grid.innerHTML='';
    for(const day of DAYS){
      const col=document.createElement('div');col.className='dayResult';col.innerHTML=`<h3>${day}</h3>`;
      for(const area of ['restaurant','bar']){
        col.insertAdjacentHTML('beforeend',`<div class="areaLabel">${area}</div>`);
        const arr=display.filter(x=>x.day===day&&x.area===area);
        if(!arr.length)col.insertAdjacentHTML('beforeend','<div class="role">No shifts</div>');
        for(const x of arr){
          const s=state.staff.find(q=>q.id===x.staffId);
          col.insertAdjacentHTML('beforeend',`<div class="shift ${area==='bar'?'bar':''} ${x.staffId?'':'unfilled'}"><div class="time">${pretty(x.start)}–${pretty(x.end)}</div><div class="who">${s?esc(s.name):'— UNFILLED —'}</div><div class="role">${x.role==='bar'?'Bar FOH':esc(x.role)}</div></div>`);
        }
      }
      grid.appendChild(col);
    }
    document.getElementById('download').disabled=false;
    panel.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function generate(){
    const state=readState();
    if(!state?.coverage||!Array.isArray(state.staff)){alert('Could not read the V2 rota settings.');return}
    const shifts=generateShifts(state),res=assignShifts(state,shifts);renderResults(state,res);
  }

  generateButton.onclick=generate;
})();