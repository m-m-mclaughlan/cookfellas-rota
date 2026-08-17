window.applyContractExperimentPatch = function (html) {
  try {
    // Separate hypothetical 40h-contract preset. This does not alter the normal
    // Work-life balance button or production template.
    const uiMarker = '"Load work-life balance")),React.createElement("div",{style:o.monthConfigRow},React.createElement("button",{style:o.btnGhost,onClick:Rt},"Update standard week from current board"))';

    const expRestaurant = '[{"day":"Mon","role":"floor","time":"11:30-9","isOpen":true},{"day":"Mon","role":"floor","time":"12-2:30"},{"day":"Mon","role":"pots","time":"6-f"},{"day":"Mon","role":"floor","time":"5-f (closedown)","isClose":true},{"day":"Tue","role":"floor","time":"11-5","isOpen":true},{"day":"Tue","role":"floor","time":"12-9"},{"day":"Tue","role":"pots","time":"6-f"},{"day":"Tue","role":"floor","time":"5-f (closedown)","isClose":true},{"day":"Wed","role":"floor","time":"11:30-9","isOpen":true},{"day":"Wed","role":"floor","time":"12-2:30"},{"day":"Wed","role":"pots","time":"6-f"},{"day":"Wed","role":"floor","time":"5-f (closedown)","isClose":true},{"day":"Thu","role":"floor","time":"11:30-9","isOpen":true},{"day":"Thu","role":"floor","time":"12-2:30"},{"day":"Thu","role":"pots","time":"6-f"},{"day":"Thu","role":"floor","time":"5-f (closedown)","isClose":true},{"day":"Fri","role":"floor","time":"11:30-5","isOpen":true},{"day":"Fri","role":"floor","time":"12-2:30"},{"day":"Fri","role":"floor","time":"5-9"},{"day":"Fri","role":"pots","time":"5-f"},{"day":"Fri","role":"floor","time":"5-f (closedown)","isClose":true},{"day":"Fri","role":"running","time":"5-f"},{"day":"Fri","role":"floor","time":"5-f"},{"day":"Sat","role":"floor","time":"11-9","isOpen":true},{"day":"Sat","role":"floor","time":"12-5"},{"day":"Sat","role":"pots","time":"11-5"},{"day":"Sat","role":"pots","time":"5-f"},{"day":"Sat","role":"running","time":"5-f"},{"day":"Sat","role":"floor","time":"5-f (closedown)","isClose":true},{"day":"Sat","role":"floor","time":"5-f"},{"day":"Sun","role":"floor","time":"11-6 (closedown)","isOpen":true,"isClose":true},{"day":"Sun","role":"floor","time":"12-6"},{"day":"Sun","role":"pots","time":"12-6"}]';

    const expBar = '[{"day":"Mon","role":"bar","time":"11:30-2:30","isOpen":true},{"day":"Mon","role":"bar","time":"2-f"},{"day":"Mon","role":"bar","time":"5-f (closedown)","isClose":true},{"day":"Tue","role":"bar","time":"11:30-2:30","isOpen":true},{"day":"Tue","role":"bar","time":"2-f"},{"day":"Tue","role":"bar","time":"5-f (closedown)","isClose":true},{"day":"Wed","role":"bar","time":"11:30-2:30","isOpen":true},{"day":"Wed","role":"bar","time":"2-f"},{"day":"Wed","role":"bar","time":"5-f (closedown)","isClose":true},{"day":"Thu","role":"bar","time":"11:30-2:30","isOpen":true},{"day":"Thu","role":"bar","time":"2-f"},{"day":"Thu","role":"bar","time":"5-f (closedown)","isClose":true},{"day":"Fri","role":"bar","time":"11:30-2:30","isOpen":true},{"day":"Fri","role":"bar","time":"2-f"},{"day":"Fri","role":"bar","time":"5-f"},{"day":"Fri","role":"bar","time":"5-f (closedown)","isClose":true},{"day":"Sat","role":"bar","time":"11:30-2:30","isOpen":true},{"day":"Sat","role":"bar","time":"2-f"},{"day":"Sat","role":"bar","time":"2-f"},{"day":"Sat","role":"bar","time":"5-f (closedown)","isClose":true},{"day":"Sun","role":"bar","time":"11-6","isOpen":true,"isClose":true}]';

    if (html.includes(uiMarker)) {
      const expButton = '"Load work-life balance")),React.createElement("div",{style:o.monthConfigRow},React.createElement("button",{style:o.btnPrimarySmall,onClick:()=>{localStorage.setItem("cookfellas-40h-experiment","1");p(e=>({...e,slots:ee(' + expRestaurant + '),assignments:{}}));_(e=>({...e,slots:ee(' + expBar + '),assignments:{}}))}},"Load 40h contract experiment (both areas)")),React.createElement("div",{style:o.monthConfigRow},React.createElement("button",{style:o.btnGhost,onClick:Rt},"Update standard week from current board"))';
      html = html.replace(uiMarker, expButton);
    } else {
      console.warn('40h experiment UI marker not found.');
    }

    // Detect the experiment by both the explicit mode flag and its unique Tue 12-9 slot.
    const isWlbMarker = '          isWlb=t.some(s=>s.day==="Mon"&&s.time==="11:30-9")&&t.some(s=>s.day==="Tue"&&s.time==="11-5")&&t.some(s=>s.day==="Sat"&&s.time==="11-9")&&a.some(s=>s.day==="Sun"&&s.time==="11-6");';
    const isWlbReplacement = '          is40Exp=localStorage.getItem("cookfellas-40h-experiment")==="1"&&t.some(s=>s.day==="Tue"&&s.time==="12-9"),\n          isWlb=t.some(s=>s.day==="Mon"&&s.time==="11:30-9")&&t.some(s=>s.day==="Tue"&&s.time==="11-5")&&t.some(s=>s.day==="Sat"&&s.time==="11-9")&&a.some(s=>s.day==="Sun"&&s.time==="11-6");';
    if (html.includes(isWlbMarker)) html = html.replace(isWlbMarker, isWlbReplacement);
    else console.warn('40h experiment mode marker not found.');

    const coreMarker = '          coreIds=new Set(core.map(s=>s.id)),\n          candidateScore=';
    const coreReplacement = '          coreIds=new Set(core.map(s=>s.id)),\n          expHire=is40Exp?e.find(s=>s.name==="New Hire 40H"&&s.contractType==="contracted"):null,\n          candidateScore=';
    if (html.includes(coreMarker)) html = html.replace(coreMarker, coreReplacement);
    else console.warn('40h experiment employee marker not found.');

    const fillMarker = '      for(let q of w.filter(q=>!j(q))){';
    const expAnchors = `      if(is40Exp&&expHire){
        // Keep the hypothetical employee isolated from normal optimisation.
        // Target: Tue-Sat, Sun/Mon off, one Friday split, about 39.5h total.
        coreIds.add(expHire.id);
        w.forEach(q=>{if(j(q)===expHire.id)M(q,null)});
        let putExp=(board,day,time,role=null,preferUnfilled=!1)=>{
          let qs=w.filter(q=>q.board===board&&q.slot.day===day&&q.slot.time===time&&(!role||q.slot.role===role));
          let q=(preferUnfilled?qs.find(q=>!j(q)):null)||qs.find(q=>R[j(q)]?.name!=="Tyler")||qs[0];
          if(!q||!valid(expHire,q)||assigned(expHire.id).some(r=>overlap(r,q)))return!1;
          M(q,expHire.id);return!0
        };
        putExp("r","Tue","12-9","floor");
        putExp("b","Wed","2-f","bar");
        putExp("r","Thu","5-f","floor");
        putExp("r","Fri","12-2:30","floor");
        putExp("b","Fri","5-f","bar");
        putExp("b","Sat","2-f","bar",!0);
      }

`;
    if (html.includes(fillMarker)) html = html.replace(fillMarker, expAnchors + fillMarker);
    else console.warn('40h experiment anchor marker not found.');

    return html;
  } catch (error) {
    console.error('40h contract experiment patch skipped:', error);
    return html;
  }
};
