window.applySaturdayFohPatch = function (html) {
  try {
    // Saturday Restaurant coverage:
    // 2 customer-facing FOH continuously from 12-5,
    // 4 customer-facing FOH from 5-9,
    // 3 customer-facing FOH from 9-finish.
    // Potwash is separate.
    // Merge the old 12-2:30 support shift and extra 2-f floor shift into
    // one continuous 12-f floor shift, avoiding both the noon blind spot
    // and unnecessary overlapping labour.
    const oldSaturday = '{"day":"Sat","role":"floor","time":"11-9","isOpen":true},{"day":"Sat","role":"floor","time":"12-2:30"},{"day":"Sat","role":"pots","time":"11-5"},{"day":"Sat","role":"pots","time":"5-f"},{"day":"Sat","role":"running","time":"5-f"},{"day":"Sat","role":"floor","time":"5-f (closedown)","isClose":true},{"day":"Sun"';
    const newSaturday = '{"day":"Sat","role":"floor","time":"11-9","isOpen":true},{"day":"Sat","role":"floor","time":"12-f"},{"day":"Sat","role":"pots","time":"11-5"},{"day":"Sat","role":"pots","time":"5-f"},{"day":"Sat","role":"running","time":"5-f"},{"day":"Sat","role":"floor","time":"5-f (closedown)","isClose":true},{"day":"Sun"';

    if (html.includes(oldSaturday)) {
      html = html.replace(oldSaturday, newSaturday);
    } else {
      console.warn('Saturday continuous-cover WLB marker not found; leaving Saturday template unchanged.');
    }

    return html;
  } catch (error) {
    console.error('Saturday continuous-cover WLB patch skipped:', error);
    return html;
  }
};
