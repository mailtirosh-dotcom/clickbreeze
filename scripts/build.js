// Builds apps/<name>/www from public/ + shared/ (no dependencies).
// Usage: node scripts/build.js customer|photographer
const fs = require("fs"), path = require("path");
const name = process.argv[2];
if (!["customer", "photographer"].includes(name)) { console.error("Usage: node scripts/build.js customer|photographer"); process.exit(1); }
const root = path.resolve(__dirname, "..");
const app = path.join(root, "apps", name), www = path.join(app, "www");
fs.rmSync(www, { recursive: true, force: true });
fs.cpSync(path.join(app, "public"), www, { recursive: true });
for (const f of ["lib.js", "app.css", "config.js"]) fs.copyFileSync(path.join(root, "shared", f), path.join(www, f));
// supabase-js is bundled from node_modules (npm install) so the app does not load it from a CDN.
const sup = path.join(app, "node_modules", "@supabase", "supabase-js", "dist", "umd", "supabase.js");
fs.mkdirSync(path.join(www, "vendor"), { recursive: true });
if (fs.existsSync(sup)) fs.copyFileSync(sup, path.join(www, "vendor", "supabase.js"));
else if (!fs.existsSync(path.join(www, "vendor", "supabase.js"))) console.warn("WARNING: run `npm install` in apps/" + name + " first so vendor/supabase.js exists.");
console.log("Built", path.relative(root, www));
