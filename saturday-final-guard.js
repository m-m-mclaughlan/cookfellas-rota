window.applySaturdayFinalGuardPatch = function (html) {
  try {
    const schedulerMarker = ',xe=(e,t,{maxOvertimeHours';
    if (!html.includes(schedulerMarker)) {
      console.warn('Final Saturday guard scheduler marker not found; skipping.');
      return html;
    }

    const fn = `,CtSatFinalGuard=(e,t,n,a,l,h=2)=>{
      let y={...n},x={...l},R=Object.fromEntries(e.map(s=>[s.id,s])),
          w=[...t.map(s=>({slot:s,board:"r"})),...a.map(s=>({slot:s,board:"b"}))],
          j=q=>q.board==="r"?y[q.slot.id]:x[q.slot.id],
          M=(q,id)=>{if(q.board==="r"){id?y[q.slot.id]=id:delete y[q.slot.id]}else{id?x[q.slot.id]=id:delete x[q.slot.id]}},
          B=time=>{if(!time)return null;let g=time.match(/(\\d{1,2})(?::(\\d{2}))?\\s*-\\s*(f|(\\d{1,2})(?::(\\d{2}))?)/i);if(!g)return null;let I=v=>v<10?v+12:v,s=I(parseInt(g[1],10))*60+(g[2]?parseInt(g[2],10):0),z=g[3].toLowerCase()==="f"?1350:I(parseInt(g[4],10))*60+(g[5]?parseInt(g[5],10):0);return{start:s,end:z}},
          overlap=(q1,q2)=>{if(q1.slot.day!==q2.slot.day)return!1;let b1=B(q1.slot.time),b2=B(q2.slot.time);return!!b1&&!!b2&&b1.start<b2.end&&b2.start<b1.end},
          assigned=id=>w.filter(q=>j(q)===id),
          mins=id=>assigned(id).reduce((z,q)=>z+W(q.slot.time)*60,0),
          floor=s=>!!s&&D(s.level)>=D("floor"),
          room=(s,q)=>{if(!floor(s)||!Q(s,q.slot.day,q.slot.time))return!1;if(assigned(s.id).some(r=>overlap(r,q)))return!1;if(s.contractType==="contracted"&&mins(s.id)+W(q.slot.time)*60>s.contractedHours*60+h*60+.01)return!1;return!0},
          score=(s,q)=>{let def=s.contractType==="contracted"?Math.max(0,s.contractedHours*60-mins(s.id)):0,bar=s.isBarStaff?-3000:0;return-def*100+bar+mins(s.id)/10};

      // This is deliberately the final repair pass. Earlier schedulers may leave
      // a lower-skilled person temporarily occupying a Saturday Bar slot; the
      // Bar floor guard removes that assignment later. Refill any resulting
      // vacancy here using genuinely available floor-trained non-management staff.
      // Wanted-shift counts and two-consecutive-days-off remain soft preferences
      // at this point: required Saturday coverage wins, while availability,
      // skill, overlap and contracted caps remain hard rules.
      let targets=w.filter(q=>q.board==="b"&&q.slot.day==="Sat"&&(q.slot.time==="2-f"||q.slot.time.startsWith("5-f"))&&!j(q));
      for(let q of targets){
        let candidates=e.filter(s=>!s.isManager&&room(s,q)).sort((p,z)=>score(p,q)-score(z,q));
        if(candidates.length)M(q,candidates[0].id);
        else console.warn('Final Saturday Bar coverage could not fill '+q.slot.time+'.');
      }

      return{assignments:y,barAssignments:x}
    }`;
    html = html.replace(schedulerMarker, fn + schedulerMarker);

    const returnMarker = 'return{...e,assignments:__barfloor.assignments,bar:{...e.bar,assignments:__barfloor.barAssignments}}';
    if (!html.includes(returnMarker)) {
      console.warn('Final Saturday guard return marker not found; skipping.');
      return html;
    }
    const replacement = 'let __satfinal=CtSatFinalGuard(e.staff,e.slots,__barfloor.assignments,e.bar.slots,__barfloor.barAssignments,e.maxOvertimeHours??2);return{...e,assignments:__satfinal.assignments,bar:{...e.bar,assignments:__satfinal.barAssignments}}';
    html = html.split(returnMarker).join(replacement);
    return html;
  } catch (error) {
    console.error('Final Saturday coverage guard skipped:', error);
    return html;
  }
};
