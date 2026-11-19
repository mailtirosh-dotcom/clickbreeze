CB.page(async function () {
  var main = document.querySelector("main");
  var isSuper = CB.can(["super_admin"]);
  var team = [], pending = null;
  var ROLE = { super_admin: ["Super admin", "green"], verifier: ["Verifier", "blue"], support: ["Support", "gray"] };

  var tsec = document.getElementById("team-h").parentNode, tbody = tsec.querySelector("tbody");
  tsec.style.overflowX = "auto";
  var aside = main.querySelector("aside");
  var email = CB.field("Email", aside), role = CB.field("Role", aside);
  CB.setOptions(role, [["verifier", "Verifier"], ["support", "Support"], ["super_admin", "Super admin"]]);
  var add = aside.querySelector("a"); add.textContent = "Add to team"; add.setAttribute("href", "#"); add.setAttribute("role", "button");
  aside.querySelector("h2").textContent = "Add a team member";
  var help = document.createElement("p");
  help.style.cssText = "margin: 0; font-size: 13px; color: #57534E";
  help.textContent = "First create their sign-in in Supabase (Authentication, Users, Auto Confirm User). Then add their email here to give them a role.";
  add.parentNode.insertBefore(help, add.nextSibling);
  if (!isSuper) aside.style.opacity = "0.6";

  async function load() {
    var r = await CB.sb.rpc("admin_team");
    if (r.error) throw r.error;
    team = r.data;
    draw();
  }
  function draw() {
    tbody.innerHTML = team.map(function (m) {
      var rl = ROLE[m.role] || [m.role, "gray"], me = m.user_id === CB.me.user_id;
      var roleCell = pending === m.user_id
        ? '<select data-role="' + m.user_id + '" aria-label="Role" style="height: 36px; border: 1px solid #A8A29E; border-radius: 8px">' + Object.keys(ROLE).map(function (k) { return '<option value="' + k + '"' + (k === m.role ? " selected" : "") + ">" + ROLE[k][0] + "</option>"; }).join("") + "</select>"
        : CB.badge(rl[0], rl[1]);
      var act = !isSuper ? "–" : me ? "You" :
        '<span style="white-space: nowrap"><a href="#" data-edit="' + m.user_id + '">' + (pending === m.user_id ? "Save" : "Edit") + '</a><br><a href="#" data-reset="' + m.user_id + '">Reset authenticator</a></span>';
      return CB.tr([CB.td(CB.esc(m.full_name || m.email) + '<div style="font-weight: 400; font-size: 13px; color: #57534E">' + CB.esc(m.email) + "</div>", true),
        CB.td(roleCell), CB.td(m.last_active ? CB.fmtDateTime(m.last_active) : "Never"),
        CB.td(CB.badge(m.authenticator ? "On" : "Not set up", m.authenticator ? "green" : "orange")), CB.td(act)]);
    }).join("") || CB.emptyRow(5, "No team members.");
  }
  var resetAsk = null;
  tbody.addEventListener("click", async function (e) {
    var t = e.target; if (t.tagName !== "A") return;
    e.preventDefault();
    var ed = t.getAttribute("data-edit"), rs = t.getAttribute("data-reset");
    if (ed) {
      if (pending !== ed) { pending = ed; return draw(); }
      var val = tbody.querySelector('select[data-role="' + ed + '"]').value;
      var m = team.filter(function (x) { return x.user_id === ed; })[0];
      var u = await CB.sb.from("admin_users").update({ role: val }).eq("user_id", ed);
      if (u.error) return CB.fail(u.error);
      await CB.audit("Changed team role to " + ROLE[val][0], m.email);
      pending = null; CB.say("Saved."); return load();
    }
    if (rs) {
      var mem = team.filter(function (x) { return x.user_id === rs; })[0];
      if (resetAsk !== rs) { resetAsk = rs; t.textContent = "Confirm: sign them out and reset?"; return; }
      resetAsk = null;
      var x = await CB.sb.rpc("reset_authenticator", { p_user: rs });
      if (x.error) return CB.fail(x.error);
      await CB.audit("Reset authenticator", mem.email);
      CB.say("Reset. They will set up a new authenticator at next sign-in."); load();
    }
  });
  add.addEventListener("click", async function (e) {
    e.preventDefault();
    if (!isSuper) return CB.say("Only a super admin can add team members.", true);
    if (!/^\S+@\S+\.\S+$/.test(email.value.trim())) return CB.say("Enter their email.", true);
    var x = await CB.sb.rpc("add_admin", { p_email: email.value.trim(), p_role: role.value, p_name: null });
    if (x.error) return CB.fail(x.error);
    await CB.audit("Added team member as " + ROLE[role.value][0], email.value.trim());
    email.value = ""; CB.say("Added."); load(); loadAudit();
  });

  // Audit log
  var asec = document.getElementById("audit-h").parentNode, abody = asec.querySelector("tbody");
  async function loadAudit() {
    var r = await CB.sb.from("audit_log").select("at,admin_name,action,record").order("at", { ascending: false }).limit(50);
    if (r.error) return CB.fail(r.error);
    abody.innerHTML = r.data.length ? r.data.map(function (a) {
      return CB.tr([CB.td(CB.fmtDateTime(a.at)), CB.td(CB.esc(a.admin_name || "–")), CB.td(CB.esc(a.action)), CB.td(CB.esc(a.record || "–"))]);
    }).join("") : CB.emptyRow(4, "No activity yet.");
  }
  CB.tabs(main.querySelector('[role="tablist"]'), function (i) { (i === 0 ? tsec : asec).scrollIntoView({ behavior: "smooth", block: "start" }); });
  await Promise.all([load(), loadAudit()]);
});
