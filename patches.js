window.applyCookfellasPatches = function (html) {
  const mustReplace = (source, marker, replacement, label) => {
    if (!source.includes(marker)) throw new Error(label + ' marker not found');
    return source.replace(marker, replacement);
  };

  // Part-day availability: AM = left half, PM = right half.
  const availabilityPatch = `
<style id="availability-split-vertical-fix">
button[title*="available mornings only"] {
  background: linear-gradient(to right, #C9A24B66 0%, #C9A24B66 50%, transparent 50%, transparent 100%) !important;
}
button[title*="available evenings only"] {
  background: linear-gradient(to right, transparent 0%, transparent 50%, #C9A24B66 50%, #C9A24B66 100%) !important;
}
</style>`;
  html = html.replace('</head>', availabilityPatch + '</head>');

  // Contracted staff are targeted to their full contract before zero-hours
  // staff are preferred. Shortfall remains a warning/tolerance setting.
  html = mustReplace(
    html,
    'X=r=>Math.max(0,r.contractedHours*60-me)',
    'X=r=>Math.max(0,r.contractedHours*60)',
    'contract priority'
  );

  // Opening + closing used to be a mandatory bundle. That meant somebody
  // available for the opening but unavailable for the evening was rejected
  // for the whole day. Treat the two shifts independently instead, while
  // still allowing the SAME person to work the open+close split when both
  // halves fit their availability.
  const pairMarker = 'let R={},w=new Set;Object.values(T).forEach(r=>{let i=r.filter(S=>S.isOpen&&!S.isClose),f=r.filter(S=>S.isClose&&!S.isOpen),v=Math.min(i.length,f.length);for(let S=0;S<v;S++)R[i[S].id]=f[S],w.add(f[S].id)});let j=r=>{let i=W(r.time)*60,f=R[r.id];return f?i+W(f.time)*60:i},';
  html = mustReplace(
    html,
    pairMarker,
    'let R={},w=new Set;let j=r=>W(r.time)*60,',
    'optional split pairing'
  );

  html = mustReplace(
    html,
    'A=(r,i,f)=>Q(r,i,f)&&!(l[r.id]&&l[r.id].has(i))&&!(u[r.id]&&u[r.id].has(i))',
    'A=(r,i,f,o)=>Q(r,i,f)&&!(l[r.id]&&l[r.id].has(i))&&(!(u[r.id]&&u[r.id].has(i))||t.some(s=>s.day===i&&x[s.id]===r.id&&((s.isOpen&&!s.isClose&&o&&o.isClose&&!o.isOpen)||(s.isClose&&!s.isOpen&&o&&o.isOpen&&!o.isClose))))',
    'same-day split availability'
  );

  html = mustReplace(
    html,
    'if(D(k.level)<D(r.role)||!A(k,r.day,r.time)||v&&!Q(k,r.day,v.time)||i.has(k.id))return!1;',
    'if(D(k.level)<D(r.role)||!A(k,r.day,r.time,r))return!1;',
    'split candidate filter'
  );

  html = mustReplace(
    html,
    '||!A(r,i.day,i.time)||(H[i.day]||new Set).has(r.id)||!v&&(i.isOpen||i.isClose)&&S.isManager&&!r.isManager',
    '||!A(r,i.day,i.time,i)||!v&&(i.isOpen||i.isClose)&&S.isManager&&!r.isManager',
    'split rebalance filter'
  );

  // Strict aligned days off means one shared block of two consecutive days
  // off. It does NOT mean identical working days. The linked people can work
  // different days outside that block and are independently topped up toward
  // their full contract.
  const strictAlignFn = `ArStrict=(e,t,n,a,l,c,h=2,d=2)=>{
    let y={...n},x={...l};
    if(!c)return{assignments:y,barAssignments:x};
    let[A,T]=c,R=Object.fromEntries(e.map(s=>[s.id,s])),
        w=[...t.map(s=>({slot:s,board:"r"})),...a.map(s=>({slot:s,board:"b"}))],
        j=q=>q.board==="r"?y[q.slot.id]:x[q.slot.id],
        M=(q,id)=>{if(q.board==="r"){id?y[q.slot.id]=id:delete y[q.slot.id]}else{id?x[q.slot.id]=id:delete x[q.slot.id]}},
        O=id=>{let z=new Set;w.forEach(q=>{j(q)===id&&z.add(q.slot.day)});return z},
        E=id=>w.reduce((z,q)=>j(q)===id?z+W(q.slot.time)*60:z,0),
        Y=(id,day)=>O(id).has(day),
        K=id=>R[id]?.contractType==="contracted"?R[id].contractedHours*60:Infinity,
        L=id=>R[id]?.contractType==="contracted"?R[id].contractedHours*60+h*60:Infinity,
        C=(day,flag,exclude)=>w.some(q=>q!==exclude&&q.slot.day===day&&q.slot[flag]&&R[j(q)]?.isManager),
        H=(q,oldId,newId)=>{if(!oldId||!R[oldId]?.isManager||R[newId]?.isManager)return!1;return(q.slot.isOpen&&!C(q.slot.day,"isOpen",q))||(q.slot.isClose&&!C(q.slot.day,"isClose",q))},
        F=(id,q)=>{let s=R[id];return !!s&&Q(s,q.slot.day,q.slot.time)&&(q.board!=="r"||D(s.level)>=D(q.slot.role))},
        twoOffWith=(id,extraDay)=>{let z=O(id);extraDay&&z.add(extraDay);for(let k=0;k<m.length;k++){let u=m[k],v=m[(k+1)%m.length];if(!z.has(u)&&!z.has(v))return!0}return!1},
        U=(id,q)=>{let cur=w.filter(r=>r.slot.day===q.slot.day&&j(r)===id);if(!cur.length)return!0;return cur.every(r=>r.board===q.board&&((r.slot.isOpen&&!r.slot.isClose&&q.slot.isClose&&!q.slot.isOpen)||(r.slot.isClose&&!r.slot.isOpen&&q.slot.isOpen&&!q.slot.isClose)))},
        V=(id,q,locked)=>{let s=R[id];if(!F(id,q)||locked.has(q.slot.day)||!U(id,q))return!1;let ds=O(id),fresh=!ds.has(q.slot.day);if(fresh&&s.contractType==="zeroHours"&&s.wantedShiftsPerWeek!=null&&ds.size>=s.wantedShiftsPerWeek)return!1;if(fresh&&!twoOffWith(id,q.slot.day))return!1;return E(id)+W(q.slot.time)*60<=L(id)},
        Z=(id,q)=>{let occ=j(q);if(occ===id||occ===A||occ===T)return!1;if(occ&&R[occ]?.contractType!=="zeroHours")return!1;if(occ&&H(q,occ,id))return!1;return!0},
        B=(id,q)=>{let s=R[id],cur=E(id),target=K(id),mins=W(q.slot.time)*60,def=Number.isFinite(target)?Math.max(0,target-cur):0,use=Math.min(def,mins),over=Number.isFinite(target)?Math.max(0,cur+mins-target):0,area=q.board==="b"?(s.isBarStaff?-700:700):(s.isBarStaff?700:-700),replace=j(q)?120:0;return-use*100+over*8+area+replace},
        Qc=id=>R[id]?.contractType==="contracted"&&E(id)<K(id)-.01;

    let blocks=m.map((day,k)=>[day,m[(k+1)%m.length]]),
        existing=blocks.filter(([u,v])=>!Y(A,u)&&!Y(A,v)&&!Y(T,u)&&!Y(T,v)),
        disruption=block=>w.reduce((z,q)=>(block.includes(q.slot.day)&&(j(q)===A||j(q)===T))?z+W(q.slot.time)*60:z,0),
        chosen=(existing.length?existing:blocks.slice().sort((p,q)=>disruption(p)-disruption(q)))[0],
        locked=new Set(chosen);

    let removed=w.filter(q=>locked.has(q.slot.day)&&(j(q)===A||j(q)===T));
    removed.forEach(q=>M(q,null));
    for(let q of removed){
      let needMgr=(q.slot.isOpen&&!C(q.slot.day,"isOpen",null))||(q.slot.isClose&&!C(q.slot.day,"isClose",null));
      let candidates=e.filter(s=>s.id!==A&&s.id!==T&&V(s.id,q,new Set)&&(!needMgr||s.isManager))
        .sort((s1,s2)=>B(s1.id,q)-B(s2.id,q));
      if(candidates.length)M(q,candidates[0].id)
    }

    let bundles=(id,day)=>{
      if(locked.has(day))return[];
      let s=R[id],already=Y(id,day),base=w.filter(q=>q.slot.day===day&&Z(id,q)&&F(id,q)),out=[];
      if(already){
        for(let q of base)if(V(id,q,locked))out.push([q])
      }else{
        let ds=O(id);
        if(s.contractType==="zeroHours"&&s.wantedShiftsPerWeek!=null&&ds.size>=s.wantedShiftsPerWeek)return[];
        for(let q of base){let mins=W(q.slot.time)*60;if(E(id)+mins<=L(id))out.push([q])}
        for(let q1 of base)for(let q2 of base){
          if(q1===q2||q1.board!==q2.board)continue;
          if(!(q1.slot.isOpen&&!q1.slot.isClose&&q2.slot.isClose&&!q2.slot.isOpen))continue;
          let mins=(W(q1.slot.time)+W(q2.slot.time))*60;
          if(E(id)+mins<=L(id))out.push([q1,q2])
        }
      }
      let seen=new Set;
      return out.filter(b=>{let key=b.map(q=>q.board+":"+q.slot.id).sort().join("|");if(seen.has(key))return!1;seen.add(key);return!0})
    },
    bundleScore=(id,b)=>{let s=R[id],cur=E(id),target=K(id),mins=b.reduce((z,q)=>z+W(q.slot.time)*60,0),def=Number.isFinite(target)?Math.max(0,target-cur):0,use=Math.min(def,mins),over=Number.isFinite(target)?Math.max(0,cur+mins-target):mins,area=b.reduce((z,q)=>z+(q.board==="b"?(s.isBarStaff?-700:700):(s.isBarStaff?700:-700)),0),replace=b.filter(q=>j(q)).length*120;return-use*100+over*8+area+replace};

    for(let id of[A,T]){
      for(let pass=0;pass<12&&Qc(id);pass++){
        let best=null;
        for(let day of m){
          for(let b of bundles(id,day)){
            let score=bundleScore(id,b);
            if(!best||score<best.score)best={score,b}
          }
        }
        if(!best||best.score>=0)break;
        best.b.forEach(q=>M(q,id))
      }
    }

    return{assignments:y,barAssignments:x}
  }`;

  const schedulerMarker = '},xe=(e,t,{maxOvertimeHours';
  if (!html.includes(schedulerMarker)) throw new Error('strict align scheduler marker not found');
  html = html.replace(schedulerMarker, '},' + strictAlignFn + ',xe=(e,t,{maxOvertimeHours');

  const alignedA = 'return{...e,assignments:a.assignments,bar:{...e.bar,assignments:a.barAssignments}}';
  const alignedAReplacement = 'let __aligned=ArStrict(e.staff,e.slots,a.assignments,e.bar.slots,a.barAssignments,We(e.staff,e.linkedDaysOff),e.maxOvertimeHours??2,e.allowedShortfallHours??2);return{...e,assignments:__aligned.assignments,bar:{...e.bar,assignments:__aligned.barAssignments}}';
  if (!html.includes(alignedA)) throw new Error('aligned return A marker not found');
  html = html.split(alignedA).join(alignedAReplacement);

  const alignedC = 'return{...e,assignments:c.assignments,bar:{...e.bar,assignments:c.barAssignments}}';
  const alignedCReplacement = 'let __aligned=ArStrict(e.staff,e.slots,c.assignments,e.bar.slots,c.barAssignments,We(e.staff,e.linkedDaysOff),e.maxOvertimeHours??2,e.allowedShortfallHours??2);return{...e,assignments:__aligned.assignments,bar:{...e.bar,assignments:__aligned.barAssignments}}';
  if (!html.includes(alignedC)) throw new Error('aligned return C marker not found');
  html = html.replace(alignedC, alignedCReplacement);

  html = html.replace('"Aligned days off"', '"Aligned days off · strict 2-day block"');
  return html;
};
