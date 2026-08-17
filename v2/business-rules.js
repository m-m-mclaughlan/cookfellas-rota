(() => {
  'use strict';
  const KEY='cookfellas-smart-v2-config';
  const VERSION=4;
  const NOON='12:00';
  const STARTS={Mon:'11:30',Tue:'11:30',Wed:'11:30',Thu:'11:30',Fri:'11:30',Sat:'11:00',Sun:'11:00'};

  function mins(t){if(!t)return null;const [h,m]=t.split(':').map(Number);return h*60+m}
  function id(){return Math.random().toString(36).slice(2,10)}

  function normaliseArea(rows, area, day){
    const start=STARTS[day]||'11:30';
    const noon=12*60;
    const primaryRole=area==='bar'?'bar':'floor';
    const source=rows||[];
    const out=[];

    // Re-use the existing canonical opening-row ID where possible. This is
    // important: creating a new ID on every pass made migrate() report a
    // change forever, which intercepted Generate and caused a reload loop.
    const existingOpening=source.find(r=>
      r.role===primaryRole&&r.start===start&&r.end===NOON&&Number(r.count)===1
    );

    // Before noon there is exactly one setup/opening person in each area.
    // Any other requirement begins no earlier than 12:00. Post-noon counts
    // are preserved exactly as the user entered them.
    for(const r0 of source){
      const r={...r0};
      const a=mins(r.start),b=mins(r.end);
      if(a==null||b==null||b<=a){out.push(r);continue}
      if(b<=noon)continue;
      if(a<noon)r.start=NOON;
      out.push(r)
    }

    out.unshift({id:existingOpening?.id||id(),role:primaryRole,start,end:NOON,count:1});
    return out
  }

  function migrate(){
    const raw=localStorage.getItem(KEY);if(!raw)return false;
    let s;try{s=JSON.parse(raw)}catch{return false}
    if(!s||!s.coverage)return false;
    let changed=false;
    s.siteHours=s.siteHours||{};

    for(const day of Object.keys(STARTS)){
      const c=s.coverage[day];if(!c)continue;
      const start=STARTS[day];
      if(!s.siteHours[day]){s.siteHours[day]={open:start,close:'22:30'};changed=true}
      if(s.siteHours[day].open!==start){s.siteHours[day].open=start;changed=true}

      const beforeR=JSON.stringify(c.restaurant||[]),beforeB=JSON.stringify(c.bar||[]);
      c.restaurant=normaliseArea(c.restaurant,'restaurant',day);
      c.bar=normaliseArea(c.bar,'bar',day);
      if(JSON.stringify(c.restaurant)!==beforeR||JSON.stringify(c.bar)!==beforeB)changed=true
    }

    if((s.businessRulesVersion||0)<VERSION){s.businessRulesVersion=VERSION;changed=true}
    if(changed)localStorage.setItem(KEY,JSON.stringify(s));
    return changed
  }

  function reloadAfterMigration(){
    if(migrate()&&sessionStorage.getItem('cookfellas-v2-opening-v4')!=='1'){
      sessionStorage.setItem('cookfellas-v2-opening-v4','1');
      location.reload();
      return true
    }
    return false
  }

  if(reloadAfterMigration())return;

  const siteOpen=document.getElementById('siteOpen');
  if(siteOpen){
    const label=siteOpen.closest('.field')?.querySelector('label');
    if(label)label.textContent='Staffing begins / manager open';
  }
  const coverageHint=document.querySelector('.panel .hint');
  if(coverageHint&&!document.getElementById('openingRuleNote')){
    coverageHint.insertAdjacentHTML('afterend','<div id="openingRuleNote" class="ok" style="margin-top:-4px">Opening rule: 1 person in Restaurant + 1 person in Bar before 12:00. Staffing starts 11:30 Mon–Fri, 11:00 Sat–Sun.</div>');
  }

  // Reset Coverage recreates the starter defaults. Re-normalise immediately
  // afterwards so the fixed business opening rule remains intact.
  const reset=document.getElementById('resetCoverage');
  if(reset){
    reset.addEventListener('click',()=>{
      setTimeout(()=>{
        sessionStorage.removeItem('cookfellas-v2-opening-v4');
        if(migrate())location.reload();
      },0)
    });
  }

  // If a pre-noon requirement is manually edited later, enforce the hard
  // opening rule once before generation. With the canonical ID preserved,
  // a normal Generate click now passes straight through without reloading.
  const generate=document.getElementById('generate');
  if(generate){
    generate.addEventListener('click',e=>{
      if(migrate()){
        e.stopImmediatePropagation();
        sessionStorage.removeItem('cookfellas-v2-opening-v4');
        location.reload();
      }
    },true)
  }
})();
