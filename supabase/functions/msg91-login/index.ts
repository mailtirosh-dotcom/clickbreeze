// ClickBreeze: exchanges a verified MSG91 OTP-widget access token for a Supabase sign-in.
// Secret needed: MSG91_AUTHKEY (set in Supabase > Edge Functions > Secrets).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

// Collect every run of 10+ digits found anywhere in a value, so we can find the verified mobile number.
function numbersIn(v: unknown, out: string[] = []): string[] {
  if (v == null) return out;
  if (typeof v === "string" || typeof v === "number") {
    const m = String(v).match(/\d{10,13}/g); if (m) out.push(...m);
  } else if (typeof v === "object") for (const x of Object.values(v as Record<string, unknown>)) numbersIn(x, out);
  return out;
}
function jwtPayload(t: string): unknown {
  try { const p = t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"); return JSON.parse(atob(p)); } catch { return null; }
}
const shape = (v: unknown): unknown => (v && typeof v === "object" ? Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, typeof x === "object" ? shape(x) : typeof x])) : typeof v);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const authkey = Deno.env.get("MSG91_AUTHKEY");
    if (!authkey) return json({ error: "Server is not set up yet (MSG91_AUTHKEY missing)." }, 500);
    const { accessToken, phone } = await req.json();
    const typed = String(phone || "").replace(/\D/g, "").slice(-10);
    if (!/^[6-9]\d{9}$/.test(typed) || !accessToken) return json({ error: "Enter your mobile number and the code." }, 400);

    // 1. Ask MSG91 whether this access token is genuine.
    const vr = await fetch("https://control.msg91.com/api/v5/widget/verifyAccessToken", {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ authkey, "access-token": accessToken }),
    });
    const verdict = await vr.json().catch(() => null);
    const okType = verdict && (String(verdict.type).toLowerCase() === "success" || verdict.success === true);
    if (!vr.ok || !okType) return json({ error: "The code could not be verified. Please try again." }, 401);

    // 2. The verified number must match the number typed (read it from MSG91's answer or from the token).
    const seen = [...numbersIn(verdict), ...numbersIn(jwtPayload(String(accessToken)))].map((n) => n.slice(-10));
    if (!seen.includes(typed)) {
      return json({ error: "Could not confirm the verified number.", debug: { verdictShape: shape(verdict) } }, 401);
    }

    // 3. Find or create the Supabase user for this number, then give the app a one-time sign-in token.
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const email = `${typed}@phone.clickbreeze.app`;
    const cr = await admin.auth.admin.createUser({ email, phone: "91" + typed, email_confirm: true, phone_confirm: true });
    if (cr.error && !/already|registered|exists/i.test(cr.error.message)) return json({ error: "Could not create the account: " + cr.error.message }, 500);
    const gl = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (gl.error || !gl.data?.properties?.hashed_token) return json({ error: "Could not sign you in: " + (gl.error?.message || "no token") }, 500);
    return json({ token_hash: gl.data.properties.hashed_token });
  } catch (e) {
    return json({ error: "Unexpected error: " + (e as Error).message }, 500);
  }
});
