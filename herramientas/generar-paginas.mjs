// Genera una página estática por proyecto (sitio/proyectos/<id>.html) para que Google y las
// redes sociales vean el nombre, el precio, la ciudad y los modelos sin ejecutar JavaScript, más
// el sitemap.xml y los datos estructurados (JSON-LD) de la portada. Es el equivalente de
// paginas_producto.py del catálogo de Electronic Games. Correr después de editar proyectos:
//   npm run paginas
import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { planReferencial, dinero, porcentaje } from "../sitio/js/finanzas.js";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "sitio");
const leer = f => JSON.parse(readFileSync(join(raiz, "datos", f), "utf8"));
const sitio = leer("sitio.json"), params = leer("parametros-financieros.json"), { proyectos } = leer("proyectos.json");
const dominio = sitio.dominio.replace(/\/?$/, "/");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ETAPAS = { inmediata: "Entrega inmediata", construccion: "En construcción", planos: "En planos" };

const carpeta = join(raiz, "proyectos");
mkdirSync(carpeta, { recursive: true });
for (const f of readdirSync(carpeta)) if (f.endsWith(".html")) unlinkSync(join(carpeta, f));

function jsonLd(p, desde, hasta){
  return {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: p.nombre,
    description: p.descripcion,
    url: `${dominio}proyectos/${p.id}.html`,
    datePosted: params.vigencia,
    image: p.fotos?.length ? p.fotos.map(f => new URL(f, dominio).href) : undefined,
    contentLocation: {
      "@type": "Place",
      name: `${p.sector}, ${p.ciudad}`,
      address: { "@type": "PostalAddress", addressLocality: p.ciudad, addressCountry: "EC" },
      geo: { "@type": "GeoCoordinates", latitude: p.coordenadas[0], longitude: p.coordenadas[1] },
    },
    offers: { "@type": "AggregateOffer", priceCurrency: "USD", lowPrice: desde, highPrice: hasta, offerCount: p.modelos.reduce((a, m) => a + m.disponibles, 0), availability: "https://schema.org/InStock" },
  };
}

const urls = [dominio];
for (const p of proyectos){
  const precios = p.modelos.map(m => m.precio), desde = Math.min(...precios), hasta = Math.max(...precios);
  const ref = planReferencial(desde, params);
  const titulo = `${p.nombre} · ${p.tipo === "departamento" ? "Departamentos" : "Casas"} en ${p.ciudad} desde ${dinero(desde)}`;
  const descripcion = `${p.nombre} en ${p.sector}: ${p.modelos.length} modelos de ${Math.min(...p.modelos.map(m => m.m2))} a ${Math.max(...p.modelos.map(m => m.m2))} m², desde ${dinero(desde)}${ref ? `, cuota desde ${dinero(ref.cuotaTotal)} al mes con ${ref.programa.nombre} (${porcentaje(ref.programa.tasa)})` : ""}. ${ETAPAS[p.etapa]}.`;
  const destino = `../#proyecto-${p.id}`;
  const html = `<!doctype html>
<html lang="es-EC">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descripcion)}">
<link rel="canonical" href="${dominio}proyectos/${p.id}.html">
<meta property="og:type" content="website">
<meta property="og:locale" content="es_EC">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(descripcion)}">
<meta property="og:url" content="${dominio}proyectos/${p.id}.html">
${p.fotos?.length ? `<meta property="og:image" content="${esc(new URL(p.fotos[0], dominio).href)}">` : ""}
<link rel="icon" href="../favicon.svg" type="image/svg+xml">
<script type="application/ld+json">${JSON.stringify(jsonLd(p, desde, hasta))}</script>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#EDF1EE;color:#14211C;line-height:1.5}main{max-width:760px;margin:0 auto;padding:32px 16px}h1{font-size:2rem;margin:.2em 0}table{border-collapse:collapse;width:100%}td,th{padding:8px;border-bottom:1px solid #C8D3CD;text-align:left}a.btn{display:inline-block;margin-top:16px;padding:12px 18px;background:#F2A93B;color:#1B1306;font-weight:700;text-decoration:none;border-radius:6px}@media (prefers-color-scheme:dark){body{background:#0C1512;color:#E5EEE9}td,th{border-color:#25362E}}</style>
<script>location.replace(${JSON.stringify(destino)});</script>
</head>
<body>
<main>
<p>${esc(p.ciudad)} · ${esc(p.sector)} · ${esc(ETAPAS[p.etapa])}</p>
<h1>${esc(p.nombre)}</h1>
<p>${esc(p.descripcion)}</p>
<p><strong>Desde ${esc(dinero(desde))}</strong>${ref ? ` · cuota desde ${esc(dinero(ref.cuotaTotal))} al mes con ${esc(ref.programa.nombre)}` : ""}.</p>
<table><thead><tr><th>Modelo</th><th>Área</th><th>Dormitorios</th><th>Baños</th><th>Precio</th></tr></thead><tbody>
${p.modelos.map(m => `<tr><td>${esc(m.nombre)}</td><td>${m.m2} m²</td><td>${m.habitaciones}</td><td>${String(m.banos).replace(".", ",")}</td><td>${esc(dinero(m.precio))}</td></tr>`).join("\n")}
</tbody></table>
<p>Amenidades: ${esc(p.amenidades.join(", "))}.</p>
<a class="btn" href="${destino}">Ver el proyecto y precalificarme</a>
</main>
</body>
</html>
`;
  writeFileSync(join(carpeta, `${p.id}.html`), html);
  urls.push(`${dominio}proyectos/${p.id}.html`);
}

writeFileSync(join(raiz, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${esc(u)}</loc><lastmod>${params.vigencia}</lastmod></url>`).join("\n")}
</urlset>
`);

// Lista de proyectos en la portada (JSON-LD), entre los marcadores de index.html.
const lista = {
  "@context": "https://schema.org", "@type": "ItemList", name: `Proyectos de ${sitio.marca}`,
  itemListElement: proyectos.map((p, i) => ({ "@type": "ListItem", position: i + 1, url: `${dominio}proyectos/${p.id}.html`, name: p.nombre })),
};
const indice = join(raiz, "index.html");
const html = readFileSync(indice, "utf8");
const nuevo = html.replace(/<!-- jsonld:inicio -->[\s\S]*?<!-- jsonld:fin -->/, `<!-- jsonld:inicio --><script type="application/ld+json">${JSON.stringify(lista)}</script><!-- jsonld:fin -->`);
writeFileSync(indice, nuevo);
console.log(`${proyectos.length} páginas de proyecto, sitemap con ${urls.length} direcciones${nuevo === html ? " (index.html sin cambios)" : ""}.`);
