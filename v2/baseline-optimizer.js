(() => {
  'use strict';

  const KEY='cookfellas-smart-v2-config';
  const DAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const button=document.getElementById('generate');
  const download=document.getElementById('download');
  if(!button)return;

  const toMin=t=>{if(!t)return null;const [h,m]=String(t).split(':').map(Number);return h*60+m};
  const pretty=m=>{const h=Math.floor(m/60),n=m%60,hh=h>12?h-12:h===0?12:h;return `${hh}${n?':'+String(n).padStart(2,'0'):''}`};
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  const hours=(a,b)=>(b-a)/60;
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

  function scheduleDay(state,lanes,day,weeklyHours){
    const staff=state.staff||[];
    const dayLanes=lanes.filter(l=>l.day===day);
    const times=[...new Set(dayLanes.flatMap(l=>l.blocks.filter(b=>b.need>0).map(b=>b.start)))].sort((a,b)=>a-b);
    const pieces=[];
    const prevByLane=new Map();

    for(const t of times){
      const active=dayLanes.map((lane,idx)=>({lane,idx,block:lane.blocks.find(b=>b.start===t)})).filter(x=>x.block&&x.block.need>0);
      const demand=active.reduce((z,x)=>z+x.block.need,0);
      if(demand>staff.length){
        return {ok:false,problem:`${day} ${pretty(t)}–${pretty(t+30)} needs ${demand} people at once but only ${staff.length} are on the roster.`};
      }

      const used=new Set();
      const chosenByLane=new Map();

      // Keep people on the same lane first. This is not a staffing constraint;
      // it simply avoids unnecessary half-hour handovers in the baseline.
      for(const x of active){
        const key=`${x.lane.area}|${x.lane.role}`;
        const prev=(prevByLane.get(key)||[]).filter(id=>staff.some(s=>s.id===id));
        const keep=[];
        for(const id of prev){
          if(keep.length>=x.block.need)break;
          if(!used.has(id)){keep.push(id);used.add(id)}
        }
        chosenByLane.set(key,keep);
      }

      // Fill every remaining required position from any person who is not
      // already working somewhere else in this same half-hour.
      for(const x of active){
        const key=`${x.lane.area}|${x.lane.role}`;
        const chosen=chosenByLane.get(key)||[];
        while(chosen.length<x.block.need){
          const candidates=staff.filter(s=>!used.has(s.id)).sort((a,b)=>(weeklyHours.get(a.id)||0)-(weeklyHours.get(b.id)||0)||String(a.name).localeCompare(String(b.name)));
          const s=candidates[0];
          if(!s)return {ok:false,problem:`${day} ${pretty(t)}–${pretty(t+30)} could not be assigned without double-booking somebody.`};
          chosen.push(s.id);used.add(s.id);
        }
        chosenByLane.set(key,chosen);
        for(const id of chosen){
          pieces.push({day,area:x.lane.area,role:x.lane.role,start:t,end:t+30,staffId:id});
          weeklyHours.set(id,(weeklyHours.get(id)||0)+.5);
        }
      }

      prevByLane.clear();
      for(const [key,ids] of chosenByLane)prevByLane.set(key,ids.slice());
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

  function renderFailure(problem){
    if(download)download.disabled=true;
    const panel=document.getElementById('resultsPanel');
    panel.style.display='block';
    document.getElementById('resultHint').textContent='Baseline could not satisfy coverage even with all business and staff constraints removed.';
    document.getElementById('metrics').innerHTML='<div class="metric"><div class="k">Rota status</div><div class="v">IMPOSSIBLE</div></div>';
    document.getElementById('warnings').innerHTML=`<div class="warn"><strong>Coverage-only failure:</strong> ${esc(problem)}</div>`;
    document.getElementById('rotaGrid').innerHTML='';
    panel.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function renderSuccess(state,lanes,assign){
    const panel=document.getElementById('resultsPanel');panel.style.display='block';
    const required=requiredHours(lanes);
    document.getElementById('resultHint').textContent='Baseline mode: coverage only. Skills, availability, contracts, manager rules, workday limits, split rules and preferences are not being applied.';
    document.getElementById('metrics').innerHTML=[
      ['Required labour',required.toFixed(1)+'h'],
      ['Scheduled labour',required.toFixed(1)+'h'],
      ['Unfilled coverage','0.0h'],
      ['Active constraints','0']
    ].map(([k,v])=>`<div class="metric"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
    document.getElementById('warnings').innerHTML='<div class="ok">✓ BASELINE PASSED — every required half-hour block is staffed. No business/staff optimisation constraints were applied.</div>';

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
          col.insertAdjacentHTML('beforeend',`<div class="shift ${area==='bar'?'bar':''}"><div class="time">${pretty(x.start)}–${pretty(x.end)}</div><div class="who">${esc(s?.name||'Staff')}</div><div class="role">${esc(role)}</div></div>`);
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
    renderSuccess(state,lanes,mergePieces(pieces));
  }

  button.onclick=generate;
})();
