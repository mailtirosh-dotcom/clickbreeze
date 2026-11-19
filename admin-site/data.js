// Shared helpers for the live admin pages. Loaded after auth.js.
(function () {
  var CB = window.CB;

  CB.DISTRICTS = ["Ariyalur", "Chengalpattu", "Chennai", "Coimbatore", "Cuddalore", "Dharmapuri", "Dindigul", "Erode", "Kallakurichi", "Kancheepuram", "Kanyakumari", "Karur", "Krishnagiri", "Madurai", "Mayiladuthurai", "Nagapattinam", "Namakkal", "Nilgiris", "Perambalur", "Pudukkottai", "Ramanathapuram", "Ranipet", "Salem", "Sivaganga", "Tenkasi", "Thanjavur", "Theni", "Thoothukudi", "Tiruchirappalli", "Tirunelveli", "Tirupathur", "Tiruppur", "Tiruvallur", "Tiruvannamalai", "Tiruvarur", "Vellore", "Viluppuram", "Virudhunagar"];

  CB.esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

  var BADGE = {
    orange: ["#FFEDD5", "#9A3412"], green: ["#CCFBF1", "#115E59"], gray: ["#E7E5E4", "#44403C"],
    red: ["#FEE2E2", "#B91C1C"], blue: ["#E0F2FE", "#075985"]
  };
  CB.badge = function (label, kind) {
    var b = BADGE[kind] || BADGE.gray;
    return '<span style="padding: 4px 10px; border-radius: 999px; background: ' + b[0] + '; color: ' + b[1] + '; font-weight: 600; font-size: 13px; white-space: nowrap">' + CB.esc(label) + "</span>";
  };

  CB.PROVIDER_STATUS = {
    draft: ["Draft", "gray"], pending: ["Pending", "orange"], changes_requested: ["Changes requested", "blue"],
    verified: ["Verified", "green"], rejected: ["Rejected", "red"], suspended: ["Suspended", "gray"]
  };
  CB.providerBadge = function (s) { var x = CB.PROVIDER_STATUS[s] || [s, "gray"]; return CB.badge(x[0], x[1]); };
  CB.providerName = function (p) { return p ? (p.studio_name || p.full_name) : "–"; };

  CB.td = function (html, bold) {
    return '<td style="padding: 12px 16px' + (bold ? "; font-weight: 600" : "") + '">' + html + "</td>";
  };
  CB.tr = function (cells, attrs) {
    return '<tr style="border-top: 1px solid #E7E5E4"' + (attrs || "") + ">" + cells.join("") + "</tr>";
  };
  CB.emptyRow = function (cols, text) {
    return '<tr style="border-top: 1px solid #E7E5E4"><td colspan="' + cols + '" style="padding: 20px 16px; color: #57534E">' + CB.esc(text) + "</td></tr>";
  };

  CB.fmtDate = function (d) {
    if (!d) return "–";
    return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  };
  CB.fmtDateTime = function (d) {
    if (!d) return "–";
    return new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  };
  CB.inr = function (n) { return n == null ? "–" : "₹" + Number(n).toLocaleString("en-IN"); };
  CB.hoursFrom = function (ts) {
    if (!ts) return "–";
    var h = Math.round((new Date(ts).getTime() - Date.now()) / 36e5);
    return h >= 0 ? "In " + h + " h" : "Overdue by " + Math.abs(h) + " h";
  };
  CB.code = function (prefix, seq) { return prefix + "-" + String(seq).padStart(5, "0"); };

  // Finds a form control by the visible text at the start of its <label>.
  CB.field = function (text, scope) {
    var labels = (scope || document).querySelectorAll("label");
    for (var i = 0; i < labels.length; i++) {
      var n = labels[i].firstChild;
      while (n && n.nodeType === 3 && !n.nodeValue.trim()) n = n.nextSibling;
      var t = n && n.nodeType === 3 ? n.nodeValue.trim() : "";
      if (t === text) return labels[i].querySelector("input,select,textarea");
    }
    return null;
  };

  // A small message that stays for a few seconds at the bottom of the screen.
  var tt;
  CB.say = function (text, isError) {
    var el = document.getElementById("cb-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "cb-toast"; el.setAttribute("role", "status");
      el.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);max-width:90vw;padding:12px 18px;border-radius:10px;font:600 14px Inter,sans-serif;z-index:99;box-shadow:0 4px 16px rgba(0,0,0,.25)";
      document.body.appendChild(el);
    }
    el.style.background = isError ? "#B91C1C" : "#115E59";
    el.style.color = "#FFFFFF";
    el.textContent = text;
    el.style.display = "block";
    clearTimeout(tt);
    tt = setTimeout(function () { el.style.display = "none"; }, isError ? 8000 : 4000);
  };

  CB.audit = async function (action, record) {
    var r = await CB.sb.from("audit_log").insert({
      admin_id: CB.me.user_id, admin_name: CB.me.full_name || CB.me.email, action: action, record: record || null
    });
    if (r.error) CB.say("Saved, but the audit log line failed: " + r.error.message, true);
  };

  CB.fail = function (error) { CB.say(error.message || String(error), true); };

  // Page scripts call CB.page(fn): runs fn once sign-in checks pass, then shows the page.
  CB.page = function (fn) {
    CB.defer = true;
    CB.ready.then(fn).catch(function (e) { CB.fail(e); }).then(CB.reveal);
  };

  CB.setOptions = function (sel, values, first) {
    sel.innerHTML = (first ? '<option value="">' + CB.esc(first) + "</option>" : "") +
      values.map(function (v) {
        var val = Array.isArray(v) ? v[0] : v, lab = Array.isArray(v) ? v[1] : v;
        return '<option value="' + CB.esc(val) + '">' + CB.esc(lab) + "</option>";
      }).join("");
  };

  // Makes a row of role="tab" buttons work. fn gets the index of the tab chosen.
  CB.tabs = function (box, fn) {
    var btns = Array.prototype.slice.call(box.querySelectorAll('[role="tab"]'));
    var on = btns.filter(function (b) { return b.getAttribute("aria-selected") === "true"; })[0];
    var off = btns.filter(function (b) { return b !== on; })[0];
    var onS = on.getAttribute("style"), offS = off.getAttribute("style");
    btns.forEach(function (b, i) {
      b.addEventListener("click", function () {
        btns.forEach(function (x) { var s = x === b; x.setAttribute("aria-selected", s); x.setAttribute("style", s ? onS : offS); });
        fn(i);
      });
    });
  };

  CB.can = function (roles) { return roles.indexOf(CB.me.role) > -1; };
})();
