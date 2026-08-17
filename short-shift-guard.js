window.applyShortShiftGuardPatch = function (html) {
  try {
    const schedulerMarker = ',xe=(e,t,{maxOvertimeHours';
    if (!html.includes(schedulerMarker)) {
      console.warn('Short-shift guard scheduler marker not found; skipping.');
      return html;
    }

    const fn = `,CtShortShiftGuard=(e,t,n,a,l)=>{
      let y={...n},x={...l},R=Object.fromEntries(e.map(s=>[s.id,s])),
          rt=t.map(s=>({...s})),bt=a.map(s=>({...s})),
          w=[...rt.map(s=>({slot:s,board:"r"})),...bt.map(s=>({slot:s,board:"b"}))],
          j=q=>q.board==="r"?y[q.slot.id]:x[q.slot.id],
          B=time=>{if(!time)return null;let g=time.match(/(\\d{1,2})(?::(\\d{2}))?\\s*-\\s*(f|(\\d{1,2})(?::(\\d{2}))?)/i);if(!g)return null;let I=v=>v<10?v+12:v,s=I(parseInt(g[1],10))*60+(g[2]?parseInt(g[2],10):0),z=g[3].toLowerCase()==="f"?1350:I(parseInt(g[4],10))*60+(g[5]?parseInt(g[5],10):0);return{start:s,end:z}},
          F=v=>{let h=Math.floor(v/60)%24,mn=v%60,d=h>12?h-12:h===0?12:h;return d+(mn?":"+String(mn).padStart(2,"0"):"")},
          assigned=id=>w.filter(q=>j(q)===id),
          extendTime=(time,end)=>{let b=B(time);if(!b)return time;let suffix=(time.match(/(\\s+\\(.*\\))\\s*$/)||[])[1]||"";return F(b.start)+"-"+F(end)+suffix};

      // Zero-hours retention rule: avoid asking someone to travel in for a
      // standalone sub-4-hour shift. Where their recorded availability allows,
      // extend that shift to four continuous hours. Do not manufacture a split
      // or alter somebody who is already working another shift that day.
      for(let q of w){
        let s=R[j(q)],b=B(q.slot.time);
        if(!s||s.contractType!=="zeroHours"||!b||b.end-b.start>=240)continue;
        if(assigned(s.id).some(r=>r!==q&&r.slot.day===q.slot.day))continue;
        let newTime=extendTime(q.slot.time,b.start+240);
        if(!Q(s,q.slot.day,newTime))continue;
        q.slot.time=newTime;
      }

      return{slots:rt,assignments:y,barSlots:bt,barAssignments:x}
    }`;
    html = html.replace(schedulerMarker, fn + schedulerMarker);

    const returnMarker = 'return{...e,assignments:__satfinal.assignments,bar:{...e.bar,assignments:__satfinal.barAssignments}}';
    if (!html.includes(returnMarker)) {
      console.warn('Short-shift guard return marker not found; skipping.');
      return html;
    }
    const replacement = 'let __short=CtShortShiftGuard(e.staff,e.slots,__satfinal.assignments,e.bar.slots,__satfinal.barAssignments);return{...e,slots:__short.slots,assignments:__short.assignments,bar:{...e.bar,slots:__short.barSlots,assignments:__short.barAssignments}}';
    html = html.split(returnMarker).join(replacement);
    return html;
  } catch (error) {
    console.error('Short-shift guard skipped:', error);
    return html;
  }
};
