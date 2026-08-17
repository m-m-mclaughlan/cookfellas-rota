(() => {
  'use strict';

  const STORAGE='cookfellas-smart-v2-config';
  const FLAG='cookfellas-v2-weekday-close-coverage-v1';
  const DAYS=['Mon','Tue','Wed','Thu'];
  const CUTOFF='21:00';
  const uid=()=>Math.random().toString(36).slice(2,10);
  const toMin=t=>{if(!t)return null;const [h,m]=String(t).split(':').map(Number);return h*60+m};

  function normaliseRole(rows, role, close){
    const cutoff=toMin(CUTOFF);
    const closeMin=toMin(close);
    const out=[];

    for(const row of rows||[]){
      if(row.role!==role){out.push(row);continue}
      const start=toMin(row.start),end=toMin(row.end);
      if(start==null||end==null){out.push(row);continue}
      if(end<=cutoff){out.push(row);continue}
      if(start<cutoff){out.push({...row,end:CUTOFF});}
      // Any portion at/after 21:00 is deliberately replaced below so that
      // the requirement is exactly one floor-trained FOH person.
    }

    if(closeMin>cutoff){
      out.push({id:uid(),role,start:CUTOFF,end:close,count:1});
    }
    return out;
  }

  function apply(force=false){
    if(!force&&localStorage.getItem(FLAG)==='1')return false;
    let state;
    try{state=JSON.parse(localStorage.getItem(STORAGE)||'null')}catch{return false}
    if(!state?.coverage||!state?.siteHours)return false;

    for(const day of DAYS){
      const close=state.siteHours?.[day]?.close||'22:30';
      const cov=state.coverage?.[day];
      if(!cov)continue;
      cov.restaurant=normaliseRole(cov.restaurant||[],'floor',close);
      cov.bar=normaliseRole(cov.bar||[],'bar',close);
    }

    localStorage.setItem(STORAGE,JSON.stringify(state));
    localStorage.setItem(FLAG,'1');
    return true;
  }

  if(apply(false)){
    location.reload();
    return;
  }

  // Keep Reset coverage aligned with the new Mon–Thu closing requirement,
  // even though the underlying legacy default coverage still uses the older
  // late-evening counts.
  const reset=document.getElementById('resetCoverage');
  if(reset){
    reset.addEventListener('click',()=>{
      setTimeout(()=>{
        if(apply(true))location.reload();
      },0);
    });
  }
})();
