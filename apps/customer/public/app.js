// ClickBreeze customer app
(function () {
  var A = CBA, h = A.h, root = document.getElementById("app");
  var towns = [], cats = [], me = null;

  function problem(e) {
    A.clear(root);
    root.appendChild(h("main", { class: "auth" }, h("h1", { text: "Something went wrong" }), h("p", { class: "err", text: e.message || String(e) }),
      h("button", { class: "btn", text: "Try again", onclick: start }), h("button", { class: "link", text: "Sign out", onclick: A.signOut })));
  }

  async function start() {
    try {
      var s = await A.session();
      if (!s) return A.signInScreen(root, "Customer sign in", start);
      A.config = await A.rpc("app_config");
      me = await A.rpc("my_customer");
      if (!me) return nameScreen();
      var t = await A.sb.from("towns").select("id,name,district").order("name");
      var c = await A.sb.from("categories").select("name").eq("active", true).order("name");
      if (t.error) throw t.error; if (c.error) throw c.error;
      towns = t.data; cats = c.data.map(function (x) { return x.name; });
      A.shell(root, [
        { id: "requests", label: "Requests", render: renderRequests },
        { id: "post", label: "Post", render: renderPost },
        { id: "bookings", label: "Bookings", render: renderBookings },
        { id: "me", label: "Me", render: renderMe }
      ], "Customer");
    } catch (e) { problem(e); }
  }

  function nameScreen() {
    A.clear(root);
    var name = h("input", { id: "nm", type: "text", autocomplete: "name", maxlength: "60" });
    var msg = h("p", { class: "err", role: "alert" });
    var f = h("form", { class: "stack" }, h("label", { for: "nm", text: "Your name" }), name, h("button", { class: "btn", type: "submit", text: "Continue" }));
    f.addEventListener("submit", async function (e) {
      e.preventDefault();
      try { await A.rpc("ensure_customer", { p_name: name.value }); start(); } catch (x) { msg.textContent = x.message; }
    });
    root.appendChild(h("main", { class: "auth" }, h("div", { class: "brand", html: "Click<span>Breeze</span>" }), h("h1", { text: "Welcome" }),
      h("p", { class: "muted", text: "Photographers will see this name only after you confirm a booking." }), f, msg));
  }

  // ---------- Requests ----------
  async function renderRequests(view, parts) {
    if (parts[0]) return renderRequest(view, parts[0]);
    view.appendChild(h("h1", { text: "My requests" }));
    A.loading(view);
    var list = await A.rpc("my_requirements");
    A.clear(view); view.appendChild(h("h1", { text: "My requests" }));
    if (!list.length) {
      view.appendChild(A.empty("You have not posted a requirement yet."));
      view.appendChild(h("a", { class: "btn", href: "#/post", text: "Post a requirement" }));
      return;
    }
    list.forEach(function (r) {
      var line = (r.area_name || r.town || "") + (r.district ? ", " + r.district : "");
      view.appendChild(h("div", { class: "card tap", tabindex: "0", role: "link", onclick: function () { A.go("#/requests/" + r.id); }, onkeydown: function (e) { if (e.key === "Enter") A.go("#/requests/" + r.id); } },
        h("div", { class: "row between" }, h("strong", { text: r.event_type + " · " + A.date(r.event_date) }), A.badge(r.status)),
        h("div", { class: "muted", text: line }),
        h("div", { class: "row between" },
          h("span", { text: r.bids_count + (r.bids_count === 1 ? " bid" : " bids") + (r.lowest != null ? " · from " + A.inr(r.lowest) : "") }),
          h("span", { class: "muted", text: r.status === "open" || r.status === "widened" ? A.left(r.closes_at) : "" }))));
    });
  }

  async function renderRequest(view, id) {
    A.loading(view);
    var list = await A.rpc("my_requirements");
    var r = list.filter(function (x) { return x.id === id; })[0];
    A.clear(view);
    view.appendChild(h("a", { class: "link", href: "#/requests", text: "← My requests" }));
    if (!r) { view.appendChild(A.empty("Requirement not found.")); return; }
    var open = r.status === "open" || r.status === "widened";
    view.appendChild(h("div", { class: "row between" }, h("h1", { text: r.event_type + " · " + A.date(r.event_date) }), A.badge(r.status)));
    view.appendChild(h("p", { class: "muted", text: (r.area_name || r.town || "") + ", " + (r.district || "") + " · reach: " + r.reach + (open ? " · " + A.left(r.closes_at) : "") }));
    if (r.notes) view.appendChild(h("p", { text: r.notes }));

    if (r.status === "confirmed") {
      view.appendChild(h("div", { class: "notice", text: "Booked. The photographer's phone number is in Bookings." }));
      view.appendChild(h("a", { class: "btn", href: "#/bookings", text: "Open booking" }));
      return;
    }
    if (!open) return;

    var bids = await A.rpc("requirement_bids", { p_req: id });
    var mode = "list", selected = null, map = null, markers = [];
    var body = h("div", { class: "stack" });
    var seg = h("div", { class: "seg", role: "group", "aria-label": "View" });
    var bList = h("button", { type: "button", text: "List", "aria-pressed": "true" });
    var bMap = h("button", { type: "button", text: "Map", "aria-pressed": "false" });
    seg.appendChild(bList); seg.appendChild(bMap);
    view.appendChild(h("h2", { text: bids.length ? bids.length + (bids.length === 1 ? " bid" : " bids") + ", lowest first" : "Waiting for bids" }));
    if (bids.length) view.appendChild(seg);
    view.appendChild(body);
    if (!bids.length) body.appendChild(A.empty("No bids yet. Nearby photographers have been notified. Check back soon."));
    view.appendChild(h("button", { class: "btn danger", type: "button", text: "Cancel this requirement", onclick: function () {
      A.ask("Cancel this requirement? Photographers will no longer see it.", "Cancel requirement", async function () {
        try { await A.rpc("cancel_requirement", { p_req: id }); A.toast("Cancelled."); A.go("#/requests"); } catch (e) { A.fail(e); }
      });
    } }));

    function refresh() { renderRequest(A.clear(view), id).catch(A.fail); }
    function choose(b) {
      var pay = A.config.payment_mode === "test" ? " Test mode: no real payment is taken." : "";
      A.ask("Choose " + b.name + " for " + A.inr(b.amount) + "? A token of " + A.inr(A.config.token_amount) + " is recorded and phone numbers are shared." + pay, "Confirm booking", async function () {
        try { await A.rpc("confirm_bid", { p_bid: b.bid_id }); A.toast("Booked."); A.go("#/bookings"); } catch (e) { A.fail(e); }
      });
    }
    function reject(b) {
      A.ask("Reject " + b.name + "'s offer?", "Reject", async function () { try { await A.rpc("reject_bid", { p_bid: b.bid_id }); A.toast("Rejected."); refresh(); } catch (e) { A.fail(e); } });
    }
    function block(b) {
      A.ask("Block " + b.name + "? You will not see their bids again and they will not see your requests.", "Block", async function () { try { await A.rpc("block_provider", { p_provider: b.provider_id }); A.toast("Blocked."); refresh(); } catch (e) { A.fail(e); } });
    }
    function bidCard(b) {
      return h("div", { class: "card" },
        h("div", { class: "row between" }, h("strong", { text: b.name }), h("span", { class: "price", text: A.inr(b.amount) })),
        h("div", { class: "muted", text: (b.type === "studio" ? "Studio" : "Photographer") + (b.experience_years != null ? " · " + b.experience_years + " years" : "") + (b.package ? " · " + b.package : "") }),
        h("div", { class: "row" },
          h("button", { class: "btn small", type: "button", text: "Choose", onclick: function () { choose(b); } }),
          h("button", { class: "btn small ghost", type: "button", text: "Reject", onclick: function () { reject(b); } }),
          h("button", { class: "btn small danger", type: "button", text: "Block", onclick: function () { block(b); } })));
    }
    function drawList() { A.clear(body); bids.forEach(function (b) { body.appendChild(bidCard(b)); }); }
    function drawMap() {
      A.clear(body);
      var box = h("div", { class: "map", role: "region", "aria-label": "Bids on a map" });
      var detail = h("div");
      body.appendChild(box);
      body.appendChild(h("p", { class: "muted", text: "Circles show the approximate area of each photographer, not an exact address." }));
      body.appendChild(detail);
      var center = r.venue_lng != null ? [r.venue_lng, r.venue_lat] : A.TN_CENTER;
      map = A.newMap(box, { center: center, zoom: r.venue_lng != null ? 10 : 8 });
      if (!map) return;
      if (r.venue_lng != null) A.pin(map, r.venue_lng, r.venue_lat);
      function paint() {
        markers.forEach(function (m) { m.remove(); }); markers = [];
        var withPos = bids.filter(function (b) { return b.approx_lat != null; });
        A.drawCircles(map, withPos.map(function (b) { return { lng: b.approx_lng, lat: b.approx_lat, km: 2, selected: selected === b.bid_id }; }));
        withPos.forEach(function (b) {
          markers.push(A.pill(map, { lng: b.approx_lng, lat: b.approx_lat, text: A.inr(b.amount), label: b.name + " " + A.inr(b.amount), selected: selected === b.bid_id,
            onClick: function () { selected = b.bid_id; paint(); A.clear(detail); detail.appendChild(bidCard(b)); } }));
        });
        if (!withPos.length) A.clear(detail), detail.appendChild(h("p", { class: "muted", text: "These photographers have not set a map location. Use the list." }));
      }
      paint();
    }
    function setMode(m) {
      mode = m; bList.setAttribute("aria-pressed", m === "list"); bMap.setAttribute("aria-pressed", m === "map");
      if (map) { map.remove(); map = null; }
      if (m === "list") drawList(); else drawMap();
    }
    bList.addEventListener("click", function () { setMode("list"); });
    bMap.addEventListener("click", function () { setMode("map"); });
    if (bids.length) drawList();
  }

  // ---------- Post ----------
  function renderPost(view) {
    var f = { event_type: cats[0] || "", date: "", reach: "town", district: "", town: "", notes: "", area: "", lng: null, lat: null };
    var districts = Array.from(new Set(towns.map(function (t) { return t.district; }))).sort();
    view.appendChild(h("h1", { text: "Post a requirement" }));
    if (!towns.length) { view.appendChild(A.empty("No towns are open yet. Please ask ClickBreeze to add your town.")); return; }
    view.appendChild(h("div", { class: "notice", text: "Photographers see only an approximate area (about " + A.config.approx_km + " km) until you confirm a booking." }));

    var chips = h("div", { class: "chips", role: "group", "aria-label": "Event type" });
    cats.forEach(function (c) {
      var b = h("button", { class: "chip", type: "button", text: c, "aria-pressed": String(c === f.event_type), onclick: function () {
        f.event_type = c; Array.prototype.forEach.call(chips.children, function (x) { x.setAttribute("aria-pressed", String(x.textContent === c)); });
      } });
      chips.appendChild(b);
    });
    var today = new Date().toISOString().slice(0, 10);
    var date = h("input", { type: "date", id: "dt", min: today, onchange: function () { f.date = date.value; } });
    var dist = h("select", { id: "ds", onchange: function () { f.district = dist.value; fillTowns(); } });
    var town = h("select", { id: "tn", onchange: function () { f.town = town.value; } });
    dist.appendChild(h("option", { value: "", text: "Select district" }));
    districts.forEach(function (d) { dist.appendChild(h("option", { value: d, text: d })); });
    function fillTowns() {
      A.clear(town); town.appendChild(h("option", { value: "", text: "Select town or village" }));
      towns.filter(function (t) { return t.district === f.district; }).forEach(function (t) { town.appendChild(h("option", { value: t.id, text: t.name })); });
      f.town = "";
    }
    fillTowns();

    var reachBox = h("div", { class: "chips", role: "group", "aria-label": "Who can bid" });
    [["town", "My town only"], ["district", "Whole district"], ["state", "All Tamil Nadu"]].forEach(function (x) {
      reachBox.appendChild(h("button", { class: "chip", type: "button", text: x[1], "aria-pressed": String(f.reach === x[0]), onclick: function () {
        f.reach = x[0]; Array.prototype.forEach.call(reachBox.children, function (c) { c.setAttribute("aria-pressed", String(c.textContent === x[1])); });
      } }));
    });

    var area = h("input", { type: "text", id: "ar", maxlength: "80", placeholder: "e.g. Murugan Mahal, Melur", oninput: function () { f.area = area.value; } });
    var mapBox = h("div", { class: "map short", role: "region", "aria-label": "Map: tap to place the pin" });
    var pinMarker = null, map = null;
    function placePin(p, fly) {
      f.lng = p.lng; f.lat = p.lat;
      if (pinMarker) pinMarker.setLngLat([p.lng, p.lat]);
      else pinMarker = A.pin(map, p.lng, p.lat, function (q) { f.lng = q.lng; f.lat = q.lat; });
      if (fly) map.flyTo({ center: [p.lng, p.lat], zoom: 13 });
    }
    var search = A.placeSearch("Search a town, village or area", function (p) { if (!area.value) { area.value = p.name; f.area = p.name; } placePin(p, true); });
    var locBtn = h("button", { class: "btn ghost small", type: "button", text: "Use my location", onclick: function () { A.locate(function (p) { placePin(p, true); }); } });
    var notes = h("textarea", { id: "nt", maxlength: "500", placeholder: "Anything the photographer should know", oninput: function () { f.notes = notes.value; } });
    var submit = h("button", { class: "btn", type: "button", text: "Post requirement", onclick: async function () {
      if (!f.event_type) return A.toast("Choose an event type.", true);
      if (!f.date) return A.toast("Choose the event date.", true);
      if (!f.town) return A.toast("Choose your district and town.", true);
      submit.disabled = true;
      try {
        var id = await A.rpc("post_requirement", { p_event_type: f.event_type, p_event_date: f.date, p_town: f.town, p_reach: f.reach, p_notes: f.notes,
          p_venue_lat: f.lat, p_venue_lng: f.lng, p_area: f.area });
        A.toast("Posted. Photographers can bid for " + A.config.bid_window_hours + " hours."); A.go("#/requests/" + id);
      } catch (e) { A.fail(e); submit.disabled = false; }
    } });

    view.appendChild(h("div", { class: "stack" },
      h("div", { class: "stack" }, h("strong", { text: "Event type" }), chips),
      h("label", { for: "dt", text: "Event date" }, date),
      h("label", { for: "ds", text: "District" }, dist),
      h("label", { for: "tn", text: "Town or village" }, town),
      h("div", { class: "stack" }, h("strong", { text: "Who can bid" }), reachBox, h("span", { class: "muted", text: "A wider reach usually brings more bids." })),
      h("strong", { text: "Where is the event?" }), search, locBtn, mapBox,
      h("p", { class: "muted", text: "Tap the map or search to place the pin. Drag it to adjust. This is optional." }),
      h("label", { for: "ar", text: "Venue or area name" }, area),
      h("label", { for: "nt", text: "Notes" }, notes),
      submit));
    map = A.newMap(mapBox, { zoom: 7 });
    if (map) map.on("click", function (e) { if (A.inTN(e.lngLat.lng, e.lngLat.lat)) placePin({ lng: e.lngLat.lng, lat: e.lngLat.lat }); });
  }

  // ---------- Bookings ----------
  async function renderBookings(view) {
    view.appendChild(h("h1", { text: "Bookings" }));
    A.loading(view);
    var list = await A.rpc("customer_bookings");
    A.clear(view); view.appendChild(h("h1", { text: "Bookings" }));
    if (!list.length) { view.appendChild(A.empty("No bookings yet. Choose a bid on one of your requests.")); return; }
    list.forEach(function (k) {
      var dirs = k.provider_lat != null ? A.directionsUrl(k.provider_lat, k.provider_lng) : A.searchUrl((k.provider_address || k.provider_name) + " " + (k.town || ""));
      view.appendChild(h("div", { class: "card" },
        h("div", { class: "row between" }, h("strong", { text: k.event_type + " · " + A.date(k.event_date) }), A.badge(k.status)),
        h("div", { class: "price", text: A.inr(k.amount) }),
        h("dl", { class: "kv" },
          h("dt", { text: "Photographer" }), h("dd", { text: k.provider_name }),
          h("dt", { text: "Package" }), h("dd", { text: k.package || "–" }),
          h("dt", { text: "Token" }), h("dd", { text: A.inr(k.token_amount) + (k.token_paid ? " recorded" : " pending") }),
          h("dt", { text: "Delivery by" }), h("dd", { text: k.delivered_at ? "Delivered " + A.date(k.delivered_at) : A.date(k.due_at) })),
        h("div", { class: "row" },
          h("a", { class: "btn small green", href: A.telUrl(k.provider_mobile), text: "Call " + k.provider_mobile }),
          h("a", { class: "btn small ghost", href: dirs, target: "_blank", rel: "noopener", text: "Get directions" }),
          h("button", { class: "btn small ghost", type: "button", text: "Report a problem", onclick: function () { reportSheet(k); } }))));
    });
  }

  function reportSheet(k) {
    var type = h("select", { id: "pt" }, ["Photographer did not arrive", "Late delivery", "Quality complaint", "Asked for extra payment", "Other"].map(function (t) { return h("option", { value: t, text: t }); }));
    var note = h("textarea", { id: "pn", maxlength: "500", placeholder: "What happened?" });
    var dlg = A.sheet([h("h2", { text: "Report a problem" }), h("label", { for: "pt", text: "What went wrong?" }, type), h("label", { for: "pn", text: "Details" }, note),
      h("div", { class: "row" }, h("button", { class: "btn ghost", type: "button", text: "Cancel", onclick: function () { dlg.close(); } }),
        h("button", { class: "btn", type: "button", text: "Send to ClickBreeze", onclick: async function () {
          try { await A.rpc("raise_dispute", { p_booking: k.id, p_type: type.value, p_note: note.value }); dlg.close(); A.toast("Sent. The team will respond within 48 hours."); } catch (e) { A.fail(e); }
        } }))]);
  }

  // ---------- Me ----------
  async function renderMe(view) {
    view.appendChild(h("h1", { text: "Me" }));
    var name = h("input", { id: "mn", type: "text", maxlength: "60", value: me.name });
    view.appendChild(h("div", { class: "stack" },
      h("label", { for: "mn", text: "Your name" }, name),
      h("button", { class: "btn", type: "button", text: "Save name", onclick: async function () { try { me = await A.rpc("ensure_customer", { p_name: name.value }); A.toast("Saved."); } catch (e) { A.fail(e); } } })));
    view.appendChild(h("h2", { text: "Blocked photographers" }));
    var blocks = await A.rpc("my_blocks");
    if (!blocks.length) view.appendChild(h("p", { class: "muted", text: "You have not blocked anyone." }));
    blocks.forEach(function (b) {
      view.appendChild(h("div", { class: "card" }, h("div", { class: "row between" }, h("span", { text: b.name }),
        h("button", { class: "btn small ghost", type: "button", text: "Unblock", onclick: async function () { try { await A.rpc("unblock_provider", { p_provider: b.provider_id }); renderMe(A.clear(view)); } catch (e) { A.fail(e); } } }))));
    });
    if (A.config.payment_mode === "test") view.appendChild(h("div", { class: "notice", text: "Test mode: no real payment is taken when you confirm a booking." }));
    view.appendChild(h("button", { class: "btn ghost", type: "button", text: "Sign out", onclick: A.signOut }));
  }

  start();
})();
