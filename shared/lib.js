// Shared by the customer and photographer apps. Plain JavaScript, no build step.
(function () {
  var cfg = window.CB_CONFIG || {};
  var sb = window.supabase.createClient(cfg.url, cfg.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });
  var A = { sb: sb, config: null };

  // ---------- small DOM helper ----------
  A.h = function (tag, attrs) {
    var el = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k === "html") el.innerHTML = v;
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null || c === false) continue;
      (Array.isArray(c) ? c : [c]).forEach(function (x) {
        if (x == null || x === false) return;
        el.appendChild(typeof x === "string" ? document.createTextNode(x) : x);
      });
    }
    return el;
  };
  var h = A.h;
  A.clear = function (el) { while (el.firstChild) el.removeChild(el.firstChild); return el; };

  // ---------- messages ----------
  var tt;
  A.toast = function (text, bad) {
    var t = document.getElementById("toast");
    if (!t) { t = h("div", { id: "toast", role: "status" }); document.body.appendChild(t); }
    t.textContent = text; t.className = "toast show" + (bad ? " bad" : "");
    clearTimeout(tt); tt = setTimeout(function () { t.className = "toast"; }, bad ? 7000 : 3500);
  };
  A.fail = function (e) { A.toast((e && e.message) || String(e), true); };

  // ---------- data ----------
  A.rpc = async function (name, args) {
    var r = await sb.rpc(name, args || {});
    if (r.error) throw new Error(r.error.message);
    return r.data;
  };

  // ---------- formatting ----------
  A.inr = function (n) { return n == null ? "–" : "₹" + Number(n).toLocaleString("en-IN"); };
  A.date = function (d) {
    if (!d) return "–";
    var x = new Date(String(d).length === 10 ? d + "T00:00:00" : d);
    return x.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  };
  A.left = function (ts) {
    if (!ts) return "";
    var m = Math.round((new Date(ts).getTime() - Date.now()) / 6e4);
    if (m <= 0) return "Closed";
    if (m < 60) return m + " min left";
    var hrs = Math.round(m / 60);
    return hrs < 48 ? hrs + " h left" : Math.round(hrs / 24) + " days left";
  };
  A.statusLabel = function (s) { return ({ open: "Open", widened: "Widened", confirmed: "Confirmed", expired: "Expired", cancelled: "Cancelled", delivered: "Delivered", active: "Active", won: "Chosen", rejected: "Rejected", withdrawn: "Withdrawn" })[s] || s; };
  A.badge = function (s) { return h("span", { class: "badge b-" + s, text: A.statusLabel(s) }); };

  // ---------- links ----------
  // Google Maps is used only as a link. It opens the Google Maps app (or the website) and costs nothing.
  A.directionsUrl = function (lat, lng) {
    return "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(lat + "," + lng);
  };
  A.searchUrl = function (q) { return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q); };
  A.telUrl = function (n) { return "tel:+91" + String(n).replace(/\D/g, "").slice(-10); };

  // ---------- sign in with mobile OTP ----------
  A.signInScreen = function (root, title, onDone) {
    A.clear(root);
    var msg = h("p", { class: "err", role: "alert" });
    var phone = h("input", { id: "ph", type: "tel", inputmode: "numeric", maxlength: "10", autocomplete: "tel-national", placeholder: "10-digit mobile number" });
    var code = h("input", { id: "otp", type: "text", inputmode: "numeric", maxlength: "6", autocomplete: "one-time-code", placeholder: "6-digit code" });
    var sendBtn = h("button", { class: "btn", type: "submit", text: "Send code" });
    var verifyBtn = h("button", { class: "btn", type: "submit", text: "Verify and continue" });
    var number = "";
    var f1 = h("form", { class: "stack" },
      h("label", { for: "ph", text: "Mobile number" }),
      h("div", { class: "phone" }, h("span", { text: "+91" }), phone), sendBtn);
    var f2 = h("form", { class: "stack", hidden: true },
      h("label", { for: "otp", text: "Code sent by SMS" }), code, verifyBtn,
      h("button", { class: "link", type: "button", text: "Use a different number", onclick: function () { f2.hidden = true; f1.hidden = false; msg.textContent = ""; } }));
    f1.addEventListener("submit", async function (e) {
      e.preventDefault(); msg.textContent = "";
      var n = phone.value.replace(/\D/g, "");
      if (!/^[6-9]\d{9}$/.test(n)) { msg.textContent = "Enter a 10-digit Indian mobile number."; return; }
      sendBtn.disabled = true;
      var r = await sb.auth.signInWithOtp({ phone: "+91" + n });
      sendBtn.disabled = false;
      if (r.error) { msg.textContent = "Could not send the code. " + r.error.message; return; }
      number = "+91" + n; f1.hidden = true; f2.hidden = false; code.focus();
    });
    f2.addEventListener("submit", async function (e) {
      e.preventDefault(); msg.textContent = "";
      verifyBtn.disabled = true;
      var r = await sb.auth.verifyOtp({ phone: number, token: code.value.trim(), type: "sms" });
      verifyBtn.disabled = false;
      if (r.error) { msg.textContent = "That code is not correct. Check the SMS and try again."; code.value = ""; return; }
      onDone();
    });
    root.appendChild(h("main", { class: "auth" },
      h("div", { class: "brand", html: "Click<span>Breeze</span>" }),
      h("h1", { text: title }),
      h("p", { class: "muted", text: "We will send a code to your mobile number." }),
      f1, f2, msg));
  };
  A.signOut = async function () { await sb.auth.signOut(); location.reload(); };
  A.session = async function () { return (await sb.auth.getSession()).data.session; };

  // ---------- maps: MapLibre GL JS (bundled in vendor/) + OpenFreeMap + Photon ----------
  A.STYLE = "https://tiles.openfreemap.org/styles/liberty";
  A.TN_CENTER = [78.4, 10.8];
  A.TN_BBOX = [76.2, 8.0, 80.4, 13.6]; // west, south, east, north
  A.inTN = function (lng, lat) { return lng >= 76 && lng <= 80.5 && lat >= 8 && lat <= 13.6; };

  A.newMap = function (el, opts) {
    opts = opts || {};
    if (!window.maplibregl) { el.textContent = "The map could not load."; return null; }
    var map = new maplibregl.Map({
      container: el, style: opts.style || A.STYLE, center: opts.center || A.TN_CENTER, zoom: opts.zoom || 7,
      attributionControl: false, dragRotate: false, pitchWithRotate: false
    });
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: "OpenFreeMap © OpenMapTiles · Data from OpenStreetMap" }));
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.touchZoomRotate.disableRotation();
    var warned = false;
    map.on("error", function () {
      if (warned) return; warned = true;
      A.toast("The map needs an internet connection.", true);
    });
    el._map = map;
    map._ready = new Promise(function (res) { map.once("load", res); });
    return map;
  };

  function circlePolygon(lng, lat, km) {
    var pts = [], n = 48;
    for (var i = 0; i <= n; i++) {
      var a = (i / n) * 2 * Math.PI;
      var dLat = (km / 111) * Math.cos(a);
      var dLng = (km / (111 * Math.max(Math.cos(lat * Math.PI / 180), 0.2))) * Math.sin(a);
      pts.push([lng + dLng, lat + dLat]);
    }
    return { type: "Polygon", coordinates: [pts] };
  }
  A.circlePolygon = circlePolygon;

  // items: [{lng, lat, km, selected}]
  A.drawCircles = async function (map, items) {
    await map._ready;
    var data = { type: "FeatureCollection", features: items.map(function (x) {
      return { type: "Feature", properties: { sel: x.selected ? 1 : 0 }, geometry: circlePolygon(x.lng, x.lat, x.km || 2) };
    }) };
    var src = map.getSource("cb-circles");
    if (src) { src.setData(data); return; }
    map.addSource("cb-circles", { type: "geojson", data: data });
    map.addLayer({ id: "cb-circles-fill", type: "fill", source: "cb-circles", paint: { "fill-color": ["case", ["==", ["get", "sel"], 1], "#C2410C", "#FB923C"], "fill-opacity": 0.18 } });
    map.addLayer({ id: "cb-circles-line", type: "line", source: "cb-circles", paint: { "line-color": "#C2410C", "line-width": 1.5 } });
  };

  // A price tag on the map. Returns the marker so the caller can remove it.
  A.pill = function (map, o) {
    var el = h("button", { type: "button", class: "pill" + (o.selected ? " sel" : "") + (o.muted ? " muted" : ""), text: o.text, "aria-label": o.label || o.text });
    el.addEventListener("click", function (e) { e.stopPropagation(); if (o.onClick) o.onClick(); });
    return new maplibregl.Marker({ element: el }).setLngLat([o.lng, o.lat]).addTo(map);
  };

  // A pin that can be dragged. onMove gets {lng, lat}.
  A.pin = function (map, lng, lat, onMove) {
    var el = h("div", { class: "pin", role: "img", "aria-label": "Pin. Drag to move." });
    var m = new maplibregl.Marker({ element: el, draggable: !!onMove, anchor: "bottom" }).setLngLat([lng, lat]).addTo(map);
    if (onMove) m.on("dragend", function () { var p = m.getLngLat(); onMove({ lng: p.lng, lat: p.lat }); });
    return m;
  };

  // Photon (Komoot, OpenStreetMap data) place search, limited to Tamil Nadu.
  A.searchPlaces = async function (q) {
    var url = "https://photon.komoot.io/api/?lang=en&limit=8&q=" + encodeURIComponent(q + " Tamil Nadu") + "&bbox=" + A.TN_BBOX.join(",");
    var r = await fetch(url);
    if (!r.ok) throw new Error("Place search is not available right now.");
    var j = await r.json();
    return (j.features || []).filter(function (f) {
      var p = f.properties || {};
      return (!p.state || p.state === "Tamil Nadu") && f.geometry && A.inTN(f.geometry.coordinates[0], f.geometry.coordinates[1]);
    }).map(function (f) {
      var p = f.properties, parts = [p.name, p.district || p.county, p.state].filter(Boolean);
      return { label: parts.join(", "), name: p.name || "", lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] };
    });
  };

  // Search box with a result list. onPick gets {label, name, lng, lat}.
  A.placeSearch = function (placeholder, onPick) {
    var list = h("ul", { class: "results", hidden: true, role: "listbox" });
    var input = h("input", { type: "search", class: "search", placeholder: placeholder, "aria-label": placeholder, autocomplete: "off" });
    var timer;
    input.addEventListener("input", function () {
      clearTimeout(timer);
      var q = input.value.trim();
      if (q.length < 3) { list.hidden = true; return; }
      timer = setTimeout(async function () {
        try {
          var res = await A.searchPlaces(q);
          A.clear(list);
          if (!res.length) list.appendChild(h("li", { class: "muted", text: "No place found in Tamil Nadu." }));
          res.forEach(function (p) {
            list.appendChild(h("li", { role: "option", tabindex: "0", text: p.label, onclick: function () { input.value = p.label; list.hidden = true; onPick(p); } }));
          });
          list.hidden = false;
        } catch (e) { A.fail(e); }
      }, 400);
    });
    return h("div", { class: "searchbox" }, input, list);
  };

  A.locate = function (onPos) {
    if (!navigator.geolocation) return A.toast("Location is not available on this phone.", true);
    navigator.geolocation.getCurrentPosition(function (p) {
      if (!A.inTN(p.coords.longitude, p.coords.latitude)) return A.toast("You are outside Tamil Nadu. Search for a place instead.", true);
      onPos({ lng: p.coords.longitude, lat: p.coords.latitude });
    }, function () { A.toast("Could not get your location. Allow location or search for a place.", true); }, { enableHighAccuracy: true, timeout: 15000 });
  };

  // ---------- app shell ----------
  // tabs: [{id, label, render(view)}]. Hash routes: #/tab or #/tab/extra
  A.shell = function (root, tabs, name) {
    A.clear(root);
    var view = h("div", { class: "view" });
    var nav = h("nav", { class: "tabs", "aria-label": name }, tabs.map(function (t) {
      return h("a", { href: "#/" + t.id, "data-tab": t.id, text: t.label });
    }));
    root.appendChild(h("div", { class: "shell" }, view, nav));
    function route() {
      var parts = (location.hash || "").replace(/^#\/?/, "").split("/");
      var t = tabs.filter(function (x) { return x.id === parts[0]; })[0] || tabs[0];
      Array.prototype.forEach.call(nav.children, function (a) { a.setAttribute("aria-current", a.getAttribute("data-tab") === t.id ? "page" : "false"); });
      A.clear(view); view.scrollTop = 0;
      Promise.resolve(t.render(view, parts.slice(1))).catch(A.fail);
    }
    window.addEventListener("hashchange", route);
    route();
    return { refresh: route };
  };
  A.go = function (hash) { location.hash = hash; };

  A.card = function () { return h.apply(null, ["div", { class: "card" }].concat([].slice.call(arguments))); };
  A.empty = function (text) { return h("p", { class: "empty", text: text }); };
  A.loading = function (view) { view.appendChild(h("p", { class: "muted", text: "Loading…" })); };

  // Confirm in place of window.confirm(), which many phone webviews block.
  A.ask = function (text, yes, onYes) {
    var dlg = h("div", { class: "overlay", role: "dialog", "aria-modal": "true" },
      h("div", { class: "sheet" }, h("p", { text: text }),
        h("div", { class: "row" },
          h("button", { class: "btn ghost", type: "button", text: "Cancel", onclick: function () { dlg.remove(); } }),
          h("button", { class: "btn", type: "button", text: yes, onclick: function () { dlg.remove(); onYes(); } }))));
    document.body.appendChild(dlg);
  };
  A.sheet = function (content) {
    var dlg = h("div", { class: "overlay", role: "dialog", "aria-modal": "true", onclick: function (e) { if (e.target === dlg) dlg.remove(); } },
      h("div", { class: "sheet" }, content));
    document.body.appendChild(dlg);
    dlg.close = function () { dlg.remove(); };
    return dlg;
  };

  window.CBA = A;
})();
