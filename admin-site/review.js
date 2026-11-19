CB.page(async function () {
  var main = document.querySelector("main");
  var id = new URLSearchParams(location.search).get("id");
  var h1 = main.querySelector("h1");
  if (!id) { h1.textContent = "No provider chosen"; return; }
  var r = await CB.sb.from("providers").select("*,towns(name,district,state)").eq("id", id).maybeSingle();
  if (r.error) throw r.error;
  var p = r.data;
  if (!p) { h1.textContent = "Provider not found"; return; }

  function setH1() {
    h1.firstChild.nodeValue = CB.providerName(p) + " ";
    var sp = h1.querySelector("span");
    sp.outerHTML = CB.providerBadge(p.status);
  }
  setH1();

  function dd(label, text) {
    Array.prototype.forEach.call(main.querySelectorAll("dt"), function (d) {
      if (d.textContent.trim() === label) d.nextElementSibling.textContent = text;
    });
  }
  var pk = (p.packages || [])[0];
  dd("Type", p.type === "studio" ? "Studio" : "Individual photographer");
  dd("Mobile", p.mobile ? "+91 " + p.mobile.slice(0, 5) + " " + p.mobile.slice(5) + " · entered by admin, not OTP-checked" : "Not added");
  dd("Location", p.towns ? p.towns.name + ", " + p.towns.district + ", " + p.towns.state : "Not set");
  dd("Experience", p.experience_years == null ? "Not given" : p.experience_years + " years");
  dd("Categories", (p.categories || []).join(", ") || "None chosen");
  dd("Packages", pk ? pk.name + (pk.price != null ? " from ₹" + pk.price : "") + (pk.days != null ? " · " + pk.days + " delivery days" : "") + ((p.packages || []).length > 1 ? " (+" + (p.packages.length - 1) + " more)" : "") : "None added");
  dd("Registered", "Added on " + CB.fmtDate(p.created_at));

  // Duplicate and history checks
  var since = new Date(Date.now() - 30 * 864e5).toISOString();
  var dm = p.mobile ? await CB.sb.from("providers").select("id", { count: "exact", head: true }).eq("mobile", p.mobile).neq("id", id) : { count: 0 };
  var fl = await CB.sb.from("safety_flags").select("id", { count: "exact", head: true }).eq("provider_id", id).gte("created_at", since);
  function chk(label, text) {
    Array.prototype.forEach.call(main.querySelectorAll("section div"), function (d) {
      var s = d.children.length === 2 && d.children[0].tagName === "SPAN" && d.children[1].tagName === "SPAN";
      if (s && d.children[0].textContent.trim() === label) d.children[1].textContent = text;
    });
  }
  chk("Same ID proof on another account", "Not checked (ID numbers are not stored)");
  chk("Same phone or device on another account", dm.count ? dm.count + " found" : "None");
  chk("Reports from customers (last 30 days)", String(fl.count || 0));
  chk("Customers who blocked this provider", "Not tracked yet");

  // Checklist and notes
  var aside = main.querySelector("aside");
  var boxes = aside.querySelectorAll('input[type="checkbox"]');
  Array.prototype.forEach.call(boxes, function (b, i) { b.checked = !!(p.checklist || [])[i]; });
  var notes = CB.field("Notes (visible to admins only)", aside);
  notes.value = p.admin_notes || "";

  var links = aside.querySelectorAll("a");
  var approve = links[0], changes = links[1], reject = links[2];
  [approve, changes, reject].forEach(function (a) { a.setAttribute("href", "#"); a.setAttribute("role", "button"); });
  var canReview = CB.can(["super_admin", "verifier"]);
  if (!canReview) { aside.style.opacity = "0.6"; CB.say("Your role can view this page but not decide.", true); }

  async function decide(status, needsReason, verb, skipCheck) {
    if (!canReview) return;
    if (needsReason && !notes.value.trim()) return CB.say("Write the reason in Notes first.", true);
    var checklist = Array.prototype.map.call(boxes, function (b) { return b.checked; });
    if (status === "verified" && !skipCheck && checklist.indexOf(false) > -1) return CB.say("Tick every item on the checklist before approving.", true);
    var u = await CB.sb.from("providers").update({ status: status, admin_notes: notes.value.trim() || null, checklist: checklist }).eq("id", id);
    if (u.error) return CB.fail(u.error);
    await CB.audit(verb, CB.providerName(p));
    CB.say("Saved.");
    setTimeout(function () { CB.go("AdminList.html"); }, 600);
  }
  approve.addEventListener("click", function (e) { e.preventDefault(); decide("verified", false, "Approved provider"); });
  changes.addEventListener("click", function (e) { e.preventDefault(); decide("changes_requested", true, "Requested changes from provider"); });
  reject.addEventListener("click", function (e) { e.preventDefault(); decide("rejected", true, "Rejected provider"); });

  // Suspend / reinstate (super admin only)
  if (CB.can(["super_admin"]) && (p.status === "verified" || p.status === "suspended")) {
    var sus = reject.cloneNode(true);
    var isSus = p.status === "suspended";
    sus.textContent = isSus ? "Reinstate provider" : "Suspend provider";
    reject.parentNode.insertBefore(sus, reject.nextSibling);
    sus.addEventListener("click", function (e) {
      e.preventDefault();
      if (!isSus && !notes.value.trim()) return CB.say("Write the reason in Notes first.", true);
      decide(isSus ? "verified" : "suspended", false, isSus ? "Reinstated provider" : "Suspended provider", true);
    });
  }
});
