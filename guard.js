/* Shows a clear message instead of a page stuck on "Loading…". */
(function () {
  function show(detail) {
    var m = document.getElementById('main'); if (!m || !/^\s*Loading/.test(m.textContent || '')) return;
    m.innerHTML = '<div style="max-width:560px;margin:40px auto;font:16px/1.5 system-ui,sans-serif;color:#0b1f4d"><h2>The page could not start</h2><p>This usually means the files were opened the wrong way. Please:</p><ol><li>Unzip the whole folder first (do not open the page from inside the zip).</li><li>Open <b>index.html</b> from the unzipped <b>usl</b> folder in Chrome, Edge or Firefox, with the <b>css</b> and <b>js</b> folders next to it.</li><li>Do not use a private/incognito window or an in-app preview that blocks storage.</li></ol>' + (detail ? '<p style="color:#667;font-size:.85rem">Details: ' + String(detail).replace(/[<>&]/g, '') + '</p>' : '') + '</div>';
  }
  window.addEventListener('error', function (e) { setTimeout(function () { show(e.message); }, 300); });
  window.addEventListener('unhandledrejection', function (e) { setTimeout(function () { show(e.reason && e.reason.message || e.reason); }, 300); });
  setTimeout(function () { show(typeof window.USL === 'undefined' ? 'The script files did not load.' : ''); }, 4000);
})();
