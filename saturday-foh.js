window.applySaturdayFohPatch = function (html) {
  try {
    // Saturday Restaurant coverage:
    // 2 customer-facing FOH continuously from 12-5,
    // 4 customer-facing FOH from 5-9,
    // 3 customer-facing FOH from 9-finish.
    // Potwash is separate.
    // Keep the daytime support shift reasonable at 12-5, then hand over to
    // a separate 5-f floor shift rather than asking one person to work 12-f.
    // The designated closer remains before the extra floor shift so Fran's
    // protected Saturday close anchor continues to attach to the close slot.
    const oldSaturday = '{"day":"Sat","role":"floor","time":"11-9","isOpen":true},{"day":"Sat","role":"floor","time":"12-2:30"},{"day":"Sat","role":"pots","time":"11-5"},{"day":"Sat","role":"pots","time":"5-f"},{"day":"Sat","role":"running","time":"5-f"},{"day":"Sat","role":"floor","time":"5-f (closedown)","isClose":true},{"day":"Sun"';
    const newSaturday = '{"day":"Sat","role":"floor","time":"11-9","isOpen":true},{"day":"Sat","role":"floor","time":"12-5"},{"day":"Sat","role":"pots","time":"11-5"},{"day":"Sat","role":"pots","time":"5-f"},{"day":"Sat","role":"running","time":"5-f"},{"day":"Sat","role":"floor","time":"5-f (closedown)","isClose":true},{"day":"Sat","role":"floor","time":"5-f"},{"day":"Sun"';

    if (html.includes(oldSaturday)) {
      html = html.replace(oldSaturday, newSaturday);
    } else {
      console.warn('Saturday split-cover WLB marker not found; leaving Saturday template unchanged.');
    }

    // The base scheduler may already have put the same person on the new
    // 12-5 bridge and a 5-f Saturday shift before the WLB optimiser runs.
    // Preserve 12-5 and release any same-person 5-f assignment for refill.
    const optimizerCoreMarker = 'let coreIds=new Set(core.map(s=>s.id)),';
    const optimizerCoreReplacement = 'for(let s of e){let d=w.find(q=>q.slot.day==="Sat"&&q.slot.time==="12-5"&&j(q)===s.id);if(d)for(let q of w.filter(q=>q.slot.day==="Sat"&&q.slot.time.startsWith("5-f")&&j(q)===s.id))M(q,null)}\n      let satBridgeConflict=(s,q)=>q.slot.day==="Sat"&&((q.slot.time==="12-5"&&assigned(s.id).some(r=>r.slot.day==="Sat"&&r.slot.time.startsWith("5-f")))||(q.slot.time.startsWith("5-f")&&assigned(s.id).some(r=>r.slot.day==="Sat"&&r.slot.time==="12-5"))),\n          coreIds=new Set(core.map(s=>s.id)),';
    if (html.includes(optimizerCoreMarker)) {
      html = html.replace(optimizerCoreMarker, optimizerCoreReplacement);
    } else {
      console.warn('Saturday split guard optimiser marker not found.');
    }

    const canFillMarker = 'if(coreIds.has(s.id)||!room(s,q))return!1;';
    const canFillReplacement = 'if(coreIds.has(s.id)||!room(s,q)||satBridgeConflict(s,q))return!1;';
    if (html.includes(canFillMarker)) {
      html = html.replace(canFillMarker, canFillReplacement);
    } else {
      console.warn('Saturday split guard candidate marker not found.');
    }

    return html;
  } catch (error) {
    console.error('Saturday split-cover WLB patch skipped:', error);
    return html;
  }
};
