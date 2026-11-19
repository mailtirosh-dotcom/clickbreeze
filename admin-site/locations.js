CB.page(async function () {
  var main = document.querySelector("main");
  var isSuper = CB.can(["super_admin"]);
  var tw = await CB.sb.from("towns").select("id,name,name_ta,district,override").order("name");
  var pv = await CB.sb.from("providers").select("town_id,status").in("status", ["verified", "pending"]).limit(5000);
  var st = await CB.sb.from("settings").select("key,value");
  var ct = await CB.sb.from("categories").select("name,active").order("name");
  [tw, pv, st, ct].forEach(function (x) { if (x.error) throw x.error; });
  var towns = tw.data, provs = pv.data, cats = ct.data;
  var needed = 3;
  st.data.forEach(function (s) { if (s.key === "verified_needed") needed = Number(s.value); });

  // Readiness rule
  var need = CB.field("Verified photographers needed per town", main);
  need.value = needed; need.placeholder = "";
  var gate = document.getElementById("gate-h").parentNode;
  var saveRule = gate.querySelector("a"); saveRule.setAttribute("href", "#"); saveRule.setAttribute("role", "button");
  saveRule.addEventListener("click", async function (e) {
    e.preventDefault();
    var n = parseInt(need.value, 10);
    if (!isSuper) return CB.say("Only a super admin can change this.", true);
    if (!(n >= 1 && n <= 50)) return CB.say("Enter a number from 1 to 50.", true);
    var u = await CB.sb.from("settings").upsert({ key: "verified_needed", value: n, updated_at: new Date().toISOString() });
    if (u.error) return CB.fail(u.error);
    needed = n; await CB.audit("Changed readiness rule to " + n + " verified photographers", "Settings");
    CB.say("Saved."); draw();
  });

  // Filters
  var fState = CB.field("State", main), fDist = CB.field("District", main), fRead = CB.field("Readiness", main);
  CB.setOptions(fState, ["Tamil Nadu"]);
  CB.setOptions(fDist, CB.DISTRICTS, "All");
  CB.setOptions(fRead, [["open", "Open"], ["notready", "Not ready"], ["forced", "Forced open"], ["closed", "Closed"]], "All");
  var tbody = main.querySelector("tbody");

  function info(t) {
    var v = 0, p = 0;
    provs.forEach(function (x) { if (x.town_id === t.id) { if (x.status === "verified") v++; else p++; } });
    var key = t.override === "open" ? "forced" : t.override === "closed" ? "closed" : v >= needed ? "open" : "notready";
    return { v: v, p: p, key: key };
  }
  var LAB = { open: ["Open", "green"], notready: ["Not ready", "orange"], forced: ["Forced open", "blue"], closed: ["Closed", "gray"] };
  var ACT = { open: ["Close town", "closed"], notready: ["Force open", "open"], forced: ["Remove override", null], closed: ["Remove override", null] };

  function draw() {
    var list = towns.filter(function (t) {
      var i = info(t);
      return (!fDist.value || t.district === fDist.value) && (!fRead.value || i.key === fRead.value);
    });
    tbody.innerHTML = list.length ? list.map(function (t) {
      var i = info(t), l = LAB[i.key], a = ACT[i.key];
      var link = isSuper ? '<a href="#" data-id="' + t.id + '" data-set="' + (a[1] || "") + '">' + a[0] + "</a>" : "–";
      return CB.tr([CB.td(CB.esc(t.name) + (t.name_ta ? ' <span style="color: #57534E">(' + CB.esc(t.name_ta) + ")</span>" : ""), true), CB.td(CB.esc(t.district)),
        CB.td(i.v + " of " + needed), CB.td(i.p), CB.td(CB.badge(l[0], l[1])), CB.td(link)]);
    }).join("") : CB.emptyRow(6, towns.length ? "No towns match." : "No towns yet. Add the first one below.");
  }
  tbody.addEventListener("click", async function (e) {
    var id = e.target.getAttribute && e.target.getAttribute("data-id");
    if (!id) return;
    e.preventDefault();
    var val = e.target.getAttribute("data-set") || null;
    var u = await CB.sb.from("towns").update({ override: val }).eq("id", id);
    if (u.error) return CB.fail(u.error);
    var t = towns.filter(function (x) { return x.id === id; })[0];
    t.override = val;
    await CB.audit(val === "closed" ? "Closed town" : val === "open" ? "Forced town open" : "Removed town override", t.name);
    draw();
  });
  fDist.addEventListener("change", draw); fRead.addEventListener("change", draw);

  // Add a town
  var add = document.getElementById("add-h").parentNode;
  var nName = CB.field("Name", add), nTa = CB.field("Name in Tamil", add), nDist = CB.field("District", add);
  CB.setOptions(nDist, CB.DISTRICTS, "Select district");
  var addLink = add.querySelector("a"); addLink.setAttribute("href", "#"); addLink.setAttribute("role", "button");
  addLink.addEventListener("click", async function (e) {
    e.preventDefault();
    if (!isSuper) return CB.say("Only a super admin can add locations.", true);
    if (!nName.value.trim() || !nDist.value) return CB.say("Enter the name and choose the district.", true);
    var row = { name: nName.value.trim(), name_ta: nTa.value.trim() || null, district: nDist.value, state: "Tamil Nadu" };
    var u = await CB.sb.from("towns").insert(row).select("id,name,name_ta,district,override").single();
    if (u.error) return CB.fail(/duplicate/.test(u.error.message) ? { message: "That town is already in this district." } : u.error);
    towns.push(u.data); towns.sort(function (a, b) { return a.name.localeCompare(b.name); });
    await CB.audit("Added location", row.name + ", " + row.district);
    nName.value = ""; nTa.value = "";
    CB.say("Added."); draw();
  });

  // Event categories
  var catSec = document.getElementById("cat-h").parentNode;
  var catRows = Array.prototype.filter.call(catSec.children, function (c) { return c.tagName === "DIV"; });
  var rowStyle = catRows[0].getAttribute("style");
  var addCat = catSec.querySelector(":scope > a");
  catRows.forEach(function (c) { c.remove(); });
  function drawCats() {
    Array.prototype.forEach.call(catSec.querySelectorAll("div[data-cat]"), function (c) { c.remove(); });
    cats.forEach(function (c) {
      var d = document.createElement("div");
      d.setAttribute("data-cat", c.name); d.setAttribute("style", rowStyle);
      d.innerHTML = "<span>" + CB.esc(c.name) + (c.active ? "" : ' <span style="color: #57534E">(off)</span>') + "</span>" + (isSuper ? '<a href="#">' + (c.active ? "Turn off" : "Turn on") + "</a>" : "");
      catSec.insertBefore(d, addCat);
    });
  }
  catSec.addEventListener("click", async function (e) {
    var row = e.target.closest && e.target.closest("div[data-cat]");
    if (!row || e.target.tagName !== "A") return;
    e.preventDefault();
    var c = cats.filter(function (x) { return x.name === row.getAttribute("data-cat"); })[0];
    var u = await CB.sb.from("categories").update({ active: !c.active }).eq("name", c.name);
    if (u.error) return CB.fail(u.error);
    c.active = !c.active; await CB.audit(c.active ? "Turned category on" : "Turned category off", c.name); drawCats();
  });
  addCat.setAttribute("href", "#");
  addCat.addEventListener("click", async function (e) {
    e.preventDefault();
    if (!isSuper) return CB.say("Only a super admin can add categories.", true);
    var box = document.getElementById("cat-new");
    if (!box) {
      box = document.createElement("div");
      box.id = "cat-new"; box.style.cssText = "display:flex;gap:8px;margin-top:8px";
      box.innerHTML = '<input aria-label="New category name" style="flex:1;height:44px;border:1px solid #A8A29E;border-radius:8px;padding:0 12px"><button type="button" style="height:44px;padding:0 16px;border-radius:8px;border:0;background:#C2410C;color:#fff;font-weight:600;cursor:pointer">Add</button>';
      addCat.parentNode.insertBefore(box, addCat.nextSibling);
      box.querySelector("button").addEventListener("click", async function () {
        var name = box.querySelector("input").value.trim();
        if (!name) return CB.say("Enter a category name.", true);
        var u = await CB.sb.from("categories").insert({ name: name });
        if (u.error) return CB.fail(/duplicate/.test(u.error.message) ? { message: "That category already exists." } : u.error);
        cats.push({ name: name, active: true }); await CB.audit("Added category", name); box.remove(); drawCats();
      });
    }
    box.querySelector("input").focus();
  });
  draw(); drawCats();
});
