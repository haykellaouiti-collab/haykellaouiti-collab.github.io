/* Epargne & Investissement Pro - UI layer. Requires calc.js and window.I18N. */
(function () {
  'use strict';
  var C = window.EPCalc, L = window.I18N || {};
  var html = document.documentElement, LANG = html.lang || 'fr';
  var ROOT = html.getAttribute('data-root') || '';
  var LOC = { fr: 'fr-FR', en: 'en-US', ar: 'ar-TN-u-nu-latn' }[LANG] || 'fr-FR';
  var $ = function (id) { return document.getElementById(id); };
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };

  /* ---------- formatting ---------- */
  var cur = store.get('ep_cur') || html.getAttribute('data-cur') || 'TND';
  function money(n) {
    if (!isFinite(n)) return '-';
    try { return new Intl.NumberFormat(LOC, { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n); }
    catch (e) { return Math.round(n).toLocaleString() + ' ' + cur; }
  }
  function num(n, d) { return isFinite(n) ? new Intl.NumberFormat(LOC, { maximumFractionDigits: d == null ? 2 : d }).format(n) : '-'; }
  function pct(n, d) { return isFinite(n) ? num(n, d == null ? 2 : d) + ' %' : '-'; }
  function compact(n) { try { return new Intl.NumberFormat(LOC, { notation: 'compact', maximumFractionDigits: 1 }).format(n); } catch (e) { return Math.round(n); } }
  function val(id) { var el = $(id); if (!el) return NaN; var s = String(el.value).replace(/\s/g, '').replace(',', '.'); return s === '' ? NaN : parseFloat(s); }
  function bad() { for (var i = 0; i < arguments.length; i++) if (!isFinite(arguments[i])) return true; return false; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function rows(list) {
    return list.map(function (r) {
      return '<div class="res-row' + (r[2] ? ' ' + r[2] : '') + '"><span>' + r[0] + '</span><strong>' + r[1] + '</strong></div>';
    }).join('');
  }
  function show(id, h) { var el = $(id); if (el) el.innerHTML = h; }
  function invalid(id) { show(id, '<p class="warn">' + L.invalid + '</p>'); }

  /* ---------- charts (inline SVG) ---------- */
  function svgWrap(inner, label) {
    return '<svg viewBox="0 0 640 230" role="img" aria-label="' + esc(label) + '" preserveAspectRatio="xMidYMid meet">' + inner + '</svg>';
  }
  function axes(max, xl, xr) {
    var g = '';
    for (var i = 0; i <= 4; i++) {
      var y = 190 - i * 40, v = max * i / 4;
      g += '<line x1="56" x2="630" y1="' + y + '" y2="' + y + '" class="gl"/><text x="50" y="' + (y + 4) + '" text-anchor="end" class="gt">' + compact(v) + '</text>';
    }
    return g + '<text x="56" y="214" class="gt">' + xl + '</text><text x="630" y="214" text-anchor="end" class="gt">' + xr + '</text>';
  }
  function lineChart(id, values, label, xr) {
    var el = $(id); if (!el) return;
    var max = Math.max.apply(null, values) || 1, n = values.length, pts = [];
    values.forEach(function (v, i) { pts.push((56 + (574 * i / Math.max(1, n - 1))).toFixed(1) + ',' + (190 - 160 * v / max).toFixed(1)); });
    el.innerHTML = svgWrap(axes(max, '0', xr) + '<polyline points="' + pts.join(' ') + '" class="ln"/>', label);
  }
  function stackChart(id, data, label, xr) {
    var el = $(id); if (!el) return;
    var max = Math.max.apply(null, data.map(function (d) { return d.bal; })) || 1, n = data.length, bw = 574 / n, g = '';
    data.forEach(function (d, i) {
      var x = 56 + i * bw, h1 = 160 * d.contrib / max, h2 = 160 * Math.max(0, d.interest) / max;
      g += '<rect x="' + (x + 1).toFixed(1) + '" y="' + (190 - h1).toFixed(1) + '" width="' + Math.max(1, bw - 2).toFixed(1) + '" height="' + h1.toFixed(1) + '" class="b1"/>';
      g += '<rect x="' + (x + 1).toFixed(1) + '" y="' + (190 - h1 - h2).toFixed(1) + '" width="' + Math.max(1, bw - 2).toFixed(1) + '" height="' + h2.toFixed(1) + '" class="b2"/>';
    });
    el.innerHTML = svgWrap(axes(max, '1', xr) + g, label) +
      '<p class="legend"><i class="sw b1"></i>' + L.chartInv + ' <i class="sw b2"></i>' + L.chartInt + '</p>';
  }

  /* ---------- CSV ---------- */
  function download(name, text) {
    var blob = new Blob(['\ufeff' + text], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function csvNum(n) { var s = (Math.round(n * 100) / 100).toFixed(2); return LANG === 'en' ? s : s.replace('.', ','); }
  var lastLoan = null;

  /* ---------- tools ---------- */
  var tools = {
    loan: function () {
      var o = { amount: val('l_amount'), rate: val('l_rate'), years: val('l_years'), fees: val('l_fees') || 0, ins: val('l_ins') || 0, extra: val('l_extra') || 0, extraStart: val('l_start') || 1 };
      if (bad(o.amount, o.rate, o.years) || o.amount <= 0 || o.years <= 0 || o.years > 50 || o.rate < 0) { invalid('l_res'); lastLoan = null; return; }
      var r = C.loan(o); lastLoan = r;
      var list = [
        [L.monthly, money(r.pay), 'hl'], [L.insM, money(r.insM)], [L.interest, money(r.interest)],
        [L.insTot, money(r.totIns)], [L.fees, money(r.fees)], [L.totalCost, money(r.totalCost), 'hl'],
        [L.totalPaid, money(r.totalPaid)], [L.taegL, pct(r.taeg * 100)], [L.months, num(r.months, 0)]
      ];
      if (o.extra > 0) list.push([L.savedInt, money(r.savedInterest), 'good'], [L.savedMon, num(r.savedMonths, 0), 'good']);
      show('l_res', rows(list));
      lineChart('l_chart', [o.amount].concat(r.rows.map(function (x) { return x.bal; })), L.chartBal, num(r.months, 0));
      var y = {}, order = [];
      r.rows.forEach(function (x) {
        var k = Math.ceil(x.m / 12); if (!y[k]) { y[k] = { pay: 0, prin: 0, int: 0, bal: 0 }; order.push(k); }
        y[k].pay += x.pay; y[k].prin += x.prin; y[k].int += x.int; y[k].bal = x.bal;
      });
      show('l_year', order.map(function (k) {
        return '<tr><td>' + k + '</td><td>' + money(y[k].pay) + '</td><td>' + money(y[k].prin) + '</td><td>' + money(y[k].int) + '</td><td>' + money(y[k].bal) + '</td></tr>';
      }).join(''));
      show('l_month', r.rows.map(function (x) {
        return '<tr><td>' + x.m + '</td><td>' + money(x.pay) + '</td><td>' + money(x.prin) + '</td><td>' + money(x.int) + '</td><td>' + money(x.bal) + '</td></tr>';
      }).join(''));
    },
    savings: function () {
      var o = { initial: val('s_init') || 0, monthly: val('s_month') || 0, rate: val('s_rate'), years: Math.round(val('s_years')), indexation: val('s_idx') || 0 };
      if (bad(o.rate, o.years) || o.years < 1 || o.years > 80 || o.initial < 0 || o.monthly < 0) { invalid('s_res'); return; }
      var r = C.savings(o);
      show('s_res', rows([[L.finalV, money(r.final), 'hl'], [L.contribV, money(r.contrib)], [L.interestV, money(r.interest), 'good']]));
      stackChart('s_chart', r.rows, L.chartInv + ' / ' + L.chartInt, String(o.years));
    },
    goal: function () {
      var o = { target: val('g_target'), initial: val('g_init') || 0, rate: val('g_rate'), years: val('g_years') };
      if (bad(o.target, o.rate, o.years) || o.target <= 0 || o.years <= 0) { invalid('g_res'); return; }
      var r = C.goal(o);
      show('g_res', r.monthly === 0 ? '<p class="good-note">' + L.goalReached + '</p>' :
        rows([[L.monthlyNeeded, money(r.monthly), 'hl'], [L.fvInit, money(r.fvInit)], [L.contribTotal, money(r.contrib)]]));
    },
    real: function () {
      var o = { amount: val('r_amount'), nominal: val('r_nom'), inflation: val('r_inf'), tax: val('r_tax') || 0, years: val('r_years') };
      if (bad(o.amount, o.nominal, o.inflation, o.years)) { invalid('r_res'); return; }
      var r = C.realReturn(o);
      show('r_res', rows([[L.netNom, pct(r.netNominal)], [L.realRate, pct(r.real), r.real < 0 ? 'bad' : 'hl'], [L.futNom, money(r.futureNominal)],
        [L.futReal, money(r.futureReal), 'hl'], [L.idleV, money(r.idle)]]));
    },
    budget: function () {
      var o = { income: val('b_income'), needs: val('b_needs'), wants: val('b_wants'), save: val('b_save') };
      if (bad(o.income, o.needs, o.wants, o.save)) { invalid('b_res'); return; }
      var r = C.budget(o);
      show('b_res', rows([[L.needsL, money(r.needs)], [L.wantsL, money(r.wants)], [L.saveL, money(r.save), 'hl']]) +
        (Math.abs(r.sum - 100) > 0.01 ? '<p class="warn">' + L.sumWarn.replace('{n}', num(r.sum, 1)) + '</p>' : ''));
    },
    retire: function () {
      var o = { age: val('t_age'), retireAge: val('t_ret'), lifeAge: val('t_life'), income: val('t_income'), pension: val('t_pension') || 0, inflation: val('t_inf'), pre: val('t_pre'), post: val('t_post'), savings: val('t_sav') || 0 };
      if (bad(o.age, o.retireAge, o.lifeAge, o.income, o.inflation, o.pre, o.post)) { invalid('t_res'); return; }
      var r = C.retirement(o);
      if (!r) { show('t_res', '<p class="warn">' + L.ageWarn + '</p>'); return; }
      show('t_res', rows([[L.yrs, num(r.years, 0)], [L.futMonthly, money(r.futureMonthly)], [L.capitalN, money(r.capital), 'hl'], [L.fvExisting, money(r.fvExisting)],
        [L.gapL, money(r.gap)], [L.monthlySave, money(r.monthly), 'hl'], [L.rule4, money(r.rule4)]]));
    },
    buyrent: function () {
      var o = { price: val('x_price'), down: val('x_down') || 0, rate: val('x_rate'), years: val('x_years'), rent: val('x_rent'), horizon: val('x_hor'), appr: val('x_appr'), rentInc: val('x_rinc'), invest: val('x_inv'), buyFees: val('x_fees') || 0, ownCost: val('x_own') || 0, sell: val('x_sell') || 0 };
      if (bad(o.price, o.rate, o.years, o.rent, o.horizon, o.appr, o.rentInc, o.invest) || o.price <= 0 || o.years <= 0 || o.horizon <= 0 || o.horizon > 50) { invalid('x_res'); return; }
      var r = C.buyRent(o);
      show('x_res', rows([[L.ownerNet, money(r.owner)], [L.renterNet, money(r.renter)], [L.diffL, money(r.diff), r.diff >= 0 ? 'good' : 'bad'],
        [L.monthlyOwn, money(r.firstOut)], [L.saleL, money(r.sale)], [L.debtL, money(r.debt)]]) +
        '<p class="note">' + (r.diff >= 0 ? L.ownerWins : L.renterWins) + '</p>');
    },
    tvm: function () {
      var solve = $('v_solve').value;
      var v = { n: val('v_n'), rate: val('v_iy'), py: val('v_py') || 12, pv: val('v_pv') || 0, pmt: val('v_pmt') || 0, fv: val('v_fv') || 0, begin: $('v_begin').checked };
      if (bad(v.n, v.rate) && solve !== 'N' && solve !== 'IY') { invalid('v_res'); return; }
      if (solve === 'N' && bad(v.rate)) { invalid('v_res'); return; }
      if (solve === 'IY' && bad(v.n)) { invalid('v_res'); return; }
      var res = C.tvm(solve, v);
      if (!isFinite(res)) { show('v_res', '<p class="warn">' + L.noSolution + '</p>'); return; }
      var text = solve === 'N' ? num(res, 2) + ' ' + L.periods : solve === 'IY' ? pct(res, 4) : money(res);
      show('v_res', rows([[L.tvmNames[solve], text, 'hl']]));
    },
    npv: function () {
      var raw = ($('n_flows').value || '').split(/[\s;]+/).join(',').split(',').filter(function (s) { return s !== ''; });
      var flows = raw.map(function (s) { return parseFloat(s.replace(',', '.')); });
      var d = val('n_disc');
      if (flows.length < 2 || flows.some(isNaN) || bad(d)) { invalid('n_res'); return; }
      var i = C.irr(flows), p = C.payback(flows);
      show('n_res', rows([[L.npvL, money(C.npv(flows, d / 100)), 'hl'], [L.irrL, isNaN(i) ? L.na : pct(i * 100)], [L.paybackL, isNaN(p) ? L.na : num(p, 2) + ' ' + L.periods]]));
    }
  };

  function runAll() { Object.keys(tools).forEach(function (k) { try { tools[k](); } catch (e) { if (window.console) console.error(k, e); } }); }
  var timer;
  document.querySelectorAll('[data-tool]').forEach(function (box) {
    var fn = tools[box.getAttribute('data-tool')];
    var go = function () { clearTimeout(timer); timer = setTimeout(function () { try { fn(); } catch (e) { if (window.console) console.error(e); } }, 120); };
    box.addEventListener('input', go); box.addEventListener('change', go);
  });

  /* ---------- currency, theme ---------- */
  var cs = $('currencySelect');
  if (cs) { cs.value = cur; cs.addEventListener('change', function () { cur = cs.value; store.set('ep_cur', cur); runAll(); }); }
  var tb = $('themeBtn');
  if (tb) tb.addEventListener('click', function () {
    var dark = !html.classList.contains('dark');
    html.classList.toggle('dark', dark); store.set('ep_theme', dark ? 'dark' : 'light');
    tb.setAttribute('aria-pressed', dark ? 'true' : 'false');
  });

  /* ---------- exports ---------- */
  var csvBtn = $('l_csv');
  if (csvBtn) csvBtn.addEventListener('click', function () {
    if (!lastLoan) return;
    var sep = LANG === 'en' ? ',' : ';';
    var lines = [L.csvHead.join(sep)];
    lastLoan.rows.forEach(function (x) { lines.push([x.m, csvNum(x.pay), csvNum(x.prin), csvNum(x.int), csvNum(x.bal)].join(sep)); });
    download(L.csvName + '.csv', lines.join('\r\n'));
  });
  var prBtn = $('l_print'); if (prBtn) prBtn.addEventListener('click', function () { window.print(); });

  /* ---------- central bank rates ---------- */
  function rate2(v) { return new Intl.NumberFormat(LOC, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) + ' %'; }
  function renderRates(data) {
    var body = $('ratesBody'); if (!body || !data || !data.rates) return;
    body.innerHTML = data.rates.map(function (r) {
      var name = (r.name && (r.name[LANG] || r.name.fr)) || r.id;
      var flag = r.ok === false ? ' <span class="chip">' + L.verify + '</span>' : '';
      return '<tr><td>' + esc(name) + '</td><td><strong>' + esc(r.text || rate2(r.value)) + '</strong>' + flag + '</td><td>' + esc(r.asOf) + '</td><td><a href="' + esc(r.url) + '" target="_blank" rel="noopener nofollow">' + esc(r.src) + '</a></td></tr>';
    }).join('');
    var u = $('ratesUpdated'); if (u && data.updated) u.textContent = data.updated;
  }
  if (window.EP_RATES) renderRates(window.EP_RATES);
  if (window.fetch && $('ratesBody')) {
    fetch(ROOT + 'assets/rates.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { if (d) renderRates(d); }).catch(function () { /* keep fallback */ });
  }

  /* ---------- consent (AdSense is loaded only after explicit consent) ---------- */
  var CK = 'ep_consent', ADS = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3266873353292561';
  function loadAds() {
    if (window.__epAds) return; window.__epAds = true;
    var s = document.createElement('script'); s.async = true; s.src = ADS; s.crossOrigin = 'anonymous'; document.head.appendChild(s);
  }
  function closeBanner() { var b = $('cmp'); if (b) b.parentNode.removeChild(b); }
  function choose(v) { store.set(CK, v); closeBanner(); if (v === 'granted') loadAds(); else if (window.__epAds) location.reload(); }
  function openBanner() {
    closeBanner();
    var b = document.createElement('div'); b.id = 'cmp'; b.className = 'cmp no-print'; b.setAttribute('role', 'dialog'); b.setAttribute('aria-label', L.cmpTitle);
    b.innerHTML = '<p><strong>' + L.cmpTitle + '</strong> ' + L.cmpText + ' <a href="' + L.cmpLink + '">' + L.cmpMore + '</a></p>' +
      '<div class="cmp-btns"><button type="button" class="btn" id="cmpNo">' + L.cmpNo + '</button><button type="button" class="btn primary" id="cmpYes">' + L.cmpYes + '</button></div>';
    document.body.appendChild(b);
    $('cmpYes').addEventListener('click', function () { choose('granted'); });
    $('cmpNo').addEventListener('click', function () { choose('denied'); });
  }
  window.epConsent = { open: openBanner };
  document.querySelectorAll('[data-consent]').forEach(function (b) { b.addEventListener('click', openBanner); });
  var c = store.get(CK);
  if (c === 'granted') loadAds(); else if (!c) openBanner();

  /* ---------- contact (mailto, nothing stored server side) ---------- */
  var mf = $('mailForm');
  if (mf) mf.addEventListener('submit', function (e) {
    e.preventDefault();
    var body = $('mName').value + ' <' + $('mEmail').value + '>\n\n' + $('mMsg').value;
    location.href = 'mailto:' + mf.getAttribute('data-to') + '?subject=' + encodeURIComponent($('mSubject').value) + '&body=' + encodeURIComponent(body);
  });

  /* ---------- service worker (offline calculators) ---------- */
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    window.addEventListener('load', function () { navigator.serviceWorker.register(ROOT + 'sw.js').catch(function () { /* optional */ }); });
  }

  if ($('l_amount')) runAll();
})();
