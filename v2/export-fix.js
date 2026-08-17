(() => {
  'use strict';

  const button = document.getElementById('download');
  if (!button) return;

  const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const filename = 'cookfellas-weekly-rota.html';

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));

  function readRotaFromScreen() {
    const grid = document.getElementById('rotaGrid');
    const panel = document.getElementById('resultsPanel');
    if (!grid || !panel || panel.style.display === 'none' || !grid.children.length) return null;

    const data = { restaurant: {}, bar: {} };
    const order = { restaurant: [], bar: [] };

    for (const dayCard of [...grid.querySelectorAll('.dayResult')]) {
      const day = dayCard.querySelector('h3')?.textContent?.trim();
      if (!DAYS.includes(day)) continue;

      let area = null;
      for (const child of [...dayCard.children]) {
        if (child.classList.contains('areaLabel')) {
          const text = child.textContent.trim().toLowerCase();
          area = text === 'restaurant' ? 'restaurant' : text === 'bar' ? 'bar' : null;
          continue;
        }
        if (!area || !child.classList.contains('shift')) continue;

        let name = child.querySelector('.who')?.textContent?.trim() || 'UNFILLED';
        const time = child.querySelector('.time')?.textContent?.trim() || '';
        const rawRole = child.querySelector('.role')?.textContent?.trim().toLowerCase() || '';
        const role = area === 'restaurant' ? rawRole : 'bar';
        if (!time) continue;
        if (/unfilled/i.test(name)) name = 'UNFILLED';

        if (!data[area][name]) {
          data[area][name] = Object.fromEntries(DAYS.map(d => [d, []]));
          order[area].push(name);
        }
        data[area][name][day].push({ time: time.replace('–','-'), role });
      }
    }

    return { data, order };
  }

  function renderedShift(area, shift) {
    const time = esc(shift.time);
    if (area === 'restaurant' && shift.role === 'pots') {
      return `<span class="shiftPart"><span class="dutyTag potsTag">POTS</span><span>${time}</span></span>`;
    }
    if (area === 'restaurant' && shift.role === 'running') {
      return `<span class="shiftPart"><span class="dutyTag runningTag">RUNNING</span><span>${time}</span></span>`;
    }
    return `<span class="shiftPart"><span>${time}</span></span>`;
  }

  function tableFor(area, parsed) {
    const people = parsed.order[area];
    const title = area === 'restaurant' ? 'Restaurant' : 'Bar';
    const legend = area === 'restaurant'
      ? '<div class="legend"><span class="dutyTag potsTag">POTS</span> pot wash duty <span class="legendGap">·</span> <span class="dutyTag runningTag">RUNNING</span> food running duty</div>'
      : '';
    const body = people.map(name => {
      const cells = DAYS.map(day => {
        const shifts = parsed.data[area][name][day];
        return `<td>${shifts.length ? shifts.map(s => renderedShift(area, s)).join('<span class="sep"> / </span>') : '<span class="dash">—</span>'}</td>`;
      }).join('');
      return `<tr class="${name === 'UNFILLED' ? 'unfilledRow' : ''}"><th scope="row">${esc(name)}</th>${cells}</tr>`;
    }).join('');

    return `<section class="rotaSection"><h2>${title}</h2>${legend}<div class="tableWrap"><table><thead><tr><th class="nameHead">Staff</th>${DAYS.map(d => `<th>${d}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div></section>`;
  }

  function buildExportHtml() {
    const parsed = readRotaFromScreen();
    if (!parsed) return null;

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cookfellas Weekly Rota</title>
<style>
*{box-sizing:border-box}
:root{--green:#16211B;--cream:#EFEBE2;--gold:#C9A24B;--line:#B9B9B2;--muted:#6E746F;--red:#9E3E32}
body{margin:0;background:#fff;color:#172019;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:24px}
.header{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;border-bottom:3px solid var(--green);padding-bottom:10px;margin-bottom:22px}
h1{font:700 27px/1.05 Georgia,serif;margin:0;color:var(--green)}
.sub{font-size:12px;color:var(--muted);margin-top:4px}
.v2{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--gold);white-space:nowrap}
.rotaSection{margin:0 0 28px}
h2{font:700 19px Georgia,serif;color:var(--green);margin:0 0 7px}
.legend{display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin:0 0 8px;font-size:10px;color:var(--muted)}
.legendGap{margin:0 3px}
.tableWrap{width:100%;overflow-x:auto}
table{border-collapse:collapse;width:100%;min-width:900px;table-layout:fixed;border:1px solid var(--line)}
th,td{border:1px solid var(--line);padding:8px 7px;text-align:center;vertical-align:middle;font-size:12px;line-height:1.25}
thead th{background:var(--green);color:var(--cream);font-weight:800}
.nameHead{width:145px;text-align:left}
tbody th{background:var(--cream);text-align:left;color:var(--green);font-weight:800;width:145px}
tbody tr:nth-child(even) td{background:#FAF9F6}
.dash{color:#B0B2AE}
.shiftPart{display:inline-flex;align-items:center;justify-content:center;gap:4px;white-space:nowrap}
.dutyTag{display:inline-block;padding:1px 4px;border:1px solid var(--green);border-radius:4px;background:var(--cream);color:var(--green);font-size:9px;font-weight:900;letter-spacing:.05em;line-height:1.35}
.runningTag{border-style:dashed}
.sep{color:var(--muted);padding:0 2px}
.unfilledRow th,.unfilledRow td{color:var(--red);font-weight:800}
.footer{font-size:10px;color:var(--muted);text-align:right;margin-top:8px}
@page{size:landscape;margin:10mm}
@media print{body{padding:0}.tableWrap{overflow:visible}table{min-width:0;font-size:10px}th,td{padding:5px 4px}.rotaSection{break-inside:avoid}.header{margin-bottom:14px}.footer{display:none}.dutyTag{font-size:8px;padding:1px 3px}}
@media(max-width:700px){body{padding:14px}.header{align-items:flex-start;flex-direction:column;gap:5px}h1{font-size:23px}.tableWrap{border:1px solid var(--line)}table{border:0}}
</style>
</head>
<body>
<header class="header"><div><h1>Cookfella's Bar &amp; Eatery</h1><div class="sub">Weekly Front of House Rota</div></div><div class="v2">Smart Rota V2</div></header>
${tableFor('restaurant', parsed)}
${tableFor('bar', parsed)}
<div class="footer">Generated from coverage requirements</div>
</body>
</html>`;
  }

  function downloadHtml(html) {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return true;
  }

  function openPreview(html) {
    const w = window.open('', '_blank');
    if (!w) return false;
    w.document.open();
    w.document.write(html);
    w.document.close();
    return true;
  }

  function saveRota(event) {
    event?.preventDefault?.();
    const html = buildExportHtml();
    if (!html) {
      alert('Generate the rota first, then tap Save rota.');
      return;
    }

    button.disabled = true;
    const oldText = button.textContent;
    button.textContent = 'Saving…';

    try {
      downloadHtml(html);

      const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      if (isiOS) {
        setTimeout(() => {
          if (document.visibilityState === 'visible') openPreview(html);
        }, 500);
      }
    } catch (err) {
      console.error(err);
      if (!openPreview(html)) alert('Could not save or open the rota export.');
    } finally {
      setTimeout(() => {
        button.disabled = false;
        button.textContent = oldText;
      }, 700);
    }
  }

  button.onclick = saveRota;
  button.textContent = 'Save rota';
})();
