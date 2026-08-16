window.applyContractOffPlanPatch = function (html) {
  const marker = ',xe=(e,t,{maxOvertimeHours';
  if (!html.includes(marker)) throw new Error('Off-plan scheduler marker not found');

  const fn = `,CtOffPlan=(e,t,a,c)=>{
    let skip=new Set(c||[]),out={},bestBoard=(s,slots,isRestaurant)=>{
      let valid=slots.filter(q=>q.day===CtOffPlan.day&&Q(s,q.day,q.time)&&(!isRestaurant||D(s.level)>=D(q.role))),best=0;
      for(let q of valid)best=Math.max(best,W(q.time)*60);
      let opens=valid.filter(q=>q.isOpen&&!q.isClose),closes=valid.filter(q=>q.isClose&&!q.isOpen);
      for(let o of opens)for(let z of closes)best=Math.max(best,(W(o.time)+W(z.time))*60);
      return best
    };
    for(let s of e){
      if(s.contractType!=="contracted"||skip.has(s.id))continue;
      let daily={},state={};
      for(let day of m){
        CtOffPlan.day=day;
        daily[day]=Math.max(bestBoard(s,t,!0),bestBoard(s,a,!1));
        state[day]=Ve(s,day)
      }
      let target=s.contractedHours*60,best=null;
      for(let i=0;i<m.length;i++){
        let block=[m[i],m[(i+1)%m.length]],potential=m.filter(d=>!block.includes(d)).reduce((z,d)=>z+daily[d],0),short=Math.max(0,target-potential),lost=daily[block[0]]+daily[block[1]],
            partialPenalty=block.reduce((z,d)=>z+(state[d]==="am"||state[d]==="pm"?1:0),0),
            fullPenalty=block.reduce((z,d)=>z+(state[d]==="full"?1:0),0),
            noneBonus=block.reduce((z,d)=>z+(state[d]==="none"?1:0),0),
            score=short*1000000+partialPenalty*100000+fullPenalty*1000+lost-noneBonus*5000;
        if(!best||score<best.score)best={score,block}
      }
      if(best)out[s.id]=new Set(best.block)
    }
    return out
  }`;
  html = html.replace(marker, fn + marker);

  const tPrefix = 'Tt=()=>{p(e=>{let t=We(e.staff,e.linkedDaysOff),n=xe(e.staff,e.bar.slots,{';
  if (!html.includes(tPrefix)) throw new Error('Combined scheduler prefix not found');
  html = html.replace(tPrefix, 'Tt=()=>{p(e=>{let t=We(e.staff,e.linkedDaysOff),__off=CtOffPlan(e.staff,e.slots,e.bar.slots,t),n=xe(e.staff,e.bar.slots,{');

  const barMarker = 'extraUnavailable:{},preferPool:h=>h.isBarStaff,linkedPair:t';
  if (!html.includes(barMarker)) throw new Error('Combined bar off-plan marker not found');
  html = html.replace(barMarker, 'extraUnavailable:__off,preferPool:h=>h.isBarStaff,linkedPair:t');

  const restMarker = 'extraUnavailable:{},preferPool:h=>!h.isBarStaff,seedMinutes:a.minutes,seedWorkedDays:a.days,linkedPair:t';
  if (!html.includes(restMarker)) throw new Error('Combined restaurant off-plan marker not found');
  html = html.replace(restMarker, 'extraUnavailable:__off,preferPool:h=>!h.isBarStaff,seedMinutes:a.minutes,seedWorkedDays:a.days,linkedPair:t');

  return html;
};
