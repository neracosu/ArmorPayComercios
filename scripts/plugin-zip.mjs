// Empaqueta el plugin de WooCommerce y publica el manifiesto de actualización.
// La versión sale del header del .php — una sola fuente de verdad: bump ahí,
// correr `npm run plugin:zip`, y los WordPress instalados ven la nueva versión
// en su siguiente chequeo (el zip y el json se sirven desde public/descargas/).
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";

const PLUGIN_DIR = "integrations/woocommerce";
const SLUG = "armorpay-woocommerce";
const php = readFileSync(`${PLUGIN_DIR}/${SLUG}/${SLUG}.php`, "utf8");

const header = (nombre) =>
  php.match(new RegExp(`^\\s*\\*\\s*${nombre}:\\s*(\\S+)`, "m"))?.[1] ?? null;

const version = header("Version");
if (!version) {
  throw new Error("No se encontró el header Version en el plugin");
}
const readme = readFileSync(`${PLUGIN_DIR}/${SLUG}/readme.txt`, "utf8");
const tested = readme.match(/^Tested up to:\s*(\S+)/m)?.[1] ?? "";

mkdirSync("public/descargas", { recursive: true });
rmSync(`public/descargas/${SLUG}.zip`, { force: true });
execFileSync("zip", ["-r", `../../public/descargas/${SLUG}.zip`, SLUG], {
  cwd: PLUGIN_DIR,
  stdio: "inherit",
});

const manifest = {
  id: `armorpay.net/${SLUG}`,
  slug: SLUG,
  version,
  url: "https://armorpay.net/docs/api",
  package: `https://armorpay.net/descargas/${SLUG}.zip`,
  requires: header("Requires at least") ?? "6.0",
  requires_php: header("Requires PHP") ?? "7.4",
  tested,
};
writeFileSync(
  `public/descargas/${SLUG}.json`,
  JSON.stringify(manifest, null, 2) + "\n"
);
console.log(`Plugin ${version} empaquetado: zip + manifiesto en public/descargas/`);
