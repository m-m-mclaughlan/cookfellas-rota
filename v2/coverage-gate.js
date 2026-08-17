(() => {
  'use strict';

  const KEY='cookfellas-smart-v2-config';
  const button=document.getElementById('generate');
  const download=document.getElementById('download');
  if(!button||typeof button.onclick!=='function')return;

  const previousGenerate=button.onclick;
  let running=false;

  function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

  function parseMissing(){
    const out=[];
    const grid=document.getElementById('rotaGrid');
    if(!grid)return out;
    for(const card of grid.querySelectorAll('.dayResult')){
      const day=card.querySelector('h3')?.textContent?.trim()||'';
      let area='';
      for(const el of card.children){
        if(el.classList.contains('areaLabel')){area=el.textContent.trim();continue}
        if(!el.classList.contains('shift')||!el.classList.contains('unfilled'))continue;
        const time=el.querySelector('.time')?.textContent?.trim()||'unknown time';
        const role=el.querySelector('.role')?.textContent?.trim()||'staff';
        out.push(`${day} ${area} ${time} (${role})`);
      }
    }
    return out;
  }

  function managerFailures(){
    const text=document.getElementById('warnings')?.textContent||'';
    return text.split(/\n|⚠/).map(x=>x.trim()).filter(x=>/no manager covering site/i.test(x));
  }

  function valid(){
    return parseMissing().length===0&&managerFailures().length===0;
  }

  function runWithTemporaryRescueRules(){
    const raw=localStorage.getItem(KEY);
    if(!raw)return;
    let state;try{state=JSON.parse(raw)}catch{return}
    if(!state)return;
    state.rules=state.rules||{};

    // Coverage is absolute. These are shift-shape preferences, so rescue mode
    // may relax them rather than accept an uncovered required block.
    state.rules.minGeneratedShift=1;
    state.rules.flexOverstaff=Math.max(1,Number(state.rules.flexOverstaff)||0);
    state.rules.flexBudget=Math.max(24,Number(state.rules.flexBudget)||0);

    try{
      localStorage.setItem(KEY,JSON.stringify(state));
      previousGenerate.call(button);
    }finally{
      localStorage.setItem(KEY,raw);
    }
  }

  function publishSuccess(rescued){
    if(download)download.disabled=false;
    const hint=document.getElementById('resultHint');
    if(hint&&rescued){
      hint.textContent='Full required coverage achieved. Hard-coverage rescue mode relaxed shift-shape preferences where necessary; availability, skills and other hard staff constraints were preserved.';
    }
    const warnings=document.getElementById('warnings');
    if(warnings){
      warnings.insertAdjacentHTML('afterbegin','<div class="ok">✓ FULL COVERAGE GATE PASSED — every required staffing block is covered.</div>');
    }
  }

  function publishFailure(missing,manager){
    if(download)download.disabled=true;
    const panel=document.getElementById('resultsPanel');
    if(panel)panel.style.display='block';
    const hint=document.getElementById('resultHint');
    if(hint)hint.textContent='No rota published. Smart Rota will not accept or save a week with uncovered required staffing or missing mandatory manager open/close cover.';

    const metrics=document.getElementById('metrics');
    if(metrics)metrics.innerHTML='<div class="metric"><div class="k">Rota status</div><div class="v">INVALID</div></div><div class="metric"><div class="k">Required coverage</div><div class="v">NOT FULLY STAFFED</div></div>';

    const problems=[...missing,...manager];
    const warnings=document.getElementById('warnings');
    if(warnings){
      const detail=problems.length?problems.map(x=>`<div class="warn">⚠ ${esc(x)}</div>`).join(''):'';
      warnings.innerHTML='<div class="warn"><strong>FULL COVERAGE REQUIRED:</strong> the optimiser could not produce a valid complete rota under the current hard constraints. No incomplete rota has been accepted.</div>'+detail;
    }

    const grid=document.getElementById('rotaGrid');
    if(grid)grid.innerHTML='';
    panel?.scrollIntoView({behavior:'smooth',block:'start'});
  }

  button.onclick=function(e){
    if(running)return;
    running=true;
    try{
      if(download)download.disabled=true;
      previousGenerate.call(this,e);
      if(valid()){
        publishSuccess(false);
        return;
      }

      runWithTemporaryRescueRules();
      if(valid()){
        publishSuccess(true);
        return;
      }

      publishFailure(parseMissing(),managerFailures());
    }finally{
      running=false;
    }
  };
})();
