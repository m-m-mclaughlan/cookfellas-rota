(() => {
  'use strict';
  const KEY='cookfellas-smart-v2-config';
  const VERSION=5;
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

    // The hard opening rule applies to customer-facing FOH only:
    // exactly one Restaurant floor opener and one Bar FOH opener before noon.
    // Other Restaurant roles (for example pots) are preserved exactly as
    // entered, so they may start before noon when the business needs them.
    const existingOpening=source.find(r=>
      r.role===primaryRole&&r.start===start&&r.end===NOON&&Number(r.count)===1
    );

    for(const r0 of source){
      const r={...r0};
      const a=mins(r.start),b=mins(r.end);

      // Non-primary Restaurant roles such as pots/running are user-controlled.
      if(area==='restaurant'&&r.role!==primaryRole){
        out.push(r);
        continue;
      }

      if(a==null||b==null||b<=a){out.push(r);continue}

      // Remove any competing primary-role requirement that sits wholly before
      // noon. If it crosses noon, preserve its post-noon demand only.
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
    if(migrate()&&sessionStorage.getItem('cookfellas-v2-opening-v5')!=='1'){
      sessionStorage.setItem('cookfellas-v2-opening-v5','1');
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
    coverageHint.insertAdjacentHTML('afterend','<div id="openingRuleNote" class="ok" style="margin-top:-4px">Opening rule: 1 Restaurant FOH opener + 1 Bar FOH opener before 12:00. Other roles such as pots can start earlier if required. Staffing starts 11:30 Mon–Fri, 11:00 Sat–Sun.</div>');
  }

  const reset=document.getElementById('resetCoverage');
  if(reset){
    reset.addEventListener('click',()=>{
      setTimeout(()=>{
        sessionStorage.removeItem('cookfellas-v2-opening-v5');
        if(migrate())location.reload();
      },0)
    });
  }

  // Enforce only the fixed FOH opening rule before generation. User-entered
  // non-primary requirements are now left untouched and therefore persist.
  const generate=document.getElementById('generate');
  if(generate){
    generate.addEventListener('click',e=>{
      if(migrate()){
        e.stopImmediatePropagation();
        sessionStorage.removeItem('cookfellas-v2-opening-v5');
        location.reload();
      }
    },true)
  }
})();
