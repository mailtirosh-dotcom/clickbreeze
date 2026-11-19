// ClickBreeze photographer app
(function () {
  var A = CBA, h = A.h, root = document.getElementById("app");
  var me = null;

  function problem(e, canRetry) {
    A.clear(root);
    root.appendChild(h("main", { class: "auth" }, h("div", { class: "brand", html: "Click<span>Breeze</span>" }), h("h1", { text: "Cannot open your account" }),
      h("p", { class: "err", text: e.message || String(e) }),
      canRetry ? h("button", { class: "btn", text: "Try again", onclick: start }) : null, h("button", { class: "link", text: "Sign out", onclick: A.signOut })));
  }

  async function start() {
    try {
      var s = await A.session();
      if (!s) return A.signInScreen(root, "Photographer sign in", start);
      A.config = await A.rpc("app_config");
      try { me = await A.rpc("link_provider"); } catch (e) { return problem(e, true); }
      A.shell(root, [
        { id: "nearby", label: "Nearby", render: renderNearby },
        { id: "bids", label: "My bids", render: renderBids },
        { id: "bookings", label: "Bookings", render: renderBookings },
        { id: "studio", label: "Studio", render: renderStudio }
      ], "Photographer");
    } catch (e) { problem(e, true); }
  }

  // ---------- Nearby requests ----------
  var reachFilter = "all", feedMode = "list";
  async function renderNearby(view) {
    view.appendChild(h("h1", { text: "Nearby requests" }));
    var feed = await A.rpc("provider_feed");
    var chips = h("div", { class: "chips", role: "group", "aria-label": "Reach" });
    [["all", "All"], ["town", "Town"], ["district", "District"], ["state", "State"]].forEach(function (x) {
      chips.appendChild(h("button", { class: "chip", type: "button", text: x[1], "aria-pressed": String(reachFilter === x[0]), onclick: function () { reachFilter = x[0]; draw(); syncChips(); } }));
    });
    function syncChips() { Array.prototype.forEach.call(chips.children, function (c, i) { c.setAttribute("aria-pressed", String(["all", "town", "district", "state"][i] === reachFilter)); }); }
    var seg = h("div", { class: "seg", role: "group", "aria-label": "View" });
    var bList = h("button", { type: "button", text: "List" }), bMap = h("button", { type: "button", text: "Map" });
    seg.appendChild(bList); seg.appendChild(bMap);
    var body = h("div", { class: "stack" });
    var map = null, markers = [], selected = null, searchPick = null;
    var search = A.placeSearch("Search a town, village or area", function (p) { searchPick = p; setMode("map"); if (map) map.flyTo({ center: [p.lng, p.lat], zoom: 11 }); });
    view.appendChild(search); view.appendChild(chips); view.appendChild(seg); view.appendChild(body);

    function visible() { return feed.filter(function (r) { return reachFilter === "all" || r.reach === reachFilter; }); }
    function sortFeed(list) {
      return list.slice().sort(function (a, b) {
        if (a.distance_km != null && b.distance_km != null) return a.distance_km - b.distance_km;
        return new Date(a.closes_at) - new Date(b.closes_at);
      });
    }
    function card(r) {
      var line = (r.area_name || r.town || "") + (r.district ? ", " + r.district : "");
      return h("div", { class: "card" },
        h("div", { class: "row between" }, h("strong", { text: r.event_type + " · " + A.date(r.event_date) }), h("span", { class: "muted", text: A.left(r.closes_at) })),
        h("div", { class: "muted", text: line + (r.distance_km != null ? " · about " + r.distance_km + " km away" : "") + " · " + r.reach + " reach" }),
        h("div", { class: "row between" },
          h("span", { text: r.bids_count ? r.bids_count + (r.bids_count === 1 ? " bid" : " bids") + " · lowest " + A.inr(r.lowest) : "No bids yet. Be first." }),
          r.my_bid != null ? h("span", { class: "badge b-active", text: "Your bid " + A.inr(r.my_bid) }) : null),
        h("button", { class: "btn small", type: "button", text: r.my_bid != null ? "Lower my bid" : "Place bid", onclick: function () { bidSheet(r, refreshFeed); } }));
    }
    function drawList() {
      A.clear(body);
      var list = sortFeed(visible());
      if (!list.length) { body.appendChild(A.empty(feed.length ? "No requests for this filter." : "No open requests near you right now. Pull down later, new ones arrive often.")); return; }
      list.forEach(function (r) { body.appendChild(card(r)); });
    }
    function drawMap() {
      A.clear(body);
      var box = h("div", { class: "map", role: "region", "aria-label": "Requests on a map" });
      var detail = h("div");
      body.appendChild(box); body.appendChild(h("p", { class: "muted", text: "Circles show an approximate area. You get the exact address after the customer confirms." })); body.appendChild(detail);
      var c0 = searchPick ? [searchPick.lng, searchPick.lat] : (me.lng != null ? [me.lng, me.lat] : A.TN_CENTER);
      map = A.newMap(box, { center: c0, zoom: searchPick ? 11 : (me.lng != null ? 10 : 7) });
      if (!map) return;
      if (me.lng != null) A.pin(map, me.lng, me.lat);
      paint(detail);
    }
    function paint(detail) {
      markers.forEach(function (m) { m.remove(); }); markers = [];
      var list = visible().filter(function (r) { return r.approx_lat != null; });
      A.drawCircles(map, list.map(function (r) { return { lng: r.approx_lng, lat: r.approx_lat, km: 2, selected: selected === r.id }; }));
      list.forEach(function (r) {
        markers.push(A.pill(map, { lng: r.approx_lng, lat: r.approx_lat, text: r.lowest != null ? A.inr(r.lowest) : "Be first", muted: r.lowest == null,
          label: r.event_type + (r.lowest != null ? " lowest " + A.inr(r.lowest) : " no bids yet"), selected: selected === r.id,
          onClick: function () { selected = r.id; paint(detail); A.clear(detail); detail.appendChild(card(r)); } }));
      });
      if (!list.length) { A.clear(detail); detail.appendChild(h("p", { class: "muted", text: "No requests with a map position for this filter. Check the list." })); }
    }
    function draw() { if (feedMode === "list") drawList(); else drawMap(); }
    function setMode(m) {
      feedMode = m; bList.setAttribute("aria-pressed", String(m === "list")); bMap.setAttribute("aria-pressed", String(m === "map"));
      if (map) { map.remove(); map = null; }
      draw();
    }
    async function refreshFeed() { feed = await A.rpc("provider_feed"); if (map) { map.remove(); map = null; } draw(); }
    bList.addEventListener("click", function () { setMode("list"); });
    bMap.addEventListener("click", function () { setMode("map"); });
    setMode(feedMode);
  }

  function bidSheet(r, done) {
    var amount = h("input", { id: "am", type: "number", inputmode: "numeric", min: "100", step: "50", placeholder: "Your price in rupees" });
    var pkg = h("input", { id: "pk", type: "text", maxlength: "80", placeholder: "e.g. 300 photos + album" });
    var msg = h("p", { class: "err", role: "alert" });
    var go = h("button", { class: "btn", type: "button", text: r.my_bid != null ? "Lower my bid" : "Place bid" });
    var dlg = A.sheet([
      h("h2", { text: r.event_type + " · " + A.date(r.event_date) }),
      h("p", { class: "muted", text: (r.area_name || r.town || "") + ", " + (r.district || "") + " · " + A.left(r.closes_at) }),
      h("p", { text: r.lowest != null ? "Lowest bid now: " + A.inr(r.lowest) + (r.my_bid != null ? ". Yours: " + A.inr(r.my_bid) + "." : ".") : "No bids yet. You can be first." }),
      h("label", { for: "am", text: "Your price (₹)" }, amount),
      h("label", { for: "pk", text: "What is included" }, pkg),
      msg, h("div", { class: "row" }, h("button", { class: "btn ghost", type: "button", text: "Cancel", onclick: function () { dlg.close(); } }), go)]);
    go.addEventListener("click", async function () {
      msg.textContent = ""; go.disabled = true;
      try { await A.rpc("place_bid", { p_req: r.id, p_amount: parseInt(amount.value, 10), p_package: pkg.value }); dlg.close(); A.toast("Bid saved."); done(); }
      catch (e) { msg.textContent = e.message; go.disabled = false; }
    });
  }

  // ---------- My bids ----------
  async function renderBids(view) {
    view.appendChild(h("h1", { text: "My bids" }));
    var list = await A.rpc("my_bids");
    if (!list.length) { view.appendChild(A.empty("You have not bid yet. Open Nearby to find requests.")); return; }
    list.forEach(function (b) {
      var st = b.status === "active" && b.req_status === "confirmed" ? "rejected" : b.status;
      view.appendChild(h("div", { class: "card" },
        h("div", { class: "row between" }, h("strong", { text: b.event_type + " · " + A.date(b.event_date) }), A.badge(st)),
        h("div", { class: "muted", text: (b.area_name || b.town || "") }),
        h("div", { class: "row between" }, h("span", { class: "price", text: A.inr(b.amount) }), h("span", { class: "muted", text: b.lowest != null ? "Lowest now " + A.inr(b.lowest) : "" })),
        b.status === "active" && (b.req_status === "open" || b.req_status === "widened") ? h("button", { class: "btn small ghost", type: "button", text: "Withdraw bid", onclick: function () {
          A.ask("Withdraw your bid of " + A.inr(b.amount) + "?", "Withdraw", async function () { try { await A.rpc("withdraw_bid", { p_bid: b.bid_id }); A.toast("Withdrawn."); renderBids(A.clear(view)); } catch (e) { A.fail(e); } });
        } }) : null));
    });
  }

  // ---------- Bookings ----------
  async function renderBookings(view) {
    view.appendChild(h("h1", { text: "Bookings" }));
    var list = await A.rpc("provider_bookings");
    if (!list.length) { view.appendChild(A.empty("No confirmed bookings yet. When a customer chooses your bid, it appears here with their phone number and exact venue.")); return; }
    list.forEach(function (k) {
      var dirs = k.venue_lat != null ? A.directionsUrl(k.venue_lat, k.venue_lng) : A.searchUrl((k.area_name || "") + " " + (k.town || "") + " Tamil Nadu");
      view.appendChild(h("div", { class: "card" },
        h("div", { class: "row between" }, h("strong", { text: k.event_type + " · " + A.date(k.event_date) }), A.badge(k.status)),
        h("div", { class: "price", text: A.inr(k.amount) }),
        h("dl", { class: "kv" },
          h("dt", { text: "Customer" }), h("dd", { text: k.customer_name }),
          h("dt", { text: "Venue" }), h("dd", { text: (k.area_name || k.town || "") + (k.district ? ", " + k.district : "") }),
          h("dt", { text: "Package" }), h("dd", { text: k.package || "–" }),
          h("dt", { text: "Deliver by" }), h("dd", { text: k.delivered_at ? "Delivered " + A.date(k.delivered_at) : A.date(k.due_at) })),
        k.notes ? h("p", { class: "muted", text: k.notes }) : null,
        h("div", { class: "row" },
          h("a", { class: "btn small green", href: A.telUrl(k.customer_phone), text: "Call customer" }),
          h("a", { class: "btn small ghost", href: dirs, target: "_blank", rel: "noopener", text: "Directions" }),
          k.status === "confirmed" ? h("button", { class: "btn small", type: "button", text: "Mark delivered", onclick: function () {
            A.ask("Mark this booking as delivered?", "Delivered", async function () { try { await A.rpc("mark_delivered", { p_booking: k.id }); A.toast("Marked delivered."); renderBookings(A.clear(view)); } catch (e) { A.fail(e); } });
          } }) : null,
          h("button", { class: "btn small ghost", type: "button", text: "Report a problem", onclick: function () { reportSheet(k); } }))));
    });
  }

  function reportSheet(k) {
    var type = h("select", { id: "pt" }, ["Customer not reachable", "Customer cancelled", "Venue or date changed", "Payment problem", "Other"].map(function (t) { return h("option", { value: t, text: t }); }));
    var note = h("textarea", { id: "pn", maxlength: "500", placeholder: "What happened?" });
    var dlg = A.sheet([h("h2", { text: "Report a problem" }), h("label", { for: "pt", text: "What went wrong?" }, type), h("label", { for: "pn", text: "Details" }, note),
      h("div", { class: "row" }, h("button", { class: "btn ghost", type: "button", text: "Cancel", onclick: function () { dlg.close(); } }),
        h("button", { class: "btn", type: "button", text: "Send to ClickBreeze", onclick: async function () {
          try { await A.rpc("raise_dispute", { p_booking: k.id, p_type: type.value, p_note: note.value }); dlg.close(); A.toast("Sent. The team will respond within 48 hours."); } catch (e) { A.fail(e); }
        } }))]);
  }

  // ---------- Studio location ----------
  async function renderStudio(view) {
    view.appendChild(h("h1", { text: me.name }));
    view.appendChild(h("p", { class: "muted", text: (me.town || "") + (me.district ? ", " + me.district : "") + " · " + (me.type === "studio" ? "Studio" : "Photographer") }));
    view.appendChild(h("div", { class: "notice", text: "Drag the pin to your studio. Customers see only an approximate circle near it until they confirm your bid." }));
    var pos = { lng: me.lng, lat: me.lat }, radius = me.radius_km || 25;
    var addr = h("input", { id: "ad", type: "text", maxlength: "160", value: me.address || "", placeholder: "Studio address" });
    var rad = h("select", { id: "rd" }, [5, 10, 25, 50, 100].map(function (n) { return h("option", { value: String(n), text: n + " km", selected: n === radius }); }));
    var box = h("div", { class: "map", role: "region", "aria-label": "Map: drag the pin to your studio" });
    var map = null, pinM = null;
    function setPin(p, fly) {
      pos = { lng: p.lng, lat: p.lat };
      if (pinM) pinM.setLngLat([p.lng, p.lat]); else pinM = A.pin(map, p.lng, p.lat, function (q) { pos = { lng: q.lng, lat: q.lat }; });
      if (fly) map.flyTo({ center: [p.lng, p.lat], zoom: 14 });
    }
    var search = A.placeSearch("Search your town, village or road", function (p) { setPin(p, true); if (!addr.value) addr.value = p.label; });
    var save = h("button", { class: "btn", type: "button", text: "Save studio location", onclick: async function () {
      if (pos.lng == null) return A.toast("Place the pin on the map first.", true);
      save.disabled = true;
      try {
        await A.rpc("set_provider_location", { p_lat: pos.lat, p_lng: pos.lng, p_radius: parseInt(rad.value, 10), p_address: addr.value });
        me.lat = pos.lat; me.lng = pos.lng; me.radius_km = parseInt(rad.value, 10); me.address = addr.value;
        A.toast("Saved.");
      } catch (e) { A.fail(e); }
      save.disabled = false;
    } });
    view.appendChild(h("div", { class: "stack" }, search,
      h("button", { class: "btn ghost small", type: "button", text: "Use my location", onclick: function () { A.locate(function (p) { setPin(p, true); }); } }),
      box,
      h("label", { for: "ad", text: "Address" }, addr),
      h("label", { for: "rd", text: "I can travel up to" }, rad),
      save,
      h("button", { class: "btn ghost", type: "button", text: "Sign out", onclick: A.signOut })));
    map = A.newMap(box, { center: pos.lng != null ? [pos.lng, pos.lat] : A.TN_CENTER, zoom: pos.lng != null ? 14 : 7 });
    if (map) {
      if (pos.lng != null) setPin(pos, false);
      map.on("click", function (e) { if (A.inTN(e.lngLat.lng, e.lngLat.lat)) setPin({ lng: e.lngLat.lng, lat: e.lngLat.lat }); });
    }
  }

  start();
})();
