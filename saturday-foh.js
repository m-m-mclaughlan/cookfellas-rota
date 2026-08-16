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

    return html;
  } catch (error) {
    console.error('Saturday split-cover WLB patch skipped:', error);
    return html;
  }
};
