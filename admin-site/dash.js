CB.page(async function () {
  var main = document.querySelector("main");
  var sel = main.querySelector("select");
  function tile(label, v) {
    Array.prototype.forEach.call(main.querySelectorAll("div"), function (d) {
      if (d.children.length === 2 && d.children[0].textContent.trim() === label) d.children[1].textContent = v;
    });
  }
  function pct(a, b) { return b ? Math.round(a * 100 / b) + "%" : "–"; }
  function mins(m) {
    if (m == null) return "–";
    m = Math.round(m);
    return m < 60 ? m + " min" : Math.floor(m / 60) + " h " + (m % 60) + " min";
  }

  async function load() {
    var days = /30/.test(sel.value) ? 30 : 7;
    var r = await CB.sb.rpc("admin_dashboard", { p_days: days });
    if (r.error) return CB.fail(r.error);
    var d = r.data;

    tile("Open requirements", d.open_requirements);
    tile("Confirmed bookings", d.confirmed_bookings);
    tile("Token revenue (₹)", Number(d.token_revenue).toLocaleString("en-IN"));
    tile("Active verified photographers", d.verified_providers);
    tile("Median time to first bid", mins(d.median_first_bid_min));
    tile("Confirmation rate", pct(d.confirmed_bookings, d.posted));
    tile("On-time delivery", pct(d.ontime, d.delivered));
    tile("Cancellation rate", pct(d.cancelled, d.posted));

    // Funnel
    var funnel = document.getElementById("funnel-h").parentNode;
    var note = funnel.querySelector("p");
    note.textContent = "Bars show live counts for the last " + days + " days.";
    var steps = [["Requirements posted", d.posted], ["Got at least 1 bid", d.with_bid], ["Got 3 or more bids", d.three_bids],
      ["Confirmed with token", d.confirmed_bookings], ["Delivered on time", d.ontime]];
    steps.forEach(function (s) {
      Array.prototype.forEach.call(funnel.querySelectorAll("span"), function (sp) {
        if (sp.textContent.trim() !== s[0]) return;
        var row = sp.parentNode, last = row.lastElementChild;
        last.textContent = s[1];
        var inner = row.children[1].firstElementChild;
        var w = d.posted ? Math.max(0, Math.min(100, s[1] * 100 / d.posted)) : 0;
        if (inner) inner.style.width = w + "%";
        else row.children[1].style.opacity = d.posted ? "1" : "0.25";
      });
    });

    // Needs attention
    var attn = document.getElementById("attn-h").parentNode;
    var map = { "Providers awaiting verification": d.pending_providers, "Disputes past response deadline": d.overdue_disputes,
      "Open safety flags": d.open_flags, "Towns below supply threshold": d.towns_below, "Requirements with no bids yet": d.no_bid_requirements };
    Array.prototype.forEach.call(attn.querySelectorAll("a"), function (a) {
      var k = a.children[0].textContent.trim();
      if (k in map) a.children[1].textContent = map[k];
    });

    // Supply gaps
    var tb = document.getElementById("supply-h").parentNode.parentNode.querySelector("tbody");
    var okStyle = 'padding: 4px 10px; border-radius: 999px; font-weight: 600; font-size: 13px';
    tb.innerHTML = d.gaps.length ? d.gaps.map(function (g) {
      var status = g.override === "open" ? ["Forced open", "gray"] : g.override === "closed" ? ["Closed", "gray"] :
        g.verified >= d.needed ? ["Ready", "green"] : ["Below threshold", "orange"];
      return CB.tr([CB.td(CB.esc(g.name) + " · " + CB.esc(g.district)), CB.td(g.verified + " of " + d.needed), CB.td(g.requirements), CB.td(CB.badge(status[0], status[1]))]);
    }).join("") : CB.emptyRow(4, "No towns yet. Add towns on the Locations page.");
  }
  sel.addEventListener("change", load);
  await load();
});
