CB.page(async function () {
  var main = document.querySelector("main");
  var r = await CB.sb.from("providers")
    .select("id,type,full_name,studio_name,mobile,categories,status,created_at,towns(name,district)")
    .order("created_at", { ascending: false }).limit(500);
  if (r.error) throw r.error;
  var rows = r.data;

  // Tiles
  function tile(label, v) {
    Array.prototype.forEach.call(main.querySelectorAll("div"), function (d) {
      if (d.children.length === 2 && d.children[0].textContent.trim() === label) d.children[1].textContent = v;
    });
  }
  function count(f) { return rows.filter(f).length; }
  tile("Verified", count(function (p) { return p.status === "verified"; }));
  tile("Pending verification", count(function (p) { return p.status === "pending"; }));
  tile("Studios", count(function (p) { return p.type === "studio"; }));
  tile("Suspended", count(function (p) { return p.status === "suspended"; }));

  var q = main.querySelector('input[type="search"]');
  var fd = CB.field("District", main), ft = CB.field("Type", main), fs = CB.field("Status", main);
  CB.setOptions(fd, CB.DISTRICTS, "All");
  CB.setOptions(ft, [["individual", "Individual"], ["studio", "Studio"]], "All");
  CB.setOptions(fs, Object.keys(CB.PROVIDER_STATUS).map(function (k) { return [k, CB.PROVIDER_STATUS[k][0]]; }), "All");
  var tbody = main.querySelector("tbody");

  function draw() {
    var s = q.value.trim().toLowerCase();
    var list = rows.filter(function (p) {
      if (fd.value && (!p.towns || p.towns.district !== fd.value)) return false;
      if (ft.value && p.type !== ft.value) return false;
      if (fs.value && p.status !== fs.value) return false;
      if (s && (p.full_name + " " + (p.studio_name || "") + " " + (p.mobile || "")).toLowerCase().indexOf(s) < 0) return false;
      return true;
    });
    tbody.innerHTML = list.length ? list.map(function (p) {
      var loc = p.towns ? CB.esc(p.towns.name) + " · " + CB.esc(p.towns.district) : "–";
      var label = p.status === "pending" || p.status === "draft" ? "Review" : "View";
      return CB.tr([
        CB.td(CB.esc(CB.providerName(p)) + (p.studio_name ? '<div style="font-weight: 400; font-size: 13px; color: #57534E">' + CB.esc(p.full_name) + "</div>" : ""), true),
        CB.td(p.type === "studio" ? "Studio" : "Individual"), CB.td(loc),
        CB.td(CB.esc((p.categories || []).join(", ") || "–")), CB.td(CB.providerBadge(p.status)),
        CB.td('<a href="AdminReview.html?id=' + p.id + '">' + label + "</a>")
      ]);
    }).join("") : CB.emptyRow(6, rows.length ? "No providers match these filters." : "No providers yet. Use Enroll new to add the first one.");
  }
  [q, fd, ft, fs].forEach(function (el) { el.addEventListener("input", draw); el.addEventListener("change", draw); });
  draw();
});
