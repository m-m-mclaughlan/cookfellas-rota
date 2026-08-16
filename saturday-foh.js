window.applySaturdayFohPatch = function (html) {
  try {
    // WLB Saturday should mirror Friday evening headcount:
    // 4 customer-facing FOH from 5-9, then 3 FOH to finish.
    // Potwash is separate. Keep the designated closer before the extra
    // generic floor shift so Fran's existing protected close anchor remains
    // attached to the closing slot after clean-label normalisation.
    const oldSaturday = '{"day":"Sat","role":"running","time":"5-f"},{"day":"Sat","role":"floor","time":"5-f (closedown)","isClose":true},{"day":"Sun"';
    const newSaturday = '{"day":"Sat","role":"running","time":"5-f"},{"day":"Sat","role":"floor","time":"5-f (closedown)","isClose":true},{"day":"Sat","role":"floor","time":"5-f"},{"day":"Sun"';

    if (html.includes(oldSaturday)) {
      html = html.replace(oldSaturday, newSaturday);
    } else {
      console.warn('Saturday four-FOH WLB marker not found; leaving Saturday template unchanged.');
    }

    return html;
  } catch (error) {
    console.error('Saturday four-FOH WLB patch skipped:', error);
    return html;
  }
};
