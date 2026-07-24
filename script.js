
/*
  SOR Dashboard v3 - script.js
  Complete rewrite — all 5 feedback items included.
  Download Excel functions added for every visualization.
*/

"use strict";

var CHART_MAX  = 40;
var PAGE_SIZE  = 15;
var TICK_MS    = 900;
var FEED_MAX   = 15;
var speeds     = [900, 500, 200];
var speedIndex = 0;

var allData    = [];
var cursor     = 0;
var simRunning = true;
var simTimer   = null;
var seenRows   = [];
var tableRows  = [];
var tablePage  = 1;
var sortCol    = "snapshot_time";
var sortDir    = -1;
var feedItems  = [];
var prevRecord = null;
var charts     = {};

var routeCounts = {
  "Direct NSE Aggressive"    : 0,
  "Direct NSE Passive"       : 0,
  "Low-Latency Route"        : 0,
  "Split Order Route"        : 0,
  "Liquidity-Optimized Route": 0
};

var slipStats = {
  buyTotal:0, buyCount:0, buyBest:-Infinity, buyWorst:Infinity,
  sellTotal:0, sellCount:0
};

var cumSignals = { BUY:0, SELL:0, NEUTRAL:0 };

function el(id) { return document.getElementById(id); }

function fmtPrice(n) {
  if (n === null || n === undefined || isNaN(n)) return "--";
  return Number(n).toLocaleString("en-IN", {minimumFractionDigits:2, maximumFractionDigits:2});
}
function fmtVol(n) {
  if (n === null || n === undefined || isNaN(n)) return "--";
  return Number(n).toFixed(3);
}
function fmtMomentum(n) {
  if (n === null || n === undefined || isNaN(n)) return "--";
  var v = Number(n);
  return (v >= 0 ? "+" : "") + v.toFixed(2);
}
function fmtBps(n) {
  if (n === null || n === undefined || isNaN(n)) return "--";
  var v = Number(n);
  return (v >= 0 ? "+" : "") + v.toFixed(2) + " bps";
}
function nowStr() {
  return new Date().toLocaleTimeString("en-IN", {hour12:false});
}

function tickClock() {
  el("clock").textContent = new Date().toLocaleTimeString("en-IN", {hour12:false});
}
setInterval(tickClock, 1000);
tickClock();

function showError(msg) {
  el("error-msg").textContent = msg;
  el("error-banner").classList.remove("hidden");
  setTimeout(function() { el("error-banner").classList.add("hidden"); }, 8000);
}

function getRoute(signal, spread) {
  if (signal === "BUY")
    return spread <= 0.15 ? "Direct NSE Aggressive" : "Liquidity-Optimized Route";
  if (signal === "SELL")
    return spread <= 0.15 ? "Direct NSE Passive" : "Split Order Route";
  return "Low-Latency Route";
}

function getSignalReason(r) {
  var signal = r.signal;
  var heat   = r.market_heat;
  var mom    = r.price_momentum;
  if (signal === "BUY") {
    return "More buyers than sellers right now. Heat score " + heat + "/100. "
      + (mom > 0 ? "Price moving upward." : "Price holding steady.");
  }
  if (signal === "SELL") {
    return "More sellers than buyers right now. Heat score " + heat + "/100. "
      + (mom < 0 ? "Price moving downward." : "Price holding steady.");
  }
  return "Market balanced. Heat score " + heat + "/100. Cautious route selected.";
}

Chart.defaults.color       = "#8b949e";
Chart.defaults.borderColor = "#30363d";
Chart.defaults.font.family = "'Segoe UI', system-ui, sans-serif";
Chart.defaults.font.size   = 11;

function makeLineChart(canvasId, label, color, fill, minY, maxY) {
  var ctx  = el(canvasId).getContext("2d");
  var scaleY = { ticks:{ maxTicksLimit:5 } };
  if (minY !== undefined) scaleY.min = minY;
  if (maxY !== undefined) scaleY.max = maxY;
  return new Chart(ctx, {
    type:"line",
    data:{
      labels:[],
      datasets:[{
        label:label, data:[],
        borderColor:color,
        backgroundColor: fill
          ? color.replace("rgb(","rgba(").replace(")",",0.12)") : "transparent",
        borderWidth:2, pointRadius:0, tension:0.35, fill:!!fill
      }]
    },
    options:{
      animation:{duration:200}, responsive:true, maintainAspectRatio:true,
      plugins:{ legend:{display:false}, tooltip:{mode:"index", intersect:false} },
      scales:{ x:{ticks:{maxTicksLimit:7, maxRotation:0}}, y:scaleY }
    }
  });
}

function makeImbThresholdChart(canvasId) {
  var ctx = el(canvasId).getContext("2d");
  return new Chart(ctx, {
    type:"line",
    data:{
      labels:[],
      datasets:[
        {
          label:"OB Imbalance",
          data:[], borderColor:"rgb(163,113,247)",
          backgroundColor:"rgba(163,113,247,0.08)",
          borderWidth:2, pointRadius:0, tension:0.3, fill:true, order:1
        },
        {
          label:"BUY Threshold +0.3",
          data:[], borderColor:"rgba(63,185,80,0.85)",
          borderWidth:1.5, borderDash:[6,4],
          pointRadius:0, fill:false, order:2
        },
        {
          label:"SELL Threshold -0.3",
          data:[], borderColor:"rgba(248,81,73,0.85)",
          borderWidth:1.5, borderDash:[6,4],
          pointRadius:0, fill:false, order:3
        }
      ]
    },
    options:{
      animation:{duration:200}, responsive:true, maintainAspectRatio:true,
      plugins:{
        legend:{ display:true, labels:{ boxWidth:12, padding:12, font:{size:10} } },
        tooltip:{ mode:"index", intersect:false }
      },
      scales:{
        x:{ ticks:{maxTicksLimit:7, maxRotation:0} },
        y:{ min:-1.1, max:1.1, ticks:{maxTicksLimit:6} }
      }
    }
  });
}

function makeRouteDonut(canvasId) {
  var ctx    = el(canvasId).getContext("2d");
  var labels = Object.keys(routeCounts);
  var colors = [
    "rgba(63,185,80,0.85)",
    "rgba(248,81,73,0.85)",
    "rgba(88,166,255,0.85)",
    "rgba(210,153,34,0.85)",
    "rgba(163,113,247,0.85)"
  ];
  return new Chart(ctx, {
    type:"doughnut",
    data:{
      labels:labels,
      datasets:[{
        data:labels.map(function() { return 0; }),
        backgroundColor:colors, borderWidth:2, borderColor:"#1c2330"
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:true, cutout:"55%",
      plugins:{
        legend:{ display:true, position:"right", labels:{ boxWidth:12, padding:10, font:{size:10} } },
        tooltip:{
          callbacks:{
            label:function(ctx) {
              var total = ctx.dataset.data.reduce(function(a,b){return a+b;},0);
              var pct   = total > 0 ? (ctx.parsed/total*100).toFixed(1) : 0;
              return ctx.label + ": " + ctx.parsed + " (" + pct + "%)";
            }
          }
        }
      },
      animation:{duration:300}
    }
  });
}

function makeSlippageChart(canvasId) {
  var ctx = el(canvasId).getContext("2d");
  return new Chart(ctx, {
    type:"bar",
    data:{
      labels:[],
      datasets:[{
        label:"Slippage bps", data:[], backgroundColor:[],
        borderRadius:3, borderWidth:0
      }]
    },
    options:{
      animation:{duration:200}, responsive:true, maintainAspectRatio:true,
      plugins:{
        legend:{display:false},
        tooltip:{ callbacks:{ label:function(ctx){ return "Slippage: " + fmtBps(ctx.parsed.y); } } }
      },
      scales:{
        x:{ticks:{maxTicksLimit:8, maxRotation:0}},
        y:{ticks:{maxTicksLimit:5}, grid:{color:"rgba(48,54,61,0.6)"}}
      }
    }
  });
}

function makeCumSignalChart(canvasId) {
  var ctx = el(canvasId).getContext("2d");
  return new Chart(ctx, {
    type:"line",
    data:{
      labels:[],
      datasets:[
        {
          label:"BUY", data:[],
          borderColor:"rgba(63,185,80,1)",
          backgroundColor:"rgba(63,185,80,0.35)",
          borderWidth:1.5, pointRadius:0, fill:true, tension:0.3, order:1
        },
        {
          label:"NEUTRAL", data:[],
          borderColor:"rgba(139,148,158,1)",
          backgroundColor:"rgba(139,148,158,0.25)",
          borderWidth:1.5, pointRadius:0, fill:true, tension:0.3, order:2
        },
        {
          label:"SELL", data:[],
          borderColor:"rgba(248,81,73,1)",
          backgroundColor:"rgba(248,81,73,0.35)",
          borderWidth:1.5, pointRadius:0, fill:true, tension:0.3, order:3
        }
      ]
    },
    options:{
      animation:{duration:200}, responsive:true, maintainAspectRatio:true,
      plugins:{
        legend:{ display:true, labels:{ boxWidth:12, padding:10, font:{size:10} } },
        tooltip:{ mode:"index", intersect:false }
      },
      scales:{
        x:{ticks:{maxTicksLimit:8, maxRotation:0}},
        y:{ticks:{maxTicksLimit:5}}
      }
    }
  });
}

function makeBarChart(canvasId, label) {
  var ctx = el(canvasId).getContext("2d");
  return new Chart(ctx, {
    type:"bar",
    data:{ labels:[], datasets:[{ label:label, data:[], backgroundColor:[], borderRadius:3, borderWidth:0 }] },
    options:{
      animation:{duration:200}, responsive:true, maintainAspectRatio:true,
      plugins:{ legend:{display:false}, tooltip:{mode:"index"} },
      scales:{
        x:{ticks:{maxTicksLimit:8, maxRotation:0}},
        y:{ticks:{maxTicksLimit:5}}
      }
    }
  });
}

function makeStackedBar(canvasId) {
  var ctx = el(canvasId).getContext("2d");
  return new Chart(ctx, {
    type:"bar",
    data:{
      labels:[],
      datasets:[
        { label:"Buy Volume",  data:[], backgroundColor:"rgba(63,185,80,0.75)", borderRadius:2, borderWidth:0 },
        { label:"Sell Volume", data:[], backgroundColor:"rgba(248,81,73,0.75)", borderRadius:2, borderWidth:0 }
      ]
    },
    options:{
      animation:{duration:200}, responsive:true, maintainAspectRatio:true,
      plugins:{ legend:{ display:true, labels:{ boxWidth:10, padding:10, font:{size:10} } }, tooltip:{mode:"index"} },
      scales:{
        x:{ stacked:true, ticks:{maxTicksLimit:8, maxRotation:0} },
        y:{ stacked:true, ticks:{maxTicksLimit:5} }
      }
    }
  });
}

function makeHorizontalBar(canvasId) {
  var ctx = el(canvasId).getContext("2d");
  return new Chart(ctx, {
    type:"bar",
    data:{
      labels:[],
      datasets:[
        { label:"Buy Orders",  data:[], backgroundColor:"rgba(63,185,80,0.75)", borderRadius:3, borderWidth:0 },
        { label:"Sell Orders", data:[], backgroundColor:"rgba(248,81,73,0.75)", borderRadius:3, borderWidth:0 }
      ]
    },
    options:{
      animation:{duration:150}, responsive:true, maintainAspectRatio:true, indexAxis:"y",
      plugins:{ legend:{ display:true, labels:{ boxWidth:10, padding:10, font:{size:10} } }, tooltip:{mode:"index"} },
      scales:{ x:{ticks:{maxTicksLimit:5}}, y:{ticks:{font:{size:10}}} }
    }
  });
}

function makeGauge(canvasId) {
  var ctx = el(canvasId).getContext("2d");
  return new Chart(ctx, {
    type:"doughnut",
    data:{ datasets:[{ data:[50,50,100], backgroundColor:["#3fb950","#f85149","#1c2330"], borderWidth:0, circumference:180, rotation:270 }] },
    options:{ responsive:true, maintainAspectRatio:false, cutout:"70%", plugins:{ legend:{display:false}, tooltip:{enabled:false} }, animation:{duration:350} }
  });
}

function updateHeatGauge(score) {
  var v = Math.max(0, Math.min(100, score || 50));
  var buyPart  = v;
  var sellPart = 100 - v;
  var hidden   = 100;
  charts.heatGauge.data.datasets[0].data            = [buyPart, sellPart, hidden];
  charts.heatGauge.data.datasets[0].backgroundColor = [
    "rgba(63,185,80,0.9)",
    "rgba(248,81,73,0.9)",
    "#1c2330"
  ];
  charts.heatGauge.update("none");
  var numEl = el("heat-score-num");
  var subEl = el("heat-score-sub");
  var color, label;
  if (v >= 65)      { color = "var(--green)";  label = "Buy Pressure"; }
  else if (v <= 35) { color = "var(--red)";    label = "Sell Pressure"; }
  else              { color = "var(--muted)";  label = "Neutral"; }
  numEl.textContent = v.toFixed(1);
  numEl.style.color = color;
  subEl.textContent = label;
  subEl.style.color = color;
}

function pushRolling(chart, label, value, dsIndex) {
  var ds = dsIndex || 0;
  chart.data.labels.push(label);
  chart.data.datasets[ds].data.push(value);
  if (chart.data.labels.length > CHART_MAX) {
    chart.data.labels.shift();
    chart.data.datasets.forEach(function(d) {
      if (d.data.length > CHART_MAX) d.data.shift();
    });
  }
}

function updateSignalBox(r) {
  var box = el("signal-box");
  box.className = "signal-box";
  if (r.signal === "BUY")       box.classList.add("sig-buy");
  else if (r.signal === "SELL") box.classList.add("sig-sell");
  else                          box.classList.add("sig-neutral");
  el("signal-value").textContent  = r.signal === "NEUTRAL" ? "HOLD" : r.signal;
  el("signal-reason").textContent = getSignalReason(r);
}

function updatePressureBar(r) {
  var bid   = r.total_bid_vol || 0;
  var ask   = r.total_ask_vol || 0;
  var total = bid + ask || 1;
  var bPct  = (bid / total * 100).toFixed(1);
  var aPct  = (ask / total * 100).toFixed(1);
  el("pressure-buy").style.width  = bPct + "%";
  el("pressure-sell").style.width = aPct + "%";
  el("buyer-pct").textContent     = bPct + "%";
  el("seller-pct").textContent    = aPct + "%";
  el("buyer-pct").style.color  = parseFloat(bPct) > 50 ? "var(--green)" : "var(--muted)";
  el("seller-pct").style.color = parseFloat(aPct) > 50 ? "var(--red)"   : "var(--muted)";
  var diff = bid - ask;
  el("pressure-sub").textContent = diff > 5
    ? "Buyers are clearly stronger right now."
    : diff < -5 ? "Sellers are clearly stronger right now."
    : "Buyers and sellers are roughly evenly matched.";
}

function updateQuickStats(r, prev) {
  el("qs-price").textContent   = fmtPrice(r.mid_price);
  el("ctrl-price").textContent = fmtPrice(r.mid_price);
  el("ctrl-route").textContent = r.route || "--";
  if (prev) {
    var diff  = r.mid_price - prev.mid_price;
    var chgEl = el("qs-price-chg");
    chgEl.textContent = (diff >= 0 ? "+" : "") + diff.toFixed(2);
    chgEl.className   = "qs-change " + (diff >= 0 ? "pos" : "neg");
  }
  el("qs-spread").textContent = fmtPrice(r.spread);
  var badge = el("qs-spread-badge");
  var cond  = r.spread_condition || "TIGHT";
  badge.textContent = cond;
  badge.className   = "qs-badge badge-" + cond.toLowerCase();
  el("qs-bid-vol").textContent  = fmtVol(r.total_bid_vol);
  el("qs-ask-vol").textContent  = fmtVol(r.total_ask_vol);
  var mom   = r.price_momentum || 0;
  var momEl = el("qs-momentum");
  momEl.textContent = fmtMomentum(mom);
  momEl.className   = "qs-value " + (mom > 0 ? "pos" : mom < 0 ? "neg" : "neu");
  el("qs-route").textContent = r.route || "--";
}

function updateLOBTable(r) {
  var tbody = el("lob-tbody");
  if (!tbody) return;
  var rows = "";
  for (var i = 1; i <= 5; i++) {
    rows += "<tr>"
      + "<td>" + fmtVol(r["bid_size_" + i]) + "</td>"
      + "<td class='bid-price'>" + fmtPrice(r["bid_price_" + i]) + "</td>"
      + "<td class='ask-price'>" + fmtPrice(r["ask_price_" + i]) + "</td>"
      + "<td>" + fmtVol(r["ask_size_" + i]) + "</td>"
      + "</tr>";
  }
  tbody.innerHTML = rows;
  var bid   = r.total_bid_vol || 0;
  var ask   = r.total_ask_vol || 0;
  var total = bid + ask || 1;
  el("lob-bar-bid").style.width = (bid/total*100).toFixed(1) + "%";
  el("lob-bar-ask").style.width = (ask/total*100).toFixed(1) + "%";
  el("lob-bid-pct").textContent = "Buyers " + (bid/total*100).toFixed(1) + "%";
  el("lob-ask-pct").textContent = "Sellers " + (ask/total*100).toFixed(1) + "%";
}

function updateDepthChart(r) {
  var labels = [], bidData = [], askData = [];
  for (var i = 5; i >= 1; i--) {
    labels.push("Level " + i);
    bidData.push(r["bid_size_" + i] || 0);
    askData.push(r["ask_size_" + i] || 0);
  }
  charts.depth.data.labels           = labels;
  charts.depth.data.datasets[0].data = bidData;
  charts.depth.data.datasets[1].data = askData;
  charts.depth.update("none");
}

function updatePriceChart(r, tLabel) {
  var mom   = r.price_momentum || 0;
  var color = mom >= 0 ? "rgba(63,185,80,0.85)" : "rgba(248,81,73,0.85)";
  charts.price.data.labels.push(tLabel);
  charts.price.data.datasets[0].data.push(r.mid_price || 0);
  charts.price.data.datasets[0].backgroundColor.push(color);
  if (charts.price.data.labels.length > CHART_MAX) {
    charts.price.data.labels.shift();
    charts.price.data.datasets[0].data.shift();
    charts.price.data.datasets[0].backgroundColor.shift();
  }
  charts.price.update("none");
}

function updateRouteChart(route) {
  if (routeCounts[route] === undefined) routeCounts[route] = 0;
  routeCounts[route] += 1;
  charts.route.data.labels           = Object.keys(routeCounts);
  charts.route.data.datasets[0].data = Object.values(routeCounts);
  charts.route.update("none");
}

function updateImbThreshold(r, tLabel) {
  var imb = r.imbalance || 0;
  charts.imbThreshold.data.labels.push(tLabel);
  charts.imbThreshold.data.datasets[0].data.push(imb);
  charts.imbThreshold.data.datasets[1].data.push(0.3);
  charts.imbThreshold.data.datasets[2].data.push(-0.3);
  if (charts.imbThreshold.data.labels.length > CHART_MAX) {
    charts.imbThreshold.data.labels.shift();
    charts.imbThreshold.data.datasets[0].data.shift();
    charts.imbThreshold.data.datasets[1].data.shift();
    charts.imbThreshold.data.datasets[2].data.shift();
  }
  charts.imbThreshold.update("none");
}

function updateSlippage(r, tLabel) {
  if (r.signal === "NEUTRAL") return;
  var bps       = r.slippage_bps || 0;
  var favorable = (r.signal === "BUY" && bps > 0) || (r.signal === "SELL" && bps < 0);
  var color     = favorable ? "rgba(63,185,80,0.8)" : "rgba(248,81,73,0.8)";
  charts.slippage.data.labels.push(tLabel);
  charts.slippage.data.datasets[0].data.push(bps);
  charts.slippage.data.datasets[0].backgroundColor.push(color);
  if (charts.slippage.data.labels.length > CHART_MAX) {
    charts.slippage.data.labels.shift();
    charts.slippage.data.datasets[0].data.shift();
    charts.slippage.data.datasets[0].backgroundColor.shift();
  }
  charts.slippage.update("none");
  if (r.signal === "BUY") {
    slipStats.buyTotal += bps;
    slipStats.buyCount += 1;
    slipStats.buyBest  = Math.max(slipStats.buyBest,  bps);
    slipStats.buyWorst = Math.min(slipStats.buyWorst, bps);
  } else {
    slipStats.sellTotal += bps;
    slipStats.sellCount += 1;
  }
  var buyAvg  = slipStats.buyCount  > 0 ? slipStats.buyTotal  / slipStats.buyCount  : 0;
  var sellAvg = slipStats.sellCount > 0 ? slipStats.sellTotal / slipStats.sellCount : 0;
  var total   = slipStats.buyCount + slipStats.sellCount;
  el("slip-buy-avg").textContent   = fmtBps(buyAvg);
  el("slip-sell-avg").textContent  = fmtBps(sellAvg);
  el("slip-buy-best").textContent  = slipStats.buyCount  > 0 ? fmtBps(slipStats.buyBest)  : "--";
  el("slip-buy-worst").textContent = slipStats.buyCount  > 0 ? fmtBps(slipStats.buyWorst) : "--";
  el("slip-count").textContent     = total + " signals tracked";
  el("slip-sell-avg").className    = "slip-value " + (sellAvg <= 0 ? "pos" : "neg");
}

function updateCumSignal(r, tLabel) {
  cumSignals[r.signal] = (cumSignals[r.signal] || 0) + 1;
  charts.signalMix.data.labels.push(tLabel);
  charts.signalMix.data.datasets[0].data.push(cumSignals.BUY);
  charts.signalMix.data.datasets[1].data.push(cumSignals.NEUTRAL);
  charts.signalMix.data.datasets[2].data.push(cumSignals.SELL);
  if (charts.signalMix.data.labels.length > CHART_MAX) {
    charts.signalMix.data.labels.shift();
    charts.signalMix.data.datasets[0].data.shift();
    charts.signalMix.data.datasets[1].data.shift();
    charts.signalMix.data.datasets[2].data.shift();
  }
  charts.signalMix.update("none");
}

function addFeed(r) {
  var t      = r.snapshot_time ? r.snapshot_time.slice(11,19) : nowStr();
  var signal = r.signal;
  var mom    = r.price_momentum || 0;
  var msg, evType;
  if (signal === "BUY") {
    msg    = "BUY signal — price " + fmtPrice(r.mid_price) + " | route: " + (r.route||"--") + " | heat " + r.market_heat + "/100";
    evType = "ev-buy";
  } else if (signal === "SELL") {
    msg    = "SELL signal — price " + fmtPrice(r.mid_price) + " | route: " + (r.route||"--") + " | heat " + r.market_heat + "/100";
    evType = "ev-sell";
  } else {
    msg    = "HOLD — balanced at " + fmtPrice(r.mid_price) + " | route: " + (r.route||"--");
    evType = "ev-neutral";
  }
  if (r.spread_condition === "WIDE" || r.spread_condition === "EXTREME") {
    msg    = "Wide spread alert: " + fmtPrice(r.spread) + " at " + fmtPrice(r.mid_price) + " — route adjusted";
    evType = "ev-warning";
  }
  if (Math.abs(mom) > 50) {
    msg    = "Large price move: " + fmtMomentum(mom) + " in one tick at " + fmtPrice(r.mid_price);
    evType = mom > 0 ? "ev-buy" : "ev-sell";
  }
  feedItems.unshift({ evType:evType, msg:msg, time:t });
  if (feedItems.length > FEED_MAX) feedItems.pop();
  var feed = el("trade-feed");
  if (!feed) return;
  feed.innerHTML = feedItems.map(function(f) {
    return "<div class='feed-item " + f.evType + "'>"
      + "<span class='feed-time'>" + f.time + "</span>"
      + "<span class='feed-msg'>"  + f.msg  + "</span>"
      + "</div>";
  }).join("");
}

function buildTable() {
  var sigFilter = (el("signal-filter") && el("signal-filter").value) || "";
  tableRows = seenRows.filter(function(r) {
    return !sigFilter || r.signal === sigFilter;
  }).sort(function(a,b) {
    var av = a[sortCol], bv = b[sortCol];
    if (av === undefined) return 0;
    var cmp = typeof av === "number" ? av-bv : String(av).localeCompare(String(bv));
    return cmp * sortDir;
  });
}

function renderTable() {
  var tbody = el("signal-tbody");
  if (!tbody) return;
  var start = (tablePage-1) * PAGE_SIZE;
  var page  = tableRows.slice(start, start + PAGE_SIZE);
  tbody.innerHTML = page.map(function(r) {
    var sig     = r.signal || "NEUTRAL";
    var cls     = sig==="BUY" ? "sig-buy-badge" : sig==="SELL" ? "sig-sell-badge" : "sig-neutral-badge";
    var heat    = r.market_heat || 50;
    var heatCls = heat>=65 ? "heat-cell-high" : heat<=35 ? "heat-cell-low" : "heat-cell-mid";
    var mom     = r.price_momentum || 0;
    var momCls  = mom>0 ? "pos" : mom<0 ? "neg" : "neu";
    var bps     = r.slippage_bps || 0;
    var bpsCls  = ((sig==="BUY"&&bps>0)||(sig==="SELL"&&bps<0)) ? "pos" : "neg";
    var t       = (r.snapshot_time||"").slice(11,19);
    return "<tr>"
      + "<td>" + t + "</td>"
      + "<td>" + fmtPrice(r.mid_price) + "</td>"
      + "<td class='" + momCls  + "'>" + fmtMomentum(mom) + "</td>"
      + "<td>" + fmtPrice(r.spread) + "</td>"
      + "<td class='" + heatCls + "'>" + heat + "</td>"
      + "<td style='font-size:.7rem;color:var(--accent)'>" + (r.route||"--") + "</td>"
      + "<td class='" + bpsCls  + "'>" + fmtBps(bps) + "</td>"
      + "<td><span class='signal-badge " + cls + "'>" + sig + "</span></td>"
      + "</tr>";
  }).join("");
  renderPagination();
}

function renderPagination() {
  var pg    = el("pagination");
  if (!pg) return;
  var total = Math.ceil(tableRows.length / PAGE_SIZE);
  pg.innerHTML = "";
  for (var i=1; i<=Math.min(total,25); i++) {
    var btn = document.createElement("button");
    btn.className   = "pg-btn" + (i===tablePage ? " active" : "");
    btn.textContent = i;
    btn.setAttribute("data-page", i);
    btn.addEventListener("click", function() {
      tablePage = parseInt(this.getAttribute("data-page"));
      renderTable();
    });
    pg.appendChild(btn);
  }
}

function tick() {
  if (!simRunning || allData.length===0) return;
  var r      = allData[cursor];
  cursor     = (cursor+1) % allData.length;
  var tLabel = r.snapshot_time ? r.snapshot_time.slice(11,19) : nowStr();

  el("snapshot-index").textContent = cursor + " / " + allData.length;
  el("snapshot-time").textContent  = r.snapshot_time || "--";

  updateSignalBox(r);
  updateHeatGauge(r.market_heat);
  updateQuickStats(r, prevRecord);
  updatePressureBar(r);
  updatePriceChart(r, tLabel);
  updateLOBTable(r);
  updateDepthChart(r);
  addFeed(r);

  charts.flow.data.labels.push(tLabel);
  charts.flow.data.datasets[0].data.push(r.total_bid_vol || 0);
  charts.flow.data.datasets[1].data.push(r.total_ask_vol || 0);
  if (charts.flow.data.labels.length > CHART_MAX) {
    charts.flow.data.labels.shift();
    charts.flow.data.datasets[0].data.shift();
    charts.flow.data.datasets[1].data.shift();
  }
  charts.flow.update("none");

  pushRolling(charts.heat,   tLabel, r.market_heat || 50);
  charts.heat.update("none");

  pushRolling(charts.spread, tLabel, r.spread || 0);
  charts.spread.update("none");

  var mom    = r.price_momentum || 0;
  var mColor = mom >= 0 ? "rgba(63,185,80,0.8)" : "rgba(248,81,73,0.8)";
  charts.momentum.data.labels.push(tLabel);
  charts.momentum.data.datasets[0].data.push(mom);
  charts.momentum.data.datasets[0].backgroundColor.push(mColor);
  if (charts.momentum.data.labels.length > CHART_MAX) {
    charts.momentum.data.labels.shift();
    charts.momentum.data.datasets[0].data.shift();
    charts.momentum.data.datasets[0].backgroundColor.shift();
  }
  charts.momentum.update("none");

  updateRouteChart(r.route || "Low-Latency Route");
  updateImbThreshold(r, tLabel);
  updateSlippage(r, tLabel);
  updateCumSignal(r, tLabel);

  if (cursor % 4 === 0) {
    seenRows.unshift(r);
    if (seenRows.length > 600) seenRows.pop();
    buildTable();
    renderTable();
  }

  prevRecord = r;
}

function init() {
  try {
    charts.price    = makeBarChart("priceChart",    "Mid Price");
    charts.price.data.datasets[0].backgroundColor = [];
    charts.flow     = makeStackedBar("flowChart");
    charts.heat     = makeLineChart("heatChart",    "Heat",   "rgb(163,113,247)", true, 0, 100);
    charts.spread   = makeLineChart("spreadChart",  "Spread", "rgb(210,153,34)",  true);
    charts.momentum = makeBarChart("momentumChart", "Momentum");
    charts.momentum.data.datasets[0].backgroundColor = [];
    charts.depth    = makeHorizontalBar("depthChart");
    charts.heatGauge    = makeGauge("heatGauge");
    charts.route        = makeRouteDonut("routeChart");
    charts.signalMix    = makeCumSignalChart("signalMixChart");
    charts.imbThreshold = makeImbThresholdChart("imbThresholdChart");
    charts.slippage     = makeSlippageChart("slippageChart");
  } catch(e) {
    showError("Chart setup failed: " + e.message);
    return;
  }

  var sf = el("signal-filter");
  if (sf) sf.addEventListener("change", function() { tablePage=1; buildTable(); renderTable(); });

  document.querySelectorAll("thead th[data-col]").forEach(function(th) {
    th.addEventListener("click", function() {
      var col = th.getAttribute("data-col");
      if (col===sortCol) { sortDir*=-1; } else { sortCol=col; sortDir=-1; }
      tablePage=1; buildTable(); renderTable();
    });
  });

  var pauseBtn = el("pause-btn");
  if (pauseBtn) pauseBtn.addEventListener("click", function() {
    simRunning = !simRunning;
    pauseBtn.textContent = simRunning ? "Pause" : "Resume";
  });

  var speedBtn = el("speed-btn");
  if (speedBtn) speedBtn.addEventListener("click", function() {
    speedIndex = (speedIndex+1) % speeds.length;
    TICK_MS    = speeds[speedIndex];
    clearInterval(simTimer);
    simTimer   = setInterval(tick, TICK_MS);
    speedBtn.textContent = "Speed x" + (speedIndex+1);
  });

  simTimer = setInterval(tick, TICK_MS);
}

fetch("sample-data.json")
  .then(function(res) {
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  })
  .then(function(data) {
    if (!Array.isArray(data) || data.length===0) throw new Error("Empty dataset.");
    allData = data;
    console.log("Loaded", allData.length, "snapshots.");
    init();
  })
  .catch(function(e) {
    showError("Could not load data: " + e.message + ". Is the HTTP server running?");
  });

/* ============================================================
   EXCEL DOWNLOAD FUNCTIONS
   Uses SheetJS (xlsx) loaded from CDN in index.html.
   Each function exports the data for one specific visual.
   ============================================================ */

function exportToExcel(data, filename, sheetname) {
  if (!data || data.length === 0) {
    alert("No data available yet. Let the replay run for a few seconds first.");
    return;
  }
  var ws = XLSX.utils.json_to_sheet(data);
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetname || "Data");
  XLSX.writeFile(wb, filename + ".xlsx");
}

function extractChartData(chartId) {
  var chartInst = Chart.getChart(chartId);
  if (!chartInst) return [];
  var labels   = chartInst.data.labels || [];
  var datasets = chartInst.data.datasets || [];
  return labels.map(function(label, i) {
    var row = { Time: label };
    datasets.forEach(function(ds) {
      row[ds.label || "Value"] = ds.data[i];
    });
    return row;
  });
}

function downloadChart(chartId, filename) {
  var data = extractChartData(chartId);
  exportToExcel(data, filename, filename);
}

function downloadPressure() {
  var data = seenRows.map(function(r) {
    var bid   = r.total_bid_vol || 0;
    var ask   = r.total_ask_vol || 0;
    var total = bid + ask || 1;
    return {
      Time          : (r.snapshot_time || "").slice(11,19),
      Buyer_Volume  : bid,
      Seller_Volume : ask,
      Buyer_Pct     : (bid/total*100).toFixed(1) + "%",
      Seller_Pct    : (ask/total*100).toFixed(1) + "%",
      Dominant_Side : bid > ask ? "BUYERS" : "SELLERS"
    };
  });
  exportToExcel(data, "Buyer_Seller_Pressure", "Pressure");
}

function downloadRouteData() {
  var total = Object.values(routeCounts).reduce(function(a,b){return a+b;},0);
  var data  = Object.keys(routeCounts).map(function(route) {
    var count = routeCounts[route];
    return {
      Route      : route,
      Count      : count,
      Percentage : total > 0 ? (count/total*100).toFixed(1) + "%" : "0%"
    };
  });
  exportToExcel(data, "Routing_Decision_Breakdown", "Routes");
}

function downloadSlippageData() {
  var data = seenRows
    .filter(function(r) { return r.signal !== "NEUTRAL"; })
    .map(function(r) {
      var bps       = r.slippage_bps || 0;
      var favorable = (r.signal === "BUY" && bps > 0) || (r.signal === "SELL" && bps < 0);
      return {
        Time         : (r.snapshot_time || "").slice(11,19),
        Signal       : r.signal,
        Price        : r.mid_price,
        Slippage_bps : bps,
        Outcome      : favorable ? "Favorable" : "Unfavorable"
      };
    });
  exportToExcel(data, "Slippage_Data", "Slippage");
}

function downloadSlippageSummary() {
  var buyAvg  = slipStats.buyCount  > 0 ? (slipStats.buyTotal  / slipStats.buyCount).toFixed(4)  : "N/A";
  var sellAvg = slipStats.sellCount > 0 ? (slipStats.sellTotal / slipStats.sellCount).toFixed(4) : "N/A";
  var data = [
    { Metric: "Avg BUY Slippage (bps)",   Value: buyAvg },
    { Metric: "Avg SELL Slippage (bps)",  Value: sellAvg },
    { Metric: "Best BUY Slippage (bps)",  Value: slipStats.buyCount > 0 ? slipStats.buyBest.toFixed(4)  : "N/A" },
    { Metric: "Worst BUY Slippage (bps)", Value: slipStats.buyCount > 0 ? slipStats.buyWorst.toFixed(4) : "N/A" },
    { Metric: "Total BUY Signals",        Value: slipStats.buyCount },
    { Metric: "Total SELL Signals",       Value: slipStats.sellCount },
    { Metric: "Total Signals Tracked",    Value: slipStats.buyCount + slipStats.sellCount }
  ];
  exportToExcel(data, "Slippage_Summary", "Summary");
}

function downloadLOBData() {
  if (!prevRecord) {
    alert("No snapshot loaded yet. Let the replay run first.");
    return;
  }
  var data = [];
  for (var i = 1; i <= 5; i++) {
    data.push({
      Level     : i,
      Bid_Price : prevRecord["bid_price_" + i],
      Bid_Size  : prevRecord["bid_size_"  + i],
      Ask_Price : prevRecord["ask_price_" + i],
      Ask_Size  : prevRecord["ask_size_"  + i]
    });
  }
  exportToExcel(data, "Order_Book_Depth", "LOB");
}

function downloadSignalHistory() {
  var data = seenRows.map(function(r) {
    return {
      Time          : (r.snapshot_time || "").slice(11,19),
      Mid_Price     : r.mid_price,
      Momentum      : r.price_momentum,
      Spread        : r.spread,
      Spread_Cond   : r.spread_condition,
      Heat_Score    : r.market_heat,
      Route         : r.route,
      Slippage_bps  : r.slippage_bps,
      Signal        : r.signal
    };
  });
  exportToExcel(data, "Signal_History", "Signals");
}

function downloadFeedData() {
  var data = feedItems.map(function(f) {
    return {
      Time    : f.time,
      Type    : f.evType.replace("ev-", "").toUpperCase(),
      Message : f.msg
    };
  });
  exportToExcel(data, "Live_Market_Events", "Feed");
}

function downloadAllData() {
  var data = seenRows.map(function(r) {
    return {
      Time           : r.snapshot_time,
      Mid_Price      : r.mid_price,
      Bid_Price_L1   : r.bid_price_1,
      Ask_Price_L1   : r.ask_price_1,
      Spread         : r.spread,
      Spread_Cond    : r.spread_condition,
      Total_Bid_Vol  : r.total_bid_vol,
      Total_Ask_Vol  : r.total_ask_vol,
      Imbalance      : r.imbalance,
      Vol_Imbalance  : r.vol_imbalance,
      Market_Heat    : r.market_heat,
      Price_Momentum : r.price_momentum,
      Slippage_bps   : r.slippage_bps,
      Route          : r.route,
      Signal         : r.signal
    };
  });
  exportToExcel(data, "SOR_All_Data", "All_Data");
}
