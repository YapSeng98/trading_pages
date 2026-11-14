/* 盈亏日历 (journal.html): the visitor's own trades, withdrawals and profit goal.
   Kept in this browser (localStorage "pnl.v1": the gold page reads it and adds closed positions to `items`) and, once
   the visitor signs in, in the owner's Supabase project (tables from supabase/journal.sql; each user sees only their
   own rows). Every change is saved here first and marked `dirty`; the cloud copy catches up a moment later.
   The 复盘 card describes the visitor's own records (nothing on it is a forecast); "让 Claude 写一份复盘" opens
   claude.ai with those numbers written out, and nothing leaves the page before that button is pressed. */
(function () {
  "use strict";
  var KEY = "pnl.v1", AUTH = "pnl.auth", CKEY = "pnl.cloud", CHEER = "pnl.cheered", UI = "pnl.ui", MAIL = "pnl.email", NS = "http://www.w3.org/2000/svg";
  // English (assets/i18n.js): tr(zh, en) for a phrase, EN for whole sentences whose word order differs
  var CFG = window.JOURNAL_CLOUD || {}, tr = window.T || function (zh) { return zh; }, EN = window.LANG === "en";
  var DAY = /^\d{4}-\d{2}-\d{2}$/;
  function $(id) { return document.getElementById(id); }
  function h(tag, attrs, kids) {
    var e = document.createElement(tag), k;
    for (k in (attrs || {})) { var v = attrs[k]; if (v === null || v === undefined || v === false) continue; if (k === "class") e.className = v; else if (k === "text") e.textContent = v; else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v); }
    (kids || []).forEach(function (c) { if (c === null || c === undefined || c === false) return; e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  function sv(name, attrs, parent) { var e = document.createElementNS(NS, name); for (var a in attrs) e.setAttribute(a, attrs[a]); if (parent) parent.appendChild(e); return e; }
  function icon(n, c) { var s = sv("svg", { class: "i" + (c ? " " + c : ""), "aria-hidden": "true" }); sv("use", { href: "#i-" + n }, s); return s; }
  function clear(e) { while (e.firstChild) e.removeChild(e.firstChild); return e; }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; }
  var toastT;
  function toast(msg, act, fn) {
    var t = $("toast"); clear(t).appendChild(document.createTextNode(msg));
    if (act) t.appendChild(h("button", { type: "button", text: act, onclick: function () { t.classList.remove("show", "act"); fn(); } }));
    t.classList.toggle("act", !!act); t.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("show", "act"); }, act ? 5500 : 2200);
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function ymd(y, m, d) { return y + "-" + pad(m + 1) + "-" + pad(d); }
  function dOf(t) { var x = new Date(t); return ymd(x.getFullYear(), x.getMonth(), x.getDate()); }
  function midnight(d) { return new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)).getTime(); }
  function num(v) { return typeof v === "number" && isFinite(v) ? v : null; }
  function str(v, n) { return typeof v === "string" ? v.trim().slice(0, n) : ""; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function uid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  var WD = EN ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] : ["日", "一", "二", "三", "四", "五", "六"], MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function wdi(d) { return new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)).getDay(); }
  function pl(n, one, many) { return n === 1 ? one : many; }       // English singular / plural
  function weekday(d) { return EN ? WD[wdi(d)] : "周" + WD[wdi(d)]; }
  function md(d) { return EN ? MON[+d.slice(5, 7) - 1] + " " + (+d.slice(8, 10)) : (+d.slice(5, 7)) + "月" + (+d.slice(8, 10)) + "日"; }
  function ms(d) { return (+d.slice(5, 7)) + "/" + (+d.slice(8, 10)); }
  function hm(t) { var x = new Date(t); return pad(x.getHours()) + ":" + pad(x.getMinutes()); }
  function spanDays(a, b) { return Math.round((midnight(b) - midnight(a)) / 864e5) + 1; }
  var TODAY = dOf(Date.now());
  function phone() { return window.matchMedia && window.matchMedia("(max-width:980px)").matches; }
  function finePointer() { return window.matchMedia && window.matchMedia("(pointer:fine)").matches; }

  // ---------- data ----------
  // Ids carry the time they were made ("r" / "x" + Date.now() in base 36), so older records without `t` still know it.
  function tOf(x) { if (num(x.t) !== null) return x.t; var t = parseInt(String(x.id).slice(1, 9), 36); return isFinite(t) && t > 1.5e12 && t < 4e12 ? t : 0; }
  function base(x, p) {        // id, change time, and "not in the cloud yet" (a record without `u` never reached it)
    var o = { id: x.id ? String(x.id).slice(0, 64) : uid(p), u: num(x.u) };
    if (x.dirty || o.u === null) o.dirty = true;
    return o;
  }
  function cleanItem(x) {
    if (!x || !DAY.test(x.d) || num(x.amt) === null) return null;
    var o = base(x, "r");
    o.d = x.d; o.amt = r2(x.amt); o.sym = str(x.sym, 16); o.side = x.side === "long" || x.side === "short" ? x.side : "";
    o.lots = num(x.lots); o.risk = num(x.risk); o.rule = x.rule === true ? true : x.rule === false ? false : null;
    o.plat = str(x.plat, 40); o.note = str(x.note, 140); o.t = tOf(x) || null;
    return o;
  }
  function cleanCash(x) {
    if (!x || !DAY.test(x.d) || num(x.amt) === null || x.amt < 0) return null;
    var o = base(x, "c");
    o.d = x.d; o.kind = x.kind === "deposit" ? "deposit" : "withdraw"; o.amt = r2(x.amt); o.plat = str(x.plat, 40); o.note = str(x.note, 140); o.t = tOf(x) || null;
    return o;
  }
  function cleanGoal(x) {
    if (!x || !(num(x.target) > 0) || !DAY.test(x.start_d)) return null;
    var o = base(x, "g");
    o.name = str(x.name, 40); o.target = r2(x.target); o.start_d = x.start_d; o.at = num(x.at) || midnight(x.start_d);
    o.done_d = DAY.test(x.done_d) ? x.done_d : null; o.done_at = num(x.done_at); o.reached = num(x.reached);
    return o;
  }
  function cleanNote(x) {                          // one remark per day: the day is its id
    if (!x || !DAY.test(x.d) || typeof x.text !== "string" || !x.text.trim()) return null;
    var o = base(x, "n"); o.id = x.d; o.d = x.d; o.text = x.text.slice(0, 2000);
    return o;
  }
  var CLEAN = { items: cleanItem, cash: cleanCash, goals: cleanGoal, notes: cleanNote };
  function load() {
    var d = null; try { d = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    if (!d || typeof d !== "object") d = {};
    var o = { cur: typeof d.cur === "string" && d.cur ? d.cur.slice(0, 4) : "$", start: num(d.start), su: num(d.su), sdirty: !!d.sdirty,
      plats: Array.isArray(d.plats) ? d.plats.filter(function (p) { return typeof p === "string" && p.trim(); }).map(function (p) { return p.trim().slice(0, 40); }).slice(0, 40) : [],
      owner: typeof d.owner === "string" ? d.owner : null, synced: num(d.synced),
      gone: Array.isArray(d.gone) ? d.gone.filter(function (g) { return g && CLEAN[g.c] && g.id; }).slice(-500) : [] };
    Object.keys(CLEAN).forEach(function (c) { o[c] = (Array.isArray(d[c]) ? d[c] : []).map(CLEAN[c]).filter(Boolean); });
    return o;
  }
  var D = load();
  function save(quiet) {
    try { localStorage.setItem(KEY, JSON.stringify(D)); } catch (e) { toast(tr("保存失败：浏览器不允许存储", "Could not save: this browser does not allow storage")); return false; }
    if (!quiet) Cloud.soon();
    return true;
  }
  function touch(x) { x.u = Date.now(); x.dirty = true; return x; }
  function find(c, id) { for (var i = 0; i < D[c].length; i++) if (D[c][i].id === id) return D[c][i]; return null; }
  function put(c, x) {
    var i = D[c].map(function (y) { return y.id; }).indexOf(x.id);
    if (i >= 0) D[c][i] = x; else D[c].push(x);
    D.gone = D.gone.filter(function (g) { return !(g.c === c && g.id === x.id); });
  }
  function drop(c, id) {
    var x = find(c, id); D[c] = D[c].filter(function (y) { return y.id !== id; });
    if (x && D.owner) D.gone.push({ c: c, id: id });       // the cloud copy is removed at the next sync
    return x;
  }
  function settingsChanged() { D.su = Date.now(); D.sdirty = true; }
  function addPlat(p) { if (p && D.plats.indexOf(p) < 0) { D.plats.push(p); settingsChanged(); } }

  // ---------- numbers ----------
  var NF = {};
  function nf(d) { return NF[d] || (NF[d] = new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: d })); }
  function money(v, d) { var a = Math.abs(v); return nf(d === undefined ? (a < 100 ? 2 : 0) : d).format(a); }
  function signed(v, d) { return (v > 0 ? "+" : v < 0 ? "−" : "") + D.cur + money(v, d); }
  function plain(v, d) { return (v < 0 ? "−" : "") + D.cur + money(v, d); }
  function short(v) { var a = Math.abs(v), t = a >= 10000 ? Math.round(a / 1000) + "k" : a >= 1000 ? (a / 1000).toFixed(1) + "k" : a >= 100 ? String(Math.round(a)) : String(Math.round(a * 10) / 10); return (v > 0 ? "+" : v < 0 ? "−" : "") + t; }
  function cls(v) { return v > 0 ? "up" : v < 0 ? "dn" : ""; }
  function pct(a, b) { return Math.round(a / b * 100); }
  function byTime(a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : tOf(a) - tOf(b); }
  function tstats(list) {
    var s = { n: list.length, sum: 0, w: 0, l: 0, z: 0, ws: 0, ls: 0, best: null, worst: null };
    list.forEach(function (x) {
      s.sum += x.amt; if (x.amt > 0) { s.w++; s.ws += x.amt; } else if (x.amt < 0) { s.l++; s.ls += x.amt; } else s.z++;
      if (!s.best || x.amt > s.best.amt) s.best = x; if (!s.worst || x.amt < s.worst.amt) s.worst = x;
    });
    s.sum = r2(s.sum); s.aw = s.w ? s.ws / s.w : 0; s.al = s.l ? -s.ls / s.l : 0; s.wr = s.w + s.l ? s.w / (s.w + s.l) : 0; s.pf = s.l ? s.ws / -s.ls : null;
    return s;
  }
  var IDX = { day: {}, cash: {}, note: {} };
  function index() {
    IDX.day = {}; IDX.cash = {}; IDX.note = {};
    D.notes.forEach(function (x) { IDX.note[x.d] = x; });
    D.items.forEach(function (x) { var o = IDX.day[x.d] || (IDX.day[x.d] = { sum: 0, n: 0, w: 0, l: 0, items: [] }); o.sum = r2(o.sum + x.amt); o.n++; if (x.amt > 0) o.w++; else if (x.amt < 0) o.l++; o.items.push(x); });
    D.cash.forEach(function (x) { if (x.kind === "withdraw") (IDX.cash[x.d] || (IDX.cash[x.d] = [])).push(x); });
    Object.keys(IDX.day).forEach(function (k) { IDX.day[k].items.sort(function (a, b) { return tOf(a) - tOf(b); }); });
  }
  function cashSum(list) { return r2(list.reduce(function (a, x) { return a + x.amt; }, 0)); }
  function withdrawals() { return D.cash.filter(function (x) { return x.kind === "withdraw"; }); }
  function plats() { return D.plats.slice(); }   // exactly the 我的平台 list, in its order (a removed platform is not offered again)
  function streaks() {          // by trading day: the run the latest days are on, and the longest winning run
    var ks = Object.keys(IDX.day).sort(), cur = 0, sign = 0, best = 0, run = 0;
    ks.forEach(function (k) { var s = IDX.day[k].sum; if (s > 0) { run++; best = Math.max(best, run); } else run = 0; });
    for (var i = ks.length - 1; i >= 0; i--) { var s = Math.sign(IDX.day[ks[i]].sum); if (!s) break; if (!sign) sign = s; if (s !== sign) break; cur++; }
    return { cur: cur, sign: sign, best: best, last: ks[ks.length - 1] };
  }
  function drawdown() {         // on the running total by day, starting from zero
    var ks = Object.keys(IDX.day).sort(), cum = 0, peak = 0, peakD = null, dd = 0, ddFrom = null, ddTo = null, ddPeak = 0;
    ks.forEach(function (k) { cum = r2(cum + IDX.day[k].sum); if (cum > peak) { peak = cum; peakD = k; } if (peak - cum > dd) { dd = r2(peak - cum); ddFrom = peakD; ddTo = k; ddPeak = peak; } });
    return { max: dd, from: ddFrom, to: ddTo, peakAt: ddPeak, now: r2(peak - cum), peak: peak, cum: cum };
  }

  // ---------- view state ----------
  var now0 = new Date(), ui = {}; try { ui = JSON.parse(ls(UI)) || {}; } catch (e) {}
  var V = { y: now0.getFullYear(), m: now0.getMonth(), sel: TODAY, date: TODAY, tab: "trade", sign: 1, edit: null, tplat: "", cplat: "", goalForm: null, lastFill: null, cashAll: false,
    per: /^(week|month|year|all)$/.test(ui.per) ? ui.per : "month" };
  var REC = null;

  // ---------- goal ----------
  // The bar counts trades from the goal's start: days after start_d, and on start_d those written from `at` on (so a
  // new goal started right after claiming one does not count the trades that finished the old one). Withdrawals do
  // not move it: they are money taken out, not money lost.
  function activeGoal() { return D.goals.filter(function (g) { return !g.done_at; }).sort(function (a, b) { return b.at - a.at; })[0] || null; }
  function inGoal(x, g) { return x.d > g.start_d || (x.d === g.start_d && (tOf(x) || Infinity) >= g.at); }
  function goalProgress(g) {
    var list = D.items.filter(function (x) { return inGoal(x, g); }).sort(byTime);
    var run = 0, hit = null, days = {}, today = 0;
    list.forEach(function (x) { run += x.amt; if (hit === null && run >= g.target - 0.004) hit = x.d; days[x.d] = 1; if (x.d === TODAY) today += x.amt; });
    var s = tstats(list);
    return { sum: s.sum, n: s.n, w: s.w, l: s.l, days: Object.keys(days).length, today: r2(today), hit: s.sum >= g.target ? hit : null, pct: s.sum / g.target * 100 };
  }
  function cheered(id) { try { return (JSON.parse(ls(CHEER)) || []).indexOf(id) >= 0; } catch (e) { return false; } }
  function cheer(id) { try { var l = JSON.parse(ls(CHEER)) || []; l.push(id); ls(CHEER, JSON.stringify(l.slice(-50))); } catch (e) {} }
  function renderGoal() {
    var el = clear($("goal")), g = activeGoal(), past = D.goals.filter(function (x) { return x.done_at; }).sort(function (a, b) { return b.done_at - a.done_at; });
    el.classList.remove("done");
    if (!g || V.goalForm) { goalForm(el, g, past[0]); trophies(el, past); return; }
    var p = goalProgress(g), done = p.sum >= g.target, fillW = Math.max(0, Math.min(100, p.pct)), left = r2(g.target - p.sum);
    el.classList.toggle("done", done);
    el.appendChild(h("div", { class: "g-k" }, [icon(done ? "trophy" : "target", "sm"), done ? tr("目标达成 · Goal reached", "Goal reached") : tr("这一轮的目标 · Goal", "This round's goal")]));
    el.appendChild(h("div", { class: "g-name", text: g.name || tr("赚到 ", "Make ") + D.cur + money(g.target, 2) }));
    el.appendChild(h("div", { class: "g-row" }, [
      h("div", { class: "g-amt" + (p.sum < 0 ? " dn" : "") }, [plain(p.sum, 2), h("small", { text: "/ " + D.cur + money(g.target, 2) })]),
      h("div", { class: "g-pct", text: Math.max(0, Math.floor(p.pct)) + "%" })]));
    var bar = h("div", { class: "bar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(Math.round(fillW)), "aria-label": tr("目标进度 ", "Goal progress ") + Math.floor(Math.max(0, p.pct)) + "%" });
    var fill = h("div", { class: "fill" }); bar.appendChild(fill);
    var tw = p.today > 0 ? Math.min(fillW, p.today / g.target * 100) : 0, moved = V.lastFill !== fillW;
    if (tw >= 0.6) bar.appendChild(h("div", { class: "tdy" + (moved ? " late" : ""), style: "left:" + (fillW - tw).toFixed(2) + "%;width:" + tw.toFixed(2) + "%", title: tr("今天 ", "Today ") + signed(p.today) }));
    [25, 50, 75].forEach(function (m) { bar.appendChild(h("i", { class: "ms" + (p.pct >= m ? " on" : ""), style: "left:" + m + "%" })); });
    bar.appendChild(h("span", { class: "cup", "aria-hidden": "true" }, [icon("trophy")]));
    el.appendChild(bar);
    var marks = h("div", { class: "marks", "aria-hidden": "true" });
    [25, 50, 75].forEach(function (m) { marks.appendChild(h("span", { class: "mid" + (p.pct >= m ? " on" : ""), style: "left:" + m + "%" }, [h("b", { text: m + "%" }), D.cur + money(g.target * m / 100, 0)])); });
    marks.appendChild(h("span", { class: "end" + (done ? " on" : ""), style: "left:100%" }, [h("b", { text: "100%" }), D.cur + money(g.target, 0)]));
    el.appendChild(marks);
    // the fill grows from where it last stood (first paint: from zero)
    fill.style.width = (V.lastFill === null ? 0 : V.lastFill) + "%";
    requestAnimationFrame(function () { requestAnimationFrame(function () { fill.style.width = fillW + "%"; }); });
    V.lastFill = fillW;
    el.appendChild(h("div", { class: "g-info" }, [
      h("span", {}, [icon("cal", "sm"), EN ? "Since " + ms(g.start_d) + " · day " + spanDays(g.start_d, TODAY) : ms(g.start_d) + " 开始 · 第 " + spanDays(g.start_d, TODAY) + " 天"]),
      h("span", {}, [icon("chart", "sm"), EN ? p.n + pl(p.n, " trade", " trades") + " · " + p.w + " won " + p.l + " lost" : p.n + " 笔 · " + p.w + " 赚 " + p.l + " 亏"]),
      p.today ? h("span", {}, [icon("sun", "sm"), tr("今天 ", "Today ") + signed(p.today)]) : null]));
    var say;
    if (done) say = EN ? ["This round took ", h("b", { text: spanDays(g.start_d, p.hit || TODAY) + pl(spanDays(g.start_d, p.hit || TODAY), " day", " days") + " and " + p.n + pl(p.n, " trade", " trades") }), "; the goal was reached on " + md(p.hit || TODAY) + (p.sum > g.target ? ", with " + plain(p.sum - g.target) + " to spare" : "") + ". Claim it and the bar starts the next round from zero."]
      : ["这一轮用了 ", h("b", { text: spanDays(g.start_d, p.hit || TODAY) + " 天、" + p.n + " 笔" }), "，在 " + md(p.hit || TODAY) + "到达目标" + (p.sum > g.target ? "，还多出 " + plain(p.sum - g.target) : "") + "。收下它，进度条从零开始下一轮。"];
    else if (!p.n) say = [EN ? "Counting from " + md(g.start_d) + "; no trades logged yet. Log each trade when it closes and the bar follows." : "从 " + md(g.start_d) + "开始算，还没有记交易。做完一笔就记下来，进度条会跟着走。"];
    else if (p.sum <= 0) say = EN ? ["So far ", h("b", { class: "dn", text: plain(p.sum) }), ", " + D.cur + money(-p.sum) + " below the start; " + D.cur + money(left) + " to go."]
      : ["目前合计 ", h("b", { class: "dn", text: plain(p.sum) }), "，比起点还低 " + D.cur + money(-p.sum) + "；离目标还差 " + D.cur + money(left) + "。"];
    else {
      var per = p.sum / p.days, need = Math.ceil(left / per);
      say = EN ? [h("b", { text: D.cur + money(left) }), " to go. This round has averaged " + signed(per) + " a trading day over " + p.days + pl(p.days, " day", " days") + "; at that average, about ", h("b", { text: need + pl(need, " more trading day", " more trading days") }), " (just the average, not a forecast)."]
        : ["还差 ", h("b", { text: D.cur + money(left) }), "。这一轮 " + p.days + " 个交易日平均每天 " + signed(per) + "，照这个平均还要大约 ", h("b", { text: need + " 个交易日" }), "（只是按平均算，不是预测）。"];
    }
    el.appendChild(h("p", { class: "g-say" }, say));
    var acts = h("div", { class: "g-acts" });
    if (done) acts.appendChild(h("button", { class: "btn pri", type: "button", onclick: function () { claim(g); } }, [icon("trophy", "sm"), tr("收下，开始下一轮", "Claim it, start the next round")]));
    acts.appendChild(h("button", { class: "btn sm" + (done ? " ghost" : ""), type: "button", text: tr("调整目标", "Edit goal"), onclick: function () { V.goalForm = "edit"; renderGoal(); } }));
    el.appendChild(acts);
    trophies(el, past);
    if (done && !cheered(g.id)) { cheer(g.id); confetti(); }
  }
  function goalForm(el, g, prev) {
    var editing = V.goalForm === "edit" && g, next = V.goalForm === "next";
    el.appendChild(h("div", { class: "g-k" }, [icon("target", "sm"), editing ? tr("调整目标", "Edit goal") : next ? tr("下一轮 · Next goal", "Next round") : tr("设一个目标 · Goal", "Set a goal")]));
    el.appendChild(h("div", { class: "g-name", text: editing ? tr("改金额、名字或开始的日子", "Change the amount, the name or the start day") : next ? tr("上一轮已经收下。这一轮想赚多少？", "Last round claimed. How much for this one?") : tr("这一轮想赚多少？", "How much do you want to make this round?") }));
    el.appendChild(h("p", { class: "g-say", text: tr("进度条从开始那天算起，只算交易盈亏；提现不会让进度变少。到了目标就收下，再开新的一轮。", "The bar counts from the start day and only counts trading profit and loss; withdrawals never shrink it. Reach the goal, claim it, and start a new round.") }));
    var amt = h("input", { id: "g-amt", type: "number", inputmode: "decimal", min: "0", step: "any", placeholder: tr("例如 1000", "e.g. 1000") });
    var name = h("input", { id: "g-name", type: "text", maxlength: "40", placeholder: tr("可不填，例如 11 月目标", "Optional, e.g. November goal") });
    var start = h("input", { id: "g-start", type: "date" });
    amt.value = editing ? g.target : prev ? prev.target : ""; name.value = editing ? g.name : ""; start.value = editing ? g.start_d : TODAY;
    var picks = prev ? [prev.target, prev.target * 1.5, prev.target * 2] : [300, 500, 1000, 2000];
    var nice = function (v) { var m = v >= 1000 ? 100 : v >= 100 ? 50 : 10; return Math.round(v / m) * m; };
    var chips = h("div", { class: "chips" }, picks.map(function (v, i) { v = i ? nice(v) : v; return h("button", { type: "button", class: "chip", text: D.cur + money(v, 2) + (prev && i ? (i === 1 ? " ×1.5" : " ×2") : prev ? tr(" 一样", " same") : ""), onclick: function () { amt.value = v; amt.focus(); } }); }));
    var err = h("div", { class: "err", role: "alert", hidden: true });
    var form = h("form", { class: "g-form", novalidate: true }, [
      h("div", { class: "f1" }, [h("label", { for: "g-amt", text: tr("目标金额", "Target amount") }), h("div", { class: "inp big" }, [h("span", { class: "cur", text: D.cur }), amt])]),
      chips,
      h("div", { class: "f2" }, [
        h("div", {}, [h("label", { for: "g-name", text: tr("名字", "Name") }), h("div", { class: "inp t" }, [name])]),
        h("div", {}, [h("label", { for: "g-start", text: tr("从哪天开始算", "Count from") }), h("div", { class: "inp" }, [start])])]),
      err,
      h("div", { class: "acts" }, [
        h("button", { class: "btn pri", type: "submit", text: editing ? tr("保存修改", "Save changes") : tr("开始这一轮", "Start this round") }),
        editing ? h("button", { class: "btn ghost", type: "button", text: tr("取消", "Cancel"), onclick: function () { V.goalForm = null; renderGoal(); } }) : null,
        editing ? h("button", { class: "btn ghost", type: "button", text: tr("删除这个目标", "Delete this goal"), onclick: function () {
          if (!window.confirm(tr("删除这个目标？交易记录不受影响。", "Delete this goal? Your trades are not affected."))) return;
          drop("goals", g.id); V.goalForm = null; save(); renderAll(); toast(tr("已删除目标", "Goal deleted"), tr("撤销", "Undo"), function () { put("goals", touch(g)); save(); renderAll(); });
        } }) : null])]);
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var t = parseFloat(amt.value), sd = DAY.test(start.value) ? start.value : TODAY;
      if (!(t > 0)) { err.textContent = tr("填一个大于 0 的金额。", "Enter an amount above 0."); err.hidden = false; amt.focus(); return; }
      if (sd > TODAY) { err.textContent = tr("开始的日子不能在今天之后。", "The start day cannot be after today."); err.hidden = false; return; }
      if (editing) { g.target = r2(t); g.name = name.value.trim().slice(0, 40); if (sd !== g.start_d) { g.start_d = sd; g.at = midnight(sd); } touch(g); }
      else put("goals", touch({ id: uid("g"), name: name.value.trim().slice(0, 40), target: r2(t), start_d: sd, at: next && sd === TODAY ? Date.now() : midnight(sd), done_d: null, done_at: null, reached: null }));
      V.goalForm = null; V.lastFill = null; save(); renderAll(); toast(editing ? tr("目标已更新", "Goal updated") : tr("新的一轮开始了：目标 ", "New round started: goal ") + D.cur + money(t, 2));
    });
    el.appendChild(form);
  }
  function claim(g) {
    var p = goalProgress(g);
    g.done_at = Date.now(); g.done_d = p.hit || TODAY; g.reached = p.sum; touch(g);
    V.goalForm = "next"; V.lastFill = null; save(); renderAll();
    toast(tr("🏆 已收下：", "🏆 Claimed: ") + (g.name || D.cur + money(g.target, 2)), tr("撤销", "Undo"), function () { g.done_at = null; g.done_d = null; g.reached = null; touch(g); V.goalForm = null; save(); renderAll(); });
  }
  function trophies(el, past) {
    if (!past.length) return;
    var row = h("div", { class: "tro-row" });
    past.slice(0, 8).forEach(function (g) {
      var d = g.done_d || dOf(g.done_at);
      row.appendChild(h("span", { class: "tro", title: (g.name ? g.name + tr("：", ": ") : "") + tr("目标 ", "Goal ") + D.cur + money(g.target, 2) + tr("，收下时合计 ", ", total when claimed ") + plain(num(g.reached) || 0, 2) }, [icon("trophy", "sm"), h("b", { text: D.cur + money(g.target, 0) }), " · " + ms(g.start_d) + "→" + ms(d) + " · " + spanDays(g.start_d, d) + tr(" 天", " days")]));
    });
    if (past.length > 8) row.appendChild(h("span", { class: "tro", text: EN ? (past.length - 8) + " more" : "还有 " + (past.length - 8) + " 个" }));
    el.appendChild(h("div", { class: "troph" }, [h("div", { class: "g-k", text: EN ? "Reached · " + past.length + (past.length > 1 ? " rounds" : " round") : "已经达成 · " + past.length + " 轮" }), row]));
  }
  // A short burst of confetti when a goal is reached (once per goal, skipped when the device asks for less motion).
  function confetti() {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var cv = h("canvas", { id: "confetti", "aria-hidden": "true" }); document.body.appendChild(cv);
    var W = cv.width = window.innerWidth, H = cv.height = window.innerHeight, x = cv.getContext("2d"), cols = ["#E8C96D", "#D4A72C", "#F5B23E", "#34D399", "#A99BFF", "#F6F5F3"], P = [], t0 = performance.now();
    for (var i = 0; i < 160; i++) P.push({ x: W * (0.2 + Math.random() * 0.6), y: H * 0.25, vx: (Math.random() - 0.5) * 9, vy: -4 - Math.random() * 9, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.3, w: 5 + Math.random() * 6, c: cols[i % cols.length] });
    (function step(ts) {
      var k = (ts - t0) / 1000; x.clearRect(0, 0, W, H);
      P.forEach(function (p) { p.vy += 0.28; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr; x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.globalAlpha = Math.max(0, 1 - k / 2.6); x.fillStyle = p.c; x.fillRect(-p.w / 2, -p.w / 4, p.w, p.w / 2); x.restore(); });
      if (k < 2.6) requestAnimationFrame(step); else cv.remove();
    })(t0);
  }

  // ---------- write one down ----------
  function openEntry(focusId) {
    if (phone()) document.body.classList.add("sheet");
    else { var q = $("quick"), r = q.getBoundingClientRect(); if (r.top < 60 || r.top > window.innerHeight * 0.5) q.scrollIntoView({ behavior: "smooth", block: "start" }); }
    if (focusId && finePointer()) $(focusId).focus({ preventScroll: true });
  }
  function closeSheet() { document.body.classList.remove("sheet"); }
  function setTab(t) {
    V.tab = t; $("tab-trade").setAttribute("aria-selected", String(t === "trade")); $("tab-cash").setAttribute("aria-selected", String(t === "cash"));
    $("f-trade").hidden = t !== "trade"; $("f-cash").hidden = t !== "cash";
  }
  function setDate(d) {
    V.date = d; $("q-date").value = d; $("q-date").max = TODAY;
    var y = dOf(Date.now() - 864e5);
    $("q-wd").textContent = weekday(d) + (d === TODAY ? tr(" · 今天", " · today") : d === y ? tr(" · 昨天", " · yesterday") : "");
    $("q-today").hidden = d === TODAY;
    $("q-date").parentNode.parentNode.classList.toggle("past", d !== TODAY);
    saveLabel();
  }
  function setSign(s) { V.sign = s; $("s-win").setAttribute("aria-pressed", String(s > 0)); $("s-loss").setAttribute("aria-pressed", String(s < 0)); saveLabel(); }
  function saveLabel() {
    var a = parseFloat($("t-amt").value), b = $("t-save"), c = parseFloat($("c-amt").value), on = V.date !== TODAY ? " · " + ms(V.date) + " " + weekday(V.date) : "";
    b.textContent = (V.edit && V.edit.c === "items" ? tr("保存修改 ", "Save changes ") : tr("保存 ", "Save ")) + (isFinite(a) && a > 0 ? (V.sign > 0 ? "+" : "−") + D.cur + money(a, 2) : "") + on;
    b.className = "btn pri wide" + (V.sign < 0 ? " neg" : "");
    $("c-save").textContent = (V.edit && V.edit.c === "cash" ? tr("保存修改 ", "Save changes ") : tr("记下提现 ", "Log withdrawal ")) + (isFinite(c) && c > 0 ? D.cur + money(c, 2) : "") + (V.cplat ? " · " + V.cplat : "") + on;
  }
  // a platform's initial on a colour picked from its name, so the same platform looks the same everywhere
  var MONO = ["#E6BE55", "#5EE3B0", "#A99BFF", "#7CC4FF", "#F59AB0", "#B5E36B"];
  function mono(p) { var k = 0; for (var i = 0; i < p.length; i++) k = (k * 31 + p.charCodeAt(i)) >>> 0; return h("span", { class: "mono", style: "background:" + MONO[k % MONO.length], "aria-hidden": "true", text: p.charAt(0).toUpperCase() }); }
  function chipRow(el, sel, pick) {
    clear(el);
    var list = plats(); if (sel && list.indexOf(sel) < 0) list.push(sel);   // a record being edited keeps its own platform
    list.forEach(function (p) { el.appendChild(h("button", { type: "button", class: "chip", "aria-pressed": String(p === sel), onclick: function () { pick(p === sel ? "" : p); } }, [mono(p), p])); });
    el.appendChild(h("button", { type: "button", class: "chip add", text: tr("＋ 新平台", "＋ New platform"), onclick: function () { newPlat(el, pick); } }));
  }
  function newPlat(el, pick) {
    clear(el);
    var inp = h("input", { type: "text", maxlength: "40", placeholder: tr("平台名，例如 Exness", "Platform name, e.g. Exness"), "aria-label": tr("新平台的名字", "New platform name") });
    var ok = function () { var v = inp.value.trim().slice(0, 40); if (!v) { paintPlats(); return; } addPlat(v); save(); pick(v); };
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); ok(); } else if (e.key === "Escape") paintPlats(); });
    el.appendChild(h("div", { class: "chip-new" }, [inp, h("button", { type: "button", class: "chip", "aria-pressed": "true", text: tr("添加", "Add"), onclick: ok }), h("button", { type: "button", class: "chip", text: tr("取消", "Cancel"), onclick: paintPlats })]));
    inp.focus();
  }
  function paintPlats() {
    var all = plats(), held = V.edit ? (find(V.edit.c, V.edit.id) || {}).plat : "";
    if (V.tplat && all.indexOf(V.tplat) < 0 && V.tplat !== held) V.tplat = ""; if (V.cplat && all.indexOf(V.cplat) < 0 && V.cplat !== held) V.cplat = "";
    chipRow($("t-plats"), V.tplat, function (p) { V.tplat = p; paintPlats(); });
    chipRow($("c-plats"), V.cplat, function (p) { V.cplat = p; $("c-err").hidden = true; paintPlats(); saveLabel(); });
    var s = clear($("s-plats"));
    D.plats.forEach(function (p) { s.appendChild(h("button", { type: "button", class: "chip", title: tr("从列表里删掉 ", "Remove from the list: ") + p, "aria-label": tr("删掉平台 ", "Remove platform ") + p, onclick: function () { D.plats = D.plats.filter(function (q) { return q !== p; }); settingsChanged(); save(); paintPlats(); } }, [mono(p), p, h("span", { class: "x", text: "×" })])); });
    s.appendChild(h("button", { type: "button", class: "chip add", text: tr("＋ 新平台", "＋ New platform"), onclick: function () { newPlat(s, function () { paintPlats(); }); } }));
  }
  var TF = ["t-amt", "t-sym", "t-lots", "t-risk", "t-note"];
  function endEdit() {
    var wasEdit = !!V.edit; V.edit = null;
    TF.concat(["c-amt", "c-note"]).forEach(function (id) { $(id).value = ""; });
    $("t-side").value = ""; $("t-rule").value = ""; $("t-cancel").hidden = true; $("c-cancel").hidden = true; $("t-err").hidden = true; $("c-err").hidden = true;
    if (wasEdit) { $("more").open = false; setSign(1); paintPlats(); }
    saveLabel();
  }
  function editTrade(x) {
    setTab("trade"); V.edit = { c: "items", id: x.id }; setDate(x.d); setSign(x.amt < 0 ? -1 : 1);
    $("t-amt").value = Math.abs(x.amt); $("t-sym").value = x.sym || ""; $("t-side").value = x.side || ""; $("t-lots").value = num(x.lots) === null ? "" : x.lots;
    $("t-risk").value = num(x.risk) === null ? "" : x.risk; $("t-rule").value = x.rule === true ? "yes" : x.rule === false ? "no" : ""; $("t-note").value = x.note || "";
    $("more").open = !!(x.sym || x.side || num(x.lots) !== null || num(x.risk) !== null || x.rule !== null || x.note);
    V.tplat = x.plat || ""; $("t-cancel").hidden = false; paintPlats(); saveLabel(); openEntry("t-amt");
  }
  function editCash(x) {
    setTab("cash"); V.edit = { c: "cash", id: x.id }; setDate(x.d); $("c-amt").value = x.amt; $("c-note").value = x.note || ""; V.cplat = x.plat || "";
    $("c-cancel").hidden = false; paintPlats(); saveLabel(); openEntry("c-amt");
  }
  function del(c, x) {
    drop(c, x.id); if (V.edit && V.edit.id === x.id) endEdit();
    save(); renderAll(); toast(tr("已删除 ", "Deleted ") + (c === "cash" ? tr("提现 ", "withdrawal ") + plain(x.amt) : signed(x.amt)), tr("撤销", "Undo"), function () { put(c, touch(x)); save(); renderAll(); });
  }
  function showDay(d) {           // the calendar and the day card follow a record that was just written
    V.sel = d; var y = +d.slice(0, 4), m = +d.slice(5, 7) - 1; if (y !== V.y || m !== V.m) { V.y = y; V.m = m; }
  }
  // Both entry routes (the form and the one-line box) end here.
  function addTrade(f, old) {
    var g = activeGoal(), before = g ? goalProgress(g).sum : 0;
    var it = touch({ id: old ? old.id : uid("r"), d: f.d, amt: r2(f.amt), sym: f.sym || "", side: f.side || "", lots: num(f.lots), risk: num(f.risk), rule: f.rule === true ? true : f.rule === false ? false : null, plat: f.plat || "", note: (f.note || "").slice(0, 140), t: old ? old.t : Date.now() });
    put("items", it);
    if (!save()) return null;
    endEdit(); showDay(it.d); renderAll(); if (phone()) closeSheet();
    var after = g ? goalProgress(g).sum : 0, msg = (old ? tr("已修改：", "Changed: ") : tr("已记下：", "Logged: ")) + md(it.d) + " " + signed(it.amt) + (it.plat ? " · " + it.plat : "");
    if (g && before < g.target && after >= g.target) msg = tr("🎉 目标达成！", "🎉 Goal reached! ") + msg;
    else if (g && it.amt > 0 && after < g.target) msg += tr(" · 目标 ", " · goal ") + Math.max(0, Math.floor(after / g.target * 100)) + "%";
    toast(msg, tr("撤销", "Undo"), function () { if (old) put("items", touch(old)); else drop("items", it.id); save(); renderAll(); });
    return it;
  }
  function addCash(f, old) {
    var it = touch({ id: old ? old.id : uid("c"), d: f.d, kind: "withdraw", amt: r2(f.amt), plat: f.plat, note: (f.note || "").slice(0, 140), t: old ? old.t : Date.now() });
    put("cash", it);
    if (!save()) return null;
    endEdit(); showDay(it.d); renderAll(); if (phone()) closeSheet();
    toast((old ? tr("已修改：", "Changed: ") : tr("已记下提现：", "Withdrawal logged: ")) + md(it.d) + " " + plain(it.amt) + " · " + it.plat, tr("撤销", "Undo"), function () { if (old) put("cash", touch(old)); else drop("cash", it.id); save(); renderAll(); });
    return it;
  }
  $("f-trade").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var amt = parseFloat($("t-amt").value), err = $("t-err");
    if (!isFinite(amt) || amt < 0) { err.textContent = tr("请填金额（一个不小于 0 的数字）。", "Enter the amount (a number, 0 or more)."); err.hidden = false; $("t-amt").focus(); return; }
    var d = DAY.test($("q-date").value) ? $("q-date").value : TODAY;
    if (d > TODAY) { err.textContent = tr("日期不能在今天之后。", "The date cannot be after today."); err.hidden = false; return; }
    var f = function (id) { var v = parseFloat($(id).value); return isFinite(v) && v >= 0 ? v : null; }, r = $("t-rule").value;
    addTrade({ d: d, amt: amt * V.sign, sym: $("t-sym").value.trim().slice(0, 16), side: $("t-side").value, lots: f("t-lots"), risk: f("t-risk"), rule: r === "yes" ? true : r === "no" ? false : null, plat: V.tplat, note: $("t-note").value.trim() },
      V.edit && V.edit.c === "items" ? find("items", V.edit.id) : null);
  });
  $("f-cash").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var amt = parseFloat($("c-amt").value), err = $("c-err");
    if (!isFinite(amt) || amt <= 0) { err.textContent = tr("请填提了多少（大于 0 的数字）。", "Enter how much you withdrew (above 0)."); err.hidden = false; $("c-amt").focus(); return; }
    if (!V.cplat) { err.textContent = tr("选一下是从哪个平台提的；列表里没有就点「＋ 新平台」。", "Pick the platform it came from; if it is not listed, tap «＋ New platform»."); err.hidden = false; return; }
    var d = DAY.test($("q-date").value) ? $("q-date").value : TODAY;
    if (d > TODAY) { err.textContent = tr("日期不能在今天之后。", "The date cannot be after today."); err.hidden = false; return; }
    addCash({ d: d, amt: amt, plat: V.cplat, note: $("c-note").value.trim() }, V.edit && V.edit.c === "cash" ? find("cash", V.edit.id) : null);
  });
  function renderToday() {
    var x = IDX.day[TODAY], c = IDX.cash[TODAY], el = clear($("todayline"));
    el.appendChild(document.createTextNode(tr("今天 ", "Today, ") + md(TODAY) + " " + weekday(TODAY) + tr("：", ": ")));
    if (x) { el.appendChild(document.createTextNode(EN ? x.n + (x.n > 1 ? " trades, " : " trade, ") + x.w + " won " + x.l + " lost, total " : x.n + " 笔，" + x.w + " 赚 " + x.l + " 亏，合计 ")); el.appendChild(h("b", { class: cls(x.sum), text: signed(x.sum) })); }
    else el.appendChild(document.createTextNode(tr("还没有记交易", "no trades logged yet")));
    if (c) { el.appendChild(document.createTextNode(tr("；提现 ", "; withdrew "))); el.appendChild(h("b", { style: "color:var(--gold-lt)", text: plain(cashSum(c)) })); }
    el.appendChild(document.createTextNode(tr("。", ".")));
  }

  // ---------- one-line entry ----------
  // A plain parser, not a model: an amount (+/− or 赚/亏), a known platform (or a new latin word, or @name), a day
  // (今天/昨天/前天/11-13/11/13), 提现 for a withdrawal, a symbol, 多/空, lots ("0.05手"); everything else is the note.
  var SYMS = { xau: "XAUUSD", xauusd: "XAUUSD", gold: "XAUUSD", "黄金": "XAUUSD", btc: "BTCUSD", btcusd: "BTCUSD", btcusdt: "BTCUSDT", "比特币": "BTCUSD", xag: "XAGUSD", xagusd: "XAGUSD", "白银": "XAGUSD", silver: "XAGUSD" };
  function platName(w) { return w.length <= 3 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1); }
  function okDay(y, m, d) { var t = new Date(y, m - 1, d); return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d ? ymd(y, m - 1, d) : null; }
  function parseLine(s) {
    var o = { kind: "trade", sign: 0, amt: null, plat: "", newPlat: false, sym: "", side: "", lots: null, d: TODAY, badDay: false, note: [] }, known = plats();
    s = String(s || "").replace(/[，、；;]/g, " ").replace(/(\d*\.?\d+)\s*(?:手|lots?(?![a-z]))/gi, " LOTS=$1 ")
      .replace(/([一-鿿])(?=[0-9+\-−＋$@A-Za-z])/g, "$1 ").replace(/([0-9A-Za-z])(?=[一-鿿])/g, "$1 ");
    s.split(/\s+/).filter(Boolean).forEach(function (tk) {
      var lo = tk.toLowerCase(), m, d;
      if ((m = /^lots=(\d*\.?\d+)$/i.exec(tk))) { o.lots = +m[1]; return; }
      if (/^(今天|今日|today)$/.test(lo)) { o.d = TODAY; return; }
      if (/^(昨天|昨日|yesterday)$/.test(lo)) { o.d = dOf(Date.now() - 864e5); return; }
      if (lo === "前天") { o.d = dOf(Date.now() - 2 * 864e5); return; }
      if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(lo))) { d = okDay(+m[1], +m[2], +m[3]); if (d) o.d = d; else o.badDay = true; return; }
      if ((m = /^(\d{1,2})(?:[\/月]|-)(\d{1,2})日?$/.exec(lo))) { var y = +TODAY.slice(0, 4); d = okDay(y, +m[1], +m[2]); if (d && d > TODAY) d = okDay(y - 1, +m[1], +m[2]); if (d) o.d = d; else o.badDay = true; return; }
      if (/^(提现|提款|出金|withdraw|withdrawal|wd)$/.test(lo)) { o.kind = "cash"; return; }
      if (/^(赚|盈|赢|盈利|赚了|win|won|profit|tp|止盈)$/.test(lo)) { o.sign = 1; return; }
      if (/^(亏|损|输|亏损|亏了|loss|lost|lose|sl|止损)$/.test(lo)) { o.sign = -1; return; }
      if (/^(多|做多|多单|long|buy|买|买入)$/.test(lo)) { o.side = "long"; return; }
      if (/^(空|做空|空单|short|sell|卖|卖出)$/.test(lo)) { o.side = "short"; return; }
      if ((m = /^([+\-−＋]?)[$＄]?(\d+(?:\.\d+)?|\.\d+)(k)?$/i.exec(tk))) {
        if (o.amt === null) { o.amt = parseFloat(m[2]) * (m[3] ? 1000 : 1); if (m[1] === "-" || m[1] === "−") o.sign = -1; else if (m[1]) o.sign = 1; } else o.note.push(tk);
        return;
      }
      if (SYMS[lo]) { o.sym = SYMS[lo]; return; }
      if (/^[a-z]{6}$/i.test(tk) && /(usd|jpy|eur|gbp|chf|cad|aud|nzd)$/i.test(tk)) { o.sym = tk.toUpperCase(); return; }
      if (tk[0] === "@" && tk.length > 1) { o.plat = tk.slice(1, 41); o.newPlat = known.indexOf(o.plat) < 0; return; }
      var hit = known.filter(function (p) { return p.toLowerCase() === lo; })[0] || known.filter(function (p) { return lo.length >= 2 && p.toLowerCase().indexOf(lo) === 0; })[0];
      if (hit && !o.plat) { o.plat = hit; return; }
      if (!o.plat && /^[a-z][a-z0-9.\-]{1,39}$/i.test(tk)) { o.plat = platName(tk); o.newPlat = true; return; }
      o.note.push(tk);
    });
    if (!o.sign) o.sign = 1;
    o.err = o.badDay ? tr("这个日期不对。", "That date is not valid.") : o.amt === null ? tr("写上金额，例如 +120 或 亏 35。", "Add an amount, e.g. +120 or loss 35.") : o.d > TODAY ? tr("日期不能在今天之后。", "The date cannot be after today.") : o.kind === "cash" && !(o.amt > 0) ? tr("提现金额要大于 0。", "A withdrawal must be above 0.") : o.kind === "cash" && !o.plat ? tr("提现要写平台，例如：提现 200 exness。", "Say the platform, e.g. withdraw 200 exness.") : "";
    return o;
  }
  var EXAMPLES = EN ? ["+120 exness", "-35 xm yesterday", "withdraw 200 exness", "+80 gold long 0.05lot"] : ["+120 exness", "-35 xm 昨天", "提现 200 exness", "+80 黄金 多 0.05手"];
  function renderNl() {
    var v = $("nl").value.trim(), out = clear($("nl-out")), go = $("nl-go");
    if (!v) {
      go.hidden = true;
      var ex = h("span", { class: "nl-ex" }, [tr("试试：", "Try: ")]);
      EXAMPLES.forEach(function (e, i) { if (i) ex.appendChild(document.createTextNode(" · ")); ex.appendChild(h("button", { type: "button", text: e, onclick: function () { $("nl").value = e; renderNl(); $("nl").focus(); } })); });
      out.appendChild(ex); return;
    }
    var o = parseLine(v);
    go.hidden = !!o.err;
    if (o.err) { out.appendChild(h("span", { class: "pv err", text: o.err })); return; }
    var a = o.kind === "cash" ? h("span", { class: "pv gd" }, [icon("wallet", "sm"), tr("提现 ", "Withdraw ") + D.cur + money(o.amt, 2)]) : h("span", { class: "pv " + (o.sign > 0 ? "up" : "dn") }, [icon(o.sign > 0 ? "up" : "down", "sm"), (o.sign > 0 ? "+" : "−") + D.cur + money(o.amt, 2)]);
    out.appendChild(a);
    if (o.plat) out.appendChild(h("span", { class: "pv", text: o.plat + (o.newPlat ? tr("（新平台）", " (new platform)") : "") }));
    out.appendChild(h("span", { class: "pv", text: ms(o.d) + " " + weekday(o.d) + (o.d === TODAY ? tr(" · 今天", " · today") : "") }));
    if (o.kind === "trade") {
      if (o.sym) out.appendChild(h("span", { class: "pv", text: o.sym }));
      if (o.side) out.appendChild(h("span", { class: "pv", text: o.side === "long" ? tr("做多", "Long") : tr("做空", "Short") }));
      if (o.lots !== null) out.appendChild(h("span", { class: "pv", text: o.lots + tr(" 手", " lots") }));
    }
    if (o.note.length) out.appendChild(h("span", { class: "pv", text: tr("备注：", "Note: ") + o.note.join(" ") }));
    out.appendChild(h("span", { class: "nl-ex", text: finePointer() ? tr("按 Enter 记下", "Press Enter to log it") : "" }));
  }
  function nlSave() {
    var o = parseLine($("nl").value);
    if (!$("nl").value.trim()) return;
    if (o.err) { renderNl(); return; }
    if (o.newPlat) addPlat(o.plat);
    if (V.edit) endEdit();
    var r = o.kind === "cash" ? addCash({ d: o.d, amt: o.amt, plat: o.plat, note: o.note.join(" ") }) : addTrade({ d: o.d, amt: o.amt * o.sign, plat: o.plat, sym: o.sym, side: o.side, lots: o.lots, note: o.note.join(" ") });
    if (r) { $("nl").value = ""; renderNl(); }
  }

  // ---------- overview ----------
  function periodOf(p) {
    var t = new Date();
    if (p === "week") return { from: dOf(new Date(t.getFullYear(), t.getMonth(), t.getDate() - (t.getDay() + 6) % 7)), label: tr("本周", "This week") };
    if (p === "month") return { from: TODAY.slice(0, 7) + "-01", label: tr("本月", "This month") };
    if (p === "year") return { from: TODAY.slice(0, 4) + "-01-01", label: tr("今年", "This year") };
    return { from: "", label: tr("全部", "All time") };
  }
  function spark(vals, pos) {
    var W = 100, H = 40, lo = Math.min.apply(null, vals.concat([0])), hi = Math.max.apply(null, vals.concat([0])), sp = hi - lo || 1;
    var pts = vals.map(function (v, i) { return [(i / (vals.length - 1)) * W, H - 3 - (v - lo) / sp * (H - 6)]; });
    var svg = sv("svg", { class: "spark", viewBox: "0 0 " + W + " " + H, preserveAspectRatio: "none", "aria-hidden": "true" });
    var col = pos ? "var(--m-bull)" : "var(--m-bear)", gid = "spk" + (pos ? "u" : "d");
    var gr = sv("linearGradient", { id: gid, x1: "0", y1: "0", x2: "0", y2: "1" }, sv("defs", {}, svg));
    sv("stop", { offset: "0", style: "stop-color:" + col + ";stop-opacity:.32" }, gr); sv("stop", { offset: "1", style: "stop-color:" + col + ";stop-opacity:0" }, gr);
    var line = pts.map(function (p) { return p[0].toFixed(2) + "," + p[1].toFixed(2); }).join(" ");
    sv("polygon", { points: "0," + H + " " + line + " " + W + "," + H, fill: "url(#" + gid + ")" }, svg);
    sv("polyline", { points: line, fill: "none", stroke: col, "stroke-width": "2", "vector-effect": "non-scaling-stroke", "stroke-linejoin": "round" }, svg);
    return svg;
  }
  function ring(w, l) {
    var r = 23, C = 2 * Math.PI * r, tot = w + l, svg = sv("svg", { class: "ring", viewBox: "0 0 58 58", role: "img", "aria-label": tr("胜率 ", "Win rate ") + (tot ? pct(w, tot) : 0) + "%" });
    sv("circle", { cx: 29, cy: 29, r: r, fill: "none", stroke: "var(--bg4)", "stroke-width": 6 }, svg);
    if (tot) {
      var gap = w && l ? 2.5 : 0, wl = C * w / tot - gap, ll = C * l / tot - gap;
      if (w) sv("circle", { cx: 29, cy: 29, r: r, fill: "none", stroke: "var(--m-bull)", "stroke-width": 6, "stroke-dasharray": Math.max(0, wl).toFixed(2) + " " + C.toFixed(2), transform: "rotate(-90 29 29)" }, svg);
      if (l) sv("circle", { cx: 29, cy: 29, r: r, fill: "none", stroke: "var(--m-bear)", "stroke-width": 6, "stroke-dasharray": Math.max(0, ll).toFixed(2) + " " + C.toFixed(2), "stroke-dashoffset": (-(C * w / tot)).toFixed(2), transform: "rotate(-90 29 29)" }, svg);
    }
    var t = sv("text", { x: 29, y: 33.5, "text-anchor": "middle" }, svg); t.textContent = tot ? pct(w, tot) + "%" : "—";
    return svg;
  }
  function renderKpis() {
    var P = periodOf(V.per), el = clear($("kpis")), list = D.items.filter(function (x) { return x.d >= P.from; }), s = tstats(list), days = {}, start = num(D.start);
    Array.prototype.forEach.call(document.querySelectorAll("#per button"), function (b) { b.setAttribute("aria-selected", String(b.getAttribute("data-p") === V.per)); });
    list.forEach(function (x) { days[x.d] = r2((days[x.d] || 0) + x.amt); });
    var dk = Object.keys(days).sort(), wd = dk.filter(function (k) { return days[k] > 0; }).length;
    var tile = function (c, ic, k, v, vc, d, extra) { var t = h("div", { class: "kp" + (c ? " " + c : "") }, [h("div", { class: "k" }, [icon(ic, "sm"), k]), h("div", { class: "v " + (vc || ""), text: v }), extra || null, h("div", { class: "d", text: d })]); el.appendChild(t); return t; };
    var sys = "";
    if (REC && V.per === "month") { var pre = TODAY.slice(0, 7), done = (REC.signals || []).filter(function (x) { return typeof x.R === "number" && x.exitMs && new Date(x.exitMs + 8 * 3600000).toISOString().slice(0, 7) === pre; }), rr = done.reduce(function (a, x) { return a + x.R; }, 0); sys = done.length ? (EN ? " Same month, the gold rule's paper record: " + done.length + " trades, " : " 同月 4H 报告纸面记录 " + done.length + " 笔、") + (rr >= 0 ? "+" : "−") + Math.abs(rr).toFixed(1) + "R" + tr("。", ".") : ""; }
    var net = tile("wide", s.sum < 0 ? "down" : "up", P.label + tr("净盈亏", " · net P&L"), s.n ? signed(s.sum, 2) : "—", cls(s.sum),
      s.n ? (EN ? s.n + " trades · " + dk.length + " trading days, " + wd + " up" + (start && V.per === "month" ? " · " + (s.sum >= 0 ? "+" : "−") + Math.abs(s.sum / start * 100).toFixed(1) + "% of the month-start balance" : "") + "."
        : s.n + " 笔 · " + dk.length + " 个交易日，" + wd + " 天赚" + (start && V.per === "month" ? " · 月初余额的 " + (s.sum >= 0 ? "+" : "−") + Math.abs(s.sum / start * 100).toFixed(1) + "%" : "") + "。") + sys : tr("这段时间还没有记录。", "Nothing logged in this period yet.") + sys);
    if (dk.length >= 2) { var c = 0; net.appendChild(spark(dk.map(function (k) { c += days[k]; return c; }), s.sum >= 0)); }
    var rt = tile("ringed", "target", tr("胜率", "Win rate"), s.n ? (EN ? s.w + "W · " + s.l + "L" : s.w + " 赚 " + s.l + " 亏") : "—", "", s.n ? (EN ? s.n + pl(s.n, " trade", " trades") + (s.z ? ", " + s.z + " break-even not counted" : "") : "共 " + s.n + " 笔" + (s.z ? "，" + s.z + " 笔打平不算" : "")) : tr("有记录后显示", "Shows once there are trades"));
    rt.insertBefore(ring(s.w, s.l), rt.querySelector(".d"));
    tile("", "zap", tr("每笔平均", "Average per trade"), s.n ? signed(s.sum / s.n, 2) : "—", s.n ? cls(s.sum) : "", s.w || s.l ? tr("平均赚 ", "Avg win ") + (s.w ? signed(s.aw, 0) : "—") + tr(" · 平均亏 ", " · avg loss ") + (s.l ? signed(-s.al, 0) : "—") + (s.pf !== null && s.w ? tr(" · 利润因子 ", " · profit factor ") + s.pf.toFixed(2) : "") : tr("有记录后显示", "Shows once there are trades"));
    var k = streaks();
    tile("", "flame", tr("最近连续（按天）", "Current streak (days)"), k.cur ? (EN ? k.cur + (k.sign > 0 ? " up" : " down") + (k.cur > 1 ? " days" : " day") : (k.sign > 0 ? "连赚 " : "连亏 ") + k.cur + " 天") : "—", k.cur ? (k.sign > 0 ? "up" : "dn") : "", k.last ? (EN ? "As of " + md(k.last) + "; longest up streak " + k.best + " days" : "截至 " + md(k.last) + "；最长连赚 " + k.best + " 天") : tr("有记录后显示", "Shows once there are trades"));
    var cw = withdrawals().filter(function (x) { return x.d >= P.from; }), cp = {};
    cw.forEach(function (x) { cp[x.plat || tr("未填平台", "no platform")] = 1; });
    tile("", "wallet", P.label + tr("提现", " · withdrawn"), cw.length ? plain(cashSum(cw)) : "—", "", cw.length ? cw.length + tr(" 笔 · ", " · ") + Object.keys(cp).join(tr("、", ", ")) : tr("提了钱就记一笔：金额 + 平台", "Log each withdrawal: amount + platform"));
  }

  // ---------- insights ----------
  // Every line is arithmetic on the visitor's own records, with how many trades it rests on.
  function insights() {
    var L = D.items.slice().sort(byTime), n = L.length, out = [];
    if (n < 3) return out;
    var s = tstats(L), exp = s.sum / n;
    out.push({ ic: "zap", tone: exp > 0 ? "good" : exp < 0 ? "bad" : "", title: tr("每笔平均", "Average per trade"), big: signed(exp, 2), short: tr("平均每笔 ", "an average of ") + signed(exp, 2) + tr("", " a trade"),
      text: EN ? "Over " + n + " trades: win rate " + Math.round(s.wr * 100) + "%, average win " + (s.w ? signed(s.aw, 2) : "—") + ", average loss " + (s.l ? signed(-s.al, 2) : "—") + "."
        : "按 " + n + " 笔算：胜率 " + Math.round(s.wr * 100) + "%，平均赚 " + (s.w ? signed(s.aw, 2) : "—") + "，平均亏 " + (s.l ? signed(-s.al, 2) : "—") + "。", n: n });
    if (s.w && s.l) {
      var be = s.al / (s.aw + s.al), gap = Math.round((s.wr - be) * 100);
      out.push({ ic: "scale", tone: s.wr > be ? "good" : "bad", title: tr("保本需要的胜率", "Break-even win rate"), big: Math.round(be * 100) + "%",
        short: s.wr > be ? (EN ? "a win rate " + gap + " points above break-even" : "胜率高过保本线 " + gap + " 个百分点") : (EN ? "a win rate " + (-gap) + " points below break-even" : "胜率比保本线低 " + (-gap) + " 个百分点"),
        text: EN ? "Your average win is " + (s.aw / s.al).toFixed(2) + "× your average loss, so you break even above a " + Math.round(be * 100) + "% win rate; you are at " + Math.round(s.wr * 100) + "%, " + (gap >= 0 ? gap + " points above." : (-gap) + " points short.")
          : "平均赚是平均亏的 " + (s.aw / s.al).toFixed(2) + " 倍，胜率要高过 " + Math.round(be * 100) + "% 才不亏；你现在是 " + Math.round(s.wr * 100) + "%，" + (gap >= 0 ? "高出 " + gap : "还差 " + (-gap)) + " 个百分点。", n: n });
    }
    var wk = {}; Object.keys(IDX.day).forEach(function (k) { var w = wdi(k), o = wk[w] || (wk[w] = { sum: 0, days: 0 }); o.sum += IDX.day[k].sum; o.days++; });
    var wl = Object.keys(wk).filter(function (w) { return wk[w].days >= 2; }).sort(function (a, b) { return wk[b].sum / wk[b].days - wk[a].sum / wk[a].days; });
    if (wl.length >= 2) {
      var bw = wl[0], ww = wl[wl.length - 1], bA = wk[bw].sum / wk[bw].days, wA = wk[ww].sum / wk[ww].days;
      var wn = function (w) { return EN ? WD[w] : "周" + WD[w]; };
      out.push({ ic: "cal", tone: wA < 0 ? "bad" : "good", title: tr("星期几做得最好", "Best day of the week"), big: wn(bw), short: EN ? wn(bw) + " best, " + wn(ww) + " worst" : wn(bw) + "最好、" + wn(ww) + "最差",
        text: EN ? wn(bw) + ": " + wk[bw].days + " days averaging " + signed(bA) + " a day; " + wn(ww) + ": " + wk[ww].days + " days averaging " + signed(wA) + " a day, the worst."
          : wn(bw) + " " + wk[bw].days + " 天平均每天 " + signed(bA) + "；" + wn(ww) + " " + wk[ww].days + " 天平均每天 " + signed(wA) + "，是最差的一天。", n: Object.keys(IDX.day).length });
    }
    var pl = {}; L.forEach(function (x) { if (!x.plat) return; var o = pl[x.plat] || (pl[x.plat] = { sum: 0, n: 0 }); o.sum += x.amt; o.n++; });
    var pk = Object.keys(pl).filter(function (p) { return pl[p].n >= 2; }).sort(function (a, b) { return pl[b].sum - pl[a].sum; });
    if (pk.length >= 2) {
      var bp = pk[0], wp = pk[pk.length - 1];
      out.push({ ic: "layers", tone: pl[wp].sum < 0 ? "bad" : "good", title: tr("平台对比", "Platforms compared"), big: bp + " " + signed(pl[bp].sum, 0), short: bp + tr(" 做得最好", " doing best"),
        text: EN ? bp + ": " + pl[bp].n + " trades, total " + signed(pl[bp].sum, 2) + "; " + wp + ": " + pl[wp].n + " trades, total " + signed(pl[wp].sum, 2) + "."
          : bp + " " + pl[bp].n + " 笔合计 " + signed(pl[bp].sum, 2) + "；" + wp + " " + pl[wp].n + " 笔合计 " + signed(pl[wp].sum, 2) + "。", n: pl[bp].n + pl[wp].n });
    }
    var after = [], other = [];
    L.forEach(function (x, i) { var p = L[i - 1]; (p && p.d === x.d && p.amt < 0 ? after : other).push(x.amt); });
    if (after.length >= 3 && other.length >= 3) {
      var aA = after.reduce(function (a, b) { return a + b; }, 0) / after.length, oA = other.reduce(function (a, b) { return a + b; }, 0) / other.length;
      out.push({ ic: "repeat", tone: aA < oA ? "bad" : "good", title: tr("亏完马上再做", "Trading straight after a loss"), big: signed(aA, 2) + tr(" / 笔", " / trade"),
        short: aA < oA ? tr("亏损后当天接着做的单子更差", "trades taken right after a loss on the same day do worse") : tr("亏损后接着做的单子没有更差", "trades right after a loss do no worse"),
        text: EN ? "The " + after.length + " trades taken on the same day after a loss averaged " + signed(aA, 2) + "; the other " + other.length + " averaged " + signed(oA, 2) + ". " + (aA < oA ? "Trades after a loss are clearly worse." : "Trades after a loss are not worse.")
          : "当天亏了一笔之后接着做的 " + after.length + " 笔，平均 " + signed(aA, 2) + "；其他 " + other.length + " 笔平均 " + signed(oA, 2) + "。" + (aA < oA ? "亏完之后的单子明显更差。" : "亏完之后的单子并没有更差。"), n: after.length });
    }
    var heavy = [], light = [];
    Object.keys(IDX.day).forEach(function (k) { (IDX.day[k].n >= 4 ? heavy : light).push(IDX.day[k].sum); });
    if (heavy.length >= 2 && light.length >= 2) {
      var hA = heavy.reduce(function (a, b) { return a + b; }, 0) / heavy.length, lA = light.reduce(function (a, b) { return a + b; }, 0) / light.length;
      out.push({ ic: "clock", tone: hA < lA ? "bad" : "good", title: tr("一天做很多笔", "Busy days"), big: signed(hA, 0) + tr(" / 天", " / day"),
        short: hA < lA ? tr("一天做 4 笔以上的日子更差", "days with 4 or more trades do worse") : tr("做得多的日子没有更差", "busy days do no worse"),
        text: EN ? heavy.length + " days with 4 or more trades averaged " + signed(hA, 2) + " a day; " + light.length + " days with fewer averaged " + signed(lA, 2) + " a day."
          : "一天 4 笔以上的 " + heavy.length + " 天，平均每天 " + signed(hA, 2) + "；少于 4 笔的 " + light.length + " 天，平均每天 " + signed(lA, 2) + "。", n: heavy.length + light.length });
    }
    var dd = drawdown();
    if (dd.max > 0) out.push({ ic: "down", tone: dd.now > 0 ? "bad" : "", title: tr("最深回撤", "Deepest drawdown"), big: "−" + D.cur + money(dd.max), short: tr("最深回撤 −", "a deepest drawdown of −") + D.cur + money(dd.max),
      text: EN ? "The running total fell from its high of " + signed(dd.peakAt) + " on " + md(dd.from || dd.to) + " to " + md(dd.to) + ", down " + D.cur + money(dd.max) + ". " + (dd.now > 0 ? "It is now " + D.cur + money(dd.now) + " below the high." : "It is at its high now.")
        : "累计盈亏从 " + md(dd.from || dd.to) + "的高点 " + signed(dd.peakAt) + " 回落到 " + md(dd.to) + "，少了 " + D.cur + money(dd.max) + "。" + (dd.now > 0 ? "现在离最高点还差 " + D.cur + money(dd.now) + "。" : "现在就在最高点。"), n: n });
    if (s.l && s.w && s.worst) {
      var ratio = -s.worst.amt / s.aw;
      if (ratio >= 1.5) out.push({ ic: "alert", tone: "bad", title: tr("最大一笔亏损", "Biggest loss"), big: signed(s.worst.amt, 2), short: EN ? "a biggest loss worth " + ratio.toFixed(1) + " average wins" : "最大一笔亏损抵掉 " + ratio.toFixed(1) + " 笔平均盈利",
        text: EN ? "The trade on " + md(s.worst.d) + " lost " + D.cur + money(-s.worst.amt, 2) + ", as much as " + ratio.toFixed(1) + " average wins." : md(s.worst.d) + "那一笔亏了 " + D.cur + money(-s.worst.amt, 2) + "，相当于 " + ratio.toFixed(1) + " 笔平均盈利。", n: n });
    }
    var rk = L.filter(function (x) { return num(x.risk) > 0; });
    if (rk.length >= 5) {
      var over = rk.filter(function (x) { return x.amt < -x.risk * 1.1; }), avgR = rk.reduce(function (a, x) { return a + x.amt / x.risk; }, 0) / rk.length;
      out.push({ ic: "target", tone: over.length ? "bad" : avgR > 0 ? "good" : "", title: tr("按计划止损", "Stops kept to plan"), big: (avgR >= 0 ? "+" : "−") + Math.abs(avgR).toFixed(2) + tr("R / 笔", "R / trade"),
        short: over.length ? (EN ? over.length + " trades lost more than planned" : over.length + " 笔亏得比计划多") : tr("没有一笔亏过计划", "no trade lost more than planned"),
        text: EN ? rk.length + " trades have a planned maximum loss: they averaged " + (avgR >= 0 ? "+" : "−") + Math.abs(avgR).toFixed(2) + "R; " + (over.length ? over.length + " lost more than 10% beyond the plan." : "none lost more than planned.")
          : rk.length + " 笔填了「原本最多打算亏」：平均每笔 " + (avgR >= 0 ? "+" : "−") + Math.abs(avgR).toFixed(2) + "R；" + (over.length ? over.length + " 笔亏得比计划多一成以上。" : "没有一笔亏得比计划多。"), n: rk.length });
    }
    var yes = L.filter(function (x) { return x.rule === true; }), no = L.filter(function (x) { return x.rule === false; });
    if (yes.length >= 3 && no.length >= 3) {
      var yA = tstats(yes).sum / yes.length, nA = tstats(no).sum / no.length;
      out.push({ ic: "book", tone: yA >= nA ? "good" : "bad", title: tr("按规则 vs 凭感觉", "By the rule vs by feel"), big: signed(yA, 0) + " vs " + signed(nA, 0), short: yA >= nA ? tr("按规则的单子比凭感觉的好", "trades by the rule beating trades by feel") : tr("凭感觉的单子反而更好", "trades by feel doing better than by the rule"),
        text: EN ? "By the rule: " + yes.length + " trades averaging " + signed(yA, 2) + "; by feel: " + no.length + " trades averaging " + signed(nA, 2) + "." : "按规则 " + yes.length + " 笔平均 " + signed(yA, 2) + "；凭感觉 " + no.length + " 笔平均 " + signed(nA, 2) + "。", n: yes.length + no.length });
    }
    return out;
  }
  function renderAi() {
    var el = clear($("ai-body")), L = D.items, ins = insights(), s = tstats(L);
    if (L.length < 3) {
      $("ai-n").textContent = "";
      el.appendChild(h("div", { class: "ai-sum" }, [h("span", { class: "tag", text: "Summary" }), tr("记满 3 笔以后，这里会自动算出：每笔平均、保本需要的胜率、星期几做得好、哪个平台好、亏完马上再做的结果、最深回撤，还有按规则和凭感觉的差别。", "After 3 trades this works out, from your own records: the average per trade, the win rate you need to break even, your best weekday and platform, how trades right after a loss do, your deepest drawdown, and trades by the rule against trades by feel.")]));
      return;
    }
    var first = L.reduce(function (a, x) { return x.d < a ? x.d : a; }, L[0].d), last = L.reduce(function (a, x) { return x.d > a ? x.d : a; }, L[0].d);
    $("ai-n").textContent = EN ? "From " + L.length + " trades · " + ms(first) + "–" + ms(last) + " · worked out by the page" : "根据 " + L.length + " 笔交易 · " + ms(first) + "–" + ms(last) + " · 页面自动算出";
    var good = ins.filter(function (x) { return x.tone === "good" && x.ic !== "zap"; })[0], bad = ins.filter(function (x) { return x.tone === "bad"; })[0];
    var sum = EN ? "All " + L.length + " trades: total " + signed(s.sum, 2) + ", win rate " + Math.round(s.wr * 100) + "%, average " + signed(s.sum / L.length, 2) + " a trade. " + (good ? "Going well: " + good.short + ". " : "") + (bad ? "Watch most: " + bad.short + ". " : "") + (L.length < 20 ? "(Only " + L.length + " trades: the findings below are not reliable yet.)" : "")
      : "全部 " + L.length + " 笔，合计 " + signed(s.sum, 2) + "，胜率 " + Math.round(s.wr * 100) + "%，平均每笔 " + signed(s.sum / L.length, 2) + "。" + (good ? "做得好的：" + good.short + "。" : "") + (bad ? "最要注意：" + bad.short + "。" : "") + (L.length < 20 ? "（只有 " + L.length + " 笔，下面的结论还不可靠。）" : "");
    el.appendChild(h("div", { class: "ai-sum" }, [h("span", { class: "tag", text: "Summary" }), sum]));
    var grid = h("div", { class: "ins" });
    ins.forEach(function (x) {
      grid.appendChild(h("div", { class: "in " + (x.tone || "") }, [h("div", { class: "t" }, [icon(x.ic, "sm"), x.title, x.n < 20 ? h("span", { class: "low", text: tr("样本 ", "n = ") + x.n }) : null]), h("div", { class: "b", text: x.big }), h("div", { class: "x", text: x.text })]));
    });
    el.appendChild(grid);
  }
  // ---------- ask Claude ----------
  function claudeText() {
    if (EN) return claudeTextEn();
    var L = D.items.slice().sort(byTime), s = tstats(L), out = [], n = L.length;
    out.push("请当我的交易教练，用简体中文帮我复盘下面这份交易日记。先给一句话结论；再写做得好的地方和最需要改的 2–3 个习惯，每一点都引用下面的具体数字；最后给我接下来 20 笔交易可以逐条检查的 3 条做法。只根据这些记录说话：不要预测行情，不要给具体的买卖点位；样本少的地方请直接说结论还不可靠。");
    out.push("");
    if (!n) { out.push("（我还没有记任何交易。）"); return out.join("\n"); }
    out.push("货币 " + D.cur + (num(D.start) ? "；月初账户余额 " + D.cur + money(D.start, 2) : "") + "；记录从 " + L[0].d + " 到 " + L[n - 1].d + "，共 " + n + " 笔交易、" + Object.keys(IDX.day).length + " 个交易日。");
    out.push("合计 " + signed(s.sum, 2) + "；赚 " + s.w + " 笔、亏 " + s.l + " 笔、平 " + s.z + " 笔；胜率 " + Math.round(s.wr * 100) + "%；平均赚 " + (s.w ? signed(s.aw, 2) : "—") + "，平均亏 " + (s.l ? signed(-s.al, 2) : "—") + (s.pf !== null ? "；利润因子 " + s.pf.toFixed(2) : "") + "；最大单笔赚 " + signed(s.best.amt, 2) + "，最大单笔亏 " + signed(s.worst.amt, 2) + "。");
    var dd = drawdown(); out.push("累计盈亏最高 " + signed(dd.peak, 2) + "，最深回撤 −" + D.cur + money(dd.max, 2) + "，现在离最高点 " + D.cur + money(dd.now, 2) + "。");
    var g = activeGoal(); if (g) { var p = goalProgress(g); out.push("当前目标：" + D.cur + money(g.target, 2) + "，从 " + g.start_d + " 开始，已完成 " + plain(p.sum, 2) + "（" + Math.floor(Math.max(0, p.pct)) + "%）。"); }
    var won = D.goals.filter(function (x) { return x.done_at; }).length; if (won) out.push("已经达成的目标：" + won + " 轮。");
    var cw = withdrawals(); if (cw.length) { var by = {}; cw.forEach(function (x) { by[x.plat || "未填"] = r2((by[x.plat || "未填"] || 0) + x.amt); }); out.push("提现合计 " + plain(cashSum(cw), 2) + "：" + Object.keys(by).map(function (k) { return k + " " + plain(by[k], 2); }).join("，") + "。"); }
    var ins = insights(); if (ins.length) { out.push(""); out.push("页面从记录里算出的观察："); ins.forEach(function (x) { out.push("- " + x.title + "：" + x.text); }); }
    var nl = D.notes.slice().sort(function (a, b) { return a.d < b.d ? 1 : -1; }).slice(0, 12);
    if (nl.length) { out.push(""); out.push("我写的备注（最近 " + nl.length + " 天，新的在前）："); nl.forEach(function (x) { out.push(x.d + "：" + x.text.replace(/\s+/g, " ").slice(0, 300)); }); }
    out.push(""); out.push("每日合计（最近 30 个交易日）：");
    Object.keys(IDX.day).sort().slice(-30).forEach(function (k) { var o = IDX.day[k]; out.push(k + " " + weekday(k) + "  " + signed(o.sum, 2) + "（" + o.n + " 笔，" + o.w + " 赚 " + o.l + " 亏）"); });
    out.push(""); out.push("最近的交易（最多 60 笔，新的在前；日期 | 金额 | 平台 | 品种 | 方向 | 手数 | R | 按规则 | 备注）：");
    L.slice(-60).reverse().forEach(function (x) {
      out.push([x.d, signed(x.amt, 2), x.plat || "-", x.sym || "-", x.side === "long" ? "多" : x.side === "short" ? "空" : "-", num(x.lots) !== null ? x.lots : "-", num(x.risk) > 0 ? (x.amt / x.risk).toFixed(2) + "R" : "-", x.rule === true ? "是" : x.rule === false ? "否" : "-", (x.note || "-").slice(0, 60)].join(" | "));
    });
    return out.join("\n");
  }
  function claudeTextEn() {
    var L = D.items.slice().sort(byTime), s = tstats(L), out = [], n = L.length;
    out.push("Please act as my trading coach and review the trading journal below, in English. Start with a one-sentence conclusion; then what is going well and the 2–3 habits that most need to change, each backed by the numbers below; then 3 concrete things I can check over my next 20 trades. Go only by these records: no market forecasts and no specific entry or exit prices; where the sample is small, say plainly that the conclusion is not reliable yet.");
    out.push("");
    if (!n) { out.push("(I have not logged any trades yet.)"); return out.join("\n"); }
    out.push("Currency " + D.cur + (num(D.start) ? "; month-start balance " + D.cur + money(D.start, 2) : "") + "; records from " + L[0].d + " to " + L[n - 1].d + ": " + n + " trades over " + Object.keys(IDX.day).length + " trading days.");
    out.push("Total " + signed(s.sum, 2) + "; " + s.w + " won, " + s.l + " lost, " + s.z + " break-even; win rate " + Math.round(s.wr * 100) + "%; average win " + (s.w ? signed(s.aw, 2) : "—") + ", average loss " + (s.l ? signed(-s.al, 2) : "—") + (s.pf !== null ? "; profit factor " + s.pf.toFixed(2) : "") + "; biggest win " + signed(s.best.amt, 2) + ", biggest loss " + signed(s.worst.amt, 2) + ".");
    var dd = drawdown(); out.push("Running total peaked at " + signed(dd.peak, 2) + "; deepest drawdown −" + D.cur + money(dd.max, 2) + "; now " + D.cur + money(dd.now, 2) + " below the peak.");
    var g = activeGoal(); if (g) { var p = goalProgress(g); out.push("Current goal: " + D.cur + money(g.target, 2) + " from " + g.start_d + ", " + plain(p.sum, 2) + " done (" + Math.floor(Math.max(0, p.pct)) + "%)."); }
    var won = D.goals.filter(function (x) { return x.done_at; }).length; if (won) out.push("Goals reached so far: " + won + ".");
    var cw = withdrawals(); if (cw.length) { var by = {}; cw.forEach(function (x) { by[x.plat || "no platform"] = r2((by[x.plat || "no platform"] || 0) + x.amt); }); out.push("Withdrawn in total " + plain(cashSum(cw), 2) + ": " + Object.keys(by).map(function (k) { return k + " " + plain(by[k], 2); }).join(", ") + "."); }
    var ins = insights(); if (ins.length) { out.push(""); out.push("What the page worked out from the records:"); ins.forEach(function (x) { out.push("- " + x.title + ": " + x.text); }); }
    var nl = D.notes.slice().sort(function (a, b) { return a.d < b.d ? 1 : -1; }).slice(0, 12);
    if (nl.length) { out.push(""); out.push("My remarks (last " + nl.length + " days, newest first; some may be in Chinese):"); nl.forEach(function (x) { out.push(x.d + ": " + x.text.replace(/\s+/g, " ").slice(0, 300)); }); }
    out.push(""); out.push("Daily totals (last 30 trading days):");
    Object.keys(IDX.day).sort().slice(-30).forEach(function (k) { var o = IDX.day[k]; out.push(k + " " + weekday(k) + "  " + signed(o.sum, 2) + " (" + o.n + " trades, " + o.w + " won " + o.l + " lost)"); });
    out.push(""); out.push("Latest trades (up to 60, newest first; date | amount | platform | symbol | side | lots | R | by the rule | note):");
    L.slice(-60).reverse().forEach(function (x) {
      out.push([x.d, signed(x.amt, 2), x.plat || "-", x.sym || "-", x.side || "-", num(x.lots) !== null ? x.lots : "-", num(x.risk) > 0 ? (x.amt / x.risk).toFixed(2) + "R" : "-", x.rule === true ? "yes" : x.rule === false ? "no" : "-", (x.note || "-").slice(0, 60)].join(" | "));
    });
    return out.join("\n");
  }
  function askNow(open) {
    var text = claudeText(), url = "https://claude.ai/new?q=" + encodeURIComponent(text), msg = $("ask-msg");
    $("ask-pre").textContent = text;
    var copied = function (ok) { msg.textContent = open ? (ok ? tr("已在新窗口打开 Claude，资料已经填好；没填好就在输入框里粘贴（已复制）。", "Claude opened in a new window with your numbers filled in; if they are missing, paste them (already copied).") : tr("已在新窗口打开 Claude。资料没填好的话，点「只复制」再粘贴。", "Claude opened in a new window. If your numbers are missing, tap «Copy only» and paste.")) : ok ? tr("已复制，到 Claude 里粘贴即可。", "Copied: paste it into Claude.") : tr("复制失败：打开下面的资料，手动复制。", "Could not copy: open the text below and copy it by hand."); };
    if (open) {
      if (url.length > 12000) url = "https://claude.ai/new";                   // too long for a link: the copied text carries it
      var a = h("a", { href: url, target: "_blank", rel: "noopener" }); document.body.appendChild(a); a.click(); a.remove();
    }
    try { navigator.clipboard.writeText(text).then(function () { copied(true); }, function () { copied(false); }); } catch (e) { copied(false); }
  }

  // ---------- running total ----------
  function renderCurve() {
    var box = clear($("chart")), ks = Object.keys(IDX.day).sort(), cum = 0, peak = 0;
    var pts = ks.map(function (k) { cum = r2(cum + IDX.day[k].sum); peak = Math.max(peak, cum); return { d: k, v: cum, day: IDX.day[k].sum, pk: peak }; });
    var ct = $("ctotal"); ct.textContent = pts.length ? tr("合计 ", "Total ") + signed(cum, 0) + " · " + pts.length + tr(" 个交易日", " trading days") : ""; ct.className = "end note " + cls(cum);
    if (pts.length < 2) { box.appendChild(h("p", { class: "note", text: tr("记了两天以上，这里会画出累计曲线：往上走是在赚，红色阴影是从高点回落的部分。", "After two days of records this draws your running total: up means making money, red shading is any fall from a previous high.") })); return; }
    var W = 760, H = 250, L = 10, R = 66, T = 14, B = 30, vs = pts.map(function (p) { return p.v; }).concat([0]), lo = Math.min.apply(null, vs), hi = Math.max.apply(null, vs.concat(pts.map(function (p) { return p.pk; }))), padv = (hi - lo) * 0.1 || 1; lo -= padv; hi += padv;
    var X = function (i) { return L + i * (W - L - R) / (pts.length - 1); }, Y = function (v) { return T + (hi - v) * (H - T - B) / (hi - lo); };
    var svg = sv("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": tr("累计盈亏曲线，最新 ", "Running total, latest ") + signed(cum, 0) });
    var col = cum >= 0 ? "var(--m-bull)" : "var(--m-bear)", gr = sv("linearGradient", { id: "eqg", x1: "0", y1: "0", x2: "0", y2: "1" }, sv("defs", {}, svg));
    sv("stop", { offset: "0", style: "stop-color:" + col + ";stop-opacity:.26" }, gr); sv("stop", { offset: "1", style: "stop-color:" + col + ";stop-opacity:0" }, gr);
    [0.25, 0.5, 0.75].forEach(function (f) { var v = lo + (hi - lo) * f; sv("line", { x1: L, x2: W - R, y1: Y(v), y2: Y(v), stroke: "rgba(255,255,255,.04)", "stroke-width": 1 }, svg); });
    sv("line", { x1: L, x2: W - R, y1: Y(0), y2: Y(0), stroke: "var(--border-2)", "stroke-width": 1 }, svg);
    sv("text", { x: W - R + 8, y: Y(0) + 3 }, svg).textContent = "0";
    var line = pts.map(function (p, i) { return X(i).toFixed(1) + "," + Y(p.v).toFixed(1); });
    sv("polygon", { points: X(0).toFixed(1) + "," + Y(0).toFixed(1) + " " + line.join(" ") + " " + X(pts.length - 1).toFixed(1) + "," + Y(0).toFixed(1), fill: "url(#eqg)" }, svg);
    // below the previous high: the drawdown, shaded
    var under = pts.map(function (p, i) { return X(i).toFixed(1) + "," + Y(p.pk).toFixed(1); }).concat(line.slice().reverse());
    sv("polygon", { points: under.join(" "), fill: "rgba(219,41,67,.16)" }, svg);
    sv("polyline", { points: pts.map(function (p, i) { return X(i).toFixed(1) + "," + Y(p.pk).toFixed(1); }).join(" "), fill: "none", stroke: "rgba(255,255,255,.22)", "stroke-width": 1, "stroke-dasharray": "3 4" }, svg);
    sv("polyline", { points: line.join(" "), fill: "none", stroke: col, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
    var lastY = Y(cum); sv("circle", { cx: X(pts.length - 1), cy: lastY, r: 4.5, fill: col, stroke: "var(--bg2)", "stroke-width": 2 }, svg);
    var lt = sv("text", { x: W - R + 8, y: Math.abs(lastY - Y(0)) < 12 ? lastY - 9 : lastY + 3, style: "fill:var(--ink);font-weight:600" }, svg); lt.textContent = short(cum);
    var cashAt = {};
    Object.keys(IDX.cash).forEach(function (k) { var i = -1; pts.forEach(function (p, j) { if (p.d <= k) i = j; }); if (i < 0) i = 0; cashAt[i] = r2((cashAt[i] || 0) + cashSum(IDX.cash[k])); });
    Object.keys(cashAt).forEach(function (i) { var x = X(+i), y = H - B + 4; sv("path", { d: "M" + (x - 4.5) + "," + (y + 8) + "L" + x + "," + y + "L" + (x + 4.5) + "," + (y + 8) + "Z", fill: "var(--m-gold)" }, svg); });
    sv("text", { x: L, y: H - 4 }, svg).textContent = ms(pts[0].d);
    sv("text", { x: W - R, y: H - 4, "text-anchor": "end" }, svg).textContent = ms(pts[pts.length - 1].d);
    var vl = sv("line", { y1: T, y2: H - B, stroke: "var(--dim)", "stroke-width": 1, "stroke-dasharray": "2 3", visibility: "hidden" }, svg), dot = sv("circle", { r: 4.5, fill: "var(--ink)", visibility: "hidden" }, svg);
    sv("rect", { x: L, y: T, width: W - L - R, height: H - T, fill: "transparent" }, svg);
    box.appendChild(svg); var tip = h("div", { class: "tip", hidden: true }); box.appendChild(tip);
    box.appendChild(h("div", { class: "legend" }, [h("span", {}, [h("i", { style: "background:" + col + ";height:3px;vertical-align:3px" }), tr("累计盈亏", "Running total")]), h("span", {}, [h("i", { style: "background:rgba(219,41,67,.35)" }), tr("从高点回落的部分", "Fall from a previous high")]), Object.keys(cashAt).length ? h("span", {}, [h("i", { style: "background:var(--m-gold);clip-path:polygon(50% 0,100% 100%,0 100%)" }), tr("提现（不算进曲线）", "Withdrawal (not in the line)")]) : null]));
    var show = function (ev) {
      var r = svg.getBoundingClientRect(), px = (ev.clientX - r.left) * W / r.width, i = Math.max(0, Math.min(pts.length - 1, Math.round((px - L) / ((W - L - R) / (pts.length - 1))))), p = pts[i];
      vl.setAttribute("x1", X(i)); vl.setAttribute("x2", X(i)); vl.setAttribute("visibility", "visible"); dot.setAttribute("cx", X(i)); dot.setAttribute("cy", Y(p.v)); dot.setAttribute("visibility", "visible");
      tip.hidden = false; tip.textContent = EN ? md(p.d) + ": day " + signed(p.day, 0) + ", total " + signed(p.v, 0) + (p.pk > p.v ? ", " + D.cur + money(p.pk - p.v, 0) + " below the high" : "") + (cashAt[i] ? ", withdrew " + plain(cashAt[i], 0) : "")
        : md(p.d) + "：当天 " + signed(p.day, 0) + "，累计 " + signed(p.v, 0) + (p.pk > p.v ? "，比高点低 " + D.cur + money(p.pk - p.v, 0) : "") + (cashAt[i] ? "，提现 " + plain(cashAt[i], 0) : "");
      var x = X(i) * r.width / W, w = tip.offsetWidth; tip.style.left = Math.max(0, Math.min(r.width - w, x - w / 2)) + "px"; tip.style.top = Math.max(0, Y(p.v) * r.height / H - 40) + "px";
    };
    svg.addEventListener("pointermove", show); svg.addEventListener("pointerdown", show);
    svg.addEventListener("pointerleave", function () { vl.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); tip.hidden = true; });
  }

  // ---------- each trading day's result: the latest 40 days as bars either side of zero ----------
  function barPath(x, y0, w, hgt, up) {     // the end away from zero is rounded (4 px), the end on zero is square
    var r = Math.min(4, w / 2, hgt), y = up ? y0 - hgt : y0 + hgt, k = up ? 1 : -1;
    return "M" + x + "," + y0 + "V" + (y + k * r) + "Q" + x + "," + y + " " + (x + r) + "," + y + "H" + (x + w - r) + "Q" + (x + w) + "," + y + " " + (x + w) + "," + (y + k * r) + "V" + y0 + "Z";
  }
  function renderDaily() {
    var box = clear($("daily")), ks = Object.keys(IDX.day).sort();
    box.hidden = !ks.length; if (!ks.length) return;
    var sums = ks.map(function (k) { return IDX.day[k].sum; }), bi = 0, wi = 0;
    sums.forEach(function (v, i) { if (v > sums[bi]) bi = i; if (v < sums[wi]) wi = i; });
    var avg = r2(sums.reduce(function (a, v) { return a + v; }, 0) / sums.length), ups = sums.filter(function (v) { return v > 0; }).length;
    var show = ks.slice(-40), off = ks.length - show.length, vals = sums.slice(off), n = vals.length;
    box.appendChild(h("div", { class: "bd-h" }, [icon("chart", "sm"), tr("每天的盈亏", "Each day's result"), h("span", { class: "dl-n", text: off ? tr("最近 " + n + " 个交易日", "latest " + n + " trading days") : tr(n + " 个交易日", n + pl(n, " trading day", " trading days")) })]));
    var W = 760, H = 128, L = 10, R = 66, T = 18, B = 22;
    var pos = Math.max.apply(null, vals.concat([0])), neg = -Math.min.apply(null, vals.concat([0])), span = pos + neg || 1, ph = H - T - B;
    var y0 = T + pos / span * ph, slot = (W - L - R) / Math.max(n, 14), bw = Math.max(3, Math.min(24, slot - 2));
    var X = function (i) { return L + i * slot + (slot - bw) / 2; };
    var svg = sv("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": EN ? "Each trading day's result; best " + signed(sums[bi], 0) + ", worst " + signed(sums[wi], 0) : "每个交易日的盈亏；最好 " + signed(sums[bi], 0) + "，最差 " + signed(sums[wi], 0) });
    var hl = sv("rect", { y: T - 6, height: ph + 12, width: slot, rx: 6, fill: "rgba(255,255,255,.05)", visibility: "hidden" }, svg);
    sv("line", { x1: L, x2: W - R, y1: y0, y2: y0, stroke: "var(--border-2)", "stroke-width": 1 }, svg);
    sv("text", { x: W - R + 8, y: y0 + 3 }, svg).textContent = "0";
    vals.forEach(function (v, i) {
      if (!v) { sv("rect", { x: X(i), y: y0 - 1, width: bw, height: 2, rx: 1, fill: "var(--neut)" }, svg); return; }
      sv("path", { d: barPath(X(i), y0, bw, Math.max(2, Math.abs(v) / span * ph), v > 0), fill: v > 0 ? "var(--m-bull)" : "var(--m-bear)" }, svg);
    });
    // labels only on the best and the worst day shown
    [[bi, true], [wi, false]].forEach(function (q) {
      var i = q[0] - off, v = sums[q[0]]; if (i < 0 || (!q[1] && (v >= 0 || wi === bi)) || (q[1] && v <= 0)) return;
      var hg = Math.max(2, Math.abs(v) / span * ph), x = Math.max(L + 14, Math.min(W - R - 14, X(i) + bw / 2));
      sv("text", { x: x, y: q[1] ? y0 - hg - 5 : y0 + hg + 11, "text-anchor": "middle", style: "fill:var(--ink)" }, svg).textContent = short(v);
    });
    sv("text", { x: L, y: H - 4 }, svg).textContent = ms(show[0]);
    if (n > 1) sv("text", { x: L + (n - 1) * slot + slot / 2, y: H - 4, "text-anchor": n > 10 ? "end" : "middle" }, svg).textContent = ms(show[n - 1]);
    sv("rect", { x: L, y: 0, width: W - L - R, height: H, fill: "transparent" }, svg);
    box.appendChild(svg); var tip = h("div", { class: "tip", hidden: true }); box.appendChild(tip);
    var hover = function (ev) {
      var r = svg.getBoundingClientRect(), px = (ev.clientX - r.left) * W / r.width, i = Math.floor((px - L) / slot);
      if (i < 0 || i >= n) { hl.setAttribute("visibility", "hidden"); tip.hidden = true; return; }
      var k = show[i], o = IDX.day[k];
      hl.setAttribute("x", L + i * slot); hl.setAttribute("visibility", "visible");
      tip.hidden = false; tip.textContent = EN ? md(k) + " " + weekday(k) + ": " + signed(o.sum) + " · " + o.n + pl(o.n, " trade", " trades") + " (" + o.w + " won " + o.l + " lost)" : md(k) + " " + weekday(k) + "：" + signed(o.sum) + " · " + o.n + " 笔（" + o.w + " 赚 " + o.l + " 亏）";
      var x = (L + i * slot + slot / 2) * r.width / W, w = tip.offsetWidth; tip.style.left = Math.max(0, Math.min(r.width - w, x - w / 2)) + "px"; tip.style.top = "-34px";
    };
    svg.addEventListener("pointermove", hover); svg.addEventListener("pointerdown", hover);
    svg.addEventListener("pointerleave", function () { hl.setAttribute("visibility", "hidden"); tip.hidden = true; });
    svg.addEventListener("click", function (ev) { var r = svg.getBoundingClientRect(), i = Math.floor(((ev.clientX - r.left) * W / r.width - L) / slot); if (i >= 0 && i < n) { showDay(show[i]); renderAll(); } });
    var stat = function (k, v, c, sub) { return h("div", {}, [h("small", { text: k }), h("b", { class: c, text: v }), sub ? h("em", { text: sub }) : null]); };
    box.appendChild(h("div", { class: "dl-stats" }, [stat(tr("最好的一天", "Best day"), signed(sums[bi], 0), cls(sums[bi]), ms(ks[bi])), stat(tr("最差的一天", "Worst day"), signed(sums[wi], 0), cls(sums[wi]), ms(ks[wi])),
      stat(tr("平均每个交易日", "Average day"), signed(avg, 0), cls(avg)), stat(tr("赚钱的日子", "Up days"), ups + " / " + ks.length, "", pct(ups, ks.length) + "%")]));
  }

  // ---------- breakdown ----------
  function diverging(el, rows) {      // rows: [{name, sum, n}], bars either side of zero
    var max = Math.max.apply(null, rows.map(function (r) { return Math.abs(r.sum); }).concat([1])), box = h("div", { class: "dv" });
    rows.forEach(function (r) {
      var w = (Math.abs(r.sum) / max * 50).toFixed(1);
      box.appendChild(h("div", { class: "r", title: r.name + tr("：", ": ") + r.n + tr(" 笔，合计 ", pl(r.n, " trade", " trades") + ", total ") + signed(r.sum, 2) }, [h("span", { class: "nm", text: r.name }), h("span", { class: "tr" }, [r.sum ? h("i", { class: r.sum > 0 ? "p" : "n", style: "width:" + w + "%" }) : null]), h("span", { class: "vv " + cls(r.sum) }, [signed(r.sum, 0), h("small", { text: r.n + tr(" 笔", pl(r.n, " trade", " trades")) })])]));
    });
    el.appendChild(box);
  }
  function renderBd() {
    var el = clear($("bd")), L = D.items;
    if (L.length < 2) { el.appendChild(h("p", { class: "note", text: tr("记了几笔以后，这里按星期、平台和多空分开加总：哪一块在赚、哪一块在亏，一眼看出来。", "After a few trades this splits your results by weekday, platform and long/short, so you see at a glance what makes money and what loses it.") })); return; }
    var wk = {}; L.forEach(function (x) { var w = wdi(x.d), o = wk[w] || (wk[w] = { sum: 0, n: 0 }); o.sum = r2(o.sum + x.amt); o.n++; });
    el.appendChild(h("div", { class: "bd-h" }, [icon("cal", "sm"), tr("按星期", "By weekday")]));
    diverging(el, [1, 2, 3, 4, 5, 6, 0].filter(function (w) { return wk[w] || w >= 1 && w <= 5; }).map(function (w) { var o = wk[w] || { sum: 0, n: 0 }; return { name: EN ? WD[w] : "周" + WD[w], sum: o.sum, n: o.n }; }));
    var NOPLAT = tr("未填平台", "No platform"), pl = {}; L.forEach(function (x) { var k = x.plat || NOPLAT, o = pl[k] || (pl[k] = { sum: 0, n: 0 }); o.sum = r2(o.sum + x.amt); o.n++; });
    var pk = Object.keys(pl).sort(function (a, b) { return pl[b].sum - pl[a].sum; });
    if (pk.length > 1 || pk[0] !== NOPLAT) { el.appendChild(h("div", { class: "bd-h", style: "margin-top:16px" }, [icon("layers", "sm"), tr("按平台", "By platform")])); diverging(el, pk.map(function (k) { return { name: k, sum: pl[k].sum, n: pl[k].n }; })); }
    var sd = { long: { sum: 0, n: 0 }, short: { sum: 0, n: 0 } }; L.forEach(function (x) { if (sd[x.side]) { sd[x.side].sum = r2(sd[x.side].sum + x.amt); sd[x.side].n++; } });
    if (sd.long.n + sd.short.n >= 2) { el.appendChild(h("div", { class: "bd-h", style: "margin-top:16px" }, [icon("scale", "sm"), tr("做多和做空", "Long and short")])); diverging(el, [{ name: tr("做多", "Long"), sum: sd.long.sum, n: sd.long.n }, { name: tr("做空", "Short"), sum: sd.short.sum, n: sd.short.n }]); }
  }

  // ---------- calendar ----------
  function renderCal() {
    $("mlabel").textContent = EN ? MON[V.m] + " " + V.y : V.y + " 年 " + (V.m + 1) + " 月";
    var grid = clear($("grid")), first = (new Date(V.y, V.m, 1).getDay() + 6) % 7, n = new Date(V.y, V.m + 1, 0).getDate(), max = 0, d, mt = 0, mn = 0;
    for (d = 1; d <= n; d++) { var o = IDX.day[ymd(V.y, V.m, d)]; if (o) { max = Math.max(max, Math.abs(o.sum)); mt += o.sum; mn += o.n; } }
    var mtot = $("mtot"); mtot.textContent = EN ? (mn ? MON[V.m] + " " + signed(r2(mt), 2) + " · " + mn + " trades" : "Nothing in " + MON[V.m]) : mn ? (V.m + 1) + " 月 " + signed(r2(mt), 2) + " · " + mn + " 笔" : (V.m + 1) + " 月没有记录"; mtot.className = "mtot " + (mn ? cls(mt) : "");
    for (var b = 0; b < first; b++) grid.appendChild(h("div", { class: "day blank" }));
    var weeks = [], wk = null;
    for (d = 1; d <= n; d++) {
      var key = ymd(V.y, V.m, d), x = IDX.day[key], cw = IDX.cash[key], col = (first + d - 1) % 7;
      if (col === 0 || d === 1) { wk = { from: d, to: d, sum: 0, n: 0 }; weeks.push(wk); }
      wk.to = d; if (x) { wk.sum += x.sum; wk.n += x.n; }
      var c = "day" + (x ? (x.sum > 0 ? " pos" : x.sum < 0 ? " neg" : "") : "") + (cw ? " cash" : "") + (IDX.note[key] ? " has-note" : "") + (key === TODAY ? " today" : "") + (key === V.sel ? " sel" : "") + (key > TODAY ? " fut" : "");
      var dots = null;
      if (x) { dots = h("span", { class: "dots", "aria-hidden": "true" }); x.items.slice(0, 8).forEach(function (it) { dots.appendChild(h("i", { class: it.amt > 0 ? "w" : it.amt < 0 ? "l" : "z" })); }); }
      var btn = h("button", { type: "button", class: c, "data-d": key, "aria-pressed": String(key === V.sel),
        "aria-label": EN ? md(key) + " " + weekday(key) + (x ? ", " + (x.sum > 0 ? "net up " : x.sum < 0 ? "net down " : "flat ") + D.cur + money(x.sum) + ", " + x.n + pl(x.n, " trade", " trades") + " (" + x.w + " won " + x.l + " lost)" : ", no trades") + (cw ? ", withdrew " + plain(cashSum(cw)) : "") + (IDX.note[key] ? ", has a remark" : "")
          : md(key) + weekday(key) + (x ? "，" + (x.sum > 0 ? "净赚 " : x.sum < 0 ? "净亏 " : "持平 ") + D.cur + money(x.sum) + "，" + x.n + " 笔（" + x.w + " 赚 " + x.l + " 亏）" : "，没有交易") + (cw ? "，提现 " + plain(cashSum(cw)) : "") + (IDX.note[key] ? "，有备注" : "") },
        [h("span", { class: "n", text: String(d) }), x ? h("span", { class: "a", text: short(x.sum) }) : null, dots]);
      if (x && max > 0) btn.style.setProperty("--a", (0.12 + 0.36 * Math.abs(x.sum) / max).toFixed(2));
      grid.appendChild(btn);
    }
    var wl = clear($("weeks"));
    weeks.forEach(function (w) { if (!w.n) return; wl.appendChild(h("span", { class: "wk" }, [(V.m + 1) + "/" + w.from + (w.to > w.from ? "–" + w.to : "") + " ", h("b", { class: cls(w.sum), text: signed(w.sum, 0) }), " · " + w.n + tr(" 笔", pl(w.n, " trade", " trades"))])); });
  }

  // ---------- one day ----------
  function opsFor(c, it, label) {
    return h("span", { class: "ops" }, [h("button", { class: "ibtn", type: "button", "aria-label": tr("修改", "Edit ") + label, title: tr("修改", "Edit"), onclick: function () { if (c === "cash") editCash(it); else editTrade(it); } }, [icon("edit", "sm")]),
      h("button", { class: "ibtn", type: "button", "aria-label": tr("删除", "Delete ") + label, title: tr("删除", "Delete"), onclick: function () { del(c, it); } }, [icon("trash", "sm")])]);
  }
  function renderDay() {
    var x = IDX.day[V.sel], cw = IDX.cash[V.sel] || [], list = clear($("recs"));
    $("dlabel").textContent = md(V.sel) + " " + weekday(V.sel) + (V.sel === TODAY ? tr(" · 今天", " · today") : "");
    var tot = $("dtotal"); tot.textContent = x ? signed(x.sum) + " · " + x.n + tr(" 笔", x.n > 1 ? " trades" : " trade") : ""; tot.className = "tot " + (x ? cls(x.sum) : "");
    if (!x && !cw.length) list.appendChild(h("p", { class: "note", text: tr("这一天没有记录。点下面的按钮，在这一天记一笔。", "Nothing logged on this day. Tap the button below to log something for it.") }));
    (x ? x.items : []).forEach(function (it) {
      var bits = [];
      if (it.sym) bits.push(it.sym); if (it.side) bits.push(it.side === "long" ? tr("做多", "Long") : tr("做空", "Short")); if (num(it.lots) !== null) bits.push(it.lots + tr(" 手", " lots"));
      if (num(it.risk) !== null && it.risk > 0) bits.push((it.amt / it.risk >= 0 ? "+" : "−") + Math.abs(it.amt / it.risk).toFixed(1) + "R");
      if (it.rule === true) bits.push(tr("按规则", "By the rule")); if (it.rule === false) bits.push(tr("没按规则", "Not by the rule")); if (it.note) bits.push(it.note);
      list.appendChild(h("div", { class: "rec" }, [h("span", { class: "dotk " + (it.amt > 0 ? "up" : it.amt < 0 ? "dn" : "z") }, [icon(it.amt < 0 ? "down" : "up", "sm")]),
        h("span", { class: "amt " + cls(it.amt) }, [signed(it.amt), it.plat ? h("span", { class: "tag", text: it.plat }) : null]), opsFor("items", it, tr("这一笔 ", "this trade ") + signed(it.amt)),
        bits.length ? h("span", { class: "meta", text: bits.join(" · ") }) : null]));
    });
    cw.forEach(function (it) {
      list.appendChild(h("div", { class: "rec cashrec" }, [h("span", { class: "dotk gd" }, [icon("wallet", "sm")]), h("span", { class: "amt", style: "color:var(--gold-lt)" }, [tr("提现 ", "Withdrew ") + plain(it.amt), it.plat ? h("span", { class: "tag", text: it.plat }) : null]), opsFor("cash", it, tr("这笔提现", "this withdrawal")),
        it.note ? h("span", { class: "meta", text: it.note }) : null]));
    });
  }

  // ---------- withdrawals ----------
  function renderCash() {
    var el = clear($("cashbody")), all = withdrawals().slice().sort(function (a, b) { return a.d < b.d ? 1 : a.d > b.d ? -1 : tOf(b) - tOf(a); }), tot = cashSum(all), y = TODAY.slice(0, 4), m = TODAY.slice(0, 7);
    $("cashtotal").textContent = all.length ? tr("合计 ", "Total ") + plain(tot) + " · " + all.length + tr(" 笔", all.length > 1 ? " withdrawals" : " withdrawal") : "";
    if (!all.length) { el.appendChild(h("p", { class: "note", text: tr("还没有提现记录。提了钱就点「记一笔」切到「提现」，或者在一句话记账里写「提现 200 exness」。这里会按平台加总，还会算出赚到的钱里有多少已经提出来了。", "No withdrawals yet. When you take money out, tap «Log a trade» and switch to «Withdrawal», or type «withdraw 200 exness» in the one-line box. This adds them up by platform and works out how much of your profit you have taken out.") })); return; }
    var inY = all.filter(function (x) { return x.d.slice(0, 4) === y; }), inM = all.filter(function (x) { return x.d.slice(0, 7) === m; });
    var ct = function (k, v) { return h("div", { class: "ct" }, [h("div", { class: "k", text: k }), h("div", { class: "v", text: v })]); };
    el.appendChild(h("div", { class: "cash-tiles" }, [ct(tr("全部提现", "All withdrawals"), plain(tot)), ct(y + tr(" 年", ""), inY.length ? plain(cashSum(inY)) : "—"), ct(tr("这个月", "This month"), inM.length ? plain(cashSum(inM)) : "—")]));
    var net = tstats(D.items).sum;
    el.appendChild(h("div", { class: "kept" }, net > 0
      ? (EN ? ["All your records net ", h("b", { text: plain(net) }), "; of that, ", h("b", { text: plain(tot) + " (" + pct(tot, net) + "%)" }), tot >= net ? " has been taken out: every dollar made is banked." : " has been taken out and banked."]
        : ["全部记录净赚 ", h("b", { text: plain(net) }), "，其中 ", h("b", { text: plain(tot) + "（" + pct(tot, net) + "%）" }), tot >= net ? " 已经提出来了：赚到的钱都落袋了。" : " 已经提出来，落袋为安。"])
      : [EN ? "All trades total " + plain(net) + "; withdrawals total " + plain(tot) + ". (If some results were never logged here, these two will not match.)" : "全部交易记录合计 " + plain(net) + "；提现合计 " + plain(tot) + "。（如果有些盈亏没记在这里，这两个数就对不上。）"]));
    var by = {};
    all.forEach(function (x) { var k = x.plat || tr("未填平台", "No platform"), o = by[k] || (by[k] = { sum: 0, n: 0, last: x.d }); o.sum = r2(o.sum + x.amt); o.n++; if (x.d > o.last) o.last = x.d; });
    var names = Object.keys(by).sort(function (a, b) { return by[b].sum - by[a].sum; }), top = by[names[0]].sum;
    var bars = h("div", { class: "pbars", role: "list", "aria-label": tr("按平台的提现合计", "Withdrawals by platform") });
    names.forEach(function (k) {
      var o = by[k];
      bars.appendChild(h("div", { class: "pb", role: "listitem", title: EN ? k + ": " + plain(o.sum) + ", " + o.n + " withdrawals, last on " + md(o.last) : k + "：" + plain(o.sum) + "，" + o.n + " 笔，最近一次 " + md(o.last) }, [h("span", { class: "nm", text: k }),
        h("span", { class: "tr" }, [h("i", { style: "width:" + Math.max(3, o.sum / top * 100).toFixed(1) + "%" })]),
        h("span", { class: "vv" }, [plain(o.sum), h("small", { text: EN ? o.n + " · last " + ms(o.last) : o.n + " 笔 · 最近 " + ms(o.last) })])]));
    });
    el.appendChild(bars);
    var shown = V.cashAll ? all : all.slice(0, 6), recs = h("div", { class: "recs" });
    shown.forEach(function (it) {
      recs.appendChild(h("div", { class: "rec cashrec" }, [h("span", { class: "dotk gd" }, [icon("wallet", "sm")]), h("span", { class: "amt", style: "color:var(--gold-lt)" }, [plain(it.amt), it.plat ? h("span", { class: "tag", text: it.plat }) : null]), opsFor("cash", it, tr("这笔提现", "this withdrawal")),
        h("span", { class: "meta", text: md(it.d) + " " + weekday(it.d) + (it.note ? " · " + it.note : "") })]));
    });
    el.appendChild(recs);
    if (all.length > 6) el.appendChild(h("button", { class: "btn sm ghost", type: "button", text: V.cashAll ? tr("只看最近 6 笔", "Show the latest 6 only") : EN ? "Show all " + all.length : "看全部 " + all.length + " 笔", onclick: function () { V.cashAll = !V.cashAll; renderCash(); } }));
  }

  // ---------- year ----------
  function renderYear() {
    $("ylabel").textContent = V.y + tr(" 年", ""); var el = clear($("months")), tot = 0, any = false;
    for (var m = 0; m < 12; m++) (function (m) {
      var pre = V.y + "-" + pad(m + 1), s = tstats(D.items.filter(function (x) { return x.d.indexOf(pre) === 0; })); tot += s.sum; if (s.n) any = true;
      el.appendChild(h("button", { type: "button", class: "mo" + (s.sum > 0 ? " pos" : s.sum < 0 ? " neg" : "") + (m === V.m ? " cur" : ""), "aria-label": (EN ? MON[m] : (m + 1) + " 月") + (s.n ? " " + signed(s.sum, 0) + tr("，", ", ") + s.n + tr(" 笔", " trades") : tr(" 没有记录", " nothing logged")), onclick: function () { V.m = m; renderAll(); } },
        [h("div", { class: "mn", text: EN ? MON[m] : (m + 1) + " 月" }), h("div", { class: "mv " + cls(s.sum), text: s.n ? short(s.sum) : "—" })]));
    })(m);
    var t = $("ytotal"); t.textContent = any ? tr("全年 ", "Year ") + signed(tot, 0) : tr("这一年还没有记录", "Nothing logged this year"); t.className = "end note " + (any ? cls(tot) : "");
  }

  // ---------- with the rules and without ----------
  function renderCmp() {
    var el = clear($("cmp")), g = { yes: [], no: [], na: [] };
    D.items.forEach(function (x) { (x.rule === true ? g.yes : x.rule === false ? g.no : g.na).push(x); });
    var row = function (name, list) { var s = tstats(list); el.appendChild(h("div", { class: "row" }, [h("span", { text: EN ? name + ": " + s.n + pl(s.n, " trade", " trades") + (s.n ? ", " + s.w + " won " + s.l + " lost" : "") : name + "：" + s.n + " 笔" + (s.n ? "，" + s.w + " 赚 " + s.l + " 亏" : "") }), h("b", { class: cls(s.sum), text: s.n ? signed(s.sum, 0) : "—" })])); };
    if (!g.yes.length && !g.no.length) { el.appendChild(h("p", { class: "note", text: tr("记一笔的时候，在「更多」里选一下这笔是不是按 4H 报告的规则做的。攒上几十笔以后，这里会告诉你：守规则的单子和凭感觉的单子，哪一种真的在赚钱。", "When you log a trade, mark under «More» whether it followed the gold page's rule. After a few dozen trades this shows which actually makes money: trades by the rule or trades by feel.") })); return; }
    row(tr("按规则做的", "By the rule"), g.yes); row(tr("没按规则做的", "Not by the rule"), g.no); if (g.na.length) row(tr("没有标注的", "Not marked"), g.na);
    el.appendChild(h("p", { class: "note", text: tr("笔数少的时候差别说明不了什么，至少看二三十笔。", "With few trades the difference means little; look again after 20–30.") }));
  }

  var CURS = ["$", "RM", "S$", "US$", "¥", "€"];
  // ---------- remarks ----------
  // One remark per day, for the day selected in the calendar (today when the page opens). Typing saves it a moment
  // later; an emptied remark is deleted. The text box is refilled only when the day changes, so typing is never
  // interrupted by a redraw.
  var noteT = null;
  function renderNotes() {
    var ta = $("n-text"), d = V.sel;
    if (V.noteDay && V.noteDay !== d && noteT) { clearTimeout(noteT); noteT = null; saveNote(); }    // typing not saved yet belongs to the day it was typed for
    var n = IDX.note[d];
    $("n-date").textContent = md(d) + " " + weekday(d) + (d === TODAY ? tr(" · 今天", " · today") : "");
    if (V.noteDay !== d || document.activeElement !== ta) { ta.value = n ? n.text : ""; V.noteDay = d; }
    $("n-count").textContent = ta.value.length ? ta.value.length + " / 2000" : "";
    if (!V.noteSaved) noteState();
    renderNoteList();
  }
  function noteState() {       // where this day's remark is kept: this device only, waiting to upload, or the cloud too
    var n = IDX.note[V.sel], w = Cloud.notesWhere(), st = $("n-state");
    st.className = "note" + (n && !n.dirty && w === "cloud" ? " ok" : "");
    st.textContent = !n ? "" : w === "local" ? tr("已存在本机", "Saved on this device") : w === "missing" ? tr("已存在本机 · 云端还没有备注表", "Saved on this device · no remarks table in the cloud yet")
      : n.dirty ? tr("已存在本机 · 正在上传云端…", "Saved on this device · uploading…") : tr("✓ 已存在本机和云端", "✓ Saved here and in the cloud");
  }
  function renderNoteList() {
    var el = clear($("n-list")), list = D.notes.filter(function (x) { return x.d !== V.sel; }).sort(function (a, b) { return a.d < b.d ? 1 : -1; }).slice(0, 5);
    if (!list.length) return;
    el.appendChild(h("div", { class: "k", text: tr("最近的备注", "Recent remarks") }));
    list.forEach(function (x) {
      el.appendChild(h("button", { type: "button", class: "n-item", title: x.text.slice(0, 300), onclick: function () { showDay(x.d); if (!V.edit) setDate(x.d); renderAll(); $("notes").scrollIntoView({ behavior: "smooth", block: "nearest" }); } }, [
        h("b", { text: ms(x.d) + " " + weekday(x.d) }), h("span", { text: x.text.replace(/\s+/g, " ") })]));
    });
  }
  function saveNote() {
    noteT = null;
    var d = V.noteDay || V.sel, text = $("n-text").value.replace(/\s+$/, ""), old = IDX.note[d];
    if (!text.trim()) { if (old) drop("notes", d); }
    else if (!old || old.text !== text) put("notes", touch({ id: d, d: d, text: text.slice(0, 2000) }));
    else return;
    if (!save()) return;
    index(); renderCal(); renderNoteList();
    V.noteSaved = true; var st = $("n-state"); st.className = "note ok"; st.textContent = text.trim() ? tr("已保存 ", "Saved ") + hm(Date.now()) : tr("已删除这一天的备注", "Remark deleted");
    setTimeout(function () { V.noteSaved = false; noteState(); }, 2500);
  }

  function renderSettings() {
    var cs = clear($("curs"));
    CURS.forEach(function (c) { cs.appendChild(h("button", { type: "button", class: "chip", "aria-pressed": String(D.cur === c), text: c, onclick: function () { D.cur = c; $("s-cur").value = ""; settingsChanged(); save(); renderAll(); } })); });
    if (document.activeElement !== $("s-cur")) $("s-cur").value = CURS.indexOf(D.cur) < 0 ? D.cur : "";
    if (document.activeElement !== $("s-start")) $("s-start").value = num(D.start) === null ? "" : D.start;
  }
  function renderAll() {
    TODAY = dOf(Date.now()); index();
    Array.prototype.forEach.call(document.querySelectorAll(".cur"), function (e) { e.textContent = D.cur; });
    if (!V.edit && V.date > TODAY) V.date = TODAY;
    setDate(V.date); renderGoal(); renderNotes(); renderToday(); paintPlats(); saveLabel(); renderNl(); renderKpis(); renderAi(); renderCurve(); renderDaily(); renderBd(); renderCal(); renderDay(); renderCash(); renderYear(); renderCmp(); renderSettings(); Cloud.paint();
    if ($("ask-ctx").open) $("ask-pre").textContent = claudeText();
  }

  // ---------- cloud (Supabase) ----------
  // Auth and data go straight to Supabase's REST endpoints: no library. The session (access and refresh token) is kept
  // in this browser, so the page stays signed in and refreshes the token itself. A sync sends deletions, then every
  // record marked dirty (upsert by id, so sending one twice is harmless), then reads the whole cloud copy back: a
  // record changed here and not sent yet wins, everything else follows the cloud, and a record the cloud no longer
  // has was deleted on another device.
  var Cloud = (function () {
    var NOTABLE = tr("云端还没有建表。", "The cloud tables have not been created yet.");
    var TABLE = { items: "pnl_trades", cash: "pnl_cash", goals: "pnl_goals", notes: "pnl_notes" };
    var COLS = { items: ["d", "amt", "sym", "side", "lots", "risk", "rule", "plat", "note", "t"], cash: ["d", "kind", "amt", "plat", "note", "t"], goals: ["name", "target", "start_d", "at", "done_d", "done_at", "reached"], notes: ["d", "text"] };
    var NUMS = { amt: 1, lots: 1, risk: 1, t: 1, target: 1, at: 1, done_at: 1, reached: 1, u: 1, start: 1 };
    var st = { busy: false, again: false, err: "", missing: false, notesMissing: false, recovery: false, note: "", formErr: "", resend: "", sql: "", mode: null, timer: null, auth: null, retried: false };
    // the remarks table came after the others (supabase/journal.sql, run again): until it exists, remarks stay here
    function tablesNow() { return Object.keys(TABLE).filter(function (cn) { return cn !== "notes" || !st.notesMissing; }); }
    function isMissing(e) { var m = String(e && e.message || ""), c = String(e && e.code || ""); return c === "PGRST205" || c === "42P01" || /schema cache|does not exist/i.test(m); }
    function ref() { var m = /^https:\/\/([a-z0-9]+)\.supabase\.co/.exec(CFG.url || ""); return m ? m[1] : ""; }
    function key() { return CFG.key || ls(CKEY) || ""; }
    function conf() { var k = key(); return CFG.url && k ? { url: CFG.url.replace(/\/+$/, ""), key: k } : null; }
    function sess() { try { var s = JSON.parse(localStorage.getItem(AUTH)); return s && s.refresh_token && s.user && s.user.id ? s : null; } catch (e) { return null; } }
    function setSess(s) { try { if (s) localStorage.setItem(AUTH, JSON.stringify(s)); else localStorage.removeItem(AUTH); } catch (e) {} }
    function keep(r, old) {
      var u = r.user || (old && old.user) || {};
      return { access_token: r.access_token, refresh_token: r.refresh_token, expires_at: num(r.expires_at) || Math.floor(Date.now() / 1000) + (num(r.expires_in) || 3600), user: { id: u.id, email: u.email } };
    }
    function call(path, o) {
      var c = conf(); o = o || {};
      var hd = { apikey: c.key, "Content-Type": "application/json" };
      if (o.token) hd.Authorization = "Bearer " + o.token;
      if (o.prefer) hd.Prefer = o.prefer;
      var body = o.body === undefined ? undefined : JSON.stringify(o.body), method = o.method || "GET";
      // keepalive lets an upload finish after the tab closes (bodies up to 64 KB); a browser that refuses it gets the plain request
      var go = function (ka) { return fetch(c.url + path, { method: method, headers: hd, body: body, cache: "no-store", keepalive: ka }); };
      var ka = method !== "GET" && document.visibilityState === "hidden" && (!body || body.length < 60000);
      return (ka ? go(true).catch(function () { return go(false); }) : go(false)).then(function (r) {
        return r.text().then(function (t) {
          var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {}
          if (!r.ok) { var e = new Error((j && (j.msg || j.message || j.error_description || j.error)) || "HTTP " + r.status); e.status = r.status; e.code = j && (j.code || j.error_code || j.error); throw e; }
          return j;
        });
      });
    }
    function token(force) {
      var s = sess(); if (!s) { var e = new Error(tr("未登录", "Not signed in")); e.status = 401; return Promise.reject(e); }
      if (!force && s.expires_at - 90 > Date.now() / 1000) return Promise.resolve(s.access_token);
      return call("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: s.refresh_token } }).then(function (r) { var n = keep(r, s); setSess(n); return n.access_token; }, function (e) {
        if (e.status === 400 || e.status === 401 || e.status === 403) { setSess(null); st.note = ""; st.formErr = tr("登录已过期，请重新登录（记录还在这台设备上）。", "Your sign-in has expired: sign in again (your records are still on this device)."); }
        throw e;
      });
    }
    function pending() { var n = D.gone.filter(function (g) { return g.c !== "notes" || !st.notesMissing; }).length + (D.sdirty ? 1 : 0); tablesNow().forEach(function (c) { D[c].forEach(function (x) { if (x.dirty) n++; }); }); return n; }
    function toRow(c, x, uid) {
      var o = { user_id: uid, id: x.id, u: x.u };
      COLS[c].forEach(function (k) { var v = x[k]; o[k] = v === "" || v === undefined ? null : v; });
      return o;
    }
    function fromRow(c, r) {
      var o = { id: r.id, u: +r.u || Date.now() };
      COLS[c].forEach(function (k) { var v = r[k]; o[k] = v === null || v === undefined ? (NUMS[k] ? null : k === "rule" ? null : "") : NUMS[k] ? +v : v; });
      var x = CLEAN[c](o); if (x) delete x.dirty;
      return x;
    }
    function chunks(a, n) { var out = []; for (var i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; }
    function seq(fns) { return fns.reduce(function (p, f) { return p.then(f); }, Promise.resolve()); }
    function pullAll(t, table, order) {
      var out = [], page = 1000;
      function next(off) { return call("/rest/v1/" + table + "?select=*" + (order ? "&order=" + order : "") + "&limit=" + page + "&offset=" + off, { token: t }).then(function (rows) { rows = rows || []; out = out.concat(rows); return rows.length === page ? next(off + page) : out; }); }
      return next(0);
    }
    function quote(id) { return '"' + String(id).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"'; }
    function words(e) {
      var m = String(e && e.message || ""), code = String(e && e.code || "");
      if (code === "PGRST205" || code === "42P01" || /schema cache|does not exist/i.test(m)) return NOTABLE;
      if (e instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(m)) return tr("连不上 Supabase：检查网络。免费项目一周没人用会被暂停，要去 Supabase 后台点 Restore。", "Cannot reach Supabase: check the connection. A free project is paused after a week without use; open the Supabase dashboard and click Restore.");
      if (e && e.status === 401) return tr("登录失效了，请重新登录。", "Your sign-in is no longer valid: sign in again.");
      return tr("同步没成功：", "Sync failed: ") + m;
    }
    function sync() {
      var c = conf(), s = sess();
      if (!c || !s) return Promise.resolve(false);
      if (st.busy) { st.again = true; return Promise.resolve(false); }
      st.busy = true; st.err = ""; paint();
      var uid = s.user.id, tk, sentGone, sent = {}, tabs;
      return token().then(function (t) {
        tk = t;
        // is the remarks table there? (one small read; until it is, remarks are left out of the sync)
        return call("/rest/v1/pnl_notes?select=id&limit=1", { token: tk }).then(function () { st.notesMissing = false; }, function (e) { if (isMissing(e)) st.notesMissing = true; else throw e; });
      }).then(function () {
        tabs = tablesNow(); sentGone = D.gone.filter(function (g) { return tabs.indexOf(g.c) >= 0; });
        var jobs = [];
        tabs.forEach(function (cn) {
          var ids = sentGone.filter(function (g) { return g.c === cn; }).map(function (g) { return g.id; });
          chunks(ids, 60).forEach(function (part) { jobs.push(function () { return call("/rest/v1/" + TABLE[cn] + "?id=in.(" + encodeURIComponent(part.map(quote).join(",")) + ")", { method: "DELETE", token: tk, prefer: "return=minimal" }); }); });
          var recs = D[cn].filter(function (x) { return x.dirty || !x.u; });
          recs.forEach(function (x) { if (!x.u) x.u = Date.now(); });
          sent[cn] = {}; recs.forEach(function (x) { sent[cn][x.id] = x.u; });
          chunks(recs, 400).forEach(function (part) { jobs.push(function () { return call("/rest/v1/" + TABLE[cn] + "?on_conflict=user_id,id", { method: "POST", token: tk, prefer: "resolution=merge-duplicates,return=minimal", body: part.map(function (x) { return toRow(cn, x, uid); }) }); }); });
        });
        var su = D.sdirty ? D.su || Date.now() : null;
        if (su) jobs.push(function () { return call("/rest/v1/pnl_settings?on_conflict=user_id", { method: "POST", token: tk, prefer: "resolution=merge-duplicates,return=minimal", body: [{ user_id: uid, cur: D.cur, start: num(D.start), plats: D.plats, u: su }] }); });
        return seq(jobs).then(function () {
          // sent: no longer dirty, unless changed again while the requests were out
          D.gone = D.gone.filter(function (g) { return !sentGone.some(function (s0) { return s0.c === g.c && s0.id === g.id; }); });
          tabs.forEach(function (cn) { D[cn].forEach(function (x) { if (sent[cn][x.id] === x.u) delete x.dirty; }); });
          if (su && D.su === su) D.sdirty = false;
          return Promise.all(tabs.map(function (cn) { return pullAll(tk, TABLE[cn], "id.asc"); }).concat([pullAll(tk, "pnl_settings")]));
        });
      }).then(function (got) {
        var gone = {}; D.gone.forEach(function (g) { gone[g.c + ":" + g.id] = 1; });
        tabs.forEach(function (cn, i) {
          var local = {}, out = [];
          D[cn].forEach(function (x) { local[x.id] = x; });
          got[i].forEach(function (r) {
            if (gone[cn + ":" + r.id]) return;
            var l = local[r.id]; delete local[r.id];
            if (l && l.dirty) { out.push(l); return; }
            var x = fromRow(cn, r); if (x) out.push(x);
          });
          Object.keys(local).forEach(function (id) { if (local[id].dirty) out.push(local[id]); });    // the rest were deleted elsewhere
          D[cn] = out;
        });
        var row = got[tabs.length][0];
        if (row && !D.sdirty) { D.cur = typeof row.cur === "string" && row.cur ? row.cur : "$"; D.start = row.start === null || row.start === undefined ? null : +row.start; D.plats = Array.isArray(row.plats) ? row.plats.filter(function (p) { return typeof p === "string"; }) : []; D.su = +row.u || null; }
        D.owner = uid; D.synced = Date.now(); st.missing = false; st.retried = false;
        save(true); st.busy = false; renderAll();
        if (st.again) { st.again = false; sync(); }
        return true;
      }).catch(function (e) {
        st.busy = false;
        if (e && e.status === 401 && !st.retried && sess()) { st.retried = true; return token(true).then(function () { return sync(); }, function () { st.err = words(e); paint(); return false; }); }
        st.err = words(e); st.missing = st.err === NOTABLE; save(true); paint();
        return false;
      });
    }
    // leaving the page (tab hidden, app switched, tab closed): send what is waiting now, not 1.2 s later
    function flush() { if (conf() && sess() && pending()) { clearTimeout(st.timer); sync(); } }
    function notesWhere() { return !conf() || !sess() ? "local" : st.notesMissing ? "missing" : "cloud"; }
    function soon() { if (!conf() || !sess()) { paint(); return; } clearTimeout(st.timer); st.timer = setTimeout(sync, 1200); paint(); }

    // --- signing in ---
    function adopt(r) {
      var s = keep(r); if (!s.user.id || !s.refresh_token) { st.formErr = tr("登录没成功：Supabase 没有返回账号。", "Sign-in failed: Supabase returned no account."); paint(); return; }
      var mine = D.items.length + D.cash.length + D.goals.length + D.notes.length;
      if (D.owner && D.owner !== s.user.id && mine) {
        if (window.confirm(EN ? "The records on this device belong to another account.\n\nOK: merge them into " + (s.user.email || "this account") + ".\nCancel: clear this device's copy and use only this account's records in the cloud." : "这台设备上的记录属于另一个账号。\n\n确定：把这些记录也并进 " + (s.user.email || "这个账号") + "。\n取消：清掉本机这份副本，只用这个账号在云端的记录。")) {
          Object.keys(TABLE).forEach(function (c) { D[c].forEach(function (x) { x.dirty = true; }); }); D.sdirty = true;
        } else { D.items = []; D.cash = []; D.goals = []; D.notes = []; D.gone = []; D.sdirty = false; D.su = null; }
      }
      setSess(s); if (s.user.email) ls(MAIL, s.user.email);
      st.err = ""; st.formErr = ""; st.note = ""; st.resend = ""; st.missing = false; st.mode = null;
      save(true); renderAll(); sync();
    }
    function authWords(e) {
      var m = String(e && e.message || "") + " " + String(e && e.code || "");
      if (/invalid login credentials|invalid_credentials/i.test(m)) return tr("邮箱或密码不对。", "Wrong e-mail or password.");
      if (/email not confirmed|email_not_confirmed/i.test(m)) return tr("这个邮箱还没确认：去邮箱点 Supabase 发来的确认链接，再回来点「登录 / 注册」。", "This e-mail is not confirmed yet: click the link in the e-mail from Supabase, then come back and press «Sign in / Sign up».");
      if (/already registered|user_already_exists/i.test(m)) return tr("这个邮箱已经注册过：直接登录。", "This e-mail is already registered: just sign in.");
      if (/signups? not allowed|signup_disabled/i.test(m)) return tr("这个项目关掉了新用户注册：用已有的账号登录。", "This project has sign-ups turned off: sign in with an existing account.");
      if (/weak_password|password should|at least/i.test(m)) return tr("密码太短或太简单：至少 6 位，最好字母加数字。", "Password too short or too simple: at least 6 characters, ideally letters and numbers.");
      if ((e && e.status === 429) || /rate limit/i.test(m)) return tr("太频繁了（Supabase 限制发信次数），过一会儿再试。", "Too many tries (Supabase limits how many e-mails it sends); try again in a while.");
      if (e instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(m)) return tr("连不上 Supabase：检查网络。免费项目一周没人用会被暂停，要去 Supabase 后台点 Restore。", "Cannot reach Supabase: check the connection. A free project is paused after a week without use; open the Supabase dashboard and click Restore.");
      return tr("没成功：", "Did not work: ") + m.trim();
    }
    function here() { return location.origin + location.pathname; }
    // "登录 / 注册": sign in; when Supabase says the e-mail and password match no account, create the account with them.
    function auth(kind) {
      var email = (($("cl-email") || {}).value || "").trim(), pw = ($("cl-pw") || {}).value || "";
      st.formErr = ""; st.note = ""; st.resend = ""; st.sql = "";
      if (!/^\S+@\S+\.\S+$/.test(email)) { st.formErr = tr("请填邮箱。", "Enter your e-mail."); paintMsg(); return; }
      if (kind !== "recover" && pw.length < 6) { st.formErr = tr("密码至少 6 位。", "The password needs at least 6 characters."); paintMsg(); return; }
      ls(MAIL, email);
      var btns = document.querySelectorAll("#cl-body button"); Array.prototype.forEach.call(btns, function (b) { b.disabled = true; });
      var red = encodeURIComponent(here()), signIn = function () { return call("/auth/v1/token?grant_type=password", { method: "POST", body: { email: email, password: pw } }); };
      var signUp = function () { return call("/auth/v1/signup?redirect_to=" + red, { method: "POST", body: { email: email, password: pw } }).then(function (r) { return { up: r }; }); };
      var p = kind === "recover" ? call("/auth/v1/recover?redirect_to=" + red, { method: "POST", body: { email: email } }).then(function () { return { recover: true }; })
        : signIn().catch(function (e) { if (/invalid login credentials|invalid_credentials/i.test(String(e.message) + " " + String(e.code)) && !(st.auth && st.auth.disable_signup)) return signUp(); throw e; });
      p.then(function (r) {
        Array.prototype.forEach.call(btns, function (b) { b.disabled = false; });
        if (r.recover) { st.note = EN ? "A password-reset e-mail has gone to " + email + ": its link brings you back to this page to set a new password." : "重设密码的邮件已发到 " + email + "：点邮件里的链接，会回到这一页让你设新密码。"; paintMsg(); return; }
        if (r.access_token) { adopt(r); toast(tr("已登录", "Signed in")); return; }
        var u = r.up && (r.up.user || r.up);
        if (r.up && r.up.access_token) { adopt(r.up); toast(tr("新账号已建好，已登录", "New account created and signed in")); return; }
        if (u && Array.isArray(u.identities) && !u.identities.length) { st.formErr = tr("这个邮箱已经注册过，但密码不对。忘了密码就点「忘记密码」。", "This e-mail is registered, but the password is wrong. If you forgot it, press «Forgot password»."); paintMsg(); return; }
        st.note = EN ? "New e-mail: the account is made and a confirmation e-mail has gone to " + email + ". Its link brings you back here signed in (if it opens a blank or localhost page, that is fine: come back and press «Sign in / Sign up» again)." : "这是新邮箱：账号已经建好，确认邮件已发到 " + email + "。点邮件里的链接就会回到这一页并自动登录（打开的如果是空白页或 localhost 也没关系，回来再点一次「登录 / 注册」）。";
        st.resend = email; st.sql = confirmSql(email); paintMsg();
      }, function (e) {
        Array.prototype.forEach.call(btns, function (b) { b.disabled = false; });
        st.formErr = authWords(e); if (/email not confirmed|email_not_confirmed/i.test(String(e.message) + " " + String(e.code))) { st.resend = email; st.sql = confirmSql(email); } paintMsg();
      });
    }
    function confirmSql(email) { return "update auth.users set email_confirmed_at = now() where email = '" + email.replace(/'/g, "''") + "' and email_confirmed_at is null;"; }
    function copy(text, done) { try { navigator.clipboard.writeText(text).then(function () { toast(done); }, function () { toast(tr("复制失败：长按选中再复制", "Copy failed: press and hold to select, then copy")); }); } catch (e) { toast(tr("复制失败：长按选中再复制", "Copy failed: press and hold to select, then copy")); } }
    function resend() {
      var email = st.resend; if (!email) return;
      call("/auth/v1/resend?redirect_to=" + encodeURIComponent(here()), { method: "POST", body: { type: "signup", email: email } }).then(function () { st.formErr = ""; st.note = EN ? "The confirmation e-mail was sent again to " + email + " (check the spam folder too)." : "确认邮件又发了一次，到 " + email + " 的收件箱（也看看垃圾邮件）。"; paintMsg(); }, function (e) { st.formErr = authWords(e); paintMsg(); });
    }
    function signOut() {
      var s = sess(); if (s) call("/auth/v1/logout", { method: "POST", token: s.access_token }).catch(function () {});
      setSess(null); st.err = ""; st.missing = false; st.recovery = false; st.mode = null; paint(); toast(tr("已退出：记录还留在这台设备上", "Signed out: your records stay on this device"));
    }
    function setPassword() {
      var pw = ($("cl-newpw") || {}).value || "";
      if (pw.length < 6) { st.formErr = tr("新密码至少 6 位。", "The new password needs at least 6 characters."); paintMsg(); return; }
      token().then(function (t) { return call("/auth/v1/user", { method: "PUT", token: t, body: { password: pw } }); }).then(function () { st.recovery = false; st.formErr = ""; st.mode = null; paint(); toast(tr("新密码已设好", "New password set")); }, function (e) { st.formErr = authWords(e); paintMsg(); });
    }
    function jwtRole(k) { var p = k.split("."); if (p.length !== 3) return null; try { return JSON.parse(atob(p[1].replace(/-/g, "+").replace(/_/g, "/"))).role || null; } catch (e) { return null; } }
    function connect() {
      var k = (($("cl-key") || {}).value || "").trim(); st.formErr = "";
      if (/^sb_secret_/.test(k) || jwtRole(k) === "service_role") { st.formErr = tr("这是管理员用的 secret key，不能放进网页：请复制 Publishable key（sb_publishable_ 开头）。也建议到 Supabase 里把这把 secret key 换掉（Rotate）。", "That is the admin secret key and must never go in a web page: copy the Publishable key (starts with sb_publishable_). It is also wise to rotate that secret key in Supabase."); paintMsg(); return; }
      if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(k) && jwtRole(k) !== "anon") { st.formErr = tr("看起来不是 Publishable key：应该以 sb_publishable_ 开头（旧项目叫 anon public key，一长串以 eyJ 开头）。", "That does not look like a Publishable key: it starts with sb_publishable_ (older projects call it the anon public key, a long string starting eyJ)."); paintMsg(); return; }
      fetch(CFG.url.replace(/\/+$/, "") + "/auth/v1/settings", { headers: { apikey: k } }).then(function (r) {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      }).then(function (j) { ls(CKEY, k); st.auth = j; st.mode = null; paint(); toast(tr("已连上 Supabase：现在登录 / 注册", "Connected to Supabase: now sign in or sign up")); }, function () { st.formErr = tr("Supabase 不认这个 key：再复制一次，注意不要多复制空格。", "Supabase does not accept this key: copy it again, without extra spaces."); paintMsg(); });
    }
    function authSettings() {       // whether sign-up is open and whether it needs an e-mail confirmation
      var c = conf(); if (!c || st.auth) return;
      st.auth = {};
      fetch(c.url + "/auth/v1/settings", { headers: { apikey: c.key } }).then(function (r) { return r.ok ? r.json() : {}; }).then(function (j) { st.auth = j || {}; st.mode = null; paint(); }).catch(function () {});
    }
    // The pairing link: this page with the project's publishable key after "#k=" (the key is made for web pages;
    // the account still needs its e-mail and password). A QR of it is drawn with qrcode-generator, loaded only here.
    function pairLink() { return here() + (CFG.key ? "" : "#k=" + encodeURIComponent(key())); }
    var qrLib = null;
    function drawQr() {
      var box = $("cl-qr"); if (!box || phone()) return;
      if (!qrLib) qrLib = new Promise(function (ok, no) { var sc = document.createElement("script"); sc.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js"; sc.onload = ok; sc.onerror = no; document.head.appendChild(sc); });
      qrLib.then(function () {
        var qr = window.qrcode(0, "M"); qr.addData(pairLink()); qr.make();
        var n = qr.getModuleCount(), svg = sv("svg", { viewBox: "0 0 " + n + " " + n, "shape-rendering": "crispEdges" }), d = "";
        for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (qr.isDark(r, c)) d += "M" + c + " " + r + "h1v1h-1z";
        sv("path", { d: d, fill: "#0B0B10" }, svg); clear(box).appendChild(svg);
      }, function () { box.hidden = true; });
    }
    function okKey(k) { return !/^sb_secret_/.test(k) && jwtRole(k) !== "service_role" && (/^sb_publishable_[A-Za-z0-9_-]+$/.test(k) || jwtRole(k) === "anon"); }
    // Links in Supabase's e-mails come back here with the session (or an error) after "#"; a pairing link brings the key.
    function fromHash() {
      var hs = location.hash.slice(1); if (!/(^|&)(access_token|error_description|k)=/.test(hs)) return;
      var q = {}; hs.split("&").forEach(function (p) { var i = p.indexOf("="); if (i > 0) q[decodeURIComponent(p.slice(0, i))] = decodeURIComponent(p.slice(i + 1).replace(/\+/g, " ")); });
      try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
      if (q.k && !q.access_token) {
        if (!CFG.key && okKey(q.k.trim())) { ls(CKEY, q.k.trim()); st.auth = null; st.note = tr("这台设备已经连上云端：用电脑上同一个邮箱和密码登录一次，就能看到那边记的每一笔。", "This device is connected to the cloud: sign in once with the same e-mail and password as on your computer to see everything logged there."); setTimeout(function () { toast(tr("已连上云端：登录一次就同步", "Connected to the cloud: sign in once to sync")); var c = $("cloud"); if (c) c.scrollIntoView({ behavior: "smooth", block: "start" }); }, 300); }
        return;
      }
      if (q.error_description) { st.formErr = EN ? "The e-mail link did not work: " + q.error_description + " (if it expired, send it again)" : "邮件里的链接没用上：" + q.error_description + "（过期了就再发一次）"; return; }
      if (!conf()) { st.formErr = tr("先连上 Supabase，再点一次邮件里的链接。", "Connect to Supabase first, then click the e-mail link again."); return; }
      call("/auth/v1/user", { token: q.access_token }).then(function (user) {
        if (q.type === "recovery") st.recovery = true;
        adopt({ access_token: q.access_token, refresh_token: q.refresh_token, expires_at: +q.expires_at || null, expires_in: +q.expires_in || 3600, user: user });
        toast(q.type === "recovery" ? tr("已登录：现在设一个新密码", "Signed in: now set a new password") : tr("邮箱已确认，已登录", "E-mail confirmed, signed in"));
      }, function (e) { st.formErr = authWords(e); paint(); });
    }

    // --- the card ---
    function link(href, text) { return h("a", { href: href, target: "_blank", rel: "noopener", text: text }); }
    function sqlLinks() { return [link("https://supabase.com/dashboard/project/" + ref() + "/sql/new", "SQL Editor"), tr("，把 ", ", paste in the whole of "), link("https://github.com/YapSeng98/trading_pages/blob/main/supabase/journal.sql", "supabase/journal.sql"), tr(" 整段贴进去，点 Run（只做一次）", " and click Run (once only)")]; }
    function state() {
      var c = conf(), s = sess(), n = pending();
      if (!c) return { k: "", t: tr("已保存在本机", "Saved on this device") };
      if (!s) return { k: "", t: tr("本机已保存 · 云端未登录", "Saved on this device · cloud not signed in") };
      if (st.busy) return { k: "busy", t: tr("同步中…", "Syncing…") };
      if (st.err) return { k: "err", t: st.missing ? tr("云端未建表", "No cloud tables") : tr("同步没成功", "Sync failed") };
      if (n) return { k: "busy", t: n + tr(" 条待上传", " to upload") };
      return { k: "ok", t: tr("已同步到云端", "Synced to the cloud") + (D.synced ? " " + hm(D.synced) : "") };
    }
    function paintMsg() {
      var m = $("cl-msg"); if (!m) return; clear(m);
      if (st.formErr) m.appendChild(h("div", { class: "warn", role: "alert", text: st.formErr }));
      if (st.note) m.appendChild(h("div", { class: "okmsg", text: st.note }));
      if (st.resend && !sess()) m.appendChild(h("div", { class: "acts" }, [h("button", { class: "btn sm", type: "button", text: tr("重发确认邮件", "Send the confirmation again"), onclick: resend })]));
      if (st.sql && !sess()) m.appendChild(h("div", { class: "sqlfix" }, [h("p", { class: "note" }, [tr("收不到确认邮件？Supabase 自带的发信只发给项目成员的邮箱，而且每小时只有几封。可以直接在 ", "No confirmation e-mail? Supabase's built-in mailer only sends to the project's members, a few an hour. You can confirm this e-mail yourself: run the line below in the "), link("https://supabase.com/dashboard/project/" + ref() + "/sql/new", "SQL Editor"), tr(" 运行下面这一行确认这个邮箱，然后回来点「登录 / 注册」：", ", then come back and press «Sign in / Sign up»:")]),
        h("pre", { text: st.sql }), h("button", { class: "btn sm", type: "button", onclick: function () { copy(st.sql, tr("已复制：到 SQL Editor 粘贴，点 Run", "Copied: paste it in the SQL Editor and click Run")); } }, [icon("copy", "sm"), tr("复制这一行", "Copy this line")])]));
      if (st.err && sess()) m.appendChild(h("div", { class: "warn" }, st.missing ? [tr("云端还没有建表：打开 Supabase 的 ", "The cloud tables are not there yet: open Supabase's ")].concat(sqlLinks(), [tr("，再点「立即同步」。", ", then press «Sync now».")]) : [st.err]));
      if (st.notesMissing && sess() && !st.err) m.appendChild(h("div", { class: "okmsg" }, [tr("备注先存在这台设备上：云端还没有备注表。打开 Supabase 的 ", "Remarks are kept on this device for now: the cloud has no remarks table yet. Open Supabase's ")].concat(sqlLinks(), [tr("（交易记录不受影响），再点「立即同步」，备注就会上云端。", " (your trades are not affected), then press «Sync now» and the remarks go up.")])));
    }
    function flow(sx, c, s) {
      var n = D.items.length + D.cash.length;
      $("fl-a-t").textContent = tr("自动保存 · ", "Auto-saved · ") + n + tr(" 条", "");
      var b = $("fl-b"), cl = !c || !s ? "" : sx.k === "ok" ? "on" : sx.k === "err" ? "err" : "busy";
      b.className = "node " + cl;
      $("fl-b-t").textContent = !c ? tr("未连接", "Not connected") : !s ? tr(tr("未登录", "Not signed in"), "Not signed in") : st.busy ? tr(tr("同步中…", "Syncing…"), "Syncing…") : st.err ? (st.missing ? tr("未建表", "No tables") : tr("没成功", "Failed")) : pending() ? pending() + tr(" 条待传", " to upload") : D.synced ? tr("已同步 ", "Synced ") + hm(D.synced) : tr(tr("已登录", "Signed in"), "Signed in");
      $("fl-l1").className = "link" + (cl === "on" || cl === "busy" ? " on" : "");
      $("fl-c").className = "node" + (s && cl === "on" ? " on" : "");
      $("fl-c-t").textContent = s ? tr("登录同一个账号即同步", "Same account = same records") : tr("登录同一个账号就能同步", "Sign in with one account to sync");
      $("fl-l2").className = "link" + (s && cl === "on" ? " on" : "");
      var step = !c ? 1 : !s ? 2 : 3;
      Array.prototype.forEach.call($("cl-steps").children, function (li, k) {
        var no = k + 1, done = no < step || (no === 3 && cl === "on"), i = li.firstChild;
        li.className = done ? "done" : no === step ? "now" : "";
        clear(i); if (done) i.appendChild(icon("check")); else i.textContent = String(no);
      });
    }
    function paint() {
      var c = conf(), s = sess(), sx = state(), pill = $("syncpill");
      pill.className = "sync " + sx.k; pill.textContent = sx.t;
      var cs = $("cl-state"); cs.className = "end pill " + sx.k; cs.textContent = sx.t;
      flow(sx, c, s);
      var mode = !c ? "key" : !s ? "login" : st.recovery ? "recovery" : "acct", body = $("cl-body");
      if (mode !== st.mode) {
        st.mode = mode; clear(body);
        if (mode === "key") {
          body.appendChild(h("p", { class: "note", text: tr("记录已经自动存在这台设备上，不连云端也不会丢。连上你的 Supabase 项目以后，手机和电脑看到的是同一份，换设备、清浏览器也不怕。准备一次就好：", "Your records are saved on this device automatically and stay there without the cloud. Connect your Supabase project and your phone and computer see the same records, safe from a new device or a cleared browser. Set up once:") }));
          body.appendChild(h("ol", { class: "steps" }, [
            h("li", {}, [tr("打开 Supabase 的 ", "Open Supabase's ")].concat(sqlLinks(), [tr("。", ".")])),
            h("li", {}, [tr("打开 ", "Open "), link("https://supabase.com/dashboard/project/" + ref() + "/settings/api-keys", "Project Settings → API Keys"), tr("，复制 ", ", copy the "), h("b", { text: "Publishable key" }), tr("（sb_publishable_ 开头；旧项目叫 anon public），贴在下面。", " (starts with sb_publishable_; older projects call it anon public) and paste it below.")])]));
          body.appendChild(h("div", { class: "fld" }, [icon("key", "sm"), h("input", { id: "cl-key", type: "text", autocomplete: "off", spellcheck: "false", placeholder: "sb_publishable_…", "aria-label": "Supabase publishable key" })]));
          body.appendChild(h("button", { class: "btn pri wide", type: "button", onclick: connect }, [tr("连接", "Connect"), icon("arrow", "sm")]));
          body.appendChild(h("p", { class: "note", text: tr("不要贴 secret key 或 service_role key：那是管理员钥匙，放进网页谁都能拿去。Publishable key 本来就是给网页用的，配合登录，每个人只能读写自己的记录。", "Never paste a secret or service_role key: that is the admin key, and in a web page anyone could take it. The Publishable key is made for web pages; with sign-in, each person reaches only their own records.") }));
        } else if (mode === "login") {
          var a = st.auth || {}, open = !a.disable_signup;
          body.appendChild(h("p", { class: "note", text: EN ? "Your records are already saved on this device. Signing in adds a cloud copy so your phone and computer stay in step: " + (open ? "sign in if you have an account; the first time, one is made for you. " : "sign in with your existing account. ") + "Sign in once per device and it stays signed in." : "记录已经自动存在这台设备上。登录只是多一份云端副本，让手机和电脑同步：" + (open ? "有账号就登录，第一次用会自动帮你注册。" : "用已有的账号登录。") + "每台设备登录一次，之后一直保持登录。" }));
          var em = h("input", { id: "cl-email", type: "email", autocomplete: "email", inputmode: "email", placeholder: tr("邮箱", "E-mail"), "aria-label": tr("邮箱", "E-mail") }); em.value = ls(MAIL) || "";
          var pw = h("input", { id: "cl-pw", type: "password", autocomplete: "current-password", placeholder: tr("密码（至少 6 位）", "Password (6+ characters)"), "aria-label": tr("密码", "Password") });
          var eye = h("button", { class: "ibtn", type: "button", "aria-label": tr("显示密码", "Show password"), onclick: function () { var show = pw.type === "password"; pw.type = show ? "text" : "password"; clear(eye).appendChild(icon(show ? "eyeoff" : "eye", "sm")); eye.setAttribute("aria-label", show ? tr("隐藏密码", "Hide password") : tr("显示密码", "Show password")); } }, [icon("eye", "sm")]);
          body.appendChild(h("div", { class: "lgrid" }, [h("div", { class: "fld" }, [icon("mail", "sm"), em]), h("div", { class: "fld" }, [icon("lock", "sm"), pw, eye])]));
          body.appendChild(h("button", { class: "btn pri wide", type: "button", onclick: function () { auth("auto"); } }, [open ? tr("登录 / 注册", "Sign in / Sign up") : tr("登录", "Sign in"), icon("arrow", "sm")]));
          body.appendChild(h("div", { class: "links" }, [h("button", { type: "button", text: tr("忘记密码", "Forgot password"), onclick: function () { auth("recover"); } }),
            !CFG.key ? h("a", { href: "#cloud", text: tr("换一个 Supabase key", "Use another Supabase key"), onclick: function (e) { e.preventDefault(); try { localStorage.removeItem(CKEY); } catch (x) {} st.auth = null; st.mode = null; paint(); } }) : null,
            open && a.mailer_autoconfirm !== true ? h("span", { class: "note", text: tr("第一次注册要去邮箱点一次确认链接", "The first sign-up needs one click on the e-mailed confirmation link") }) : null]));
          pw.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); auth("auto"); } });
        } else if (mode === "recovery") {
          body.appendChild(h("p", { class: "note", text: tr("你是从「重设密码」的邮件过来的：设一个新密码。", "You came from the password-reset e-mail: set a new password.") }));
          body.appendChild(h("div", { class: "fld" }, [icon("lock", "sm"), h("input", { id: "cl-newpw", type: "password", autocomplete: "new-password", placeholder: tr("新密码，至少 6 位", "New password, 6+ characters"), "aria-label": tr("新密码", "New password") })]));
          body.appendChild(h("div", { class: "acts" }, [h("button", { class: "btn pri", type: "button", text: tr("设好新密码", "Set the new password"), onclick: setPassword }), h("button", { class: "btn ghost", type: "button", text: tr("以后再说", "Later"), onclick: function () { st.recovery = false; st.mode = null; paint(); } })]));
        } else {
          body.appendChild(h("div", { class: "acct" }, [h("span", { class: "av", id: "cl-av" }), h("div", { style: "min-width:0" }, [h("b", { id: "cl-who" }), h("small", { id: "cl-st" })])]));
          body.appendChild(h("div", { class: "mini3" }, [h("div", {}, [h("b", { id: "cl-n1" }), h("span", { text: tr("笔交易", "trades") })]), h("div", {}, [h("b", { id: "cl-n2" }), h("span", { text: tr("笔提现", "withdrawals") })]), h("div", {}, [h("b", { id: "cl-n4" }), h("span", { text: tr("条备注", "remarks") })]), h("div", {}, [h("b", { id: "cl-n3" }), h("span", { text: tr("个目标", "goals") })])]));
          body.appendChild(h("div", { class: "acts" }, [h("button", { class: "btn sm", type: "button", onclick: function () { st.retried = false; sync().then(function (ok) { if (ok) toast(tr("已同步", "Synced")); }); } }, [icon("refresh", "sm"), tr("立即同步", "Sync now")]), h("button", { class: "btn sm ghost", type: "button", onclick: signOut }, [icon("logout", "sm"), tr("退出登录", "Sign out")])]));
          body.appendChild(h("div", { class: "pair" }, [h("div", { class: "qr", id: "cl-qr", "aria-hidden": "true" }), h("div", { style: "min-width:0" }, [h("b", { text: tr("在手机上也看得到", "See it on your phone too") }),
            h("p", { class: "note", text: tr("用手机相机扫左边的码（或者把链接发到手机打开），手机就连上同一个云端；再用同一个邮箱和密码登录一次，这里记的每一笔都会出现在手机上，手机记的也会回到这里。", "Scan the code with your phone's camera (or send yourself the link) and the phone joins the same cloud. Sign in once with the same e-mail and password: everything logged here shows on the phone, and what you log there comes back here.") }),
            h("div", { class: "acts", style: "margin-top:8px" }, [h("button", { class: "btn sm", type: "button", onclick: function () { copy(pairLink(), tr("链接已复制：发到手机上打开", "Link copied: open it on your phone")); } }, [icon("copy", "sm"), tr("复制链接", "Copy link")])])])]));
          body.appendChild(h("p", { class: "note", text: tr("这台设备会一直保持登录：每次保存几秒后自动上传，打开或切回这一页时也会同步。没网的时候照样能记，连上后补传。", "This device stays signed in: each save uploads a few seconds later, and the page syncs when opened, when you come back to it and when you leave it. Offline, you can still log; it uploads once you are back online.") }));
          drawQr();
        }
        body.appendChild(h("div", { id: "cl-msg", class: "cl" }));
      }
      if (mode === "acct") {
        var who = s.user.email || s.user.id, n = pending();
        $("cl-av").textContent = who.charAt(0).toUpperCase(); $("cl-who").textContent = who;
        $("cl-st").textContent = st.busy ? tr(tr("同步中…", "Syncing…"), "Syncing…") : st.err ? tr("上次同步没成功", "The last sync failed") : D.synced ? tr("已登录 · 上次同步 ", "Signed in · last sync ") + ms(dOf(D.synced)) + " " + hm(D.synced) + (n ? tr(" · 还有 ", " · ") + n + tr(" 条待上传", " to upload") : "") : tr("已登录 · 还没同步过", "Signed in · not synced yet");
        $("cl-n1").textContent = D.items.length; $("cl-n2").textContent = withdrawals().length; $("cl-n3").textContent = D.goals.length; $("cl-n4").textContent = D.notes.length;
      }
      paintMsg();
    }
    function init() {
      fromHash(); authSettings();
      if (sess()) sync();
      document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible" && sess() && conf() && (!D.synced || Date.now() - D.synced > 30000)) sync(); });
      window.addEventListener("online", function () { if (sess()) sync(); });
    }
    return { paint: paint, soon: soon, sync: sync, flush: flush, notesWhere: notesWhere, init: init };
  })();

  // ---------- wiring ----------
  $("tab-trade").addEventListener("click", function () { if (V.edit && V.edit.c === "cash") endEdit(); setTab("trade"); });
  $("tab-cash").addEventListener("click", function () { if (V.edit && V.edit.c === "items") endEdit(); setTab("cash"); });
  $("q-date").addEventListener("change", function () { if (DAY.test(this.value)) { setDate(this.value); showDay(this.value); renderCal(); renderDay(); renderYear(); renderNotes(); } });
  $("q-today").addEventListener("click", function () { setDate(TODAY); showDay(TODAY); renderAll(); });
  $("s-win").addEventListener("click", function () { setSign(1); }); $("s-loss").addEventListener("click", function () { setSign(-1); });
  $("t-amt").addEventListener("keydown", function (e) { if (e.key === "-") { e.preventDefault(); setSign(-1); } else if (e.key === "+") { e.preventDefault(); setSign(1); } });
  $("t-amt").addEventListener("input", function () { $("t-err").hidden = true; saveLabel(); });
  $("c-amt").addEventListener("input", function () { $("c-err").hidden = true; saveLabel(); });
  $("t-cancel").addEventListener("click", function () { endEdit(); }); $("c-cancel").addEventListener("click", function () { endEdit(); });
  $("nl").addEventListener("input", renderNl);
  $("n-text").addEventListener("input", function () { $("n-count").textContent = this.value.length ? this.value.length + " / 2000" : ""; if (!V.noteDay) V.noteDay = V.sel; clearTimeout(noteT); noteT = setTimeout(saveNote, 700); });
  $("n-text").addEventListener("blur", function () { clearTimeout(noteT); saveNote(); });
  $("nl").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); nlSave(); } });
  $("nl-go").addEventListener("click", nlSave);
  $("fab").addEventListener("click", function () { openEntry(); });
  $("top-add").addEventListener("click", function () { openEntry("nl"); });
  $("sheet-x").addEventListener("click", closeSheet); $("scrim").addEventListener("click", closeSheet);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && document.body.classList.contains("sheet")) closeSheet(); });
  Array.prototype.forEach.call(document.querySelectorAll("#per button"), function (b) { b.addEventListener("click", function () { V.per = b.getAttribute("data-p"); ls(UI, JSON.stringify({ per: V.per })); renderKpis(); }); });
  $("ask-go").addEventListener("click", function () { askNow(true); });
  $("ask-copy").addEventListener("click", function () { askNow(false); });
  $("ask-ctx").addEventListener("toggle", function () { if ($("ask-ctx").open) $("ask-pre").textContent = claudeText(); });
  $("grid").addEventListener("click", function (ev) {
    var b = ev.target.closest ? ev.target.closest(".day[data-d]") : null; if (!b) return;
    V.sel = b.getAttribute("data-d"); if (!V.edit && V.sel <= TODAY) setDate(V.sel);
    renderCal(); renderDay(); renderNotes(); if (window.innerWidth < 980) $("daycard").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("d-add").addEventListener("click", function () { if (V.edit) endEdit(); setDate(V.sel <= TODAY ? V.sel : TODAY); openEntry(V.tab === "cash" ? "c-amt" : "t-amt"); });
  $("prev").addEventListener("click", function () { V.m--; if (V.m < 0) { V.m = 11; V.y--; } renderAll(); });
  $("next").addEventListener("click", function () { V.m++; if (V.m > 11) { V.m = 0; V.y++; } renderAll(); });
  $("s-cur").addEventListener("input", function () { D.cur = this.value.trim().slice(0, 4) || "$"; settingsChanged(); save(); renderAll(); });
  $("s-start").addEventListener("input", function () { var v = parseFloat(this.value); D.start = isFinite(v) && v > 0 ? v : null; settingsChanged(); save(); renderKpis(); });
  function download(name, text, type) { var a = h("a", { href: URL.createObjectURL(new Blob([text], { type: type })), download: name }); document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  function strip(x) { var o = {}; for (var k in x) if (k !== "dirty") o[k] = x[k]; return o; }
  $("export").addEventListener("click", function () {
    if (!D.items.length && !D.cash.length && !D.goals.length && !D.notes.length) { toast(tr("还没有记录可以导出", "Nothing to export yet")); return; }
    download(tr("盈亏日历备份-", "pnl-journal-backup-") + TODAY + ".json", JSON.stringify({ cur: D.cur, start: D.start, plats: D.plats, items: D.items.map(strip), cash: D.cash.map(strip), goals: D.goals.map(strip), notes: D.notes.map(strip) }, null, 1), "application/json");
    toast(EN ? "Exported " + D.items.length + " trades, " + D.cash.length + " withdrawals and " + D.notes.length + " remarks: keep the file safe" : "已导出 " + D.items.length + " 笔交易、" + D.cash.length + " 笔提现、" + D.notes.length + " 条备注，请把文件存好");
  });
  $("csv").addEventListener("click", function () {
    if (!D.items.length && !D.cash.length && !D.notes.length) { toast(tr("还没有记录可以导出", "Nothing to export yet")); return; }
    var q = function (v) { v = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var rows = [["type", "date", "amount", "platform", "symbol", "side", "lots", "planned_risk", "R", "by_rules", "note"]];
    D.items.forEach(function (x) { rows.push(["trade", x.d, x.amt, x.plat, x.sym, x.side, x.lots, x.risk, num(x.risk) && x.risk > 0 ? (x.amt / x.risk).toFixed(2) : "", x.rule === true ? "yes" : x.rule === false ? "no" : "", x.note]); });
    D.cash.forEach(function (x) { rows.push([x.kind, x.d, x.amt, x.plat, "", "", "", "", "", "", x.note]); });
    D.notes.forEach(function (x) { rows.push(["remark", x.d, "", "", "", "", "", "", "", "", x.text]); });
    rows = [rows[0]].concat(rows.slice(1).sort(function (a, b) { return a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0; }));
    download(tr("盈亏日历-", "pnl-journal-") + TODAY + ".csv", "﻿" + rows.map(function (r) { return r.map(q).join(","); }).join("\n"), "text/csv");
  });
  $("import").addEventListener("change", function () {
    var file = this.files && this.files[0], self = this; if (!file) return;
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var d = JSON.parse(rd.result), added = 0; if (!d || !Array.isArray(d.items)) throw new Error("bad");
        Object.keys(CLEAN).forEach(function (c) {
          (Array.isArray(d[c]) ? d[c] : []).forEach(function (x) { if (!x || !x.id || find(c, String(x.id))) return; var y = CLEAN[c](x); if (y) { put(c, touch(y)); added++; } });
        });
        if (Array.isArray(d.plats)) d.plats.forEach(function (p) { if (typeof p === "string" && p.trim()) addPlat(p.trim().slice(0, 40)); });
        if (!D.items.length && typeof d.cur === "string" && d.cur) { D.cur = d.cur.slice(0, 4); settingsChanged(); }
        save(); renderAll(); toast(added ? tr("已读入 " + added + " 条新记录", "Read in " + added + " new records") : tr("备份里的记录这里都已经有了", "Everything in the backup is already here"));
      } catch (e) { toast(tr("这个文件读不了：需要本页导出的备份文件", "Cannot read this file: it needs a backup exported from this page")); }
      self.value = "";
    };
    rd.readAsText(file);
  });
  // the gold page (another tab) can add a closed position to the same store
  window.addEventListener("storage", function (e) { if (e.key === KEY) { D = load(); renderAll(); Cloud.soon(); } });
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible" && dOf(Date.now()) !== TODAY) renderAll(); if (document.visibilityState === "hidden") leaving(); });
  window.addEventListener("pagehide", leaving);
  function leaving() { if (noteT) { clearTimeout(noteT); saveNote(); } Cloud.flush(); }      // a remark typed just now is kept and sent before the page goes
  var rz; window.addEventListener("resize", function () { clearTimeout(rz); rz = setTimeout(renderCurve, 150); });
  // the report page's paper record, for the "same month" line (optional)
  fetch("data/xau-signals.json", { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { if (d && d.signals) { REC = d; renderKpis(); } }).catch(function () {});
  setTab("trade"); setSign(1); renderAll(); Cloud.init();
})();
