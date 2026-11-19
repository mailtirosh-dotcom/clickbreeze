CB.page(async function () {
  var main = document.querySelector("main");
  var tr = await CB.sb.from("towns").select("id,name,district").order("name");
  var cr = await CB.sb.from("categories").select("name").eq("active", true).order("name");
  if (tr.error) throw tr.error;
  var towns = tr.data;

  var dist = CB.field("District", main), town = CB.field("Town / village", main);
  CB.setOptions(dist, CB.DISTRICTS, "Select district");
  function fillTowns() {
    var list = towns.filter(function (t) { return t.district === dist.value; });
    CB.setOptions(town, list.map(function (t) { return [t.id, t.name]; }),
      dist.value && !list.length ? "No towns here yet. Add one in Locations" : "Select town or village");
  }
  dist.addEventListener("change", fillTowns); fillTowns();

  // Categories come from the Locations page list.
  var catFs = Array.prototype.filter.call(main.querySelectorAll("fieldset"), function (f) { return /Categories offered/.test(f.textContent); })[0];
  Array.prototype.forEach.call(catFs.querySelectorAll("label"), function (l) { l.remove(); });
  (cr.data || []).forEach(function (c) {
    var l = document.createElement("label");
    l.style.cssText = "display: flex; align-items: center; gap: 6px; padding: 10px 14px; border-radius: 999px; border: 1px solid #D6D3D1; font-size: 14px";
    l.innerHTML = '<input type="checkbox" value="' + CB.esc(c.name) + '"> ' + CB.esc(c.name);
    catFs.appendChild(l);
  });

  // Packages table.
  var tbody = Array.prototype.filter.call(main.querySelectorAll("table"), function (t) { return t.querySelector("caption"); })[0].querySelector("tbody");
  var inStyle = "height: 40px; width: 100%; box-sizing: border-box; border: 1px solid #A8A29E; border-radius: 8px; padding: 0 8px";
  function addPkg() {
    var r = document.createElement("tr");
    r.style.borderBottom = "1px solid #E7E5E4";
    r.innerHTML = '<td style="padding: 6px 8px"><input aria-label="Package name" style="' + inStyle + '"></td>' +
      '<td style="padding: 6px 8px"><input aria-label="Price from in rupees" type="number" min="0" style="' + inStyle + '"></td>' +
      '<td style="padding: 6px 8px"><input aria-label="Deliverables" style="' + inStyle + '"></td>' +
      '<td style="padding: 6px 8px"><input aria-label="Delivery days" type="number" min="0" style="' + inStyle + '"></td>';
    tbody.appendChild(r);
  }
  tbody.innerHTML = ""; addPkg();
  var addBtn = Array.prototype.filter.call(main.querySelectorAll("button"), function (b) { return /Add package/.test(b.textContent); })[0];
  addBtn.addEventListener("click", addPkg);

  // Not wired yet: file uploads.
  var file = main.querySelector('input[type="file"]');
  file.disabled = true;
  var note = document.createElement("span");
  note.style.cssText = "font-weight: 400; color: #57534E; font-size: 13px";
  note.textContent = "File uploads come later with storage. Do not type ID numbers anywhere.";
  file.parentNode.appendChild(note);
  var st = CB.field("Verification status", main);
  CB.setOptions(st, [["draft", "Draft"], ["pending", "Pending"], ["rejected", "Rejected"]]);

  var btns = Array.prototype.slice.call(document.querySelectorAll("button"));
  var draftBtn = btns.filter(function (b) { return b.textContent.trim() === "Save draft"; })[0];
  var verifyBtn = btns.filter(function (b) { return /Verify/.test(b.textContent); })[0];
  if (!CB.can(["super_admin", "verifier"])) {
    draftBtn.disabled = verifyBtn.disabled = true;
    CB.say("Your role cannot enroll providers.", true);
  }

  async function save(status) {
    var radios = main.querySelectorAll('input[name="ptype"]');
    var name = CB.field("Full name", main).value.trim();
    var mobile = CB.field("Mobile number", main).value.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
    var email = CB.field("Email", main).value.trim();
    var years = CB.field("Years of experience", main).value;
    if (!name) return CB.say("Enter the full name.", true);
    if (mobile && !/^[6-9]\d{9}$/.test(mobile)) return CB.say("Enter a 10-digit Indian mobile number.", true);
    if (email && !/^\S+@\S+\.\S+$/.test(email)) return CB.say("That email does not look right.", true);
    if (status === "verified" && (!mobile || !town.value)) return CB.say("To activate, add the mobile number and choose the town.", true);
    draftBtn.disabled = verifyBtn.disabled = true;
    try {
      if (mobile) {
        var dup = await CB.sb.from("providers").select("id").eq("mobile", mobile).limit(1);
        if (dup.data && dup.data.length) return CB.say("A provider with this mobile number already exists.", true);
      }
      var cats = Array.prototype.map.call(catFs.querySelectorAll("input:checked"), function (i) { return i.value; });
      var pk = Array.prototype.map.call(tbody.querySelectorAll("tr"), function (r) {
        var i = r.querySelectorAll("input");
        return { name: i[0].value.trim(), price: i[1].value ? Number(i[1].value) : null, deliverables: i[2].value.trim(), days: i[3].value ? Number(i[3].value) : null };
      }).filter(function (p) { return p.name; });
      var row = {
        type: radios[1].checked ? "studio" : "individual",
        full_name: name, studio_name: CB.field("Studio name (if any)", main).value.trim() || null,
        mobile: mobile || null, email: email || null, experience_years: years === "" ? null : Number(years),
        town_id: town.value || null, pin: CB.field("PIN code", main).value.trim() || null,
        address: CB.field("Studio / home address", main).value.trim() || null,
        categories: cats, packages: pk, id_proof_type: CB.field("ID proof type", main).value,
        gstin: CB.field("GSTIN (studios, optional)", main).value.trim() || null,
        admin_notes: CB.field("Admin notes", main).value.trim() || null, status: status
      };
      var r = await CB.sb.from("providers").insert(row);
      if (r.error) return CB.fail(r.error);
      await CB.audit(status === "verified" ? "Enrolled and approved provider" : "Saved provider as " + status, row.studio_name || name);
      CB.say("Saved.");
      setTimeout(function () { CB.go("AdminList.html"); }, 700);
    } finally {
      draftBtn.disabled = verifyBtn.disabled = !CB.can(["super_admin", "verifier"]);
    }
  }
  draftBtn.addEventListener("click", function () { save(st.value === "rejected" ? "rejected" : st.value); });
  verifyBtn.addEventListener("click", function () { save("verified"); });
});
