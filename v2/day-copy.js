(() => {
  'use strict';
  const KEY='cookfellas-smart-v2-config';
  const CLIP='cookfellas-smart-v2-day-clipboard';
  const STARTS={Mon:'11:30',Tue:'11:30',Wed:'11:30',Thu:'11:30',Fri:'11:30',Sat:'11:00',Sun:'11:00'};
  const uid=()=>Math.random().toString(36).slice(2,10);
  const clone=x=>JSON.parse(JSON.stringify(x));

  const activeDay=()=>document.querySelector('.daytab.active')?.textContent?.trim()||'Mon';
  const read=key=>{try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}};
  const write=(key,val)=>localStorage.setItem(key,JSON.stringify(val));
  const freshRows=rows=>(rows||[]).map(r=>({...clone(r),id:uid()}));

  function ensureBar(){
    if(document.getElementById('dayCopyBar'))return;
    const tabs=document.getElementById('dayTabs');
    if(!tabs)return;
    const bar=document.createElement('div');
    bar.id='dayCopyBar';
    bar.className='actions';
    bar.style.margin='0 0 10px 0';
    bar.innerHTML='<button class="btn small" id="copyDay">Copy day</button><button class="btn small" id="pasteDay">Paste day</button><span class="badge" id="dayCopyStatus">No day copied</span>';
    tabs.insertAdjacentElement('afterend',bar);
    document.getElementById('copyDay').addEventListener('click',copyDay);
    document.getElementById('pasteDay').addEventListener('click',pasteDay);
    updateLabels();
    new MutationObserver(updateLabels).observe(tabs,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  }

  function updateLabels(){
    const day=activeDay(),clip=read(CLIP);
    const c=document.getElementById('copyDay'),p=document.getElementById('pasteDay'),s=document.getElementById('dayCopyStatus');
    if(!c||!p||!s)return;
    c.textContent=`Copy ${day}`;
    p.textContent=`Paste to ${day}`;
    p.disabled=!clip;
    p.style.opacity=clip?'1':'.45';
    s.textContent=clip?`Copied ${clip.source}`:'No day copied';
  }

  function copyDay(){
    const day=activeDay(),state=read(KEY);
    if(!state?.coverage?.[day])return;
    write(CLIP,{source:day,coverage:clone(state.coverage[day]),close:state.siteHours?.[day]?.close||'22:30'});
    updateLabels();
  }

  function pasteDay(){
    const target=activeDay(),clip=read(CLIP),state=read(KEY);
    if(!clip||!state?.coverage?.[target])return;
    state.coverage[target]={
      restaurant:freshRows(clip.coverage?.restaurant),
      bar:freshRows(clip.coverage?.bar)
    };
    state.siteHours=state.siteHours||{};
    state.siteHours[target]={...(state.siteHours[target]||{}),open:STARTS[target],close:clip.close||state.siteHours[target]?.close||'22:30'};
    write(KEY,state);
    sessionStorage.removeItem('cookfellas-v2-opening-v3');
    location.reload();
  }

  ensureBar();
})();
