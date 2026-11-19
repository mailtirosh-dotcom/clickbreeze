(function () {
  var cfg = window.CB_CONFIG || {};
  var sb = window.supabase.createClient(cfg.url, cfg.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });
  var CB = { sb: sb };
  CB.ready = new Promise(function (res) { CB._ok = res; });
  CB.defer = false;
  CB.reveal = function () { document.documentElement.style.visibility = "visible"; };

  CB.go = function (p) { location.replace(p); };

  // Works out where the signed-in person is in the sign-in flow.
  CB.state = async function () {
    var s = (await sb.auth.getSession()).data.session;
    if (!s) return { step: "signin" };
    var row = await sb.from("admin_users").select("role,full_name,email").eq("user_id", s.user.id).maybeSingle();
    if (!row.data) { await sb.auth.signOut(); return { step: "denied" }; }
    var a = (await sb.auth.mfa.getAuthenticatorAssuranceLevel()).data || {};
    var f = (await sb.auth.mfa.listFactors()).data || {};
    var verified = (f.totp || []).filter(function (x) { return x.status === "verified"; });
    if (!verified.length) return { step: "enroll", session: s, admin: row.data };
    if (a.currentLevel !== "aal2") return { step: "code", session: s, factor: verified[0], admin: row.data };
    return { step: "ok", session: s, admin: row.data };
  };

  CB.signOut = async function () {
    await sb.auth.signOut();
    CB.go("index.html");
  };

  function addSignOut(admin) {
    var nav = document.querySelector('nav[aria-label="Admin"]');
    if (!nav) return;
    var box = document.createElement("div");
    box.style.cssText = "margin-top:auto;padding:16px 12px 0;border-top:1px solid #44403C;color:#D6D3D1;font-size:13px";
    var who = document.createElement("div");
    who.textContent = (admin.full_name || admin.email) + " · " + admin.role.replace("_", " ");
    who.style.marginBottom = "8px";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Sign out";
    btn.style.cssText = "height:44px;padding:0 16px;border-radius:8px;border:1px solid #78716C;background:transparent;color:#FFFFFF;font:inherit;font-weight:600;cursor:pointer";
    btn.onclick = CB.signOut;
    box.appendChild(who); box.appendChild(btn); nav.appendChild(box);
  }

  // Every admin page calls this. The page stays hidden until the person has
  // passed password + authenticator and has an admin role.
  CB.guard = async function () {
    var st = await CB.state();
    if (st.step !== "ok") {
      CB.go(st.step === "enroll" ? "AdminTwoFA.html" : "index.html" + (st.step === "denied" ? "?denied=1" : ""));
      return;
    }
    CB.me = { user_id: st.session.user.id, role: st.admin.role, full_name: st.admin.full_name, email: st.admin.email };
    CB._ok(CB.me);
    if (!CB.defer) CB.reveal();
    else setTimeout(CB.reveal, 6000);
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () { addSignOut(st.admin); });
    } else { addSignOut(st.admin); }
  };

  window.CB = CB;
})();
