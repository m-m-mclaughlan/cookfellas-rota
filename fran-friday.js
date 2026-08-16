window.applyFranFridayPatch = function (html) {
  try {
    // Fran gets Friday evening off by splitting the old 11:30-9 core.
    const oldFridayTemplate = '{"day":"Fri","role":"floor","time":"11:30-9","isOpen":true},{"day":"Fri","role":"floor","time":"12-2:30"}';
    const newFridayTemplate = '{"day":"Fri","role":"floor","time":"11:30-5","isOpen":true},{"day":"Fri","role":"floor","time":"12-2:30"},{"day":"Fri","role":"floor","time":"5-9"}';
    if (html.includes(oldFridayTemplate)) {
      html = html.replace(oldFridayTemplate, newFridayTemplate);
    } else {
      console.warn('Fran Friday template marker not found; leaving daytime template unchanged.');
    }

    // Friday evening requirement: four customer-facing FOH from 5-9,
    // explicitly including a runner. Potwash remains a separate fifth body.
    // After 9 the 5-9 support shift leaves, so three FOH remain to finish.
    const oldFridayEvening = '{"day":"Fri","role":"running","time":"6-f"},{"day":"Fri","role":"floor","time":"6-f"}';
    const newFridayEvening = '{"day":"Fri","role":"running","time":"5-f"},{"day":"Fri","role":"floor","time":"5-f"}';
    if (html.includes(oldFridayEvening)) {
      html = html.replace(oldFridayEvening, newFridayEvening);
    } else {
      console.warn('Friday four-FOH evening marker not found; leaving evening template unchanged.');
    }

    // Keep the established manager pattern but protect Fran's Friday evening.
    const oldFranAnchor = 'anchor("Fran","r","Fri","11:30-9","floor");';
    const newFranAnchor = 'anchor("Fran","r","Fri","11:30-5","floor");';
    if (html.includes(oldFranAnchor)) {
      html = html.replace(oldFranAnchor, newFranAnchor);
    } else {
      console.warn('Fran Friday optimizer anchor not found; leaving optimizer anchor unchanged.');
    }

    // Quality-of-life refinement for non-core staff: make area preference and
    // avoiding a second same-day shift much more important. These stay soft
    // penalties so availability can still override them when necessary.
    const oldScore = 'area=q.board==="b"?(s.isBarStaff?-500:500):(s.isBarStaff?500:-500),mgr=s.isManager?250:0,split=assigned(s.id).some(r=>r.slot.day===q.slot.day)?800:0;';
    const newScore = 'area=q.board==="b"?(s.isBarStaff?-2500:2500):(s.isBarStaff?2500:-2500),mgr=s.isManager?250:0,split=assigned(s.id).some(r=>r.slot.day===q.slot.day)?4000:0;';
    if (html.includes(oldScore)) {
      html = html.replace(oldScore, newScore);
    } else {
      console.warn('WLB staff-quality score marker not found; leaving scoring unchanged.');
    }

    return html;
  } catch (error) {
    console.error('Fran Friday WLB patch skipped:', error);
    return html;
  }
};
