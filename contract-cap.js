window.applyContractCapPatch = function (html) {
  const marker = ',xe=(e,t,{maxOvertimeHours';
  if (!html.includes(marker)) throw new Error('Contract cap scheduler marker not found');

  const fn = `,CtCap=(e,t,n,a,l,h=2)=>{
    let y={...n},x={...l},R=Object.fromEntries(e.map(s=>[s.id,s])),
        w=[...t.map(s=>({slot:s,board:"r"})),...a.map(s=>({slot:s,board:"b"}))],
        j=q=>q.board==="r"?y[q.slot.id]:x[q.slot.id],
        M=(q,id)=>{if(q.board==="r"){id?y[q.slot.id]=id:delete y[q.slot.id]}else{id?x[q.slot.id]=id:delete x[q.slot.id]}},
        O=id=>{let z=new Set;w.forEach(q=>{j(q)===id&&z.add(q.slot.day)});return z},
        E=id=>w.reduce((z,q)=>j(q)===id?z+W(q.slot.time)*60:z,0),
        C=(day,flag,exclude)=>w.some(q=>q!==exclude&&q.slot.day===day&&q.slot[flag]&&R[j(q)]?.isManager),
        twoOff=(id,day)=>{let z=O(id);z.add(day);for(let k=0;k<m.length;k++){let u=m[k],v=m[(k+1)%m.length];if(!z.has(u)&&!z.has(v))return!0}return!1},
        sameDay=(id,q)=>{let cur=w.filter(r=>r.slot.day===q.slot.day&&j(r)===id);if(!cur.length)return!0;if(cur.some(r=>r.board!==q.board)||cur.length!==1)return!1;let r=cur[0].slot;return(r.isOpen&&!r.isClose&&q.slot.isClose&&!q.slot.isOpen)||(r.isClose&&!r.isOpen&&q.slot.isOpen&&!q.slot.isClose)},
        eligible=(s,q,needMgr)=>{if(!Q(s,q.slot.day,q.slot.time)||(q.board==="r"&&D(s.level)<D(q.slot.role))||!sameDay(s.id,q))return!1;if(needMgr&&!s.isManager)return!1;let days=O(s.id),fresh=!days.has(q.slot.day);if(fresh&&!twoOff(s.id,q.slot.day))return!1;if(s.contractType==="zeroHours"&&fresh&&s.wantedShiftsPerWeek!=null&&days.size>=s.wantedShiftsPerWeek)return!1;if(s.contractType==="contracted"&&E(s.id)+W(q.slot.time)*60>s.contractedHours*60+h*60)return!1;return!0};

    for(let s of e.filter(v=>v.contractType==="contracted")){
      let cap=s.contractedHours*60+h*60;
      for(let pass=0;pass<12&&E(s.id)>cap+.01;pass++){
        let current=E(s.id),target=s.contractedHours*60,best=null;
        for(let q of w.filter(r=>j(r)===s.id)){
          let mins=W(q.slot.time)*60,after=current-mins;
          if(after<0)continue;
          let needMgr=s.isManager&&((q.slot.isOpen&&!C(q.slot.day,"isOpen",q))||(q.slot.isClose&&!C(q.slot.day,"isClose",q)));
          let candidates=e.filter(r=>r.id!==s.id&&eligible(r,q,needMgr)).sort((p,z)=>{
            let pt=p.contractType==="contracted"?Math.max(0,p.contractedHours*60-E(p.id)):0,zt=z.contractType==="contracted"?Math.max(0,z.contractedHours*60-E(z.id)):0;
            if((pt>0)!==(zt>0))return pt>0?-1:1;
            if(q.board==="b"&&p.isBarStaff!==z.isBarStaff)return p.isBarStaff?-1:1;
            if(q.board==="r"&&p.isBarStaff!==z.isBarStaff)return p.isBarStaff?1:-1;
            return E(p.id)-E(z.id)
          });
          if(!candidates.length)continue;
          let score=Math.abs(target-after)+Math.max(0,cap-after)*.01;
          if(!best||score<best.score)best={score,q,replacement:candidates[0]}
        }
        if(!best)break;
        M(best.q,best.replacement.id)
      }
    }
    return{assignments:y,barAssignments:x}
  }`;
  html = html.replace(marker, fn + marker);

  const returnMarker = 'return{...e,assignments:__topped.assignments,bar:{...e.bar,assignments:__topped.barAssignments}}';
  if (!html.includes(returnMarker)) throw new Error('Contract cap return marker not found');
  const replacement = 'let __capped=CtCap(e.staff,e.slots,__topped.assignments,e.bar.slots,__topped.barAssignments,e.maxOvertimeHours??2);return{...e,assignments:__capped.assignments,bar:{...e.bar,assignments:__capped.barAssignments}}';
  html = html.split(returnMarker).join(replacement);
  return html;
};
