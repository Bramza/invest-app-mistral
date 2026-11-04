/* InvestTrack — frontend logica */
"use strict";

const TYPE_META = {
  aandeel:    { label: "Aandeel",    color: "#6366f1" },
  etf:        { label: "ETF",        color: "#22d3ee" },
  crypto:     { label: "Crypto",     color: "#f59e0b" },
  obligatie:  { label: "Obligatie",  color: "#a78bfa" },
  grondstof:  { label: "Grondstof",  color: "#f472b6" },
  contant:    { label: "Contant",    color: "#34d399" },
};

const state = { portfolio: null, editingId: null, armedDelete: null };

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const eur = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
const eurCompact = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const numFmt = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 4 });
const pctFmt = new Intl.NumberFormat("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateFmt = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short" });
const dateFull = new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------------- API ---------------- */
async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "Er ging iets mis");
    err.errors = data.errors || null;
    throw err;
  }
  return data;
}

/* ---------------- Toasts ---------------- */
function toast(msg, type = "ok") {
  const el = document.createElement("div");
  el.className = `toast ${type === "error" ? "error" : ""}`;
  el.textContent = msg;
  $("#toasts").appendChild(el);
  setTimeout(() => {
    el.classList.add("out");
    setTimeout(() => el.remove(), 260);
  }, 3200);
}

/* ---------------- Getal-animatie ---------------- */
function animateValue(el, to, formatter, duration = 700) {
  const from = el._val ?? 0;
  el._val = to;
  if (from === to) { el.textContent = formatter(to); return; }
  const start = performance.now();
  function frame(now) {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = formatter(from + (to - from) * eased);
    if (p < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* ---------------- Render: statistieken ---------------- */
function renderStats(t) {
  animateValue($("#statTotal"), t.total_value, (v) => eur.format(v));
  animateValue($("#statInvested"), t.invested, (v) => eur.format(v));

  const plEl = $("#statPL");
  animateValue(plEl, t.pl, (v) => (v < 0 ? "−" : "") + eur.format(Math.abs(v)));
  plEl.classList.toggle("pos", t.pl > 0);
  plEl.classList.toggle("neg", t.pl < 0);

  const badge = $("#statPLBadge");
  const arrow = t.pl >= 0
    ? '<svg viewBox="0 0 24 24"><path d="M12 5l7 8h-4v6h-6v-6H5z"/></svg>'
    : '<svg viewBox="0 0 24 24"><path d="M12 19l-7-8h4V5h6v6h4z"/></svg>';
  badge.className = "badge " + (Math.abs(t.pl) < 0.005 ? "flat" : t.pl > 0 ? "pos" : "neg");
  badge.innerHTML = t.pl === 0 ? "0,00%" : `${arrow}${t.pl > 0 ? "+" : "−"}${pctFmt.format(Math.abs(t.pl_pct))}%`;

  $("#statTotalSub").textContent = `van ${eurCompact.format(t.invested + t.cash)} ingelegd vermogen`;
  $("#statPositions").textContent = t.positions;
  $("#statCashSub").textContent = `contant: ${eur.format(t.cash)}`;
}

/* ---------------- Render: area chart ---------------- */
function renderChart(history) {
  const svg = $("#areaChart");
  const wrap = $("#chartWrap");
  const W = wrap.clientWidth || 800;
  const H = wrap.clientHeight || 280;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.innerHTML = "";

  if (!history || history.length < 2) {
    svg.innerHTML = `<text x="${W / 2}" y="${H / 2}" fill="#5b6579" font-size="14" text-anchor="middle">Nog onvoldoende gegevens</text>`;
    return;
  }

  const pad = { l: 8, r: 8, t: 18, b: 8 };
  const xs = history.map((p) => p.t);
  const ys = history.map((p) => p.v);
  const minV = Math.min(...ys);
  const maxV = Math.max(...ys);
  const span = maxV - minV || 1;
  const x = (i) => pad.l + (i / (history.length - 1)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - minV) / span) * (H - pad.t - pad.b);

  const line = history.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(history.length - 1).toFixed(1)},${H - pad.b} L${pad.l},${H - pad.b} Z`;

  const gid = "areaGrad";
  svg.innerHTML = `
    <defs>
      <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="rgba(99,102,241,0.45)"/>
        <stop offset="0.6" stop-color="rgba(34,211,238,0.12)"/>
        <stop offset="1" stop-color="rgba(34,211,238,0)"/>
      </linearGradient>
      <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#6366f1"/>
        <stop offset="1" stop-color="#22d3ee"/>
      </linearGradient>
    </defs>
    <path d="${area}" fill="url(#${gid})"/>
    <path d="${line}" fill="none" stroke="url(#lineGrad)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  `;

  const lastX = x(history.length - 1), lastY = y(history[history.length - 1].v);
  const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  dot.setAttribute("cx", lastX); dot.setAttribute("cy", lastY); dot.setAttribute("r", 4.5);
  dot.setAttribute("fill", "#22d3ee"); dot.setAttribute("stroke", "#070b14"); dot.setAttribute("stroke-width", 2.5);
  svg.appendChild(dot);

  const halo = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  halo.setAttribute("cx", lastX); halo.setAttribute("cy", lastY); halo.setAttribute("r", 9);
  halo.setAttribute("fill", "rgba(34,211,238,0.25)");
  svg.appendChild(halo);

  // gridlijnen + labels
  const grid = document.createElementNS("http://www.w3.org/2000/svg", "g");
  for (let g = 0; g <= 3; g++) {
    const gy = pad.t + (g / 3) * (H - pad.t - pad.b);
    const val = maxV - (g / 3) * span;
    const ln = document.createElementNS("http://www.w3.org/2000/svg", "line");
    ln.setAttribute("x1", pad.l); ln.setAttribute("x2", W - pad.r);
    ln.setAttribute("y1", gy); ln.setAttribute("y2", gy);
    ln.setAttribute("stroke", "rgba(255,255,255,0.05)");
    grid.appendChild(ln);
    const tx = document.createElementNS("http://www.w3.org/2000/svg", "text");
    tx.setAttribute("x", W - pad.r); tx.setAttribute("y", gy - 5);
    tx.setAttribute("fill", "#5b6579"); tx.setAttribute("font-size", "10.5");
    tx.setAttribute("text-anchor", "end");
    tx.textContent = eurCompact.format(val);
    grid.appendChild(tx);
  }
  svg.appendChild(grid);

  // hover tooltip
  const tip = $("#chartTooltip");
  const hit = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  hit.setAttribute("x", 0); hit.setAttribute("y", 0);
  hit.setAttribute("width", W); hit.setAttribute("height", H);
  hit.setAttribute("fill", "transparent");
  svg.appendChild(hit);

  const cross = document.createElementNS("http://www.w3.org/2000/svg", "line");
  cross.setAttribute("stroke", "rgba(255,255,255,0.25)");
  cross.setAttribute("stroke-dasharray", "4 4");
  cross.setAttribute("y1", pad.t); cross.setAttribute("y2", H - pad.b);
  cross.style.display = "none";
  svg.appendChild(cross);

  hit.addEventListener("mousemove", (ev) => {
    const rect = svg.getBoundingClientRect();
    const mx = (ev.clientX - rect.left) * (W / rect.width);
    let i = Math.round(((mx - pad.l) / (W - pad.l - pad.r)) * (history.length - 1));
    i = Math.max(0, Math.min(history.length - 1, i));
    const px = x(i), py = y(history[i].v);
    cross.setAttribute("x1", px); cross.setAttribute("x2", px);
    cross.style.display = "block";
    tip.hidden = false;
    tip.style.left = `${(px / W) * rect.width}px`;
    tip.style.top = `${(py / H) * rect.height}px`;
    tip.innerHTML = `<div class="tt-date">${dateFmt.format(new Date(history[i].t * 1000))}</div><div class="tt-value">${eur.format(history[i].v)}</div>`;
  });
  hit.addEventListener("mouseleave", () => {
    tip.hidden = true;
    cross.style.display = "none";
  });

  // legende
  const first = history[0], last = history[history.length - 1];
  const delta = last.v - first.v;
  const dpct = first.v ? (delta / first.v) * 100 : 0;
  $("#chartLegend").innerHTML = `
    <span><span class="dot" style="background:#6366f1"></span>Periode</span>
    <span style="color:${delta >= 0 ? "var(--green)" : "var(--red)"}">${delta >= 0 ? "+" : "−"}${eurCompact.format(Math.abs(delta))} (${delta >= 0 ? "+" : ""}${pctFmt.format(dpct)}%)</span>
  `;
}

/* ---------------- Render: donut ---------------- */
function renderDonut(portfolio) {
  const svg = $("#donutChart");
  const t = portfolio.totals;
  const total = t.total_value || 1;

  const groups = {};
  for (const h of portfolio.holdings) {
    const v = h.amount * h.current_price;
    groups[h.type] = (groups[h.type] || 0) + v;
  }
  if (t.cash > 0) groups.contant = (groups.contant || 0) + t.cash;

  const entries = Object.entries(groups).sort((a, b) => b[1] - a[1]);
  const R = 80, C = 2 * Math.PI * R;
  svg.innerHTML = "";
  let offset = 0;
  for (const [type, val] of entries) {
    const frac = val / total;
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("cx", 100); c.setAttribute("cy", 100); c.setAttribute("r", R);
    c.setAttribute("stroke", TYPE_META[type].color);
    c.setAttribute("stroke-dasharray", `${Math.max(0, frac * C - 2)} ${C - frac * C + 2}`);
    c.setAttribute("stroke-dashoffset", -offset * C);
    c.setAttribute("stroke-linecap", "butt");
    svg.appendChild(c);
    offset += frac;
  }
  $("#donutTotal").textContent = eurCompact.format(t.total_value);

  $("#donutLegend").innerHTML = entries.map(([type, val]) => `
    <li>
      <span class="dot" style="background:${TYPE_META[type].color}"></span>
      <span class="lg-name">${TYPE_META[type].label}</span>
      <span class="lg-val">${eurCompact.format(val)}</span>
      <span class="lg-pct">${pctFmt.format((val / total) * 100)}%</span>
    </li>
  `).join("");
}

/* ---------------- Render: topposities ---------------- */
function renderTop(portfolio) {
  const t = portfolio.totals;
  const sorted = [...portfolio.holdings]
    .map((h) => ({ ...h, value: h.amount * h.current_price }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
  const max = sorted.length ? sorted[0].value : 1;
  $("#topList").innerHTML = sorted.map((h) => {
    const meta = TYPE_META[h.type];
    const pl = (h.current_price - h.buy_price) * h.amount;
    const plPct = h.buy_price ? ((h.current_price - h.buy_price) / h.buy_price) * 100 : 0;
    return `
      <div class="top-row">
        <span class="avatar" style="background:${meta.color}22;color:${meta.color};box-shadow:inset 0 0 0 1px ${meta.color}55">${esc(h.name.slice(0, 2).toUpperCase())}</span>
        <div><div class="tr-name">${esc(h.name)}</div><div class="tr-type">${meta.label} · ${numFmt.format(h.amount)} st</div></div>
        <div class="tr-bar"><div class="tr-bar-fill" style="width:${((h.value / max) * 100).toFixed(1)}%"></div></div>
        <span class="tr-value">${eur.format(h.value)}</span>
        <span class="tr-pl badge ${pl >= 0 ? "pos" : "neg"}">${pl >= 0 ? "+" : "−"}${pctFmt.format(Math.abs(plPct))}%</span>
      </div>`;
  }).join("") || `<div class="empty-state"><p>Nog geen beholdingen.</p></div>`;
}

/* ---------------- Render: tabel ---------------- */
function renderTable(portfolio) {
  const body = $("#holdingsBody");
  const holdings = [...portfolio.holdings].sort((a, b) => b.amount * b.current_price - a.amount * a.current_price);
  $("#emptyState").classList.toggle("hidden", holdings.length > 0);
  body.innerHTML = holdings.map((h) => {
    const meta = TYPE_META[h.type];
    const value = h.amount * h.current_price;
    const pl = value - h.amount * h.buy_price;
    const plPct = h.buy_price ? (pl / (h.amount * h.buy_price)) * 100 : 0;
    const armed = state.armedDelete === h.id;
    return `
      <tr data-id="${h.id}">
        <td>
          <div class="cell-holding">
            <span class="avatar" style="background:${meta.color}22;color:${meta.color};box-shadow:inset 0 0 0 1px ${meta.color}55">${esc(h.name.slice(0, 2).toUpperCase())}</span>
            <div class="cell-name">${esc(h.name)}<small>${numFmt.format(h.amount)} stuks</small></div>
          </div>
        </td>
        <td><span class="type-pill"><span class="dot" style="background:${meta.color}"></span>${meta.label}</span></td>
        <td class="num">${numFmt.format(h.amount)}</td>
        <td class="num">${eur.format(h.buy_price)}</td>
        <td class="num">${eur.format(h.current_price)}</td>
        <td class="num" style="font-weight:800">${eur.format(value)}</td>
        <td class="num pl-cell ${pl >= 0 ? "pos" : "neg"}">${pl >= 0 ? "+" : "−"}${eur.format(Math.abs(pl))}<br><small>(${pl >= 0 ? "+" : ""}${pctFmt.format(plPct)}%)</small></td>
        <td class="actions">
          <div class="row-actions">
            <button class="icon-btn" data-edit="${h.id}" title="Bewerken" aria-label="Bewerken">
              <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25zM20.7 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
            </button>
            <button class="icon-btn ${armed ? "armed" : ""}" data-del="${h.id}">${armed ? "Zeker?" : '<svg viewBox="0 0 24 24"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>'}</button>
          </div>
        </td>
      </tr>`;
  }).join("");
}

/* ---------------- Alles renderen ---------------- */
function renderAll(portfolio) {
  state.portfolio = portfolio;
  renderStats(portfolio.totals);
  renderChart(portfolio.history);
  renderDonut(portfolio);
  renderTop(portfolio);
  renderTable(portfolio);
  $("#cashInput").value = portfolio.cash.toFixed(2);
}

async function load() {
  const data = await api("/api/portfolio");
  renderAll(data);
}

/* ---------------- Navigatie ---------------- */
function setPage(hash) {
  const id = (hash || "#dashboard").slice(1);
  $$(".page").forEach((p) => p.classList.toggle("hidden", p.id !== id));
  $$("[data-nav]").forEach((a) => a.classList.toggle("active", a.getAttribute("href") === `#${id}`));
  const titles = { dashboard: "Dashboard", beholdingen: "Beleggingen", contant: "Contant" };
  $("#pageTitle").textContent = titles[id] || "Dashboard";
  $("#sidebar").classList.remove("open");
  window.scrollTo({ top: 0, behavior: "smooth" });
}
window.addEventListener("hashchange", () => setPage(location.hash));
$$("[data-nav]").forEach((a) => a.addEventListener("click", () => setPage(a.getAttribute("href"))));
$("[data-navlink]").addEventListener("click", (e) => {
  e.preventDefault();
  location.hash = "#beleggingen";
});
$("#menuBtn").addEventListener("click", () => $("#sidebar").classList.toggle("open"));

/* ---------------- Modal ---------------- */
function openModal(holding) {
  state.editingId = holding ? holding.id : null;
  $("#modalTitle").textContent = holding ? "Belegging bewerken" : "Nieuwe belegging";
  $("#holdingId").value = holding ? holding.id : "";
  $("#fName").value = holding ? holding.name : "";
  $("#fType").value = holding ? holding.type : "aandeel";
  $("#fAmount").value = holding ? holding.amount : "";
  $("#fBuy").value = holding ? holding.buy_price : "";
  $("#fCurrent").value = holding ? holding.current_price : "";
  ["name", "type", "amount", "buy_price", "current_price"].forEach((f) => {
    $(`#err-${f}`).textContent = "";
    const input = { name: "#fName", type: "#fType", amount: "#fAmount", buy_price: "#fBuy", current_price: "#fCurrent" }[f];
    $(input).classList.remove("invalid");
  });
  $("#holdingModal").classList.remove("hidden");
  setTimeout(() => $("#fName").focus(), 60);
}
function closeModal() {
  $("#holdingModal").classList.add("hidden");
  state.editingId = null;
}

$("#addHoldingBtn").addEventListener("click", () => openModal(null));
$("#emptyAddBtn").addEventListener("click", () => openModal(null));
$("#modalClose").addEventListener("click", closeModal);
$("#modalCancel").addEventListener("click", closeModal);
$("#holdingModal").addEventListener("click", (e) => { if (e.target === e.currentTarget) closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

$("#holdingForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    name: $("#fName").value.trim(),
    type: $("#fType").value,
    amount: parseFloat($("#fAmount").value),
    buy_price: parseFloat($("#fBuy").value),
    current_price: parseFloat($("#fCurrent").value),
  };
  const id = $("#holdingId").value;
  const btn = $("#modalSave");
  btn.classList.add("loading");
  try {
    if (id) {
      await api(`/api/holdings/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      toast("Belegging bijgewerkt");
    } else {
      await api("/api/holdings", { method: "POST", body: JSON.stringify(payload) });
      toast("Belegging toegevoegd");
    }
    closeModal();
    await load();
  } catch (err) {
    if (err.errors) {
      for (const [field, msg] of Object.entries(err.errors)) {
        const errEl = $(`#err-${field}`);
        if (errEl) errEl.textContent = msg;
        const input = { name: "#fName", type: "#fType", amount: "#fAmount", buy_price: "#fBuy", current_price: "#fCurrent" }[field];
        if (input) $(input).classList.add("invalid");
      }
    } else {
      toast(err.message, "error");
    }
  } finally {
    btn.classList.remove("loading");
  }
});

/* ---------------- Tabel-acties (edit / delete) ---------------- */
$("#holdingsBody").addEventListener("click", async (e) => {
  const editBtn = e.target.closest("[data-edit]");
  const delBtn = e.target.closest("[data-del]");
  if (editBtn) {
    const h = state.portfolio.holdings.find((x) => x.id === editBtn.dataset.edit);
    if (h) openModal(h);
    return;
  }
  if (delBtn) {
    const id = delBtn.dataset.del;
    if (state.armedDelete !== id) {
      state.armedDelete = id;
      renderTable(state.portfolio);
      setTimeout(() => {
        if (state.armedDelete === id) { state.armedDelete = null; renderTable(state.portfolio); }
      }, 3000);
      return;
    }
    state.armedDelete = null;
    try {
      await api(`/api/holdings/${id}`, { method: "DELETE" });
      toast("Belegging verwijderd");
      await load();
    } catch (err) {
      toast(err.message, "error");
    }
  }
});

/* ---------------- Contant ---------------- */
$("#cashBtn").addEventListener("click", () => { location.hash = "#contant"; setTimeout(() => $("#cashInput").focus(), 100); });
$("#cashForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const data = await api("/api/cash", { method: "POST", body: JSON.stringify({ amount: parseFloat($("#cashInput").value) }) });
    renderAll(data.portfolio);
    toast("Contant saldo opgeslagen");
  } catch (err) {
    toast(err.message, "error");
  }
});

/* ---------------- Markt simuleren ---------------- */
$("#simulateBtn").addEventListener("click", async () => {
  const btn = $("#simulateBtn");
  btn.classList.add("loading");
  btn.lastChild.textContent = " Simuleren… ";
  try {
    const data = await api("/api/simulate", { method: "POST", body: "{}" });
    renderAll(data.portfolio);
    const t = data.portfolio.totals;
    toast(`Koersen bijgewerkt — totale waarde ${eur.format(t.total_value)}`);
  } catch (err) {
    toast(err.message, "error");
  } finally {
    btn.classList.remove("loading");
    btn.lastChild.textContent = " Markt simuleren";
  }
});

/* ---------------- Init ---------------- */
$("#pageDate").textContent = dateFull.format(new Date());
window.addEventListener("resize", () => { if (state.portfolio) renderChart(state.portfolio.history); });
setPage(location.hash || "#dashboard");
load().catch((err) => toast(err.message, "error"));
