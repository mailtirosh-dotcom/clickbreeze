// ClickBreeze customer app
(function () {
  var A = CBA, h = A.h, root = document.getElementById("app");
  var towns = [], cats = [], me = null;
  var lang = "en"; try { lang = localStorage.getItem("cb_lang") || "en"; } catch (e) {}
  var TA = {
    "Requests": "கோரிக்கைகள்", "Post": "பதிவிடு", "Bookings": "முன்பதிவுகள்", "Me": "நான்",
    "What do you need shot?": "என்ன படம் எடுக்க வேண்டும்?", "Step 1 of 2": "படி 1 / 2", "Event type": "நிகழ்வு வகை", "Event date": "நிகழ்வு தேதி",
    "District": "மாவட்டம்", "Town or village": "நகரம் / கிராமம்", "Who can bid first?": "முதலில் யார் ஏலம் எடுக்கலாம்?",
    "Town": "நகரம்", "District ": "மாவட்டம்", "State": "மாநிலம்", "Post and get bids": "பதிவிட்டு ஏலங்களைப் பெறு",
    "bids so far": "ஏலங்கள் வந்துள்ளன", "bid so far": "ஏலம் வந்துள்ளது", "List": "பட்டியல்", "Map": "வரைபடம்", "Confirm bid": "ஏலத்தை உறுதி செய்",
    "Reject offer": "நிராகரி", "Block photographer": "தடுக்கவும்", "Lowest": "குறைவு", "Sorted by lowest bid · contacts shown after you confirm": "குறைந்த ஏலம் முதலில் · உறுதி செய்த பிறகே தொடர்பு எண் தெரியும்",
    "Confirm booking": "முன்பதிவை உறுதி செய்", "HOW YOU PAY": "எப்படி செலுத்துவது", "Agreed price": "ஒப்புக்கொண்ட விலை",
    "Booking token · pay now": "முன்பதிவு டோக்கன் · இப்போது செலுத்து", "Balance · pay photographer on shoot day": "மீதித் தொகை · படப்பிடிப்பு நாளில் செலுத்துக",
    "Booking confirmed": "முன்பதிவு உறுதியானது", "Call": "அழை", "WhatsApp": "வாட்ஸ்அப்", "Get directions to studio": "ஸ்டுடியோவுக்கு வழி",
    "Block": "தடு", "Cancel": "ரத்து", "Report a problem": "சிக்கலைத் தெரிவி", "My requests": "என் கோரிக்கைகள்"
  };
  function T(k) { return (lang === "ta" && TA[k]) || k; }
  function langSeg() {
    function set(l) { lang = l; try { localStorage.setItem("cb_lang", l); } catch (e) {} start(); }
    return h("div", { class: "lang", role: "group", "aria-label": "Language" },
      h("button", { type: "button", "aria-pressed": String(lang === "en"), text: "English", onclick: function () { set("en"); } }),
      h("button", { type: "button", "aria-pressed": String(lang === "ta"), text: "தமிழ்", onclick: function () { set("ta"); } }));
  }
  function kmBetween(a, b, c, d) {
    var R = 6371, rad = Math.PI / 180, dLat = (c - a) * rad, dLng = (d - b) * rad;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }
  function avatar(name, big) { return h("div", { class: "avatar" + (big ? " big" : ""), "aria-hidden": "true", text: (name || "?").trim().charAt(0).toUpperCase() }); }
  function pageHead(title, backHash) {
    return h("header", { class: "bar" }, h("a", { class: "back", href: backHash, "aria-label": "Back", text: "‹" }), h("div", { class: "bar-t", text: title }));
  }
  var REACH = { town: "Town", district: "District", state: "State" };

  function problem(e) {
    A.clear(root);
    root.appendChild(h("main", { class: "auth" }, h("h1", { text: "Something went wrong" }), h("p", { class: "err", text: e.message || String(e) }),
      h("button", { class: "btn", text: "Try again", onclick: start }), h("button", { class: "link", text: "Sign out", onclick: A.signOut })));
  }

  async function start() {
    try {
      var s = await A.session();
      if (!s) { if (A.open) await A.anonymous(); else return A.signInScreen(root, "Customer sign in", start); }
      A.config = await A.rpc("app_config");
      me = await A.rpc("my_customer");
      if (!me) return nameScreen();
      var t = await A.sb.from("towns").select("id,name,district").order("name");
      var c = await A.sb.from("categories").select("name").eq("active", true).order("name");
      if (t.error) throw t.error; if (c.error) throw c.error;
      towns = t.data; cats = c.data.map(function (x) { return x.name; });
      A.shell(root, [
        { id: "requests", label: T("Requests"), render: renderRequests },
        { id: "post", label: T("Post"), render: renderPost },
        { id: "bookings", label: T("Bookings"), render: renderBookings },
        { id: "me", label: T("Me"), render: renderMe }
      ], "Customer");
    } catch (e) { problem(e); }
  }

  function nameScreen() {
    A.clear(root);
    var name = h("input", { id: "nm", type: "text", autocomplete: "name", maxlength: "60" });
    var mob = h("input", { id: "mb", type: "tel", inputmode: "numeric", maxlength: "10", placeholder: "10-digit mobile number", autocomplete: "tel-national" });
    var msg = h("p", { class: "err", role: "alert" });
    var f = h("form", { class: "stack" }, h("label", { for: "nm", text: "Your name" }), name, A.open ? h("label", { for: "mb", text: "Mobile number" }) : null, A.open ? mob : null, h("button", { class: "btn", type: "submit", text: "Continue" }));
    f.addEventListener("submit", async function (e) {
      e.preventDefault();
      try { await A.rpc("ensure_customer", A.open ? { p_name: name.value, p_phone: mob.value } : { p_name: name.value }); start(); } catch (x) { msg.textContent = x.message; }
    });
    root.appendChild(h("main", { class: "auth" }, h("img", { class: "logo", src: "logo.png", alt: "ClickBreeze" }), h("h1", { text: "Welcome" }),
      h("p", { class: "muted", text: "Photographers see your name and number only after you confirm a booking." }), f, msg));
  }

  // ---------- Requests ----------
  async function renderRequests(view, parts) {
    if (parts[0]) return renderRequest(view, parts);
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

  async function renderRequest(view, parts) {
    var id = parts[0];
    if (parts[1] === "pay") return renderPay(view, id, parts[2]);
    view.classList.add("flush");
    A.loading(view);
    var list = await A.rpc("my_requirements");
    var r = list.filter(function (x) { return x.id === id; })[0];
    A.clear(view);
    if (!r) { view.classList.remove("flush"); view.appendChild(h("a", { class: "link", href: "#/requests", text: "← " + T("My requests") })); view.appendChild(A.empty("Requirement not found.")); return; }
    var open = r.status === "open" || r.status === "widened";
    var where = (r.area_name || r.town || "") + (r.district ? ", " + r.district : "");
    if (r.status === "confirmed" || !open) {
      view.classList.remove("flush");
      view.appendChild(h("a", { class: "link", href: "#/requests", text: "← " + T("My requests") }));
      view.appendChild(h("div", { class: "row between" }, h("h1", { text: r.event_type + " · " + A.date(r.event_date) }), A.badge(r.status)));
      view.appendChild(h("p", { class: "muted", text: where }));
      if (r.status === "confirmed") {
        view.appendChild(h("div", { class: "notice", text: "Booked. The photographer's phone number is in Bookings." }));
        view.appendChild(h("a", { class: "btn", href: "#/bookings", text: "Open booking" }));
      }
      return;
    }

    var bids = await A.rpc("requirement_bids", { p_req: id });
    var mode = "list", selected = null, map = null, markers = [];
    var hero = h("header", { class: "hero" },
      h("a", { class: "back light", href: "#/requests", "aria-label": "Back", text: "‹" }),
      h("div", { class: "hero-sub", text: r.event_type + " · " + A.date(r.event_date) + " · " + (r.town || "") }),
      h("h1", { text: bids.length ? bids.length + " " + T(bids.length === 1 ? "bid so far" : "bids so far") : "Waiting for bids" }),
      h("div", { class: "row" },
        h("span", { class: "tag hot", text: "Open in " + (REACH[r.reach] || r.reach).toLowerCase() }),
        h("span", { class: "tag", text: A.left(r.closes_at) })));
    var bList = h("button", { type: "button", role: "tab", "aria-selected": "true", text: T("List") });
    var bMap = h("button", { type: "button", role: "tab", "aria-selected": "false", text: T("Map") });
    if (bids.length) hero.appendChild(h("div", { class: "tabs2", role: "tablist", "aria-label": "View" }, bList, bMap));
    view.appendChild(hero);
    var body = h("div", { class: "pad stack" });
    view.appendChild(body);
    if (!bids.length) body.appendChild(A.empty("No bids yet. Nearby photographers have been notified. Check back soon."));
    body.appendChild(h("button", { class: "btn danger", type: "button", text: "Cancel this requirement", onclick: function () {
      A.ask("Cancel this requirement? Photographers will no longer see it.", "Cancel requirement", async function () {
        try { await A.rpc("cancel_requirement", { p_req: id }); A.toast("Cancelled."); A.go("#/requests"); } catch (e) { A.fail(e); }
      });
    } }));
    var holder = h("div", { class: "stack" });
    body.insertBefore(holder, body.firstChild);

    function refresh() { renderRequest(A.clear(view), parts).catch(A.fail); }
    function reject(b) {
      A.ask("Reject " + b.name + "'s offer?", "Reject", async function () { try { await A.rpc("reject_bid", { p_bid: b.bid_id }); A.toast("Rejected."); refresh(); } catch (e) { A.fail(e); } });
    }
    function blockSheet(b) {
      var dlg = A.sheet([
        h("h2", { text: "Block " + b.name + "?" }),
        h("ul", { class: "bul" },
          h("li", { text: "Their bid on this requirement is removed." }),
          h("li", { text: "They won't see or bid on your future requirements." }),
          h("li", { text: "They are not told who blocked them." }),
          h("li", { text: "Unblock anytime in Me › Blocked photographers." })),
        h("div", { class: "row two" },
          h("button", { class: "btn ghost", type: "button", text: T("Cancel"), onclick: function () { dlg.close(); } }),
          h("button", { class: "btn red", type: "button", text: T("Block"), onclick: async function () {
            try { await A.rpc("block_provider", { p_provider: b.provider_id }); dlg.close(); A.toast("Blocked."); refresh(); } catch (e) { A.fail(e); }
          } }))]);
    }
    function bidCard(b, isLowest) {
      var km = (r.venue_lat != null && b.approx_lat != null) ? Math.round(kmBetween(r.venue_lat, r.venue_lng, b.approx_lat, b.approx_lng)) : null;
      return h("article", { class: "bid" + (isLowest ? " best" : "") },
        h("div", { class: "row between top" },
          h("div", { class: "row nowrap" }, avatar(b.name), h("div", null, h("strong", { text: b.name }),
            h("div", { class: "muted", text: (b.type === "studio" ? "Studio" : "Individual") + (b.experience_years != null ? " · " + b.experience_years + " yrs" : "") + (km != null ? " · about " + km + " km" : "") }))),
          isLowest ? h("span", { class: "low", text: T("Lowest") }) : null),
        h("div", { class: "row between end" }, h("div", { class: "muted", text: b.package || "" }), h("div", { class: "price", text: A.inr(b.amount) })),
        h("a", { class: "btn", href: "#/requests/" + id + "/pay/" + b.bid_id, text: T("Confirm bid") }),
        h("div", { class: "row between line" },
          h("button", { class: "quiet", type: "button", text: T("Reject offer"), onclick: function () { reject(b); } }),
          h("button", { class: "quiet red", type: "button", text: T("Block photographer"), onclick: function () { blockSheet(b); } })));
    }
    function drawList() {
      A.clear(holder);
      holder.appendChild(h("p", { class: "muted", text: T("Sorted by lowest bid · contacts shown after you confirm") }));
      bids.forEach(function (b, i) { holder.appendChild(bidCard(b, i === 0 && bids.length > 1)); });
    }
    function drawMap() {
      A.clear(holder);
      var box = h("div", { class: "map", role: "region", "aria-label": "Bids on a map" });
      var detail = h("div");
      holder.appendChild(box);
      holder.appendChild(h("p", { class: "muted", text: "Circles show the approximate area. Exact address and contact appear after you confirm." }));
      holder.appendChild(detail);
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
            onClick: function () { selected = b.bid_id; paint(); A.clear(detail); detail.appendChild(bidCard(b, false)); } }));
        });
        if (!withPos.length) { A.clear(detail); detail.appendChild(h("p", { class: "muted", text: "These photographers have not set a map location. Use the list." })); }
      }
      paint();
    }
    function setMode(m) {
      mode = m; bList.setAttribute("aria-selected", String(m === "list")); bMap.setAttribute("aria-selected", String(m === "map"));
      if (map) { map.remove(); map = null; }
      if (m === "list") drawList(); else drawMap();
    }
    bList.addEventListener("click", function () { setMode("list"); });
    bMap.addEventListener("click", function () { setMode("map"); });
    if (bids.length) drawList();
  }

  // ---------- Confirm and pay token ----------
  async function renderPay(view, id, bidId) {
    A.loading(view);
    var list = await A.rpc("my_requirements");
    var r = list.filter(function (x) { return x.id === id; })[0];
    var bids = await A.rpc("requirement_bids", { p_req: id });
    var b = bids.filter(function (x) { return x.bid_id === bidId; })[0];
    A.clear(view);
    view.appendChild(pageHead(T("Confirm booking"), "#/requests/" + id));
    if (!r || !b) { view.appendChild(A.empty("This bid is no longer available.")); return; }
    var token = Number(A.config.token_amount), balance = Math.max(0, Number(b.amount) - token);
    var pay = h("button", { class: "btn", type: "button", text: "Pay " + A.inr(token) + " & reveal contact" });
    pay.addEventListener("click", async function () {
      pay.disabled = true;
      try { var kid = await A.rpc("confirm_bid", { p_bid: bidId }); A.toast("Booked."); A.go("#/bookings/" + kid); } catch (e) { A.fail(e); pay.disabled = false; }
    });
    view.appendChild(h("div", { class: "pad stack" },
      h("section", { class: "panel" }, h("div", { class: "row nowrap" }, avatar(b.name), h("div", null, h("strong", { text: b.name }), h("div", { class: "muted", text: b.type === "studio" ? "Studio" : "Individual" }))),
        h("div", { class: "muted", text: (b.package ? b.package + " · " : "") + r.event_type + " · " + A.date(r.event_date) })),
      h("section", { class: "panel" }, h("h2", { class: "cap", text: T("HOW YOU PAY") }),
        h("div", { class: "row between" }, h("span", { text: T("Agreed price") }), h("strong", { text: A.inr(b.amount) })),
        h("div", { class: "row between tokenrow" }, h("strong", { text: T("Booking token · pay now") }), h("span", { class: "price", text: A.inr(token) })),
        h("div", { class: "row between" }, h("span", { class: "muted", text: T("Balance · pay photographer on shoot day") }), h("strong", { text: A.inr(balance) }))),
      h("section", { class: "panel" }, h("h2", { class: "cap", text: "IF PLANS CHANGE" }),
        h("ul", { class: "bul" }, h("li", { text: "Photographer cancels: full token refund." }), h("li", { text: "If you cancel: ask ClickBreeze, as per its refund policy." }), h("li", { text: "Phone numbers are shared after you confirm." }))),
      A.config.payment_mode === "test" ? h("div", { class: "notice", text: "Test mode: no real payment is taken. The token is only recorded." }) : null,
      h("p", { class: "muted center", text: "Your other bids will be marked Not selected." }), pay));
  }

  // ---------- Post ----------
  function renderPost(view) {
    var f = { event_type: cats[0] || "", date: "", reach: "town", district: "", town: "", notes: "", area: "", lng: null, lat: null };
    var districts = Array.from(new Set(towns.map(function (t) { return t.district; }))).sort();
    view.appendChild(h("div", { class: "row between" }, h("div", { class: "muted", text: T("Step 1 of 2") }), langSeg()));
    view.appendChild(h("h1", { text: T("What do you need shot?") }));
    if (!towns.length) { view.appendChild(A.empty("No towns are open yet. Please ask ClickBreeze to add your town.")); return; }
    view.appendChild(h("div", { class: "notice", text: "Photographers see only an approximate area (about " + A.config.approx_km + " km) until you confirm a booking." }));

    var chips = h("div", { class: "grid3", role: "group", "aria-label": "Event type" });
    cats.forEach(function (c) {
      var b = h("button", { class: "chip cell", type: "button", text: c, "aria-pressed": String(c === f.event_type), onclick: function () {
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

    var reachBox = h("div", { class: "seg3", role: "group", "aria-label": "Who can bid" });
    [["town", T("Town")], ["district", T("District ")], ["state", T("State")]].forEach(function (x) {
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
    var submit = h("button", { class: "btn", type: "button", text: T("Post and get bids"), onclick: async function () {
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
      h("div", { class: "stack" }, h("strong", { text: T("Event type") }), chips),
      h("label", { for: "dt", text: T("Event date") }, date),
      h("label", { for: "ds", text: T("District") }, dist),
      h("label", { for: "tn", text: T("Town or village") }, town),
      h("div", { class: "stack" }, h("strong", { text: T("Who can bid first?") }), reachBox, h("span", { class: "muted", text: "No confirmed bid in time? A wider reach usually brings more bids." })),
      h("strong", { text: "Where is the event?" }), search, locBtn, mapBox,
      h("p", { class: "muted", text: "Tap the map or search to place the pin. Drag it to adjust. This is optional." }),
      h("label", { for: "ar", text: "Venue or area name" }, area),
      h("label", { for: "nt", text: "Notes" }, notes),
      submit));
    map = A.newMap(mapBox, { zoom: 7 });
    if (map) map.on("click", function (e) { if (A.inTN(e.lngLat.lng, e.lngLat.lat)) placePin({ lng: e.lngLat.lng, lat: e.lngLat.lat }); });
  }

  // ---------- Bookings ----------
  async function renderBookings(view, parts) {
    A.loading(view);
    var list = await A.rpc("customer_bookings");
    A.clear(view);
    if (parts && parts[0]) {
      var k = list.filter(function (x) { return x.id === parts[0]; })[0];
      if (k) return bookedScreen(view, k);
    }
    view.appendChild(h("h1", { text: T("Bookings") }));
    if (!list.length) { view.appendChild(A.empty("No bookings yet. Choose a bid on one of your requests.")); return; }
    list.forEach(function (k) {
      view.appendChild(h("div", { class: "card tap", tabindex: "0", role: "link", onclick: function () { A.go("#/bookings/" + k.id); }, onkeydown: function (e) { if (e.key === "Enter") A.go("#/bookings/" + k.id); } },
        h("div", { class: "row between" }, h("strong", { text: k.event_type + " · " + A.date(k.event_date) }), A.badge(k.status)),
        h("div", { class: "row between" }, h("span", { class: "muted", text: k.provider_name }), h("span", { class: "price", text: A.inr(k.amount) }))));
    });
  }

  function bookedScreen(view, k) {
    view.classList.add("flush");
    var dirs = k.provider_lat != null ? A.directionsUrl(k.provider_lat, k.provider_lng) : A.searchUrl((k.provider_address || k.provider_name) + " " + (k.town || ""));
    var wa = "https://wa.me/91" + String(k.provider_mobile || "").replace(/\D/g, "").slice(-10);
    var balance = Math.max(0, Number(k.amount) - Number(k.token_amount || 0));
    var done = k.status === "delivered" || !!k.delivered_at;
    view.appendChild(h("header", { class: "okhead" },
      h("a", { class: "back light", href: "#/bookings", "aria-label": "Back", text: "‹" }),
      h("div", { class: "tick", "aria-hidden": "true", text: "✓" }),
      h("h1", { text: T("Booking confirmed") }),
      h("p", { text: "Your photographer has been notified. Call them to finalise the venue and timing." })));
    view.appendChild(h("div", { class: "pad stack" },
      h("section", { class: "panel stack" },
        h("div", { class: "row nowrap" }, avatar(k.provider_name, true), h("div", null, h("strong", { class: "big", text: k.provider_name }), h("div", { class: "muted", text: "Verified" }))),
        h("div", { class: "phonebig", text: "+91 " + k.provider_mobile }),
        h("div", { class: "row two" },
          h("a", { class: "btn", href: A.telUrl(k.provider_mobile), text: T("Call") }),
          h("a", { class: "btn ghost", href: wa, target: "_blank", rel: "noopener", text: T("WhatsApp") })),
        h("a", { class: "btn outline", href: dirs, target: "_blank", rel: "noopener", text: T("Get directions to studio") })),
      h("section", { class: "panel" }, h("dl", { class: "kv wide" },
        h("dt", { text: T("Agreed price") }), h("dd", { text: A.inr(k.amount) }),
        h("dt", { text: "Package" }), h("dd", { text: k.package || "–" }),
        h("dt", { text: "Shoot date" }), h("dd", { text: A.date(k.event_date) }),
        h("dt", { text: "Delivery by" }), h("dd", { text: k.delivered_at ? "Delivered " + A.date(k.delivered_at) : A.date(k.due_at) }),
        h("dt", { text: "Token" }), h("dd", { text: A.inr(k.token_amount) + (k.token_paid ? " recorded" : " pending") }),
        h("dt", { text: "Balance" }), h("dd", { text: A.inr(balance) + " on shoot day" }))),
      h("ol", { class: "steps", "aria-label": "Booking status" },
        h("li", { class: "on", text: "Confirmed" }), h("li", { class: done ? "on" : "", text: "Shoot done" }), h("li", { class: "", text: "Photos & review" })),
      h("button", { class: "btn ghost", type: "button", text: T("Report a problem"), onclick: function () { reportSheet(k); } })));
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
    view.appendChild(h("div", { class: "row between" }, h("h1", { text: T("Me") }), langSeg()));
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
    if (!A.open) view.appendChild(h("button", { class: "btn ghost", type: "button", text: "Sign out", onclick: A.signOut }));
  }

  start();
})();
