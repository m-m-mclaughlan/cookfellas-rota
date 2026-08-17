(() => {
  'use strict';

  const button = document.getElementById('download');
  if (!button) return;

  const filename = 'cookfellas-smart-rota-v2.html';

  function buildExportHtml() {
    const panel = document.getElementById('resultsPanel');
    const grid = document.getElementById('rotaGrid');
    if (!panel || !grid || panel.style.display === 'none' || !grid.children.length) return null;

    const metrics = document.getElementById('metrics')?.innerHTML || '';
    const warnings = document.getElementById('warnings')?.innerHTML || '';
    const rota = grid.innerHTML;

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cookfellas Smart Rota V2</title>
<style>
*{box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:20px;color:#16211B;background:#fff}h1{font:700 24px Georgia,serif;margin:0 0 4px}p{margin:0 0 16px;color:#5c665f}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0 18px}.metric{border:1px solid #bbb;border-radius:8px;padding:8px}.metric .k{font-size:10px;color:#6b746e}.metric .v{font:700 17px Georgia,serif;margin-top:2px}.warn,.ok{padding:8px;border:1px solid #bbb;border-radius:7px;margin:6px 0;font-size:12px}.rotaGrid{display:grid;grid-template-columns:repeat(7,minmax(145px,1fr));gap:7px;overflow:auto}.dayResult{border:1px solid #bbb;border-radius:8px;padding:8px;min-width:145px}.dayResult h3{margin:0 0 7px;font-size:13px}.areaLabel{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#6b746e;margin:7px 0 3px}.shift{border-left:3px solid #6FAE8C;background:#f4f5f2;border-radius:5px;padding:6px;margin:4px 0}.shift.bar{border-left-color:#C9A24B}.shift.unfilled{border-left-color:#C98A6B}.shift .time{font-weight:800;font-size:12px}.shift .who{font-size:12px;margin-top:2px}.shift .role{font-size:10px;color:#6b746e}@media print{body{padding:8px}.rotaGrid{grid-template-columns:repeat(7,1fr)}.dayResult{break-inside:avoid}.metrics{grid-template-columns:repeat(6,1fr)}}
</style>
</head>
<body>
<h1>Cookfella's Bar &amp; Eatery — Smart Rota V2</h1>
<p>Generated from coverage requirements</p>
<div class="metrics">${metrics}</div>
<div>${warnings}</div>
<div class="rotaGrid">${rota}</div>
</body>
</html>`;
  }

  async function saveRota(event) {
    event?.preventDefault?.();
    const html = buildExportHtml();
    if (!html) {
      alert('Generate the rota first, then tap Save rota.');
      return;
    }

    button.disabled = true;
    const oldText = button.textContent;
    button.textContent = 'Preparing…';

    try {
      const file = new File([html], filename, { type: 'text/html' });

      // iPhone/iPad: native share sheet is much more reliable than a hidden
      // blob download. “Save to Files” gives the user an actual HTML file.
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            title: 'Cookfellas Smart Rota V2',
            files: [file]
          });
          return;
        } catch (err) {
          if (err && err.name === 'AbortError') return;
          console.warn('File share failed; falling back to browser download', err);
        }
      }

      // Desktop / browsers with normal download support.
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      console.error(err);
      alert('Could not save the rota. Try opening this page in Safari and tap Save rota again.');
    } finally {
      button.disabled = false;
      button.textContent = oldText;
    }
  }

  button.onclick = saveRota;
  button.textContent = 'Save rota';
})();
