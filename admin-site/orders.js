CB.page(async function () {
  var main = document.querySelector("main");
  var canAct = CB.can(["super_admin", "support"]);
  var rq = await CB.sb.from("requirements")
    .select("id,seq,event_type,event_date,reach,status,closes_at,created_at,customer_name,towns(name,district),bids(id,amount,package,status,providers(full_name,studio_name))")
    .order("created_at", { ascending: false }).limit(300);
  if (rq.error) throw rq.error;
  var reqs = rq.data;
  var cats = await CB.sb.from("categories").select("name").order("name");

  var q = main.querySelector('input[type="search"]');
  var fd = CB.field("District", main), fe = CB.field("Event type", main), fs = CB.field("Status", main);
  CB.setOptions(fd, CB.DISTRICTS, "All");
  CB.setOptions(fe, (cats.data || []).map(function (c) { return c.name; }), "All");
  CB.setOptions(fs, [["open", "Open"], ["widened", "Widened"], ["confirmed", "Confirmed"], ["expired", "Expired"], ["cancelled", "Cancelled"]], "All");

  var table = main.querySelector("table");
  var thead = table.querySelector("thead tr"), tbody = table.querySelector("tbody");
  var reqHead = thead.innerHTML;
  var det = document.getElementById("det-h").parentNode.parentNode;
  var detTitle = document.getElementById("det-h");
  var detBody = det.querySelector("tbody");
  var btns = det.querySelectorAll("button");
  var extendB = btns[0], widenB = btns[1], cancelB = btns[2];
  var tabsBox = main.querySelector('[role="tablist"]');
  var mode = 0, selected = null;
  tbody.style.cursor = "pointer";
  var STAT = { open: ["Open", "orange"], widened: ["Widened", "blue"], confirmed: ["Confirmed", "green"], expired: ["Expired", "gray"], cancelled: ["Cancelled", "red"] };
  function lowest(r) {
    var a = (r.bids || []).filter(function (b) { return b.status === "active" || b.status === "won"; }).map(function (b) { return b.amount; });
    return a.length ? Math.min.apply(null, a) : null;
  }

  function drawReqs() {
    var s = q.value.trim().toLowerCase();
    var list = reqs.filter(function (r) {
      if (fd.value && (!r.towns || r.towns.district !== fd.value)) return false;
      if (fe.value && r.event_type !== fe.value) return false;
      if (fs.value && r.status !== fs.value) return false;
      if (s && (CB.code("RQ", r.seq) + " " + (r.customer_name || "")).toLowerCase().indexOf(s) < 0) return false;
      return true;
    });
    tbody.innerHTML = list.length ? list.map(function (r) {
      var st = STAT[r.status] || [r.status, "gray"], lo = lowest(r);
      var closes = r.status === "open" || r.status === "widened" ? CB.hoursFrom(r.closes_at) : "Closed";
      return CB.tr([CB.td(CB.code("RQ", r.seq), true), CB.td(CB.esc(r.event_type) + " · " + CB.fmtDate(r.event_date)),
        CB.td(r.towns ? CB.esc(r.towns.name) + " · " + CB.esc(r.towns.district) : "–"), CB.td(r.reach.charAt(0).toUpperCase() + r.reach.slice(1)),
        CB.td((r.bids || []).length), CB.td(lo == null ? "None" : CB.inr(lo)), CB.td(CB.badge(st[0], st[1])), CB.td(closes)],
        ' data-id="' + r.id + '"');
    }).join("") : CB.emptyRow(8, reqs.length ? "No requirements match these filters." : "No requirements yet. They appear when customers post them in the app.");
    if (!selected || !list.some(function (r) { return r.id === selected; })) selected = list.length ? list[0].id : null;
    drawDetail();
  }

  function drawDetail() {
    var r = reqs.filter(function (x) { return x.id === selected; })[0];
    det.style.display = mode === 0 && r ? "" : "none";
    if (!r) return;
    detTitle.textContent = "Selected: " + CB.code("RQ", r.seq) + " · " + r.event_type + (r.towns ? ", " + r.towns.name : "");
    var open = r.status === "open" || r.status === "widened";
    [extendB, widenB, cancelB].forEach(function (b) { b.disabled = !canAct || !open; b.style.opacity = b.disabled ? "0.5" : "1"; });
    widenB.disabled = widenB.disabled || r.reach === "state"; widenB.style.opacity = widenB.disabled ? "0.5" : "1";
    detBody.innerHTML = (r.bids || []).length ? r.bids.map(function (b) {
      var st = b.status === "active" ? ["Active", "green"] : b.status === "rejected" ? ["Rejected by customer", "gray"] : b.status === "removed" ? ["Removed by admin", "red"] : b.status === "won" ? ["Chosen", "green"] : ["Withdrawn", "gray"];
      var act = b.status === "active" && canAct ? '<a href="#" data-rm="' + b.id + '">Remove bid</a>' : "–";
      return CB.tr([CB.td(CB.esc(CB.providerName(b.providers)), true), CB.td(CB.inr(b.amount)), CB.td(CB.esc(b.package || "–")), CB.td(CB.badge(st[0], st[1])), CB.td(act)]);
    }).join("") : CB.emptyRow(5, "No bids yet.");
  }

  async function change(patch, verb) {
    var r = reqs.filter(function (x) { return x.id === selected; })[0];
    var u = await CB.sb.from("requirements").update(patch).eq("id", r.id);
    if (u.error) return CB.fail(u.error);
    Object.assign(r, patch);
    await CB.audit(verb, CB.code("RQ", r.seq));
    CB.say("Saved."); drawReqs();
  }
  extendB.addEventListener("click", function () {
    var r = reqs.filter(function (x) { return x.id === selected; })[0];
    var base = Math.max(Date.now(), r.closes_at ? new Date(r.closes_at).getTime() : 0);
    change({ closes_at: new Date(base + 24 * 36e5).toISOString() }, "Extended bid window by 24 h");
  });
  widenB.addEventListener("click", function () {
    var r = reqs.filter(function (x) { return x.id === selected; })[0];
    change({ reach: r.reach === "town" ? "district" : "state", status: "widened" }, "Widened requirement reach");
  });
  cancelB.addEventListener("click", function () { change({ status: "cancelled" }, "Cancelled requirement"); });
  detBody.addEventListener("click", async function (e) {
    var id = e.target.getAttribute && e.target.getAttribute("data-rm");
    if (!id) return;
    e.preventDefault();
    var u = await CB.sb.from("bids").update({ status: "removed" }).eq("id", id);
    if (u.error) return CB.fail(u.error);
    var r = reqs.filter(function (x) { return x.id === selected; })[0];
    r.bids.forEach(function (b) { if (b.id === id) b.status = "removed"; });
    await CB.audit("Removed a bid", CB.code("RQ", r.seq));
    CB.say("Bid removed."); drawReqs();
  });
  tbody.addEventListener("click", function (e) {
    var tr = e.target.closest && e.target.closest("tr[data-id]");
    if (tr && mode === 0) { selected = tr.getAttribute("data-id"); drawDetail(); }
  });

  var bookings = null;
  async function drawBookings() {
    if (!bookings) {
      var b = await CB.sb.from("bookings")
        .select("id,seq,token_amount,due_at,delivered_at,status,requirements(seq,event_type,towns(name,district)),bids(amount,providers(full_name,studio_name))")
        .order("created_at", { ascending: false }).limit(300);
      if (b.error) return CB.fail(b.error);
      bookings = b.data;
    }
    thead.innerHTML = ["Booking", "Event", "Town · District", "Provider", "Agreed (₹)", "Token (₹)", "Status", "Due"].map(function (h) { return '<th style="padding: 12px 16px">' + h + "</th>"; }).join("");
    var BS = { confirmed: ["Confirmed", "orange"], delivered: ["Delivered", "green"], cancelled: ["Cancelled", "red"] };
    tbody.innerHTML = bookings.length ? bookings.map(function (b) {
      var rq2 = b.requirements || {}, st = BS[b.status] || [b.status, "gray"];
      return CB.tr([CB.td(CB.code("BK", b.seq), true), CB.td(CB.esc(rq2.event_type || "–")),
        CB.td(rq2.towns ? CB.esc(rq2.towns.name) + " · " + CB.esc(rq2.towns.district) : "–"),
        CB.td(CB.esc(CB.providerName(b.bids && b.bids.providers))), CB.td(CB.inr(b.bids && b.bids.amount)), CB.td(CB.inr(b.token_amount)),
        CB.td(CB.badge(st[0], st[1])), CB.td(b.delivered_at ? "Delivered " + CB.fmtDate(b.delivered_at) : CB.fmtDate(b.due_at))]);
    }).join("") : CB.emptyRow(8, "No bookings yet.");
  }

  CB.tabs(tabsBox, function (i) {
    mode = i;
    main.querySelectorAll("label")[0].parentNode.style.display = i === 0 ? "" : "none";
    if (i === 0) { thead.innerHTML = reqHead; drawReqs(); } else { det.style.display = "none"; drawBookings(); }
  });
  [q, fd, fe, fs].forEach(function (el) { el.addEventListener("input", function () { if (mode === 0) drawReqs(); }); el.addEventListener("change", function () { if (mode === 0) drawReqs(); }); });
  drawReqs();
});
