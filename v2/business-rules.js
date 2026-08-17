(() => {
  'use strict';
  const KEY='cookfellas-smart-v2-config';
  const VERSION=2;
  const NOON='12:00';

  function mins(t){if(!t)return null;const [h,m]=t.split(':').map(Number);return h*60+m}
  function id(){return Math.random().toString(36).slice(2,10)}

  function splitBeforeNoon(rows, role){
    const out=[];
    for(const r0 of rows||[]){
      const r={...r0};
      if(r.role!==role){out.push(r);continue}
      const a=mins(r.start),b=mins(r.end),n=12*60;
      if(a==null||b==null||b<=a){out.push(r);continue}
      if(a<n&&b<=n){out.push({...r,count:Math.min(1,Number(r.count)||0)});continue}
      if(a<n&&b>n){
        out.push({...r,id:r.id||id(),end:NOON,count:Math.min(1,Number(r.count)||0)});
        out.push({...r,id:id(),start:NOON,count:Number(r.count)||0});
        continue;
      }
      out.push(r)
    }
    return out
  }

  function migrate(){
    let raw=localStorage.getItem(KEY);if(!raw)return false;
    let s;try{s=JSON.parse(raw)}catch{return false}
    if(!s||!s.coverage)return false;
    let changed=false;
    for(const day of Object.keys(s.coverage)){
      const c=s.coverage[day];if(!c)continue;
      const beforeR=JSON.stringify(c.restaurant||[]),beforeB=JSON.stringify(c.bar||[]);
      c.restaurant=splitBeforeNoon(c.restaurant,'floor');
      c.bar=splitBeforeNoon(c.bar,'bar');
      if(JSON.stringify(c.restaurant)!==beforeR||JSON.stringify(c.bar)!==beforeB)changed=true
    }
    if((s.businessRulesVersion||0)<VERSION){s.businessRulesVersion=VERSION;changed=true}
    if(changed)localStorage.setItem(KEY,JSON.stringify(s));
    return changed
  }

  function applyAndReloadIfNeeded(){
    if(migrate()&&sessionStorage.getItem('cookfellas-v2-opening-migrated')!=='1'){
      sessionStorage.setItem('cookfellas-v2-opening-migrated','1');
      location.reload();
    }
  }

  // smart.js renders and saves synchronously before this file runs.
  applyAndReloadIfNeeded();

  // Reset Coverage recreates the built-in defaults. Re-apply the business
  // opening rule immediately afterwards so future resets remain correct.
  const reset=document.getElementById('resetCoverage');
  if(reset){
    reset.addEventListener('click',()=>{
      setTimeout(()=>{
        sessionStorage.removeItem('cookfellas-v2-opening-migrated');
        if(migrate())location.reload();
      },0)
    });
  }
})();
