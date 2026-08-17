window.applyShortShiftGuardPatch = function (html) {
  try {
    const schedulerMarker = ',xe=(e,t,{maxOvertimeHours';
    if (!html.includes(schedulerMarker)) {
      console.warn('Split-gap guard scheduler marker not found; skipping.');
      return html;
    }

    const fn = `,CtShortShiftGuard=(e,t,n,a,l,h=2)=>{
      let y={...n},x={...l},R=Object.fromEntries(e.map(s=>[s.id,s])),
          w=[...t.map(s=>({slot:s,board:"r"})),...a.map(s=>({slot:s,board:"b"}))],
          j=q=>q.board==="r"?y[q.slot.id]:x[q.slot.id],
          M=(q,id)=>{if(q.board==="r"){id?y[q.slot.id]=id:delete y[q.slot.id]}else{id?x[q.slot.id]=id:delete x[q.slot.id]}},
          B=time=>{if(!time)return null;let g=time.match(/(\\d{1,2})(?::(\\d{2}))?\\s*-\\s*(f|(\\d{1,2})(?::(\\d{2}))?)/i);if(!g)return null;let I=v=>v<10?v+12:v,s=I(parseInt(g[1],10))*60+(g[2]?parseInt(g[2],10):0),z=g[3].toLowerCase()==="f"?1350:I(parseInt(g[4],10))*60+(g[5]?parseInt(g[5],10):0);return{start:s,end:z}},
          assigned=id=>w.filter(q=>j(q)===id),
          mins=id=>assigned(id).reduce((z,q)=>z+W(q.slot.time)*60,0),
          skilled=(s,q)=>q.board==="b"?D(s.level)>=D("floor"):D(s.level)>=D(q.slot.role),
          valid=(s,q)=>!!s&&Q(s,q.slot.day,q.slot.time)&&skilled(s,q),
          pairGap=(q1,q2)=>{let b1=B(q1.slot.time),b2=B(q2.slot.time);if(!b1||!b2)return 9999;if(b1.start<b2.end&&b2.start<b1.end)return-1;if(b2.start>=b1.end)return b2.start-b1.end;if(b1.start>=b2.end)return b1.start-b2.end;return-1},
          gapOkay=(s,q)=>assigned(s.id).every(r=>{if(r===q||r.slot.day!==q.slot.day)return!0;let g=pairGap(r,q);return g===0||g>=150}),
          room=(s,q)=>{if(!valid(s,q)||!gapOkay(s,q))return!1;if(s.contractType==="contracted"&&mins(s.id)+W(q.slot.time)*60>s.contractedHours*60+h*60+.01)return!1;return!0},
          moveRank=(s,q)=>(s?.isManager?100000:0)+(s?.contractType==="contracted"?10000:0)+W(q.slot.time)*100,
          candidateScore=(s,q)=>{let sameDay=assigned(s.id).some(r=>r.slot.day===q.slot.day)?1000:0,bar=q.board==="b"?(s.isBarStaff?-500:500):(s.isBarStaff?500:-500),mgr=s.isManager?10000:0;return mgr+sameDay+bar+mins(s.id)/10};

      // Hard rota-quality rule: if a person has two separate shifts in one day,
      // the break between them must be at least 2.5 hours (150 minutes).
      // Touching shifts are treated as continuous work, not a split.
      // We do not lengthen short shifts just to manufacture paid hours.
      for(let pass=0;pass<20;pass++){
        let bad=null;
        for(let s of e){
          let qs=assigned(s.id).sort((p,z)=>(B(p.slot.time)?.start??0)-(B(z.slot.time)?.start??0));
          for(let i=0;i<qs.length-1;i++){
            if(qs[i].slot.day!==qs[i+1].slot.day)continue;
            let g=pairGap(qs[i],qs[i+1]);
            if(g>0&&g<150){bad={s,a:qs[i],b:qs[i+1]};break}
          }
          if(bad)break
        }
        if(!bad)break;

        let q=moveRank(bad.s,bad.a)<=moveRank(bad.s,bad.b)?bad.a:bad.b,
            old=j(q);
        M(q,null);
        let candidates=e.filter(s=>s.id!==old&&room(s,q)).sort((p,z)=>candidateScore(p,q)-candidateScore(z,q));
        if(candidates.length)M(q,candidates[0].id);
        else console.warn('Split-gap rule left '+q.slot.day+' '+q.slot.time+' unfilled: no eligible employee can take it while preserving a 2.5h minimum split break.');
      }

      return{assignments:y,barAssignments:x}
    }`;
    html = html.replace(schedulerMarker, fn + schedulerMarker);

    const returnMarker = 'return{...e,assignments:__satfinal.assignments,bar:{...e.bar,assignments:__satfinal.barAssignments}}';
    if (!html.includes(returnMarker)) {
      console.warn('Split-gap guard return marker not found; skipping.');
      return html;
    }
    const replacement = 'let __short=CtShortShiftGuard(e.staff,e.slots,__satfinal.assignments,e.bar.slots,__satfinal.barAssignments,e.maxOvertimeHours??2);return{...e,assignments:__short.assignments,bar:{...e.bar,assignments:__short.barAssignments}}';
    html = html.split(returnMarker).join(replacement);
    return html;
  } catch (error) {
    console.error('Split-gap guard skipped:', error);
    return html;
  }
};
