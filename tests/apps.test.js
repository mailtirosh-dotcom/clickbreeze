// Browser test for both apps with the REAL MapLibre 4.7.1 file and a mocked backend.
// Usage: node tests/apps.test.js   (needs Playwright; run `node scripts/build.js customer` and `photographer` first)
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const root = path.resolve(__dirname, "..");
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".txt": "text/plain" };
function serve(dir) {
  return new Promise(res => {
    const s = http.createServer((q, r) => {
      let f = path.join(dir, q.url.split("?")[0]); if (f.endsWith("/")) f += "index.html";
      if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { "content-type": mime[path.extname(f)] || "application/octet-stream" }); r.end(fs.readFileSync(f));
    }).listen(0, () => res(s));
  });
}
const STUB = `window.supabase={createClient:function(){var S=JSON.parse(localStorage.getItem('S')||'{"in":0}');
return {auth:{signInAnonymously:async()=>{if(window.__noAnon)return {error:{message:'disabled'}};S.in=1;localStorage.setItem('S',JSON.stringify(S));return {data:{}}},getSession:async()=>({data:{session:S.in?{user:{id:'u'}}:null}}),
 signInWithOtp:async(a)=>{window.__otp=a;return {}},
 verifyOtp:async(a)=>{ if(a.token_hash!=='th') return {error:{message:'bad'}}; S.in=1;localStorage.setItem('S',JSON.stringify(S));return {data:{}} },
 signOut:async()=>{localStorage.removeItem('S');return {}}},
 rpc:async(n,a)=>{ try{ return {data:await window.__rpc(n,a||{})} }catch(e){ return {error:{message:e.message}} } },
 from:(t)=>{var b={select:()=>b,eq:()=>b,order:()=>b,then:(res,rej)=>window.__table(t).then(d=>res({data:d,error:null}),rej)};return b;}};}};`;
const STYLE = { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": "#dddddd" } }] };
let fails = 0; const ok = (n, c, x) => { console.log((c ? "PASS " : "FAIL ") + n + (x ? " " + x : "")); if (!c) fails++; };

(async () => {
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const calls = []; const window_calls = [];
  const db = {
    customer: null, booked: false, blocked: false,
    reqs: [{ id: "r1", seq: 1, event_type: "Wedding", event_date: "2027-01-10", reach: "town", status: "open", closes_at: new Date(Date.now() + 20 * 36e5).toISOString(), town: "Melur", district: "Madurai", area_name: "Murugan Mahal", notes: "Evening", venue_lat: 9.84, venue_lng: 78.34, bids_count: 2, lowest: 8500, booking_id: null }],
    bids: [
      { bid_id: "b1", amount: 8500, package: "Photos + album", status: "active", provider_id: "p1", name: "Golden Frame", type: "studio", experience_years: 9, approx_lat: 9.85, approx_lng: 78.35 },
      { bid_id: "b2", amount: 9000, package: "Photos", status: "active", provider_id: "p2", name: "Kumar", type: "individual", experience_years: 4, approx_lat: 9.8, approx_lng: 78.3 }],
    bookings: [],
    feed: [
      { id: "f1", event_type: "Wedding", event_date: "2027-01-10", reach: "town", town: "Melur", district: "Madurai", area_name: "Murugan Mahal", closes_at: new Date(Date.now() + 20 * 36e5).toISOString(), approx_lat: 9.85, approx_lng: 78.35, distance_km: 4.2, bids_count: 1, lowest: 8500, my_bid: null },
      { id: "f2", event_type: "Birthday", event_date: "2027-01-12", reach: "district", town: "Usilampatti", district: "Madurai", area_name: null, closes_at: new Date(Date.now() + 30 * 36e5).toISOString(), approx_lat: 9.97, approx_lng: 77.78, distance_km: null, bids_count: 0, lowest: null, my_bid: null }],
    provider: { id: "p1", name: "Golden Frame", person: "Ravi", type: "studio", status: "verified", town: "Melur", district: "Madurai", lat: null, lng: null, radius_km: 25, address: null },
    providerError: null, pbookings: []
  };
  async function rpc(n, a) {
    calls.push([n, a]);
    switch (n) {
      case "app_config": return { token_amount: 300, bid_window_hours: 24, payment_mode: "test", approx_km: 2 };
      case "my_customer": return db.customer;
      case "ensure_customer": if (a.p_phone !== undefined && !/^[6-9]\d{9}$/.test(a.p_phone)) throw new Error("Enter a 10-digit mobile number"); db.customer = { user_id: "u", name: a.p_name }; return db.customer;
      case "my_requirements": return db.reqs;
      case "requirement_bids": return db.blocked ? [db.bids[1]] : db.bids;
      case "post_requirement": db.reqs.push(Object.assign({}, db.reqs[0], { id: "r2", seq: 2, event_type: a.p_event_type, bids_count: 0, lowest: null })); return "r2";
      case "confirm_bid": db.reqs[0].status = "confirmed"; db.bookings = [{ id: "k1", seq: 1, status: "confirmed", token_amount: 300, token_paid: true, due_at: "2027-01-17T00:00:00Z", delivered_at: null, amount: 8500, package: "Photos + album", event_type: "Wedding", event_date: "2027-01-10", town: "Melur", district: "Madurai", provider_name: "Golden Frame", provider_mobile: "9876543210", provider_lat: 9.83, provider_lng: 78.33, venue_lat: 9.84, venue_lng: 78.34 }]; return "k1";
      case "customer_bookings": return db.bookings;
      case "block_provider": db.blocked = true; return null;
      case "my_blocks": return db.blocked ? [{ provider_id: "p1", name: "Golden Frame" }] : [];
      case "unblock_provider": db.blocked = false; return null;
      case "raise_dispute": return "d1";
      case "link_provider_open": if (a.p_phone !== "9876543210") throw new Error("No photographer account found for this mobile number. Ask ClickBreeze to enroll you."); db.linked = true; return db.provider;
      case "my_provider": return db.linked ? db.provider : null;
      case "link_provider": if (db.providerError) throw new Error(db.providerError); return db.provider;
      case "provider_feed": return db.feed;
      case "place_bid": db.feed[0].my_bid = a.p_amount; db.feed[0].lowest = Math.min(db.feed[0].lowest, a.p_amount); return null;
      case "my_bids": return [{ bid_id: "b1", amount: 8500, package: null, status: "active", req_status: "open", event_type: "Wedding", event_date: "2027-01-10", town: "Melur", area_name: "Murugan Mahal", lowest: 8500 }];
      case "withdraw_bid": return null;
      case "provider_bookings": return db.pbookings;
      case "mark_delivered": return null;
      case "set_provider_location": db.provider.lat = a.p_lat; db.provider.lng = a.p_lng; return null;
      default: throw new Error("unknown rpc " + n);
    }
  }
  async function open(dir, name, login) {
    const server = await serve(dir); const port = server.address().port;
    const ctx = await browser.newContext({ viewport: { width: 400, height: 800 }, permissions: ["geolocation"], geolocation: { latitude: 9.9, longitude: 78.1 } });
    await ctx.route("**/config.js", r => r.fulfill({ contentType: "text/javascript", body: "window.CB_CONFIG={url:'https://x.supabase.co',key:'k',login:'" + (login || "msg91") + "',msg91:{widgetId:'w',tokenAuth:'t'}}" }));
    await ctx.route("**/verify.msg91.com/otp-provider.js", r => r.fulfill({ contentType: "text/javascript", body: "window.initSendOTP=function(c){window.__wid=c.widgetId;window.sendOtp=function(id,ok,bad){window.__sent=id;ok({type:'success',message:'req123'})};window.retryOtp=function(ch,ok){window.__retry=1;ok({type:'success'})};window.verifyOtp=function(o,ok,bad){o==='123456'?ok({type:'success',message:'aaaaaaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbbbb.cccccccccccccccc'}):bad({message:'OTP not match'})}}" }));
    await ctx.route("**/functions/v1/msg91-login", r => { const b = JSON.parse(r.request().postData() || "{}"); window_calls.push(b); r.fulfill({ contentType: "application/json", status: b.phone === "9876543210" || b.phone === "9876500001" ? 200 : 401, body: JSON.stringify({ token_hash: "th" }) }); });
    await ctx.route("**/vendor/supabase.js", r => r.fulfill({ contentType: "text/javascript", body: STUB }));
    await ctx.route("**/tiles.openfreemap.org/**", r => r.fulfill({ contentType: "application/json", body: JSON.stringify(STYLE) }));
    await ctx.route("**/photon.komoot.io/**", r => r.fulfill({ contentType: "application/json", body: JSON.stringify({ features: [
      { geometry: { coordinates: [78.34, 9.84] }, properties: { name: "Melur", district: "Madurai", state: "Tamil Nadu" } },
      { geometry: { coordinates: [77.6, 12.97] }, properties: { name: "Bengaluru", state: "Karnataka" } }] }) }));
    const page = await ctx.newPage(); const errs = [];
    page.on("pageerror", e => errs.push(e.message));
    page.on("console", m => { if (m.type() === "error" && !/Failed to load resource|ERR_|WebGL|GPU stall|swiftshader/i.test(m.text())) errs.push(m.text()); });
    await page.exposeFunction("__rpc", rpc);
    await page.exposeFunction("__table", async t => t === "towns" ? [{ id: "t1", name: "Melur", district: "Madurai" }, { id: "t2", name: "Theni", district: "Theni" }] : [{ name: "Wedding" }, { name: "Birthday" }]);
    await page.goto("http://localhost:" + port + "/index.html");
    return { page, errs, server, ctx };
  }
  const toastText = p => p.evaluate(() => (document.getElementById("toast") || {}).textContent || "");

  // ================= CUSTOMER =================
  {
    const { page: p, errs, server, ctx } = await open(path.join(root, "apps/customer/www"), "customer");
    await p.waitForSelector("#ph");
    ok("customer: sign-in screen shown", /Customer sign in/.test(await p.textContent("body")));
    await p.fill("#ph", "12345"); await p.click("text=Send code"); ok("customer: bad number rejected", /10-digit/.test(await p.textContent(".err")));
    await p.fill("#ph", "9876543210"); await p.click("text=Send code"); await p.waitForSelector("#otp");
    ok("customer: MSG91 widget asked to send to 91 + number", await p.evaluate(() => window.__sent) === "919876543210" && await p.evaluate(() => window.__wid) === "w");
    await p.fill("#otp", "000000"); await p.click("text=Verify and continue"); await p.waitForTimeout(200);
    ok("customer: wrong code message", /not correct/.test(await p.textContent("body")));
    await p.fill("#otp", "123456"); await p.click("text=Verify and continue"); await p.waitForSelector("#nm");
    ok("customer: access token and number sent to the login function", window_calls.length === 1 && window_calls[0].phone === "9876543210" && /^a+\.b+\.c+$/.test(window_calls[0].accessToken));
    await p.fill("#nm", "Anu"); await p.click("text=Continue"); await p.waitForSelector(".card");
    ok("customer: requests list", /Wedding/.test(await p.textContent(".view")) && /2 bids · from ₹8,500/.test(await p.textContent(".view")));
    await p.click(".card.tap"); await p.waitForSelector("text=2 bids so far");
    ok("customer: bids listed with actions", await p.locator("a:has-text('Confirm bid')").count() === 2 && await p.locator("button:has-text('Block photographer')").count() === 2 && await p.locator(".low").count() === 1);
    await p.screenshot({ path: "/tmp/c_bids.png" });
    await p.locator("button:has-text('Block photographer')").first().click(); await p.waitForSelector(".sheet");
    ok("customer: block sheet explains what happens", /not told who blocked/.test(await p.textContent(".sheet")));
    await p.click(".sheet button:has-text('Cancel')");
    ok("customer: block sheet closes", await p.locator(".sheet").count() === 0);
    await p.click("button[role=tab]:has-text('Map')"); await p.waitForSelector(".maplibregl-canvas");
    await p.waitForFunction(() => document.querySelector(".map")._map.getSource("cb-circles"), null, { timeout: 8000 });
    const info = await p.evaluate(() => { const m = document.querySelector(".map")._map; return { feats: m.getSource("cb-circles")._data.features.length, layers: !!m.getLayer("cb-circles-fill"), version: maplibregl.getVersion ? maplibregl.getVersion() : "?" }; });
    ok("customer: MapLibre " + info.version + " draws 2 approximate circles", info.feats === 2 && info.layers);
    ok("customer: price markers on map", await p.locator(".pill").count() === 2 && /₹8,500/.test(await p.locator(".pill").first().textContent()));
    ok("customer: attribution text", /OpenFreeMap/.test(await p.textContent(".maplibregl-ctrl-attrib")));
    await p.locator(".pill").first().click(); await p.waitForTimeout(150);
    ok("customer: selected bid card under map", await p.locator(".bid:has-text('Golden Frame')").count() === 1);
    await p.locator(".bid:has-text('Golden Frame') >> a:has-text('Confirm bid')").click(); await p.waitForSelector("text=HOW YOU PAY");
    ok("customer: pay screen shows token, balance and test mode", /₹300/.test(await p.textContent(".view")) && /₹8,200/.test(await p.textContent(".view")) && /Test mode/.test(await p.textContent(".view")));
    await p.click("button:has-text('Pay ₹300')"); await p.waitForSelector("text=Booking confirmed");
    ok("customer: phone revealed after booking (tel link)", await p.getAttribute("a.btn:has-text('Call')", "href") === "tel:+919876543210" && /\+91 9876543210/.test(await p.textContent(".view")));
    ok("customer: WhatsApp link", /wa\.me\/919876543210/.test(await p.getAttribute("a:has-text('WhatsApp')", "href")));
    const dir = await p.getAttribute("a:has-text('Get directions')", "href");
    ok("customer: Get directions opens Google Maps link", /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=9\.83%2C78\.33$/.test(dir), dir);
    await p.click("button:has-text('Report a problem')"); await p.selectOption("#pt", "Late delivery"); await p.click("text=Send to ClickBreeze"); await p.waitForTimeout(200);
    ok("customer: dispute raised", calls.some(c => c[0] === "raise_dispute" && c[1].p_type === "Late delivery"));
    // post
    await p.screenshot({ path: "/tmp/c_booked.png" });
    await p.click(".tabs a[data-tab=post]"); await p.waitForSelector("#dt");
    await p.click(".lang button:has-text('தமிழ்')"); await p.waitForSelector("text=என்ன படம் எடுக்க வேண்டும்?");
    ok("customer: Tamil switch works", /பதிவிட்டு ஏலங்களைப் பெறு/.test(await p.textContent("body")));
    await p.screenshot({ path: "/tmp/c_post_ta.png" });
    await p.click(".lang button:has-text('English')"); await p.waitForSelector("text=What do you need shot?");
    await p.click(".tabs a[data-tab=post]"); await p.waitForSelector("#dt");
    await p.fill("#dt", "2027-02-01"); await p.selectOption("#ds", "Madurai"); await p.selectOption("#tn", { label: "Melur" });
    await p.click("button:has-text('Birthday')"); await p.click(".seg3 button:has-text('District')");
    await p.waitForSelector(".map.short .maplibregl-canvas");
    await p.waitForTimeout(600);
    await p.locator(".map.short").scrollIntoViewIfNeeded(); await p.waitForTimeout(200); const box = await p.locator(".map.short").boundingBox();
    await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await p.waitForTimeout(300);
    ok("customer: pin placed by tapping map", await p.locator(".pin").count() === 1);
    await p.fill("#ar", "Hall road"); await p.click("text=Post and get bids"); await p.waitForTimeout(400);
    const post = calls.filter(c => c[0] === "post_requirement").pop();
    ok("customer: post_requirement args", post && post[1].p_event_type === "Birthday" && post[1].p_reach === "district" && post[1].p_event_date === "2027-02-01" && typeof post[1].p_venue_lat === "number" && post[1].p_area === "Hall road", JSON.stringify(post && post[1]));
    // search inside Tamil Nadu only
    await p.click(".tabs a[data-tab=post]"); await p.waitForSelector(".search");
    await p.fill(".search", "Mel"); await p.waitForSelector(".results li");
    ok("customer: Photon search keeps Tamil Nadu only", await p.locator(".results li").count() === 1 && /Melur/.test(await p.textContent(".results")));
    // block
    await p.click(".tabs a[data-tab=requests]"); await p.waitForSelector(".card.tap");
    await p.click(".card.tap >> nth=0"); await p.waitForTimeout(300);
    await p.click(".tabs a[data-tab=me]"); await p.waitForSelector("text=Blocked photographers");
    ok("customer: Me screen with test-mode notice", /Test mode/.test(await p.textContent(".view")));
    ok("customer: no page errors", errs.length === 0, errs.join(" | "));
    await ctx.close(); server.close();
  }

  // ================= PHOTOGRAPHER =================
  {
    db.providerError = "No photographer account found for this mobile number. Ask ClickBreeze to enroll you.";
    const { page: p, errs, server, ctx } = await open(path.join(root, "apps/photographer/www"), "photographer");
    await p.waitForSelector("#ph"); await p.fill("#ph", "9876543210"); await p.click("text=Send code"); await p.waitForSelector("#otp");
    await p.fill("#otp", "123456"); await p.click("text=Verify and continue"); await p.waitForSelector("text=Cannot open your account");
    ok("photographer: unknown number shows the enroll message", /Ask ClickBreeze to enroll/.test(await p.textContent("body")));
    db.providerError = null; await p.click("text=Try again"); await p.waitForSelector(".card");
    ok("photographer: nearby list sorted nearest first", /Murugan Mahal/.test(await p.locator(".card").first().textContent()) && /4.2 km/.test(await p.textContent(".view")));
    ok("photographer: 'Be first' for a request with no bids", /Be first/.test(await p.textContent(".view")));
    await p.click("button.chip:has-text('District')"); await p.waitForTimeout(100);
    ok("photographer: reach filter", await p.locator(".card").count() === 1);
    await p.click("button.chip:has-text('All')");
    await p.locator(".card >> nth=0 >> text=Place bid").click(); await p.fill("#am", "8000"); await p.fill("#pk", "250 photos"); await p.click(".sheet >> text=Place bid");
    await p.waitForTimeout(500);
    const pb = calls.filter(c => c[0] === "place_bid").pop();
    ok("photographer: place_bid args", pb && pb[1].p_req === "f1" && pb[1].p_amount === 8000 && pb[1].p_package === "250 photos", JSON.stringify(pb && pb[1]));
    ok("photographer: list shows my bid after refresh", /Your bid ₹8,000/.test(await p.textContent(".view")));
    await p.click("button:has-text('Map')"); await p.waitForSelector(".maplibregl-canvas");
    await p.waitForFunction(() => document.querySelector(".map")._map.getSource("cb-circles"), null, { timeout: 8000 });
    ok("photographer: circles + price pills", await p.locator(".pill").count() === 2 && (await p.locator(".pill").allTextContents()).some(t => /Be first/.test(t)) && (await p.locator(".pill").allTextContents()).some(t => /₹8,000/.test(t)));
    await p.fill(".search", "Mel"); await p.waitForSelector(".results li"); await p.click(".results li"); await p.waitForTimeout(800);
    const c = await p.evaluate(() => { const m = document.querySelector(".map")._map; const x = m.getCenter(); return [x.lng, x.lat]; });
    ok("photographer: search moves the map to Melur", Math.abs(c[0] - 78.34) < 0.2 && Math.abs(c[1] - 9.84) < 0.2, JSON.stringify(c));
    await p.click(".tabs a[data-tab=bids]"); await p.waitForSelector("text=Withdraw bid");
    ok("photographer: my bids", /₹8,500/.test(await p.textContent(".view")));
    db.pbookings = [{ id: "k1", seq: 1, status: "confirmed", token_amount: 300, due_at: "2027-01-17T00:00:00Z", delivered_at: null, amount: 8500, package: "Photos", event_type: "Wedding", event_date: "2027-01-10", town: "Melur", district: "Madurai", area_name: "Murugan Mahal", notes: "Evening", customer_name: "Anu", customer_phone: "9876500001", venue_lat: 9.84, venue_lng: 78.34 }];
    await p.click(".tabs a[data-tab=bookings]"); await p.waitForSelector("text=Call customer");
    ok("photographer: customer phone and exact venue after booking", await p.getAttribute("a:has-text('Call customer')", "href") === "tel:+919876500001" && /destination=9\.84%2C78\.34/.test(await p.getAttribute("a:has-text('Directions')", "href")));
    await p.click("text=Mark delivered"); await p.click(".sheet button:has-text('Delivered')"); await p.waitForTimeout(300);
    ok("photographer: mark delivered", calls.some(c => c[0] === "mark_delivered"));
    await p.click(".tabs a[data-tab=studio]"); await p.waitForSelector(".map .maplibregl-canvas"); await p.waitForTimeout(700);
    ok("photographer: no pin before location is set", await p.locator(".pin").count() === 0);
    await p.locator(".map").scrollIntoViewIfNeeded(); await p.waitForTimeout(200); const b2 = await p.locator(".map").boundingBox(); await p.mouse.click(b2.x + b2.width / 2, b2.y + b2.height / 2); await p.waitForTimeout(300);
    ok("photographer: pin appears", await p.locator(".pin").count() === 1);
    const pin = await p.locator(".pin").boundingBox();
    await p.mouse.move(pin.x + 15, pin.y + 15); await p.mouse.down(); await p.mouse.move(pin.x + 60, pin.y + 40, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(300);
    await p.selectOption("#rd", "50"); await p.fill("#ad", "Main road, Melur"); await p.click("text=Save studio location"); await p.waitForTimeout(400);
    const sl = calls.filter(c => c[0] === "set_provider_location").pop();
    ok("photographer: set_provider_location after dragging pin", sl && Math.abs(sl[1].p_lat - 10.8) > 0 && sl[1].p_radius === 50 && sl[1].p_address === "Main road, Melur" && sl[1].p_lng > 70, JSON.stringify(sl && sl[1]));
    ok("photographer: no page errors", errs.length === 0, errs.join(" | "));
    await p.screenshot({ path: "/tmp/ph_studio.png" });
    await ctx.close(); server.close();
  }
  // ================= OPEN MODE (no SMS) =================
  {
    const { page: p, errs, server, ctx } = await open(path.join(root, "apps/customer/www"), "customer", "open");
    db.customer = null;
    await p.waitForSelector("#nm");
    ok("open: customer goes straight to name+mobile (no OTP)", await p.locator("#ph").count() === 0 && await p.locator("#mb").count() === 1);
    await p.fill("#nm", "Anu"); await p.fill("#mb", "123"); await p.click("text=Continue"); await p.waitForTimeout(200);
    ok("open: bad mobile rejected", /10-digit/.test(await p.textContent(".err")));
    await p.fill("#mb", "9876500001"); await p.click("text=Continue"); await p.waitForSelector(".card");
    const ec = calls.filter(c => c[0] === "ensure_customer").pop();
    ok("open: ensure_customer gets name and phone", ec && ec[1].p_name === "Anu" && ec[1].p_phone === "9876500001");
    await p.click(".tabs a[data-tab=me]"); await p.waitForSelector("text=Blocked photographers");
    ok("open: customer has no sign-out button", await p.locator("button:has-text('Sign out')").count() === 0);
    await p.reload(); await p.waitForSelector(".tabs");
    ok("open: session survives reopening", await p.locator("#nm").count() === 0);
    ok("open: customer no page errors", errs.length === 0, errs.join(" | "));
    await ctx.close(); server.close();
  }
  {
    const { page: p, errs, server, ctx } = await open(path.join(root, "apps/photographer/www"), "photographer", "open");
    db.linked = false;
    await p.waitForSelector("#ph");
    await p.fill("#ph", "9000000000"); await p.click("text=Continue"); await p.waitForSelector(".err:has-text('No photographer account')");
    ok("open: unknown number rejected", true);
    await p.fill("#ph", "9876543210"); await p.click("text=Continue"); await p.waitForSelector(".card");
    ok("open: photographer opens with enrolled number", /Murugan Mahal/.test(await p.textContent(".view")));
    await p.reload(); await p.waitForSelector(".tabs");
    ok("open: photographer stays linked after reopening", await p.locator("#ph").count() === 0);
    ok("open: photographer no page errors", errs.length === 0, errs.join(" | "));
    await ctx.close(); server.close();
  }
  await browser.close();
  console.log(fails ? "FAILS: " + fails : "ALL PASS"); process.exit(fails ? 1 : 0);
})().catch(e => { console.error("CRASH", e.message); process.exit(1); });
