window.applyBarFloorGuardPatch = function (html) {
  try {
    const schedulerMarker = ',xe=(e,t,{maxOvertimeHours';
    if (!html.includes(schedulerMarker)) {
      console.warn('Bar floor guard scheduler marker not found; skipping.');
      return html;
    }

    const fn = `,CtBarFloorGuard=(e,t,n,a,l,h=2)=>{
      let y={...n},x={...l},R=Object.fromEntries(e.map(s=>[s.id,s])),
          w=[...t.map(s=>({slot:s,board:"r"})),...a.map(s=>({slot:s,board:"b"}))],
          j=q=>q.board==="r"?y[q.slot.id]:x[q.slot.id],
          M=(q,id)=>{if(q.board==="r"){id?y[q.slot.id]=id:delete y[q.slot.id]}else{id?x[q.slot.id]=id:delete x[q.slot.id]}},
          B=time=>{if(!time)return null;let g=time.match(/(\\d{1,2})(?::(\\d{2}))?\\s*-\\s*(f|(\\d{1,2})(?::(\\d{2}))?)/i);if(!g)return null;let I=v=>v<10?v+12:v,s=I(parseInt(g[1],10))*60+(g[2]?parseInt(g[2],10):0),z=g[3].toLowerCase()==="f"?1350:I(parseInt(g[4],10))*60+(g[5]?parseInt(g[5],10):0);return{start:s,end:z}},
          overlap=(q1,q2)=>{if(q1.slot.day!==q2.slot.day)return!1;let b1=B(q1.slot.time),b2=B(q2.slot.time);return!!b1&&!!b2&&b1.start<b2.end&&b2.start<b1.end},
          assigned=id=>w.filter(q=>j(q)===id),
          days=id=>new Set(assigned(id).map(q=>q.slot.day)),
          mins=id=>assigned(id).reduce((z,q)=>z+W(q.slot.time)*60,0),
          floor=s=>!!s&&D(s.level)>=D("floor"),
          twoOff=(id,day)=>{let z=days(id);z.add(day);for(let k=0;k<m.length;k++){let u=m[k],v=m[(k+1)%m.length];if(!z.has(u)&&!z.has(v))return!0}return!1},
          eligible=(s,q)=>{if(!floor(s)||!Q(s,q.slot.day,q.slot.time))return!1;if(assigned(s.id).some(r=>overlap(r,q)))return!1;let ds=days(s.id),fresh=!ds.has(q.slot.day);if(fresh&&!twoOff(s.id,q.slot.day))return!1;if(s.contractType==="zeroHours"&&fresh&&s.wantedShiftsPerWeek!=null&&ds.size>=s.wantedShiftsPerWeek)return!1;if(s.contractType==="contracted"&&mins(s.id)+W(q.slot.time)*60>s.contractedHours*60+h*60+.01)return!1;return!0},
          score=(s,q)=>{let def=s.contractType==="contracted"?Math.max(0,s.contractedHours*60-mins(s.id)):0,bar=s.isBarStaff?-5000:0,same=days(s.id).has(q.slot.day)?3000:0;return-def*100+bar+same+mins(s.id)/10};

      let invalid=a.map(slot=>({slot,board:"b"})).filter(q=>{let id=j(q),s=R[id];return id&&!floor(s)});
      invalid.forEach(q=>M(q,null));

      for(let q of invalid){
        let candidates=e.filter(s=>eligible(s,q)).sort((p,z)=>score(p,q)-score(z,q));
        if(candidates.length)M(q,candidates[0].id)
      }

      return{assignments:y,barAssignments:x}
    }`;
    html = html.replace(schedulerMarker, fn + schedulerMarker);

    const returnMarker = 'return{...e,assignments:__wlb.assignments,bar:{...e.bar,assignments:__wlb.barAssignments}}';
    if (!html.includes(returnMarker)) {
      console.warn('Bar floor guard final return marker not found; skipping.');
      return html;
    }
    const replacement = 'let __barfloor=CtBarFloorGuard(e.staff,e.slots,__wlb.assignments,e.bar.slots,__wlb.barAssignments,e.maxOvertimeHours??2);return{...e,assignments:__barfloor.assignments,bar:{...e.bar,assignments:__barfloor.barAssignments}}';
    html = html.split(returnMarker).join(replacement);
    return html;
  } catch (error) {
    console.error('Bar floor guard patch skipped:', error);
    return html;
  }
};
