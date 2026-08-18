window.applyCleanShiftLabelsPatch = function (html) {
  try {
    // Keep the staff-facing terminology neutral. This only changes visible
    // labels; the underlying scheduling behaviour is untouched.
    html = html.split('"Aligned days off"').join('"Rota preferences"');
    html = html.split('"Work-life balance"').join('"Rota preferences"');
    html = html.split('"Work life balance"').join('"Rota preferences"');

    // Remove the redundant visible "(closedown)" suffix from all built-in
    // template/optimizer literals. isClose remains the source of truth.
    html = html.split(' (closedown)').join('');

    // Any shift created from a template (standard, rota-preference or saved) is normalised.
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

    // Staff printouts should not show the manager marker. This only changes
    // the generated staff-facing HTML; manager status in the rota app is untouched.
    const printManagerMarker = '${Ie(e.name)}${e.isManager?" (MGR)":""}';
    const printManagerReplacement = '${Ie(e.name)}';
    if (html.includes(printManagerMarker)) {
      html = html.replace(printManagerMarker, printManagerReplacement);
    } else {
      console.warn('Print manager-label marker not found.');
    }

    // Keep Restaurant printouts easy to scan by putting anybody assigned a
    // POTS duty after the normal Restaurant staff rows. Bar printouts contain
    // no pots-role slots, so their existing order is preserved.
    const printRowsMarker = '<tbody>${e.map(a=>Zt(a,t,n)).join("")}</tbody>';
    const printRowsReplacement = '<tbody>${e.slice().sort((a,l)=>{let c=t.some(h=>h.role==="pots"&&n[h.id]===a.id),y=t.some(h=>h.role==="pots"&&n[h.id]===l.id);return Number(c)-Number(y)}).map(a=>Zt(a,t,n)).join("")}</tbody>';
    if (html.includes(printRowsMarker)) {
      html = html.replace(printRowsMarker, printRowsReplacement);
    } else {
      console.warn('Print row-order marker not found.');
    }

    return html;
  } catch (error) {
    console.error('Clean shift labels patch skipped:', error);
    return html;
  }
};
