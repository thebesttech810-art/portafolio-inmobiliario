// Arma una copia del sitio lista para publicar como Artifact de claude.ai (una página privada
// para mostrar el sitio sin servidor): el HTML va sin <html>/<head>/<body> (la plataforma los
// pone), los estilos van en línea y se copian scripts, datos y three.js.
//   node herramientas/artefacto.mjs [carpeta-de-salida]
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const sitio = join(raiz, "sitio");
const salida = resolve(process.argv[2] || join(raiz, "build", "artefacto"));
rmSync(salida, { recursive: true, force: true });
mkdirSync(salida, { recursive: true });

const html = readFileSync(join(sitio, "index.html"), "utf8");
const css = readFileSync(join(sitio, "css", "estilos.css"), "utf8");
// En la galería de claude.ai el título es solo el nombre de la página.
const titulo = "<title>Llave Portafolio Inmobiliario</title>";
const fuentes = [...html.matchAll(/<link rel="(?:preconnect|stylesheet)" href="https:\/\/fonts\.[^"]+"[^>]*>/g)].map(m => m[0]).join("\n");
const cuerpo = html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>")).trim();
writeFileSync(join(salida, "index.html"), `${titulo}\n${fuentes}\n<style>\n${css}\n</style>\n${cuerpo}\n`);
for (const c of ["js", "datos", "vendor"]) cpSync(join(sitio, c), join(salida, c), { recursive: true });
cpSync(join(sitio, "favicon.svg"), join(salida, "favicon.svg"));
console.log(`Artifact listo en ${salida}`);
