CB.page(async function () {
  var main = document.querySelector("main");
  var canAct = CB.can(["super_admin", "support"]);
  var r = await CB.sb.from("disputes")
    .select("id,seq,type,customer_name,opened_at,respond_by,status,token_amount,outcome,refund_amount,resolution_note,resolved_at,timeline,provider_id,assigned_to,providers(full_name,studio_name),admin_users(full_name,email),bookings(seq,token_paid_at,requirements(event_type,event_date))")
    .order("opened_at", { ascending: false }).limit(300);
  if (r.error) throw r.error;
  var rows = r.data, selected = rows.length ? rows[0].id : null, mode = 0;

  var table = main.querySelector("table");
  var thead = table.querySelector("thead tr"), tbody = table.querySelector("tbody");
  var disHead = thead.innerHTML;
  tbody.style.cursor = "pointer";
  var caseH = document.getElementById("case-h");
  var caseSec = caseH.parentNode, split = caseSec.parentNode;
  var aside = split.querySelector("aside");
  var dl = caseSec.querySelector("dl"), ol = caseSec.querySelector("ol");
  var liStyle = ol.querySelector("li").getAttribute("style");
  var outcome = CB.field("Outcome", aside), amount = CB.field("Refund amount (₹)", aside), msg = CB.field("Message to both parties", aside);
  var flagBox = aside.querySelector('input[type="checkbox"]');
  var links = aside.querySelectorAll("a");
  var resolve = links[links.length - 1];
  resolve.setAttribute("href", "#"); resolve.setAttribute("role", "button");
  var assign = resolve.cloneNode(true);
  assign.textContent = "Assign to me";
  resolve.parentNode.insertBefore(assign, resolve);
  var note = aside.querySelector("p");
  CB.setOptions(outcome, [["full", "Refund token in full"], ["partial", "Partial refund"], ["none", "No refund"]]);
  amount.placeholder = "";
  CB.sb.from("settings").select("value").eq("key", "refund_limit").maybeSingle().then(function (s) {
    var lim = s.data ? s.data.value : 500;
    note.textContent = "Refunds above ₹" + lim + " need a super admin. Every resolution is saved in the audit log.";
  });
  if (!canAct) { aside.style.opacity = "0.6"; }

  var ST = { open: ["Open", "red"], waiting_provider: ["Waiting for provider", "orange"], under_review: ["Under review", "blue"], closed: ["Closed", "gray"] };
  function find() { return rows.filter(function (x) { return x.id === selected; })[0]; }

  function drawList() {
    if (mode === 2) { thead.innerHTML = ""; tbody.innerHTML = CB.emptyRow(7, "Support tickets arrive with the customer app."); return; }
    if (mode === 1) {
      thead.innerHTML = ["Case", "Booking", "Provider", "Token (₹)", "Refunded (₹)", "Outcome", "Resolved"].map(function (h) { return '<th style="padding: 12px 16px">' + h + "</th>"; }).join("");
      var rf = rows.filter(function (d) { return d.refund_amount > 0; });
      tbody.innerHTML = rf.length ? rf.map(function (d) {
        return CB.tr([CB.td(CB.code("CS", d.seq), true), CB.td(d.bookings ? CB.code("BK", d.bookings.seq) : "–"), CB.td(CB.esc(CB.providerName(d.providers))),
          CB.td(CB.inr(d.token_amount)), CB.td(CB.inr(d.refund_amount)), CB.td(d.outcome === "full" ? "Full" : "Partial"), CB.td(CB.fmtDate(d.resolved_at))]);
      }).join("") : CB.emptyRow(7, "No refunds yet.");
      return;
    }
    thead.innerHTML = disHead;
    tbody.innerHTML = rows.length ? rows.map(function (d) {
      var st = ST[d.status] || [d.status, "gray"];
      var by = d.status === "closed" ? "Resolved" : CB.hoursFrom(d.respond_by);
      var who = d.admin_users ? (d.admin_users.full_name || d.admin_users.email) : "Unassigned";
      return CB.tr([CB.td(CB.code("CS", d.seq), true), CB.td(CB.esc(d.type)), CB.td(d.bookings ? CB.code("BK", d.bookings.seq) : "–"), CB.td(CB.fmtDate(d.opened_at)),
        CB.td(d.status !== "closed" && d.respond_by && new Date(d.respond_by) < new Date() ? CB.badge(by, "red") : CB.esc(by)), CB.td(CB.badge(st[0], st[1])), CB.td(CB.esc(who))],
        ' data-id="' + d.id + '"');
    }).join("") : CB.emptyRow(7, "No disputes yet. They appear when a customer or photographer raises one in the app.");
  }

  function drawCase() {
    var d = find();
    split.style.display = mode === 0 && d ? "" : "none";
    if (!d) return;
    caseH.textContent = "Case " + CB.code("CS", d.seq) + " · " + d.type;
    function set(label, text) { Array.prototype.forEach.call(dl.querySelectorAll("dt"), function (t) { if (t.textContent.trim() === label) t.nextElementSibling.textContent = text; }); }
    var bk = d.bookings, rq = bk && bk.requirements;
    set("Customer", d.customer_name || "–");
    set("Photographer", CB.providerName(d.providers));
    set("Booking", bk ? CB.code("BK", bk.seq) + (rq ? " · " + rq.event_type + " · " + CB.fmtDate(rq.event_date) : "") : "–");
    set("Token paid", d.token_amount != null ? CB.inr(d.token_amount) + (bk && bk.token_paid_at ? " on " + CB.fmtDate(bk.token_paid_at) : "") : "–");
    set("Shoot-day code used", "Not tracked yet");
    ol.innerHTML = (d.timeline || []).map(function (t) { return '<li style="' + liStyle + '"><strong>' + CB.fmtDateTime(t.at) + "</strong> · " + CB.esc(t.text) + "</li>"; }).join("") ||
      '<li style="' + liStyle + '">No notes yet.</li>';
    var closed = d.status === "closed";
    aside.style.opacity = canAct && !closed ? "1" : "0.6";
    amount.value = d.refund_amount != null ? d.refund_amount : "";
    msg.value = d.resolution_note || "";
    outcome.value = d.outcome || "full";
    resolve.textContent = closed ? "Case closed" : "Resolve case";
    assign.style.display = closed ? "none" : "";
  }

  async function save(patch, verb, d) {
    var u = await CB.sb.from("disputes").update(patch).eq("id", d.id);
    if (u.error) { CB.fail(u.error); return false; }
    Object.assign(d, patch);
    await CB.audit(verb, CB.code("CS", d.seq));
    return true;
  }
  assign.addEventListener("click", async function (e) {
    e.preventDefault();
    var d = find(); if (!d || !canAct) return;
    var u = await CB.sb.from("disputes").update({ assigned_to: CB.me.user_id, status: d.status === "open" ? "under_review" : d.status }).eq("id", d.id);
    if (u.error) return CB.fail(u.error);
    d.assigned_to = CB.me.user_id; d.admin_users = { full_name: CB.me.full_name, email: CB.me.email };
    if (d.status === "open") d.status = "under_review";
    await CB.audit("Took dispute", CB.code("CS", d.seq));
    CB.say("Assigned to you."); drawList(); drawCase();
  });
  resolve.addEventListener("click", async function (e) {
    e.preventDefault();
    var d = find(); if (!d || !canAct || d.status === "closed") return;
    var refund = outcome.value === "full" ? (d.token_amount || 0) : outcome.value === "none" ? 0 : Number(amount.value);
    if (outcome.value === "partial" && (!amount.value || refund <= 0)) return CB.say("Enter the refund amount.", true);
    if (d.token_amount != null && refund > d.token_amount) return CB.say("The refund cannot be more than the token paid.", true);
    var tl = (d.timeline || []).concat([{ at: new Date().toISOString(), text: "Resolved by " + (CB.me.full_name || CB.me.email) + ": " + (outcome.options[outcome.selectedIndex].text) + (msg.value.trim() ? ". " + msg.value.trim() : "") }]);
    var ok = await save({ status: "closed", outcome: outcome.value, refund_amount: refund, resolution_note: msg.value.trim() || null, resolved_at: new Date().toISOString(), timeline: tl, assigned_to: d.assigned_to || CB.me.user_id }, "Resolved dispute", d);
    if (!ok) return;
    if (flagBox.checked && d.provider_id) {
      var f = await CB.sb.from("safety_flags").insert({ subject_kind: "provider", subject_name: CB.providerName(d.providers), provider_id: d.provider_id, flag_type: "Dispute: " + d.type, evidence: "From case " + CB.code("CS", d.seq), severity: "medium" });
      if (f.error) CB.fail(f.error);
    }
    CB.say("Case resolved."); drawList(); drawCase();
  });
  tbody.addEventListener("click", function (e) {
    var tr = e.target.closest && e.target.closest("tr[data-id]");
    if (tr && mode === 0) { selected = tr.getAttribute("data-id"); drawCase(); }
  });
  CB.tabs(main.querySelector('[role="tablist"]'), function (i) { mode = i; drawList(); drawCase(); });
  drawList(); drawCase();
});
