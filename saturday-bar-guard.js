window.applySaturdayBarGuardPatch = function (html) {
  try {
    const marker = '      let boundsDay=day=>{';
    if (!html.includes(marker)) {
      console.warn('Saturday Bar guard optimiser marker not found.');
      return html;
    }

    const guard = `      let satBar=w.filter(q=>q.board==="b"&&q.slot.day==="Sat"),
          satBar2=satBar.filter(q=>q.slot.time==="2-f"),
          satBar5=satBar.filter(q=>q.slot.time.startsWith("5-f")),
          hardSatCandidates=q=>e.filter(s=>!coreIds.has(s.id)&&room(s,q)&&!satBridgeConflict(s,q)).sort((s1,s2)=>candidateScore(s1,q)-candidateScore(s2,q));

      // Saturday Bar minimum: two people from 2pm, three from 5pm.
      // First ignore soft wanted-shift/two-day-off preferences for an empty 2-f.
      // If that still cannot fill it, promote the existing 5-f person to 2-f
      // and then refill the vacated evening slot.
      for(let q of satBar2.filter(q=>!j(q))){
        let cs=hardSatCandidates(q);
        if(cs.length){M(q,cs[0].id);continue}
        let moved=!1;
        for(let src of satBar5.filter(r=>j(r))){
          let s=R[j(src)];
          if(!s||coreIds.has(s.id))continue;
          let old=j(src);M(src,null);
          if(room(s,q)&&!satBridgeConflict(s,q)){M(q,s.id);moved=!0;break}
          M(src,old)
        }
        if(!moved)console.warn('Saturday Bar 2-f coverage could not be filled from available floor-trained staff.');
      }

      for(let q of satBar5.filter(q=>!j(q))){
        let cs=hardSatCandidates(q);
        if(cs.length)M(q,cs[0].id);
        else console.warn('Saturday Bar 5-f coverage could not be filled from available floor-trained staff.');
      }

`;

    return html.replace(marker, guard + marker);
  } catch (error) {
    console.error('Saturday Bar coverage guard skipped:', error);
    return html;
  }
};
