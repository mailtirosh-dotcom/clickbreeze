CB.page(async function () {
  var main = document.querySelector("main");
  var canAct = CB.can(["super_admin", "support"]);
  var r = await CB.sb.from("safety_flags").select("*").order("created_at", { ascending: false }).limit(300);
  if (r.error) throw r.error;
  var rows = r.data, selected = null;

  var ff = CB.field("Flag type", main), fv = CB.field("Severity", main), fs = CB.field("Status", main);
  var base = ["Repeated customer reports", "Suspected shill bidding", "Duplicate account", "Phone number shared in chat", "OTP abuse"];
  var types = base.slice();
  rows.forEach(function (x) { if (types.indexOf(x.flag_type) < 0) types.push(x.flag_type); });
  CB.setOptions(ff, types, "All");
  CB.setOptions(fv, [["high", "High"], ["medium", "Medium"], ["low", "Low"]], "All");
  CB.setOptions(fs, [["open", "Open"], ["dismissed", "Dismissed"], ["action_taken", "Action taken"]], "All");
  fs.value = "open";

  var tbody = main.querySelector("tbody");
  var flH = document.getElementById("fl-h"), ul = flH.parentNode.querySelector("ul");
  var liStyle = ul.querySelector("li").getAttribute("style");
  var split = flH.parentNode.parentNode, aside = split.querySelector("aside");
  var decision = CB.field("Decision", aside), notes = CB.field("Notes (admins only)", aside);
  var save = aside.querySelector("a"); save.setAttribute("href", "#"); save.setAttribute("role", "button");
  CB.setOptions(decision, [["warn", "Warn the provider"], ["suspend", "Suspend account"], ["dismiss", "Dismiss the flag"]]);
  if (!canAct) aside.style.opacity = "0.6";

  // The rules box is a design for now.
  var rules = document.getElementById("rules-h").parentNode.parentNode;
  Array.prototype.forEach.call(rules.querySelectorAll("div > span:last-child"), function (s) { if (s.parentNode.children.length === 2) s.textContent = "Not connected yet"; });

  var SEV = { high: ["High", "red"], medium: ["Medium", "orange"], low: ["Low", "gray"] };
  var KIND = { provider: "Provider", customer: "Customer", number: "Unregistered number" };
  function find() { return rows.filter(function (x) { return x.id === selected; })[0]; }

  function draw() {
    var list = rows.filter(function (x) {
      return (!ff.value || x.flag_type === ff.value) && (!fv.value || x.severity === fv.value) && (!fs.value || x.status === fs.value);
    });
    tbody.innerHTML = list.length ? list.map(function (x) {
      var sv = SEV[x.severity];
      return CB.tr([CB.td(CB.esc(x.subject_name) + '<div style="font-weight: 400; font-size: 13px; color: #57534E">' + (KIND[x.subject_kind] || "") + "</div>", true),
        CB.td(CB.esc(x.flag_type)), CB.td(CB.esc(x.evidence || "–")), CB.td(CB.badge(sv[0], sv[1])), CB.td(CB.fmtDate(x.created_at)),
        CB.td('<a href="#" data-id="' + x.id + '">Review</a>' + (x.provider_id ? ' &nbsp; <a href="AdminReview.html?id=' + x.provider_id + '">Profile</a>' : ""))]);
    }).join("") : CB.emptyRow(6, rows.length ? "No flags match these filters." : "No safety flags. They appear when the rules in Settings catch something, or when you raise one from a dispute.");
    if (!selected || !list.some(function (x) { return x.id === selected; })) selected = list.length ? list[0].id : null;
    drawDetail();
  }
  function drawDetail() {
    var x = find();
    split.style.display = x ? "" : "none";
    if (!x) return;
    flH.textContent = x.subject_name + " · " + x.flag_type;
    var items = ["<strong>" + CB.fmtDate(x.created_at) + "</strong> · " + CB.esc(x.evidence || "No evidence text.")];
    if (x.decision) items.push("<strong>Decision</strong> · " + CB.esc(x.decision) + (x.notes ? ". " + CB.esc(x.notes) : ""));
    ul.innerHTML = items.map(function (h) { return '<li style="' + liStyle + '">' + h + "</li>"; }).join("");
    notes.value = x.notes || "";
    var done = x.status !== "open";
    aside.style.opacity = canAct && !done ? "1" : "0.6";
    save.textContent = done ? "Decision saved" : "Save decision";
    Array.prototype.forEach.call(decision.options, function (o) { if (o.value === "suspend") o.disabled = !x.provider_id; });
  }

  tbody.addEventListener("click", function (e) {
    var id = e.target.getAttribute && e.target.getAttribute("data-id");
    if (id) { e.preventDefault(); selected = id; drawDetail(); }
  });
  save.addEventListener("click", async function (e) {
    e.preventDefault();
    var x = find(); if (!x || !canAct || x.status !== "open") return;
    var label = decision.options[decision.selectedIndex].text;
    if (decision.value === "suspend") {
      if (!notes.value.trim()) return CB.say("Write the reason in Notes first.", true);
      var s = await CB.sb.from("providers").update({ status: "suspended", admin_notes: notes.value.trim() }).eq("id", x.provider_id);
      if (s.error) return CB.fail(s.error);
      await CB.audit("Suspended provider", x.subject_name);
    }
    var patch = { status: decision.value === "dismiss" ? "dismissed" : "action_taken", decision: label, notes: notes.value.trim() || null, decided_by: CB.me.user_id };
    var u = await CB.sb.from("safety_flags").update(patch).eq("id", x.id);
    if (u.error) return CB.fail(u.error);
    Object.assign(x, patch);
    await CB.audit("Safety flag: " + label, x.subject_name);
    CB.say("Decision saved."); draw();
  });
  [ff, fv, fs].forEach(function (el) { el.addEventListener("change", draw); });
  draw();
});
