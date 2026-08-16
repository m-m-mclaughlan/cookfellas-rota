window.applyContractTopupPatch = function (html) {
  const marker = ',xe=(e,t,{maxOvertimeHours';
  if (!html.includes(marker)) throw new Error('Contract top-up scheduler marker not found');

  const fn = `,CtTopup=(e,t,n,a,l,c,h=2)=>{
    let y={...n},x={...l},R=Object.fromEntries(e.map(s=>[s.id,s])),skip=new Set(c||[]),
        w=[...t.map(s=>({slot:s,board:"r"})),...a.map(s=>({slot:s,board:"b"}))],
        j=q=>q.board==="r"?y[q.slot.id]:x[q.slot.id],
        M=(q,id)=>{if(q.board==="r"){id?y[q.slot.id]=id:delete y[q.slot.id]}else{id?x[q.slot.id]=id:delete x[q.slot.id]}},
        O=id=>{let z=new Set;w.forEach(q=>{j(q)===id&&z.add(q.slot.day)});return z},
        E=id=>w.reduce((z,q)=>j(q)===id?z+W(q.slot.time)*60:z,0),
        C=(day,flag,exclude)=>w.some(q=>q!==exclude&&q.slot.day===day&&q.slot[flag]&&R[j(q)]?.isManager),
        F=(id,q)=>{let s=R[id];return !!s&&Q(s,q.slot.day,q.slot.time)&&(q.board!=="r"||D(s.level)>=D(q.slot.role))},
        twoOff=(id,day)=>{let z=O(id);z.add(day);for(let k=0;k<m.length;k++){let u=m[k],v=m[(k+1)%m.length];if(!z.has(u)&&!z.has(v))return!0}return!1},
        sameDay=(id,q)=>{let cur=w.filter(r=>r.slot.day===q.slot.day&&j(r)===id);if(!cur.length)return!0;if(cur.some(r=>r.board!==q.board))return!1;if(cur.length!==1)return!1;let r=cur[0].slot;return(r.isOpen&&!r.isClose&&q.slot.isClose&&!q.slot.isOpen)||(r.isClose&&!r.isOpen&&q.slot.isOpen&&!q.slot.isClose)},
        canReplace=(id,q)=>{let occ=j(q);if(occ===id)return!1;if(occ&&R[occ]?.contractType!=="zeroHours")return!1;if(occ&&R[occ]?.isManager&&!R[id]?.isManager){if(q.slot.isOpen&&!C(q.slot.day,"isOpen",q))return!1;if(q.slot.isClose&&!C(q.slot.day,"isClose",q))return!1}return!0},
        eligible=(id,q,mins)=>{let s=R[id],days=O(id),fresh=!days.has(q.slot.day);if(!F(id,q)||!canReplace(id,q)||!sameDay(id,q))return!1;if(fresh&&!twoOff(id,q.slot.day))return!1;return E(id)+mins<=s.contractedHours*60+h*60},
        area=(id,b)=>{let s=R[id];return b.reduce((z,q)=>z+(q.board==="b"?(s.isBarStaff?-30:30):(s.isBarStaff?30:-30)),0)},
        bundles=(id,day)=>{let base=w.filter(q=>q.slot.day===day&&canReplace(id,q)&&F(id,q)),out=[];
          for(let q of base){let mins=W(q.slot.time)*60;if(eligible(id,q,mins))out.push([q])}
          if(!O(id).has(day))for(let q1 of base)for(let q2 of base){
            if(q1===q2||q1.board!==q2.board)continue;
            if(!(q1.slot.isOpen&&!q1.slot.isClose&&q2.slot.isClose&&!q2.slot.isOpen))continue;
            let mins=(W(q1.slot.time)+W(q2.slot.time))*60;
            if(!twoOff(id,day)||E(id)+mins>R[id].contractedHours*60+h*60)continue;
            out.push([q1,q2])
          }
          let seen=new Set;return out.filter(b=>{let k=b.map(q=>q.board+":"+q.slot.id).sort().join("|");if(seen.has(k))return!1;seen.add(k);return!0})},
        score=(id,b)=>{let s=R[id],cur=E(id),target=s.contractedHours*60,mins=b.reduce((z,q)=>z+W(q.slot.time)*60,0),after=cur+mins,dist=Math.abs(target-after),over=Math.max(0,after-target),repl=b.filter(q=>j(q)).length;return dist*100+over*20+area(id,b)+repl*5};

    let contracted=e.filter(s=>s.contractType==="contracted"&&!skip.has(s.id)).sort((p,q)=>(q.contractedHours*60-E(q.id))-(p.contractedHours*60-E(p.id)));
    for(let s of contracted){
      for(let pass=0;pass<20&&E(s.id)<s.contractedHours*60;pass++){
        let before=Math.abs(s.contractedHours*60-E(s.id)),best=null;
        for(let day of m)for(let b of bundles(s.id,day)){
          let after=Math.abs(s.contractedHours*60-(E(s.id)+b.reduce((z,q)=>z+W(q.slot.time)*60,0)));
          if(after>=before)continue;
          let sc=score(s.id,b);if(!best||sc<best.sc)best={sc,b}
        }
        if(!best)break;
        best.b.forEach(q=>M(q,s.id))
      }
    }
    return{assignments:y,barAssignments:x}
  }`;
  html = html.replace(marker, fn + marker);

  const returnMarker = 'return{...e,assignments:__aligned.assignments,bar:{...e.bar,assignments:__aligned.barAssignments}}';
  if (!html.includes(returnMarker)) throw new Error('Contract top-up return marker not found');
  const replacement = 'let __topped=CtTopup(e.staff,e.slots,__aligned.assignments,e.bar.slots,__aligned.barAssignments,We(e.staff,e.linkedDaysOff),e.maxOvertimeHours??2);return{...e,assignments:__topped.assignments,bar:{...e.bar,assignments:__topped.barAssignments}}';
  html = html.split(returnMarker).join(replacement);
  return html;
};
