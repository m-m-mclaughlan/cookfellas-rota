window.applySaturdayFohPatch = function (html) {
  try {
    // WLB Saturday evening mirrors Friday headcount:
    // 4 customer-facing FOH from 5-9, then 3 FOH to finish.
    // Potwash is separate.
    // One of the non-manager floor shifts now starts at 2pm rather than 5pm
    // to remove the Saturday afternoon blind spot while preserving the
    // evening headcount and the dedicated 5pm runner.
    const oldSaturday = '{"day":"Sat","role":"running","time":"5-f"},{"day":"Sat","role":"floor","time":"5-f (closedown)","isClose":true},{"day":"Sun"';
    const newSaturday = '{"day":"Sat","role":"running","time":"5-f"},{"day":"Sat","role":"floor","time":"5-f (closedown)","isClose":true},{"day":"Sat","role":"floor","time":"2-f"},{"day":"Sun"';

    if (html.includes(oldSaturday)) {
      html = html.replace(oldSaturday, newSaturday);
    } else {
      console.warn('Saturday afternoon-cover WLB marker not found; leaving Saturday template unchanged.');
    }

    return html;
  } catch (error) {
    console.error('Saturday afternoon-cover WLB patch skipped:', error);
    return html;
  }
};
