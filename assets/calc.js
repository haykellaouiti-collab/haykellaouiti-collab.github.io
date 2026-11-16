/* Epargne & Investissement Pro - pure financial maths (no DOM). */
(function (root) {
  'use strict';

  function pmtCalc(P, r, n) { return r > 0 ? P * r / (1 - Math.pow(1 + r, -n)) : P / n; }

  /* Loan amortisation with optional monthly extra repayment */
  function loanSchedule(P, annual, n, extra, extraStart) {
    var r = annual / 1200, pay = pmtCalc(P, r, n), bal = P, rows = [], tInt = 0, tPay = 0;
    extra = extra || 0; extraStart = extraStart || 1;
    for (var m = 1; m <= n && bal > 0.005; m++) {
      var it = bal * r, pr = pay - it;
      if (m >= extraStart && extra > 0) pr += extra;
      if (pr > bal || m === n) pr = bal;
      bal -= pr; if (bal < 0.005) bal = 0;
      rows.push({ m: m, pay: pr + it, prin: pr, int: it, bal: bal });
      tInt += it; tPay += pr + it;
    }
    return { pay: pay, rows: rows, interest: tInt, paid: tPay };
  }

  /* Effective annual rate (TAEG/APR) including fees and insurance */
  function taeg(net, rows, ins) {
    function f(i) { var s = 0, d = 1; for (var k = 0; k < rows.length; k++) { d /= (1 + i); s += (rows[k].pay + ins) * d; } return net - s; }
    if (f(0) >= 0) return 0;
    var lo = 0, hi = 1;
    for (var it = 0; it < 100; it++) { var mid = (lo + hi) / 2; if (f(mid) < 0) lo = mid; else hi = mid; }
    return Math.pow(1 + (lo + hi) / 2, 12) - 1;
  }

  function loan(o) {
    var n = Math.round(o.years * 12);
    var base = loanSchedule(o.amount, o.rate, n, 0, 1);
    var s = loanSchedule(o.amount, o.rate, n, o.extra, o.extraStart);
    var insM = o.amount * (o.ins || 0) / 100 / 12;
    var months = s.rows.length;
    var totIns = insM * months;
    var fees = o.fees || 0;
    return {
      pay: s.pay, insM: insM, rows: s.rows, months: months,
      interest: s.interest, totIns: totIns, fees: fees,
      totalCost: s.interest + totIns + fees,
      totalPaid: s.paid + totIns + fees,
      taeg: taeg(o.amount - fees, s.rows, insM),
      savedInterest: base.interest - s.interest,
      savedMonths: base.rows.length - months
    };
  }

  /* Compound savings, monthly compounding, contributions at month end */
  function savings(o) {
    var r = o.rate / 1200, bal = o.initial, contrib = o.initial, cm = o.monthly, rows = [];
    for (var y = 1; y <= o.years; y++) {
      for (var m = 0; m < 12; m++) { bal = bal * (1 + r) + cm; contrib += cm; }
      rows.push({ y: y, bal: bal, contrib: contrib, interest: bal - contrib });
      cm *= 1 + (o.indexation || 0) / 100;
    }
    return { final: bal, contrib: contrib, interest: bal - contrib, rows: rows };
  }

  function goal(o) {
    var r = o.rate / 1200, n = Math.round(o.years * 12);
    var fvInit = o.initial * Math.pow(1 + r, n);
    var gap = o.target - fvInit;
    var monthly = gap <= 0 ? 0 : (r > 0 ? gap * r / (Math.pow(1 + r, n) - 1) : gap / n);
    return { monthly: monthly, fvInit: fvInit, gap: Math.max(0, gap), contrib: monthly * n };
  }

  function realReturn(o) {
    var nn = o.nominal * (1 - (o.tax || 0) / 100);
    var real = ((1 + nn / 100) / (1 + o.inflation / 100) - 1) * 100;
    return {
      netNominal: nn, real: real,
      futureNominal: o.amount * Math.pow(1 + nn / 100, o.years),
      futureReal: o.amount * Math.pow(1 + real / 100, o.years),
      idle: o.amount / Math.pow(1 + o.inflation / 100, o.years)
    };
  }

  function budget(o) {
    var sum = o.needs + o.wants + o.save;
    return { needs: o.income * o.needs / 100, wants: o.income * o.wants / 100, save: o.income * o.save / 100, sum: sum };
  }

  /* Retirement: capital needed to fund indexed withdrawals until life expectancy */
  function retirement(o) {
    var n = o.retireAge - o.age, span = o.lifeAge - o.retireAge;
    if (!(n > 0) || !(span > 0)) return null;
    var need = Math.max(0, o.income - (o.pension || 0));
    var inf = o.inflation / 100, pre = o.pre / 100, post = o.post / 100;
    var futureMonthly = need * Math.pow(1 + inf, n);
    var realPost = (1 + post) / (1 + inf) - 1;
    var mp = Math.pow(1 + realPost, 1 / 12) - 1, N = span * 12;
    var factor = Math.abs(mp) < 1e-12 ? N : (1 - Math.pow(1 + mp, -N)) / mp;
    var capital = futureMonthly * factor;
    var fvExisting = (o.savings || 0) * Math.pow(1 + pre, n);
    var gap = Math.max(0, capital - fvExisting);
    var mpre = Math.pow(1 + pre, 1 / 12) - 1, months = n * 12;
    var monthly = gap <= 0 ? 0 : (Math.abs(mpre) < 1e-12 ? gap / months : gap * mpre / (Math.pow(1 + mpre, months) - 1));
    return { years: n, futureMonthly: futureMonthly, capital: capital, fvExisting: fvExisting, gap: gap, monthly: monthly, rule4: futureMonthly * 12 / 0.04 };
  }

  /* Buy vs rent, month by month. Whoever pays less invests the difference. */
  function buyRent(o) {
    var down = Math.min(o.down, o.price), loanAmt = o.price - down;
    var fees = o.price * o.buyFees / 100, r = o.rate / 1200, n = Math.round(o.years * 12);
    var pay = loanAmt > 0 ? pmtCalc(loanAmt, r, n) : 0;
    var ri = Math.pow(1 + o.invest / 100, 1 / 12) - 1;
    var debt = loanAmt, fo = 0, fr = down + fees, rentM = o.rent, H = Math.round(o.horizon * 12);
    var firstOut = pay + o.price * o.ownCost / 1200;
    for (var m = 1; m <= H; m++) {
      var out = 0;
      if (m <= n && debt > 0) {
        var it = debt * r, pr = Math.min(pay - it, debt);
        if (m === n) pr = debt;
        debt -= pr; out += pay;
      }
      var value = o.price * Math.pow(1 + o.appr / 100, m / 12);
      out += value * o.ownCost / 1200;
      fo *= 1 + ri; fr *= 1 + ri;
      var diff = out - rentM;
      if (diff > 0) fr += diff; else fo -= diff;
      if (m % 12 === 0) rentM *= 1 + o.rentInc / 100;
    }
    var sale = o.price * Math.pow(1 + o.appr / 100, o.horizon);
    var owner = sale * (1 - o.sell / 100) - debt + fo;
    return { pay: pay, firstOut: firstOut, owner: owner, renter: fr, diff: owner - fr, debt: debt, sale: sale, fees: fees };
  }

  /* Time value of money. v: n, rate (annual %), py, pv, pmt, fv, begin */
  function tvm(solve, v) {
    var py = v.py || 12, r = v.rate / 100 / py, n = v.n, pv = v.pv, pmt = v.pmt, fv = v.fv, t = v.begin ? 1 : 0;
    function eq(rr) {
      if (Math.abs(rr) < 1e-12) return pv + pmt * n + fv;
      var g = Math.pow(1 + rr, n);
      return pv * g + pmt * (1 + rr * t) * (g - 1) / rr + fv;
    }
    var g = Math.pow(1 + r, n), a = Math.abs(r) < 1e-12 ? n : (1 + r * t) * (g - 1) / r;
    if (solve === 'FV') return Math.abs(r) < 1e-12 ? -(pv + pmt * n) : -(pv * g + pmt * a);
    if (solve === 'PV') return Math.abs(r) < 1e-12 ? -(fv + pmt * n) : -(fv + pmt * a) / g;
    if (solve === 'PMT') return Math.abs(r) < 1e-12 ? -(pv + fv) / n : -(fv + pv * g) / a;
    if (solve === 'N') {
      if (Math.abs(r) < 1e-12) return -(pv + fv) / pmt;
      var p2 = pmt * (1 + r * t), q = (p2 - fv * r) / (p2 + pv * r);
      return q > 0 ? Math.log(q) / Math.log(1 + r) : NaN;
    }
    if (solve === 'IY') {
      var lo = -0.5, hi = 2, steps = 4000, prev = eq(lo), found = NaN;
      for (var i = 1; i <= steps; i++) {
        var x = lo + (hi - lo) * i / steps, cur = eq(x);
        if (isFinite(prev) && isFinite(cur) && prev * cur <= 0) {
          var a0 = lo + (hi - lo) * (i - 1) / steps, b0 = x;
          for (var k = 0; k < 100; k++) { var mid = (a0 + b0) / 2; if (eq(a0) * eq(mid) <= 0) b0 = mid; else a0 = mid; }
          found = (a0 + b0) / 2; break;
        }
        prev = cur;
      }
      return isNaN(found) ? NaN : found * py * 100;
    }
    return NaN;
  }

  function npv(flows, d) {
    var s = 0; for (var t = 0; t < flows.length; t++) s += flows[t] / Math.pow(1 + d, t); return s;
  }
  function irr(flows) {
    var lo = -0.99, hi = 10, steps = 4000, prev = npv(flows, lo);
    for (var i = 1; i <= steps; i++) {
      var x = lo + (hi - lo) * i / steps, cur = npv(flows, x);
      if (isFinite(prev) && isFinite(cur) && prev * cur <= 0) {
        var a = lo + (hi - lo) * (i - 1) / steps, b = x;
        for (var k = 0; k < 100; k++) { var mid = (a + b) / 2; if (npv(flows, a) * npv(flows, mid) <= 0) b = mid; else a = mid; }
        return (a + b) / 2;
      }
      prev = cur;
    }
    return NaN;
  }
  function payback(flows) {
    var cum = 0;
    for (var t = 0; t < flows.length; t++) {
      var before = cum; cum += flows[t];
      if (t > 0 && cum >= 0 && before < 0) return t - 1 + (-before) / flows[t];
    }
    return NaN;
  }

  var api = { pmtCalc: pmtCalc, loanSchedule: loanSchedule, taeg: taeg, loan: loan, savings: savings, goal: goal,
    realReturn: realReturn, budget: budget, retirement: retirement, buyRent: buyRent, tvm: tvm, npv: npv, irr: irr, payback: payback };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.EPCalc = api;
})(typeof window !== 'undefined' ? window : this);
