window.applyFranFridayPatch = function (html) {
  try {
    // The WLB template keeps the same Friday coverage and paid hours by
    // splitting the old 11:30-9 core into 11:30-5 plus 5-9.
    const oldFridayTemplate = '{"day":"Fri","role":"floor","time":"11:30-9","isOpen":true},{"day":"Fri","role":"floor","time":"12-2:30"}';
    const newFridayTemplate = '{"day":"Fri","role":"floor","time":"11:30-5","isOpen":true},{"day":"Fri","role":"floor","time":"12-2:30"},{"day":"Fri","role":"floor","time":"5-9"}';
    if (html.includes(oldFridayTemplate)) {
      html = html.replace(oldFridayTemplate, newFridayTemplate);
    } else {
      console.warn('Fran Friday template marker not found; leaving template unchanged.');
    }

    // Keep the established manager pattern but protect Fran's Friday evening.
    const oldFranAnchor = 'anchor("Fran","r","Fri","11:30-9","floor");';
    const newFranAnchor = 'anchor("Fran","r","Fri","11:30-5","floor");';
    if (html.includes(oldFranAnchor)) {
      html = html.replace(oldFranAnchor, newFranAnchor);
    } else {
      console.warn('Fran Friday optimizer anchor not found; leaving optimizer unchanged.');
    }

    return html;
  } catch (error) {
    console.error('Fran Friday WLB patch skipped:', error);
    return html;
  }
};
