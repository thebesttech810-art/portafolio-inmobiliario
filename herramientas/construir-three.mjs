// Genera sitio/vendor/three.js con SOLO las piezas de three.js que usa el sitio (como en el
// catálogo de Electronic Games): lee los `import { ... } from "../vendor/three.js"` de sitio/js,
// arma un archivo de entrada y lo empaqueta con esbuild. Correr después de usar una pieza nueva:
//   npm run vendor
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const VERSION_THREE = "0.186.1", VERSION_ESBUILD = "0.25.10";
const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const carpetaJs = join(raiz, "sitio", "js");

const nombres = new Set();
for (const f of readdirSync(carpetaJs).filter(f => f.endsWith(".js"))){
  const src = readFileSync(join(carpetaJs, f), "utf8");
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']\.\.\/vendor\/three\.js["']/g)){
    m[1].split(",").map(s => s.trim()).filter(Boolean).forEach(n => nombres.add(n.split(/\s+as\s+/)[0]));
  }
}
const EXTRAS = {
  OrbitControls: "three/examples/jsm/controls/OrbitControls.js",
  mergeGeometries: "three/examples/jsm/utils/BufferGeometryUtils.js",
};
const deThree = [...nombres].filter(n => !EXTRAS[n]).sort();
let entrada = `export { ${deThree.join(", ")} } from "three";\n`;
for (const [n, ruta] of Object.entries(EXTRAS)) if (nombres.has(n)) entrada += `export { ${n} } from "${ruta}";\n`;

const trabajo = join(tmpdir(), "construir-three");
if (!existsSync(join(trabajo, "node_modules", "three", "package.json"))){
  mkdirSync(trabajo, { recursive: true });
  writeFileSync(join(trabajo, "package.json"), "{\"private\":true}");
  execSync(`npm install --no-save --no-audit --no-fund three@${VERSION_THREE} esbuild@${VERSION_ESBUILD}`, { cwd: trabajo, stdio: "inherit" });
}
writeFileSync(join(trabajo, "entrada.js"), entrada);
const salida = join(raiz, "sitio", "vendor", "three.js");
execSync(`npx esbuild entrada.js --bundle --format=esm --minify --legal-comments=none --outfile="${salida}"`, { cwd: trabajo, stdio: "inherit" });
const cabecera = `/* three.js r${VERSION_THREE.split(".")[1]} (MIT, https://threejs.org) recortado a lo que usa el sitio. Generado por herramientas/construir-three.mjs: no editar a mano. */\n`;
writeFileSync(salida, cabecera + readFileSync(salida, "utf8"));
console.log(`vendor/three.js: ${nombres.size} piezas, ${(statSync(salida).size / 1024).toFixed(0)} KB`);
