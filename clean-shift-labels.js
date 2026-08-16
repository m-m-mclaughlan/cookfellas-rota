window.applyCleanShiftLabelsPatch = function (html) {
  try {
    // Remove the redundant visible "(closedown)" suffix from all built-in
    // template/optimizer literals. isClose remains the source of truth.
    html = html.split(' (closedown)').join('');

    // Any shift created from a template (standard, WLB or saved) is normalised.
    const eeMarker = 'ee=s=>(s||[]).map(g=>({id:oe(),isOpen:!1,isClose:!1,...g}))';
    const eeReplacement = 'ee=s=>(s||[]).map(g=>({id:oe(),isOpen:!1,isClose:!1,...g,time:String(g&&g.time||"").replace(/\\s*\\(closedown\\)\\s*/gi,"").trim()}))';
    if (html.includes(eeMarker)) {
      html = html.replace(eeMarker, eeReplacement);
    } else {
      console.warn('Shift-template label normaliser marker not found.');
    }

    // Clean currently persisted Restaurant shifts as they are loaded.
    const restaurantLoadMarker = 'I=(s.slots||[]).map(b=>({...b,role:b.role==="bar"?"running":b.role}))';
    const restaurantLoadReplacement = 'I=(s.slots||[]).map(b=>({...b,role:b.role==="bar"?"running":b.role,time:String(b&&b.time||"").replace(/\\s*\\(closedown\\)\\s*/gi,"").trim()}))';
    if (html.includes(restaurantLoadMarker)) {
      html = html.replace(restaurantLoadMarker, restaurantLoadReplacement);
    } else {
      console.warn('Restaurant saved-shift label normaliser marker not found.');
    }

    // Clean currently persisted Bar shifts as they are loaded.
    const barLoadMarker = '$={...te.bar,...s.bar||{},staff:void 0};return delete $.staff,{...te,...s,staff:J,slots:I,bar:$}';
    const barLoadReplacement = '$={...te.bar,...s.bar||{},staff:void 0};$.slots=($.slots||[]).map(b=>({...b,time:String(b&&b.time||"").replace(/\\s*\\(closedown\\)\\s*/gi,"").trim()}));return delete $.staff,{...te,...s,staff:J,slots:I,bar:$}';
    if (html.includes(barLoadMarker)) {
      html = html.replace(barLoadMarker, barLoadReplacement);
    } else {
      console.warn('Bar saved-shift label normaliser marker not found.');
    }

    // Normalise manually entered shifts too, so the suffix cannot be re-added.
    html = html.split('time:t.time.trim()').join('time:t.time.trim().replace(/\\s*\\(closedown\\)\\s*/gi,"").trim()');

    // Belt-and-braces export cleanup for any legacy value that reaches print.
    const exportMarker = 'Ie(y.time)+(y.role==="pots"?\' <strong class="pots-tag">POTS</strong>\':"")';
    const exportReplacement = 'Ie(String(y.time||"").replace(/\\s*\\(closedown\\)\\s*/gi,"").trim())+(y.role==="pots"?\' <strong class="pots-tag">POTS</strong>\':"")';
    if (html.includes(exportMarker)) {
      html = html.replace(exportMarker, exportReplacement);
    }

    return html;
  } catch (error) {
    console.error('Clean shift labels patch skipped:', error);
    return html;
  }
};
