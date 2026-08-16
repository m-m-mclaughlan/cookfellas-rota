window.applyWlbOptimizerPatch = function (html) {
  try {
    const schedulerMarker = ',xe=(e,t,{maxOvertimeHours';
    if (!html.includes(schedulerMarker)) {
      console.warn('WLB optimizer scheduler marker not found; skipping.');
      return html;
    }

    const managerMarker = 'fe=(e,t,n,a,l,c,h)=>{let d=(y,x)=>y.some(H=>H.day===h&&H[e]&&c[x[H.id]]?.isManager);return d(t,n)||d(a,l)}';
    const managerReplacement = 'fe=(e,t,n,a,l,c,h)=>{let d=s=>{if(!s)return null;let g=s.match(/(\\d{1,2})(?::(\\d{2}))?\\s*-\\s*(f|(\\d{1,2})(?::(\\d{2}))?)/i);if(!g)return null;let I=$=>$<10?$+12:$,G=I(parseInt(g[1],10))*60+(g[2]?parseInt(g[2],10):0),J=g[3].toLowerCase()==="f"?1350:I(parseInt(g[4],10))*60+(g[5]?parseInt(g[5],10):0);return{start:G,end:J}},y=[...t.map(s=>({slot:s,id:n[s.id]})),...a.map(s=>({slot:s,id:l[s.id]}))].filter(s=>s.slot.day===h),x=y.map(s=>d(s.slot.time)).filter(Boolean);if(!x.length)return!1;let H=Math.min(...x.map(s=>s.start)),C=Math.max(...x.map(s=>s.end));return y.some(s=>{let g=d(s.slot.time),I=c[s.id];return g&&I?.isManager&&(e==="isOpen"?g.start<=H&&g.end>H:g.end>=C&&g.start<C)})}';
    if (html.includes(managerMarker)) html = html.replace(managerMarker, managerReplacement);

    const fn = `,CtWlbOpt=(e,t,n,a,l,h=2)=>{
      let y={...n},x={...l},R=Object.fromEntries(e.map(s=>[s.id,s])),
          w=[...t.map(s=>({slot:s,board:"r"})),...a.map(s=>({slot:s,board:"b"}))],
          j=q=>q.board=="r"?y[q.slot.id]:x[q.slot.id],
          M=(q,id)=>{if(q.board=="r"){id?y[q.slot.id]=id:delete y[q.slot.id]}else{id?x[q.slot.id]=id:delete x[q.slot.id]}},
          B=time=>{if(!time)return null;let g=time.match(/(\\d{1,2})(?::(\\d{2}))?\\s*-\\s*(f|(\\d{1,2})(?::(\\d{2}))?)/i);if(!g)return null;let I=v=>v<10?v+12:v,s=I(parseInt(g[1],10))*60+(g[2]?parseInt(g[2],10):0),z=g[3].toLowerCase()=="f"?1350:I(parseInt(g[4],10))*60+(g[5]?parseInt(g[5],10):0);return{start:s,end:z}},
          overlap=(q1,q2)=>{if(q1.slot.day!==q2.slot.day)return!1;let b1=B(q1.slot.time),b2=B(q2.slot.time);return!!b1&&!!b2&&b1.start<b2.end&&b2.start<b1.end},
          assigned=id=>w.filter(q=>j(q)===id),
          days=id=>new Set(assigned(id).map(q=>q.slot.day)),
          mins=id=>assigned(id).reduce((z,q)=>z+W(q.slot.time)*60,0),
          valid=(s,q)=>!!s&&Q(s,q.slot.day,q.slot.time)&&(q.board!=="r"||D(s.level)>=D(q.slot.role)),
          room=(s,q,ignoreCap=!1)=>{if(!valid(s,q))return!1;if(assigned(s.id).some(r=>overlap(r,q)))return!1;if(!ignoreCap&&s.contractType==="contracted"&&mins(s.id)+W(q.slot.time)*60>s.contractedHours*60+h*60+.01)return!1;return!0},
          twoOffAfter=(id,day)=>{let z=days(id);z.add(day);for(let k=0;k<m.length;k++){let u=m[k],v=m[(k+1)%m.length];if(!z.has(u)&&!z.has(v))return!0}return!1},
          find=(board,day,time,role=null)=>w.find(q=>q.board===board&&q.slot.day===day&&q.slot.time===time&&(!role||q.slot.role===role))||w.find(q=>q.board===board&&q.slot.day===day&&q.slot.time.startsWith(time)&&(!role||q.slot.role===role)),
          isWlb=t.some(s=>s.day==="Mon"&&s.time==="11:30-9")&&t.some(s=>s.day==="Tue"&&s.time==="11-5")&&t.some(s=>s.day==="Sat"&&s.time==="11-9")&&a.some(s=>s.day==="Sun"&&s.time==="11-6");
      if(!isWlb)return{assignments:y,barAssignments:x};

      let coreNames=new Set(["Mark","Fran","Tyler","George"]),core=e.filter(s=>coreNames.has(s.name)&&s.isManager),byName=Object.fromEntries(core.map(s=>[s.name,s])),protectedIds=new Set;
      w.forEach(q=>{let s=R[j(q)];if(s&&coreNames.has(s.name))M(q,null)});

      let anchor=(name,board,day,time,role=null)=>{let s=byName[name],q=find(board,day,time,role);if(!s||!q||!valid(s,q)||assigned(s.id).some(r=>overlap(r,q)))return!1;M(q,s.id);protectedIds.add(q.board+":"+q.slot.id);return!0};

      // Mark: Sun/Mon off, Tuesday ends at 5pm, contract recovered with Friday Bar core.
      // 6 + 9.5 + 8.5 + 8.5 + 10 = 42.5h.
      anchor("Mark","r","Tue","11-5","floor");
      anchor("Mark","r","Wed","11:30-9","floor");
      anchor("Mark","b","Thu","2-f","bar");
      anchor("Mark","b","Fri","2-f","bar");
      anchor("Mark","r","Sat","11-9","floor");

      anchor("Fran","r","Mon","11:30-9","floor");
      anchor("Fran","r","Tue","5-f","floor");
      anchor("Fran","r","Fri","11:30-9","floor");
      anchor("Fran","r","Sat","5-f","floor");
      anchor("Fran","r","Sun","11-6","floor");

      // Tyler: Wed/Thu off. Friday becomes the one justified split:
      // opener + closer = 8.5h, keeping him at 41h while Mark takes 2-f.
      anchor("Tyler","b","Mon","2-f","bar");
      anchor("Tyler","b","Tue","2-f","bar");
      anchor("Tyler","b","Fri","11:30-2:30","bar");
      anchor("Tyler","b","Fri","5-f (closedown)","bar");
      anchor("Tyler","b","Sat","2-f","bar");
      anchor("Tyler","b","Sun","11-6","bar");

      anchor("George","r","Wed","5-f","floor");
      anchor("George","r","Thu","11:30-9","floor");
      anchor("George","r","Fri","5-f","floor");

      for(let s of e)for(let day of m){
        let qs=assigned(s.id).filter(q=>q.slot.day===day).sort((q1,q2)=>{
          let p1=protectedIds.has(q1.board+":"+q1.slot.id)?1:0,p2=protectedIds.has(q2.board+":"+q2.slot.id)?1:0;
          if(p1!==p2)return p2-p1;return W(q2.slot.time)-W(q1.slot.time)
        }),keep=[];
        for(let q of qs){if(keep.some(r=>overlap(r,q)))M(q,null);else keep.push(q)}
      }

      let coreIds=new Set(core.map(s=>s.id)),
          candidateScore=(s,q)=>{let def=s.contractType==="contracted"?Math.max(0,s.contractedHours*60-mins(s.id)):0,area=q.board==="b"?(s.isBarStaff?-500:500):(s.isBarStaff?500:-500),mgr=s.isManager?250:0,split=assigned(s.id).some(r=>r.slot.day===q.slot.day)?800:0;return-def*100+area+mgr+split+mins(s.id)/10},
          canFill=(s,q)=>{if(coreIds.has(s.id)||!room(s,q))return!1;let ds=days(s.id),fresh=!ds.has(q.slot.day);if(fresh&&!twoOffAfter(s.id,q.slot.day))return!1;if(s.contractType==="zeroHours"&&fresh&&s.wantedShiftsPerWeek!=null&&ds.size>=s.wantedShiftsPerWeek)return!1;return!0};

      for(let q of w.filter(q=>!j(q))){
        let cs=e.filter(s=>canFill(s,q)).sort((s1,s2)=>candidateScore(s1,q)-candidateScore(s2,q));
        if(cs.length)M(q,cs[0].id)
      }

      let boundsDay=day=>{let qs=w.filter(q=>q.slot.day===day),bs=qs.map(q=>B(q.slot.time)).filter(Boolean);return bs.length?{open:Math.min(...bs.map(b=>b.start)),close:Math.max(...bs.map(b=>b.end))}:null},
          covers=(q,when,val)=>{let b=B(q.slot.time);return b&&(when==="open"?b.start<=val&&b.end>val:b.end>=val&&b.start<val)},
          managerThere=(day,when)=>{let bd=boundsDay(day);if(!bd)return!0;let val=bd[when];return w.some(q=>q.slot.day===day&&covers(q,when,val)&&R[j(q)]?.isManager)},
          coverScore=(s,q)=>{let already=days(s.id).has(q.slot.day)?-1000:0,def=s.contractType==="contracted"?Math.max(0,s.contractedHours*60-mins(s.id)):0,area=q.board==="b"?(s.isBarStaff?-200:200):(s.isBarStaff?200:-200);return already-def*10+area+mins(s.id)/10};

      for(let day of m)for(let when of["open","close"]){
        if(managerThere(day,when))continue;
        let bd=boundsDay(day);if(!bd)continue;let val=bd[when],targets=w.filter(q=>q.slot.day===day&&covers(q,when,val));
        let best=null;
        for(let q of targets)for(let s of e.filter(s=>s.isManager)){
          let current=j(q);if(current===s.id){best={q,s,score:-1e9};break}
          let old=current;M(q,null);let ok=room(s,q);M(q,old);
          if(!ok)continue;let sc=coverScore(s,q);if(!best||sc<best.score)best={q,s,score:sc}
        }
        if(best)M(best.q,best.s.id)
      }

      for(let name of["Mark","Fran","Tyler"]){let s=byName[name];if(!s||days(s.id).has("Sat")||Ve(s,"Sat")==="none")continue;let qs=w.filter(q=>q.slot.day==="Sat"&&valid(s,q)).sort((q1,q2)=>W(q2.slot.time)-W(q1.slot.time));for(let q of qs){let old=j(q);M(q,null);if(room(s,q,!0)){M(q,s.id);break}M(q,old)}}

      return{assignments:y,barAssignments:x}
    }`;
    html = html.replace(schedulerMarker, fn + schedulerMarker);

    const returnMarker = 'return{...e,assignments:__guarded.assignments,bar:{...e.bar,assignments:__guarded.barAssignments}}';
    if (!html.includes(returnMarker)) {
      console.warn('WLB optimizer final return marker not found; skipping optimizer.');
      return html;
    }
    const replacement = 'let __wlb=CtWlbOpt(e.staff,e.slots,__guarded.assignments,e.bar.slots,__guarded.barAssignments,e.maxOvertimeHours??2);return{...e,assignments:__wlb.assignments,bar:{...e.bar,assignments:__wlb.barAssignments}}';
    html = html.split(returnMarker).join(replacement);
    return html;
  } catch (error) {
    console.error('WLB optimizer patch skipped:', error);
    return html;
  }
};
