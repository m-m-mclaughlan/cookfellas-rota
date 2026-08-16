window.applyAvailabilityGuardPatch = function (html) {
  const marker = ',xe=(e,t,{maxOvertimeHours';
  if (!html.includes(marker)) throw new Error('Availability guard scheduler marker not found');

  const fn = `,CtAvailGuard=(e,t,n,a,l,h=2)=>{
    let y={...n},x={...l},R=Object.fromEntries(e.map(s=>[s.id,s])),
        w=[...t.map(s=>({slot:s,board:"r"})),...a.map(s=>({slot:s,board:"b"}))],
        j=q=>q.board==="r"?y[q.slot.id]:x[q.slot.id],
        M=(q,id)=>{if(q.board==="r"){id?y[q.slot.id]=id:delete y[q.slot.id]}else{id?x[q.slot.id]=id:delete x[q.slot.id]}},
        O=id=>{let z=new Set;w.forEach(q=>{j(q)===id&&z.add(q.slot.day)});return z},
        E=id=>w.reduce((z,q)=>j(q)===id?z+W(q.slot.time)*60:z,0),
        C=(day,flag,exclude)=>w.some(q=>q!==exclude&&q.slot.day===day&&q.slot[flag]&&R[j(q)]?.isManager),
        twoOff=(id,day)=>{let z=O(id);z.add(day);for(let k=0;k<m.length;k++){let u=m[k],v=m[(k+1)%m.length];if(!z.has(u)&&!z.has(v))return!0}return!1},
        sameDay=(id,q)=>{let cur=w.filter(r=>r.slot.day===q.slot.day&&j(r)===id);if(!cur.length)return!0;if(cur.some(r=>r.board!==q.board)||cur.length!==1)return!1;let r=cur[0].slot;return(r.isOpen&&!r.isClose&&q.slot.isClose&&!q.slot.isOpen)||(r.isClose&&!r.isOpen&&q.slot.isOpen&&!q.slot.isClose)},
        valid=(s,q)=>Q(s,q.slot.day,q.slot.time)&&(q.board!=="r"||D(s.level)>=D(q.slot.role)),
        eligible=(s,q,needMgr)=>{if(!valid(s,q)||!sameDay(s.id,q))return!1;if(needMgr&&!s.isManager)return!1;let days=O(s.id),fresh=!days.has(q.slot.day);if(fresh&&!twoOff(s.id,q.slot.day))return!1;if(s.contractType==="zeroHours"&&fresh&&s.wantedShiftsPerWeek!=null&&days.size>=s.wantedShiftsPerWeek)return!1;if(s.contractType==="contracted"&&E(s.id)+W(q.slot.time)*60>s.contractedHours*60+h*60)return!1;return!0};

    let invalid=w.filter(q=>{let id=j(q),s=R[id];return id&&(!s||!valid(s,q))});
    invalid.forEach(q=>M(q,null));

    for(let q of invalid){
      let needMgr=(q.slot.isOpen&&!C(q.slot.day,"isOpen",null))||(q.slot.isClose&&!C(q.slot.day,"isClose",null));
      let candidates=e.filter(s=>eligible(s,q,needMgr)).sort((p,z)=>{
        let pd=p.contractType==="contracted"?Math.max(0,p.contractedHours*60-E(p.id)):0,
            zd=z.contractType==="contracted"?Math.max(0,z.contractedHours*60-E(z.id)):0;
        if((pd>0)!==(zd>0))return pd>0?-1:1;
        if(pd!==zd)return zd-pd;
        if(q.board==="b"&&p.isBarStaff!==z.isBarStaff)return p.isBarStaff?-1:1;
        if(q.board==="r"&&p.isBarStaff!==z.isBarStaff)return p.isBarStaff?1:-1;
        return E(p.id)-E(z.id)
      });
      if(candidates.length)M(q,candidates[0].id)
    }
    return{assignments:y,barAssignments:x}
  }`;
  html = html.replace(marker, fn + marker);

  const returnMarker = 'return{...e,assignments:__capped.assignments,bar:{...e.bar,assignments:__capped.barAssignments}}';
  if (!html.includes(returnMarker)) throw new Error('Availability guard return marker not found');
  const replacement = 'let __guarded=CtAvailGuard(e.staff,e.slots,__capped.assignments,e.bar.slots,__capped.barAssignments,e.maxOvertimeHours??2);return{...e,assignments:__guarded.assignments,bar:{...e.bar,assignments:__guarded.barAssignments}}';
  html = html.split(returnMarker).join(replacement);
  return html;
};
