/* The Pre-Token Radar — renders window.RADAR (data.js) into the page.
   No network, no framework. Hash routes: #detail=<slug> opens a protocol's
   dossier, #filter=<text> applies a board search, #category=<name> and
   #chain=<name> apply those filters. */
(function () {
  'use strict';
  var R = window.RADAR;
  if (!R) { document.getElementById('meta-line').textContent = 'No data: data.js did not load.'; return; }

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + n;
  }
  function moneyFull(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function pct(v) { return (v === null || v === undefined) ? 'n/a' : (v > 0 ? '+' : '') + v.toFixed(1) + '%'; }
  function ageText(d) { return d === null ? 'n/a' : d >= 365 ? (d / 365).toFixed(1) + 'y' : d + 'd'; }
  function x(v) { return '×' + v.toFixed(2); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  /* ---- header and headline figures ---- */
  $('meta-line').textContent = 'Snapshot ' + R.as_of + ' · ' + R.source.replace('DefiLlama ', '') +
    ' · watchlist floor ' + moneyFull(R.floor_usd) + ' · model ' + R.model_version;
  var top = R.rows[0];
  $('stats').innerHTML =
    stat(moneyFull(top ? top.implied_value_usd : 0), 'implied value of the top protocol' + (top ? ' — ' + top.name : '')) +
    stat(R.board_size + ' rows', R.watchlist_size + ' watchlist + ' + R.early_size + ' early, below the floor') +
    stat('×' + R.fit.global_median_ratio.toFixed(2), 'median market-cap / TVL of the ' + R.fit.n + ' live-token peers') +
    stat('R² ' + R.fit.r_squared.toFixed(2), 'fit on ' + R.fit.n + ' live protocols; walk-forward error ×' + R.fit.walkforward_median_error_x.toFixed(2));
  function stat(b, s) { return '<div class="stat"><b>' + esc(b) + '</b><span>' + esc(s) + '</span></div>'; }

  /* ---- the model, in the open ---- */
  $('formula').textContent = 'log(market cap) = ' + R.fit.intercept.toFixed(3) + ' + ' + R.fit.slope.toFixed(3) +
    ' · log(TVL)      implied = fitted × category residual × momentum × tenure × breadth';
  $('fit-note').textContent = 'Fitted on the ' + R.fit.n + ' live-token protocols in this snapshot (market cap and TVL both positive). ' +
    'A pre-token protocol is read off the same line: its TVL goes in, a fitted market cap comes out, and the four factors adjust it. ' +
    'The median live protocol misses the line by ×' + R.fit.median_error_x.toFixed(2) + ' — the fit is an anchor, not a price.';
  $('fit-stats').innerHTML = kv([
    ['Live protocols fitted', String(R.fit.n)],
    ['R-squared', R.fit.r_squared.toFixed(3)],
    ['Median in-sample error', '×' + R.fit.median_error_x.toFixed(2)],
    ['Global median mcap / TVL', '×' + R.fit.global_median_ratio.toFixed(3)],
  ]);
  $('walk-note').textContent = 'Out-of-sample, not in-sample: the line is re-fitted on the oldest ' + R.fit.walkforward_train +
    ' dated live protocols and tested on the newest ' + R.fit.walkforward_test + ', the ones the fit never saw. ' +
    'Half the held-out protocols land within ×' + R.fit.walkforward_median_error_x.toFixed(2) + ' of their real market cap.';
  $('walk-stats').innerHTML = kv([
    ['Train (oldest 70%)', String(R.fit.walkforward_train) + ' protocols'],
    ['Test (newest 30%)', String(R.fit.walkforward_test) + ' protocols'],
    ['Median held-out error', '×' + R.fit.walkforward_median_error_x.toFixed(2)],
    ['Mean held-out error', '×' + R.fit.walkforward_mean_error_x.toFixed(2)],
  ]);
  function kv(pairs) { return pairs.map(function (p) { return '<dt>' + esc(p[0]) + '</dt><dd>' + esc(p[1]) + '</dd>'; }).join(''); }

  /* ---- scatter: live tokens, log TVL vs log market cap ---- */
  (function scatter() {
    var pts = R.fit_points || [];
    var W = 560, H = 340, padL = 46, padB = 34, padT = 12, padR = 10;
    if (!pts.length) { $('scatter').innerHTML = '<p class="note">No fit points in data.js.</p>'; return; }
    var xs = pts.map(function (p) { return Math.log10(p.tvl); });
    var ys = pts.map(function (p) { return Math.log10(p.mcap); });
    var x0 = Math.floor(Math.min.apply(null, xs)), x1 = Math.ceil(Math.max.apply(null, xs));
    var y0 = Math.floor(Math.min.apply(null, ys)), y1 = Math.ceil(Math.max.apply(null, ys));
    function X(v) { return padL + (v - x0) / (x1 - x0) * (W - padL - padR); }
    function Y(v) { return H - padB - (v - y0) / (y1 - y0) * (H - padT - padB); }
    var ln10 = Math.LN10;
    function lineY(logTvl) { return (R.fit.intercept + R.fit.slope * logTvl) / ln10; }
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '">';
    s += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#fffdf6"/>';
    var gx;
    for (gx = x0; gx <= x1; gx++) {
      s += '<line x1="' + X(gx) + '" y1="' + padT + '" x2="' + X(gx) + '" y2="' + (H - padB) + '" stroke="#e4dcc6" stroke-width="1"/>';
      s += '<text x="' + X(gx) + '" y="' + (H - 12) + '" font-size="10" fill="#7d8b99" text-anchor="middle" font-family="monospace">10^' + gx + '</text>';
    }
    var gy;
    for (gy = y0; gy <= y1; gy++) {
      s += '<line x1="' + padL + '" y1="' + Y(gy) + '" x2="' + (W - padR) + '" y2="' + Y(gy) + '" stroke="#e4dcc6" stroke-width="1"/>';
      s += '<text x="' + (padL - 6) + '" y="' + (Y(gy) + 3) + '" font-size="10" fill="#7d8b99" text-anchor="end" font-family="monospace">10^' + gy + '</text>';
    }
    s += '<text x="' + (W / 2) + '" y="' + (H - 0) + '" font-size="10" fill="#7d8b99" text-anchor="middle"></text>';
    s += '<line x1="' + X(x0) + '" y1="' + Y(lineY(x0 * ln10)) + '" x2="' + X(x1) + '" y2="' + Y(lineY(x1 * ln10)) + '" stroke="#b4552d" stroke-width="2"/>';
    pts.forEach(function (p) {
      s += '<circle cx="' + X(Math.log10(p.tvl)).toFixed(1) + '" cy="' + Y(Math.log10(p.mcap)).toFixed(1) + '" r="3.2" fill="#1e6b4f" opacity="0.75"/>';
    });
    s += '<text x="' + (W - padR) + '" y="' + (Y(lineY(x1 * ln10)) - 6) + '" font-size="11" fill="#b4552d" text-anchor="end" font-family="monospace">fitted line</text>';
    s += '<text x="' + padL + '" y="16" font-size="11" fill="#4a5a6a" font-family="monospace">log market cap (y) vs log TVL (x), USD</text>';
    s += '</svg>';
    $('scatter').innerHTML = s;
  })();

  /* ---- category peer table ---- */
  $('peer-table').querySelector('tbody').innerHTML = R.categories.map(function (c) {
    return '<tr><td>' + esc(c.category) + '</td><td class="num">' + c.peers + '</td><td class="num">' + x(c.residual_x) + '</td><td class="num">×' + c.median_ratio.toFixed(3) + '</td></tr>';
  }).join('');

  /* ---- live-token comparison ---- */
  $('live-table').querySelector('tbody').innerHTML = R.live.map(function (p) {
    return '<tr><td class="name">' + esc(p.name) + '</td><td>' + esc(p.category || '—') + '</td><td class="num">' + money(p.tvl_usd) + '</td><td class="num">' + money(p.mcap_usd) + '</td><td class="num">×' + p.ratio.toFixed(2) + '</td></tr>';
  }).join('');

  /* ---- board: filters, sort, render ---- */
  var cats = [];
  var chains = [];
  R.rows.forEach(function (r) {
    if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category);
    r.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
  });
  cats.sort(); chains.sort();
  $('f-category').innerHTML = '<option value="">All categories</option>' + cats.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('');
  $('f-chain').innerHTML = '<option value="">All chains</option>' + chains.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('');

  var watchSet = {};
  R.rows.forEach(function (r) { watchSet[r.slug] = false; });
  (R.watchlist || []).forEach(function (s) { watchSet[s] = true; });

  var selected = null;
  function visibleRows() {
    var q = $('f-search').value.trim().toLowerCase();
    var cat = $('f-category').value, ch = $('f-chain').value;
    var minReady = parseInt($('f-ready').value, 10) || 0;
    var wlOnly = $('f-watchlist').checked;
    var sort = $('f-sort').value;
    var rows = R.rows.filter(function (r) {
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      if (cat && r.category !== cat) return false;
      if (ch && r.chains.indexOf(ch) < 0) return false;
      if (r.readiness < minReady) return false;
      if (wlOnly && !watchSet[r.slug]) return false;
      return true;
    });
    var by = {
      rank: function (a, b) { return a.rank - b.rank; },
      tvl: function (a, b) { return b.tvl_usd - a.tvl_usd; },
      growth: function (a, b) { return (b.change_7d || 0) - (a.change_7d || 0); },
      age: function (a, b) { return (b.age_days || 0) - (a.age_days || 0); },
      readiness: function (a, b) { return b.readiness - a.readiness || a.rank - b.rank; },
    };
    rows.sort(by[sort] || by.rank);
    return rows;
  }

  function renderBoard() {
    var rows = visibleRows();
    $('row-count').textContent = rows.length + ' of ' + R.rows.length + ' protocols shown';
    $('board-table').querySelector('tbody').innerHTML = rows.map(function (r) {
      var g = r.change_7d;
      var gCls = g === null ? '' : g >= 0 ? 'up' : 'down';
      return '<tr class="row' + (selected === r.slug ? ' active' : '') + '" data-slug="' + esc(r.slug) + '">' +
        '<td class="num">' + r.rank + '</td>' +
        '<td class="name">' + esc(r.name) + (watchSet[r.slug] ? '<span class="badge">WATCHLIST</span>' : '') + '<span class="sub">' + esc(r.slug) + '</span></td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td>' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num ' + gCls + '">' + pct(g) + '</td>' +
        '<td class="num">' + ageText(r.age_days) + '</td>' +
        '<td class="num"><b>' + money(r.implied_value_usd) + '</b></td>' +
        '<td class="num">' + r.readiness + '</td></tr>';
    }).join('');
  }

  /* ---- detail dossier ---- */
  var PHASES = ['Prepare', 'Position', 'Stay active', 'Hold', 'Claim & record'];
  function select(slug, scroll) {
    var r = null;
    R.rows.forEach(function (row) { if (row.slug === slug) r = row; });
    if (!r) return;
    selected = slug;
    renderBoard();
    var panel = $('detail-panel');
    panel.hidden = false;
    $('detail-title').textContent = '#' + r.rank + ' — ' + r.name;
    $('detail-sub').textContent = (r.category || 'Uncategorised') + ' · ' + r.chains.join(', ') + ' · ' +
      (watchSet[r.slug] ? 'on the watchlist · ' : 'below the watchlist floor · ') + 'records no token in DefiLlama';
    $('detail-facts').innerHTML = kv([
      ['Implied value', moneyFull(r.implied_value_usd)],
      ['TVL', moneyFull(r.tvl_usd)],
      ['7-day TVL change', pct(r.change_7d)],
      ['Age with no token', r.age_days === null ? 'not reported' : r.age_days + ' days'],
      ['Launch-readiness', r.readiness + ' / 100'],
      ['Fitted value (off the line)', moneyFull(r.fitted_value_usd)],
    ]);
    // Factor waterfall: running value after each multiplier, log-scaled bars.
    var steps = [
      ['Fitted off the line', r.fitted_value_usd, ''],
      ['Category residual', r.fitted_value_usd * r.category_residual_x, x(r.category_residual_x)],
      ['Momentum (7d)', r.fitted_value_usd * r.category_residual_x * r.momentum_x, x(r.momentum_x)],
      ['Tenure (no token)', r.fitted_value_usd * r.category_residual_x * r.momentum_x * r.tenure_x, x(r.tenure_x)],
      ['Chain breadth', r.implied_value_usd, x(r.breadth_x)],
    ];
    var maxV = Math.max.apply(null, steps.map(function (s) { return s[1]; }));
    var W = 560, rowH = 34, H = steps.length * rowH + 8;
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Factor waterfall for the implied value">';
    steps.forEach(function (st, i) {
      var y = 8 + i * rowH;
      var w = Math.max(2, (Math.log(Math.max(st[1], 1)) / Math.log(Math.max(maxV, 2))) * (W - 210));
      var col = i === steps.length - 1 ? '#1e6b4f' : i === 0 ? '#4a5a6a' : '#8a6d1b';
      s += '<text x="0" y="' + (y + 15) + '" font-size="12" fill="#1d2a38">' + esc(st[0]) + '</text>';
      s += '<rect x="150" y="' + y + '" width="' + w.toFixed(1) + '" height="20" fill="' + col + '" opacity="0.85"/>';
      s += '<text x="' + (160 + w).toFixed(1) + '" y="' + (y + 15) + '" font-size="12" fill="#1d2a38" font-family="monospace">' + money(st[1]) + (st[2] ? '  ' + st[2] : '') + '</text>';
    });
    s += '</svg>';
    $('waterfall').innerHTML = s;
    $('detail-model-note').textContent = 'Read it left to right: the fitted value is what the regression says a protocol of this TVL is worth; ' +
      'each factor then moves it up or down. The last bar is the board\'s implied value, ' + moneyFull(r.implied_value_usd) + '.';
    $('detail-farm').innerHTML = r.farm_steps.map(function (step, i) {
      var m = step.match(/^(.*) Cost: (.*)\. Time: (.*)\.$/);
      var body = m ? m[1] : step;
      var cost = m ? m[2] : '', time = m ? m[3] : '';
      return '<li><span class="phase">' + PHASES[i] + '</span>' + esc(body) +
        '<span class="chips"><span class="chip">Cost: ' + esc(cost) + '</span><span class="chip">Time: ' + esc(time) + '</span></span></li>';
    }).join('');
    if (scroll) panel.scrollIntoView({ behavior: 'auto', block: 'start' });
  }

  $('board-table').addEventListener('click', function (e) {
    var tr = e.target.closest('tr.row');
    if (!tr) return;
    try { history.replaceState(null, '', '#detail=' + tr.getAttribute('data-slug')); } catch (err) { /* hash only */ }
    select(tr.getAttribute('data-slug'), false);
  });
  ['f-search', 'f-category', 'f-chain', 'f-ready', 'f-watchlist', 'f-sort'].forEach(function (id) {
    $(id).addEventListener('input', renderBoard);
    $(id).addEventListener('change', renderBoard);
  });

  $('footer-line').textContent = 'Data: ' + R.source + ' · snapshot ' + R.as_of + ' · ' + R.rows.length +
    ' rows · model ' + R.model_version + ' · this page reads data.js only; it makes no network request.';

  /* ---- hash routes, for deep links and screenshots ---- */
  renderBoard();
  var hash = window.location.hash || '';
  var dm = hash.match(/#detail=([A-Za-z0-9._-]+)/);
  var fm = hash.match(/#filter=([^&]+)/);
  var cm = hash.match(/#category=([^&]+)/);
  var chm = hash.match(/#chain=([^&]+)/);
  if (fm) { $('f-search').value = decodeURIComponent(fm[1]); renderBoard(); }
  if (cm) { $('f-category').value = decodeURIComponent(cm[1]); renderBoard(); }
  if (chm) { $('f-chain').value = decodeURIComponent(chm[1]); renderBoard(); }
  if (fm || cm || chm) { $('board-panel').scrollIntoView({ behavior: 'auto', block: 'start' }); }
  if (dm) { select(dm[1], true); }
})();
