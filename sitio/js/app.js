/* Llave · portafolio inmobiliario. Arranque de la página: carga los datos (sitio, proyectos y
   parámetros financieros), arma la portada 3D, el catálogo con filtros, el mapa, la sección de
   financiamiento y el pie. La ficha de cada proyecto vive en ficha.js y el precalificador en
   precalificador.js. Las piezas 3D se cargan solo si el navegador tiene WebGL 2. */
import { $, $$, el, icono, banos, mesAnio, fechaLarga, guardar, leer, aviso, copiar, enlaceWhatsApp, evento, hayWebGL2, escapar, regla } from "./ui.js";
import { dinero, porcentaje, planReferencial, mejorPlan, semaforoPlan, diasDesde, evaluarPerfil } from "./finanzas.js";

const CLAVE_FAV = "llave_favoritos", CLAVE_PRECAL = "llave_precalificacion";
const ETAPAS = { inmediata: "Entrega inmediata", construccion: "En construcción", planos: "En planos" };
const CIUDADES_COORD = {
  "Quito": [-0.18, -78.47], "Sangolquí": [-0.33, -78.45], "Guayaquil": [-2.17, -79.92], "Cuenca": [-2.9, -79.0],
  "Manta": [-0.95, -80.73], "Ambato": [-1.25, -78.62], "Santo Domingo": [-0.25, -79.17],
};

export const estado = {
  sitio: null, params: null, proyectos: [],
  filtros: { q: "", ciudad: "", tipo: "", precioMax: 0, cuotaMax: 0, hab: 0, etapa: "", credito: "", soloAlcanza: false, soloFav: false, orden: "recomendados" },
  favoritos: new Set(leer(CLAVE_FAV, [])),
  comparar: [],
  precal: leer(CLAVE_PRECAL, null),
  webgl: hayWebGL2(),
  miniaturas: null,
};

// ---------- Datos derivados de cada proyecto ----------

function preparar(p, params){
  const precios = p.modelos.map(m => m.precio);
  const desde = Math.min(...precios), hasta = Math.max(...precios);
  const ref = planReferencial(desde, params);
  const creditos = params.programas.filter(pr => p.modelos.some(m => m.precio >= (pr.precioMin || 0) && m.precio <= (pr.precioMax ?? Infinity))).map(pr => pr.id);
  return {
    ...p, desde, hasta, ref,
    m2: [Math.min(...p.modelos.map(m => m.m2)), Math.max(...p.modelos.map(m => m.m2))],
    hab: [Math.min(...p.modelos.map(m => m.habitaciones)), Math.max(...p.modelos.map(m => m.habitaciones))],
    banosMax: Math.max(...p.modelos.map(m => m.banos)),
    parq: Math.max(...p.modelos.map(m => m.parqueaderos)),
    disponibles: p.modelos.reduce((a, m) => a + (m.disponibles || 0), 0),
    creditos,
  };
}

/** Cómo le queda este proyecto a la persona precalificada (si lo está). */
export function situacion(p){
  if (!estado.precal) return null;
  const plan = mejorPlan(p.desde, estado.precal.perfil, estado.params);
  return { plan, semaforo: semaforoPlan(plan, estado.params) };
}

export const proyectoPorId = id => estado.proyectos.find(p => p.id === id);
export const programaPorId = id => estado.params.programas.find(p => p.id === id);
export function etiquetaPrograma(pr){ return `${pr.corto} ${porcentaje(pr.tasa)}`; }

// ---------- Portada ----------

async function iniciarPortada(){
  const { params, proyectos } = estado;
  const tasaMin = Math.min(...params.programas.map(p => p.tasa));
  const entradaMin = Math.min(...params.programas.map(p => 1 - Math.max(...p.financiamiento.map(t => t.porcentaje))).filter(x => x > 0));
  const cuotaMin = Math.min(...proyectos.map(p => p.ref?.cuotaTotal || Infinity));
  const desdeMin = Math.min(...proyectos.map(p => p.desde));
  $("#heroOjo").textContent = `Casas y departamentos desde ${dinero(desdeMin)} · Ecuador`;
  $("#heroVer").textContent = `Ver los ${proyectos.length} proyectos`;
  $("#heroDatos").replaceChildren(
    ...[["Entrada desde", porcentaje(entradaMin, 0)], ["Tasa desde", porcentaje(tasaMin)], ["Cuota desde", `${dinero(cuotaMin)}/mes`]]
      .map(([t, v]) => el("div", {}, el("dt", {}, t), el("dd", {}, v)))
  );
  if (!estado.webgl) return;
  try {
    const { iniciarHero } = await import("./escena-hero.js");
    // Con el tema oscuro la maqueta arranca de noche, con las ventanas encendidas.
    const raizTema = document.documentElement.dataset.theme;
    const oscuro = raizTema === "dark" || (raizTema !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
    const horaInicial = oscuro ? 19.3 : 16.6;
    const hero = iniciarHero($("#heroLienzo"), { hora: horaInicial });
    const rango = $("#horaMaqueta"), salida = $("#horaTexto");
    $("#reloj").hidden = false;
    let tocado = false;
    const mostrar = h => {
      const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
      salida.textContent = `${String(hh).padStart(2, "0")}:${String(mm === 60 ? 59 : mm).padStart(2, "0")}`;
      rango.value = h; rango.style.setProperty("--p", `${((h - rango.min) / (rango.max - rango.min)) * 100}%`);
    };
    mostrar(horaInicial);
    rango.addEventListener("input", () => { tocado = true; hero.setHora(+rango.value); mostrar(+rango.value); });
    // Con el scroll cae la tarde sobre la maqueta (hasta que la persona mueva el reloj).
    let pend = false;
    addEventListener("scroll", () => {
      if (tocado || pend) return;
      pend = true;
      requestAnimationFrame(() => {
        pend = false;
        const t = Math.min(1, scrollY / 700);
        const h = horaInicial + t * (oscuro ? 1.6 : 3.4);
        hero.setHora(h); mostrar(h);
      });
    }, { passive: true });
  } catch (e) {
    console.warn("Portada 3D no disponible:", e);
  }
}

function iniciarFranja(){
  const { params } = estado;
  const items = params.programas.map(pr => {
    const entrada = 1 - Math.max(...pr.financiamiento.map(t => t.porcentaje));
    const tope = pr.precioMax ? ` · hasta ${dinero(pr.precioMax)}` : "";
    return el("div.franja-item", {}, el("strong", {}, pr.nombre), el("span", {}, `${porcentaje(pr.tasa)} · ${entrada > 0 ? `entrada ${porcentaje(entrada, 0)}` : "sin entrada"} · ${pr.plazoMax} años${tope}`));
  });
  const dias = diasDesde(params.vigencia);
  const fecha = el("span.franja-fecha", {}, `Tasas y topes al ${fechaLarga(params.vigencia)}${dias > (params.revisarCadaDias || 60) ? " · por revisar" : ""}`);
  $("#franja").replaceChildren(...items, fecha);
}

// ---------- Catálogo ----------

function opcionesFiltro(){
  const { proyectos, params } = estado;
  const ciudades = [...new Set(proyectos.map(p => p.ciudad))];
  const maxPrecio = Math.ceil(Math.max(...proyectos.map(p => p.hasta)) / 5000) * 5000;
  const minPrecio = Math.floor(Math.min(...proyectos.map(p => p.desde)) / 5000) * 5000;
  const maxCuota = Math.ceil(Math.max(...proyectos.map(p => p.ref?.cuotaTotal || 0)) / 50) * 50;
  const minCuota = Math.floor(Math.min(...proyectos.map(p => p.ref?.cuotaTotal || 0)) / 50) * 50;
  return { ciudades, maxPrecio, minPrecio, maxCuota, minCuota, programas: params.programas };
}

function construirFiltros(){
  const o = opcionesFiltro(), f = estado.filtros;
  f.precioMax ||= o.maxPrecio; f.cuotaMax ||= o.maxCuota;
  const form = $("#filtros");
  const selCiudad = el("select", { id: "fCiudad", name: "ciudad" }, el("option", { value: "" }, "Todas las ciudades"), ...o.ciudades.map(c => el("option", { value: c }, c)));
  const selTipo = el("select", { id: "fTipo", name: "tipo" }, el("option", { value: "" }, "Casas y departamentos"), el("option", { value: "casa" }, "Casas"), el("option", { value: "departamento" }, "Departamentos"));
  const rango = (id, etiqueta, min, max, paso, valor, formato) => {
    const out = el("output", { for: id });
    const inp = el("input", { type: "range", id, min, max, step: paso, value: valor });
    const pintar = () => { out.textContent = formato(+inp.value, +inp.value >= max); inp.style.setProperty("--p", `${((inp.value - min) / (max - min)) * 100}%`); };
    pintar(); inp.addEventListener("input", pintar);
    return el("label.campo.campo-rango", { for: id }, el("span", {}, etiqueta, " ", out), inp);
  };
  const chipsGrupo = (nombre, leyenda, opciones) => el("fieldset.campo", {}, el("legend", {}, leyenda),
    el("div.chips", { role: "group" }, ...opciones.map(([v, t]) => el("button.chip", { type: "button", "aria-pressed": String(String(f[nombre]) === String(v)), dataset: { filtro: nombre, valor: v } }, t))));
  const toggle = el("button.btn.btn-linea.btn-chico.filtros-toggle", { type: "button", "aria-expanded": "false", "aria-controls": "filtrosMas", html: `${icono("filtro")} Más filtros` });
  form.replaceChildren(
    el("div.filtros-fila", {},
      el("label.campo.campo-buscar", { for: "fBuscar" }, el("span", {}, "Buscar"), el("input", { type: "search", id: "fBuscar", placeholder: "Sector, nombre o ciudad", autocomplete: "off", value: f.q })),
      el("label.campo", { for: "fCiudad" }, el("span", {}, "Ciudad"), selCiudad),
      el("label.campo", { for: "fTipo" }, el("span", {}, "Tipo"), selTipo),
      toggle,
    ),
    el("div.filtros-mas", { id: "filtrosMas" },
      el("div.filtros-fila", {},
        rango("fPrecio", "Precio hasta", o.minPrecio + 5000, o.maxPrecio, 1000, f.precioMax, (v, tope) => tope ? "cualquiera" : dinero(v)),
        rango("fCuota", "Cuota mensual hasta", o.minCuota + 50, o.maxCuota, 10, f.cuotaMax, (v, tope) => tope ? "cualquiera" : `${dinero(v)}/mes`),
      ),
      el("div.filtros-fila", {},
        chipsGrupo("hab", "Dormitorios", [[0, "Todos"], [2, "2 o más"], [3, "3 o más"], [4, "4 o más"]]),
        chipsGrupo("etapa", "Etapa", [["", "Todas"], ["inmediata", "Entrega inmediata"], ["construccion", "En construcción"], ["planos", "En planos"]]),
      ),
      el("div.filtros-fila", {},
        chipsGrupo("credito", "Crédito", [["", "Todos"], ...o.programas.filter(p => ["credicasa", "miti-vis", "miti-vip"].includes(p.id)).map(p => [p.id, p.corto]), ["biess", "BIESS"], ["banca", "Banco"]]),
        el("fieldset.campo", {}, el("legend", {}, "Mostrar"),
          el("div.chips", {},
            el("button.chip", { type: "button", id: "fAlcanza", "aria-pressed": String(f.soloAlcanza), disabled: !estado.precal || null, title: estado.precal ? "" : "Precalifícate para usar este filtro" }, "Solo los que me alcanzan"),
            el("button.chip", { type: "button", id: "fFav", "aria-pressed": String(f.soloFav), html: `${icono("corazon")} Favoritos` }),
          )),
      ),
    ),
  );
  selCiudad.value = f.ciudad; selTipo.value = f.tipo;
  form.addEventListener("submit", e => e.preventDefault());
  $("#fBuscar").addEventListener("input", e => { f.q = e.target.value; pintarCatalogo(); });
  selCiudad.addEventListener("change", () => { f.ciudad = selCiudad.value; pintarCatalogo(); marcarCiudad(); });
  selTipo.addEventListener("change", () => { f.tipo = selTipo.value; pintarCatalogo(); });
  $("#fPrecio").addEventListener("input", e => { f.precioMax = +e.target.value; pintarCatalogo(); });
  $("#fCuota").addEventListener("input", e => { f.cuotaMax = +e.target.value; pintarCatalogo(); });
  toggle.addEventListener("click", () => { const a = form.classList.toggle("abiertos"); toggle.setAttribute("aria-expanded", String(a)); });
  form.addEventListener("click", e => {
    const b = e.target.closest("[data-filtro]");
    if (b){
      const { filtro, valor } = b.dataset;
      f[filtro] = filtro === "hab" ? +valor : valor;
      $$(`[data-filtro="${filtro}"]`, form).forEach(x => x.setAttribute("aria-pressed", String(x === b)));
      pintarCatalogo();
    }
    if (e.target.closest("#fAlcanza")){ f.soloAlcanza = !f.soloAlcanza; $("#fAlcanza").setAttribute("aria-pressed", String(f.soloAlcanza)); pintarCatalogo(); }
    if (e.target.closest("#fFav")){ f.soloFav = !f.soloFav; $("#fFav").setAttribute("aria-pressed", String(f.soloFav)); pintarCatalogo(); }
  });
}

function filtrar(){
  const f = estado.filtros, o = opcionesFiltro();
  const q = f.q.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  const norm = s => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  let lista = estado.proyectos.filter(p =>
    (!q || norm(`${p.nombre} ${p.ciudad} ${p.sector} ${p.descripcion}`).includes(q)) &&
    (!f.ciudad || p.ciudad === f.ciudad) &&
    (!f.tipo || p.tipo === f.tipo) &&
    (f.precioMax >= o.maxPrecio || p.desde <= f.precioMax) &&
    (f.cuotaMax >= o.maxCuota || (cuotaDe(p) <= f.cuotaMax)) &&
    (!f.hab || p.hab[1] >= f.hab) &&
    (!f.etapa || p.etapa === f.etapa) &&
    (!f.credito || p.creditos.includes(f.credito)) &&
    (!f.soloFav || estado.favoritos.has(p.id)) &&
    (!f.soloAlcanza || ["verde", "amarillo"].includes(situacion(p)?.semaforo))
  );
  const orden = {
    recomendados: (a, b) => (orden.alcance(a, b)) || (b.destacado - a.destacado) || a.desde - b.desde,
    alcance: (a, b) => { const r = s => ({ verde: 0, amarillo: 1, rojo: 2 }[situacion(s)?.semaforo] ?? 1); return estado.precal ? r(a) - r(b) : 0; },
    precio: (a, b) => a.desde - b.desde,
    precioDesc: (a, b) => b.desde - a.desde,
    cuota: (a, b) => cuotaDe(a) - cuotaDe(b),
    entrega: (a, b) => a.entrega.localeCompare(b.entrega),
  };
  return lista.sort(orden[f.orden] || orden.recomendados);
}

/** Cuota que se muestra: la personal si hay precalificación; si no, la referencial. */
export function cuotaDe(p){
  const s = situacion(p);
  return (s?.plan?.cuotaTotal) || p.ref?.cuotaTotal || 0;
}

const SILUETA = `<svg class="tarjeta-silueta" viewBox="0 0 200 80" fill="currentColor" aria-hidden="true"><path d="M10 80V44l40-26 40 26v36zM96 80V30h70v50zM112 22h38v8h-38z"/></svg>`;

function tarjeta(p){
  const s = situacion(p);
  const pr = s?.plan?.programa || p.ref?.programa;
  const imagen = el("div.tarjeta-imagen", { html: SILUETA });
  const fav = estado.favoritos.has(p.id);
  const badges = el("div.tarjeta-badges", {},
    el("span.etiqueta", {}, p.etapa === "construccion" ? `En construcción · ${p.avance} %` : ETAPAS[p.etapa]),
    p.disponibles <= 5 ? el("span.etiqueta.etiqueta-luz", {}, `Quedan ${p.disponibles}`) : null,
  );
  imagen.append(badges, el("button.fav", { type: "button", "aria-pressed": String(fav), "aria-label": `${fav ? "Quitar de" : "Guardar en"} favoritos: ${p.nombre}`, dataset: { fav: p.id }, html: icono("corazon") }));
  cargarImagen(imagen, p);
  let personal = null;
  if (s){
    const txt = s.semaforo === "verde" ? "Te alcanza" : s.semaforo === "amarillo" ? "Casi te alcanza" : "Fuera de tu presupuesto";
    personal = el(`span.etiqueta.personal.etiqueta-${s.semaforo === "verde" ? "ok" : s.semaforo === "amarillo" ? "alerta" : "peligro"}`, {}, txt);
  }
  const enComparar = estado.comparar.includes(p.id);
  return el("article.tarjeta", { dataset: { id: p.id } },
    imagen,
    el("div.tarjeta-cuerpo", {},
      el("p.tarjeta-lugar", { html: `${icono("pin")} ${escapar(p.ciudad)} · ${escapar(p.sector)}` }),
      el("h3", {}, el("a", { href: `#proyecto-${p.id}` }, p.nombre)),
      el("div.cota", {}, p.m2[0] === p.m2[1] ? `${p.m2[0]} m²` : `${p.m2[0]}–${p.m2[1]} m²`),
      el("div.specs", { html: `<span>${icono("cama")} ${p.hab[0] === p.hab[1] ? p.hab[0] : `${p.hab[0]}–${p.hab[1]}`} dorm.</span><span>${icono("bano")} hasta ${banos(p.banosMax)}</span><span>${icono("auto")} ${p.parq}</span>${p.tipo === "departamento" ? "<span>Departamento</span>" : ""}` }),
      el("div.precio-fila", {},
        el("div.precio", {}, el("small", {}, "Desde"), el("strong", {}, dinero(p.desde))),
        el("div.cuota", {}, el("small", {}, s ? "Tu cuota aprox." : "Cuota desde"), el("strong", {}, `${dinero(cuotaDe(p))}/mes`), el("small", {}, pr ? etiquetaPrograma(pr) : "")),
      ),
      el("div.tarjeta-pie", {},
        personal || el("span.personal.etiqueta", {}, `${p.disponibles} disponibles`),
        el("label.comparar", {}, el("input", { type: "checkbox", dataset: { comparar: p.id }, checked: enComparar || null }), "Comparar"),
      ),
    ),
  );
}

const observadorImg = "IntersectionObserver" in window ? new IntersectionObserver(entradas => {
  for (const e of entradas) if (e.isIntersecting){ observadorImg.unobserve(e.target); e.target._cargar?.(); }
}, { rootMargin: "300px" }) : null;

/** Foto real si existe; si no, render de la maqueta cuando la tarjeta se acerca a la pantalla. */
export function cargarImagen(contenedor, p, vista = "frente", ancho = 640, alto = 480){
  const poner = src => {
    if (!src) return;
    const img = el("img", { alt: `${p.nombre}: ${vista === "frente" ? "fachada" : vista}`, decoding: "async", loading: "lazy" });
    img.onload = () => img.classList.add("cargada");
    img.src = src;
    contenedor.querySelector("img")?.remove();
    contenedor.prepend(img);
  };
  if (p.fotos?.length){ poner(p.fotos[0]); return; }
  if (!estado.webgl) return;
  contenedor._cargar = async () => {
    estado.miniaturas ||= import("./miniaturas.js");
    const m = await estado.miniaturas;
    poner(await m.render(p, vista, ancho, alto));
  };
  if (observadorImg) observadorImg.observe(contenedor); else contenedor._cargar();
}

export function pintarCatalogo(){
  const lista = filtrar();
  const total = estado.proyectos.length;
  const grilla = $("#grilla");
  if (!lista.length){
    grilla.replaceChildren(el("div.vacio", {}, el("strong", {}, "Ningún proyecto cumple esos filtros."), el("span", {}, "Prueba con otra ciudad o sube el precio máximo."), el("button.btn.btn-linea.btn-chico", { type: "button", onclick: limpiarFiltros }, "Quitar filtros")));
  } else grilla.replaceChildren(...lista.map(tarjeta));
  const ordenSel = el("select", { "aria-label": "Ordenar proyectos", id: "fOrden" },
    ...[["recomendados", "Recomendados"], ["precio", "Precio: menor a mayor"], ["precioDesc", "Precio: mayor a menor"], ["cuota", "Cuota mensual"], ["entrega", "Fecha de entrega"]].map(([v, t]) => el("option", { value: v }, t)));
  ordenSel.value = estado.filtros.orden;
  ordenSel.addEventListener("change", () => { estado.filtros.orden = ordenSel.value; pintarCatalogo(); });
  const resumen = estado.precal
    ? (() => { const n = estado.proyectos.filter(p => situacion(p)?.semaforo === "verde").length; return el("span", {}, el("strong", {}, `${lista.length} de ${total}`), ` proyectos · ${n} te alcanzan con tu precalificación`); })()
    : el("span", {}, el("strong", {}, `${lista.length} de ${total}`), " proyectos");
  $("#conteo").replaceChildren(resumen, ordenSel);
  $("#proyTitulo").textContent = `${total} proyectos en ${new Set(estado.proyectos.map(p => p.ciudad)).size} ciudades`;
}

function limpiarFiltros(){
  Object.assign(estado.filtros, { q: "", ciudad: "", tipo: "", precioMax: 0, cuotaMax: 0, hab: 0, etapa: "", credito: "", soloAlcanza: false, soloFav: false });
  construirFiltros(); pintarCatalogo(); marcarCiudad();
}

function eventosCatalogo(){
  $("#grilla").addEventListener("click", e => {
    const f = e.target.closest("[data-fav]");
    if (f){
      e.preventDefault();
      const id = f.dataset.fav;
      estado.favoritos.has(id) ? estado.favoritos.delete(id) : estado.favoritos.add(id);
      guardar(CLAVE_FAV, [...estado.favoritos]);
      f.setAttribute("aria-pressed", String(estado.favoritos.has(id)));
      aviso(estado.favoritos.has(id) ? "Guardado en favoritos" : "Quitado de favoritos");
      evento("favorito", { proyecto: id });
    }
  });
  $("#grilla").addEventListener("change", e => {
    const c = e.target.closest("[data-comparar]");
    if (!c) return;
    const id = c.dataset.comparar;
    if (c.checked){
      if (estado.comparar.length >= 3){ c.checked = false; aviso("Puedes comparar hasta 3 proyectos"); return; }
      estado.comparar.push(id);
    } else estado.comparar = estado.comparar.filter(x => x !== id);
    pintarBandeja();
  });
}

// ---------- Comparador ----------

function pintarBandeja(){
  const b = $("#bandeja");
  b.hidden = estado.comparar.length === 0;
  if (b.hidden) return;
  const nombres = estado.comparar.map(id => proyectoPorId(id).nombre).join(", ");
  b.replaceChildren(
    el("span", {}, nombres),
    el("button.btn.btn-luz.btn-chico", { type: "button", disabled: estado.comparar.length < 2 || null, onclick: abrirComparador }, `Comparar (${estado.comparar.length})`),
    el("button.btn.btn-fantasma.btn-icono", { type: "button", "aria-label": "Vaciar comparación", style: { color: "inherit" }, html: icono("cerrar"), onclick: () => { estado.comparar = []; $$("[data-comparar]").forEach(c => (c.checked = false)); pintarBandeja(); } }),
  );
}

function abrirComparador(){
  const ps = estado.comparar.map(proyectoPorId);
  const filas = [
    ["Ciudad", p => `${p.ciudad} · ${p.sector}`],
    ["Precio desde", p => dinero(p.desde), true],
    [estado.precal ? "Tu cuota aprox." : "Cuota desde", p => `${dinero(cuotaDe(p))}/mes`, true],
    ["Crédito sugerido", p => (situacion(p)?.plan?.programa || p.ref?.programa)?.nombre || "—"],
    ["Área", p => `${p.m2[0]}–${p.m2[1]} m²`, true],
    ["Dormitorios", p => `${p.hab[0]}–${p.hab[1]}`, true],
    ["Baños", p => `hasta ${banos(p.banosMax)}`, true],
    ["Parqueaderos", p => String(p.parq), true],
    ["Etapa", p => ETAPAS[p.etapa]],
    ["Entrega", p => mesAnio(p.entrega)],
    ["Entrada en cuotas", p => p.entradaCuotasMeses ? `${p.entradaCuotasMeses} meses` : "No"],
    ["Alícuota", p => `${dinero(p.alicuota)}/mes`, true],
    ["Amenidades", p => p.amenidades.slice(0, 4).join(", ")],
  ];
  if (estado.precal) filas.splice(3, 0, ["¿Te alcanza?", p => ({ verde: "Sí", amarillo: "Casi", rojo: "No" }[situacion(p)?.semaforo] || "—")]);
  const d = $("#comparador");
  d.replaceChildren(
    el("div.dialogo-barra", {}, el("h2", { id: "compTitulo" }, "Comparar proyectos"), el("button.btn.btn-fantasma.btn-icono", { type: "button", "aria-label": "Cerrar", html: icono("cerrar"), onclick: () => d.close() })),
    el("div.dialogo-cuerpo", {}, el("div.tabla-scroll", { style: { margin: "16px", border: "1px solid var(--linea)" } },
      el("table.tabla", {},
        el("thead", {}, el("tr", {}, el("th", {}, ""), ...ps.map(p => el("th", {}, el("a", { href: `#proyecto-${p.id}`, onclick: () => d.close() }, p.nombre))))),
        el("tbody", {}, ...filas.map(([t, f, num]) => el("tr", {}, el("th", {}, t), ...ps.map(p => el(num ? "td.num" : "td", {}, f(p))))))
      ))),
  );
  d.showModal();
  evento("comparar", { proyectos: estado.comparar.join(",") });
}

// ---------- Mapa ----------

function ciudadesResumen(){
  const m = new Map();
  for (const p of estado.proyectos){
    const c = m.get(p.ciudad) || { nombre: p.ciudad, cantidad: 0, min: Infinity, lat: 0, lon: 0 };
    c.cantidad++; c.min = Math.min(c.min, p.desde);
    m.set(p.ciudad, c);
  }
  return [...m.values()].map(c => {
    const [lat, lon] = CIUDADES_COORD[c.nombre] || (() => { const ps = estado.proyectos.filter(p => p.ciudad === c.nombre); return [ps[0].coordenadas[0], ps[0].coordenadas[1]]; })();
    return { ...c, lat, lon, desde: dinero(c.min) };
  }).sort((a, b) => b.cantidad - a.cantidad);
}

let mapa3d = null;
function elegirCiudad(nombre){
  estado.filtros.ciudad = estado.filtros.ciudad === nombre ? "" : nombre;
  const sel = $("#fCiudad"); if (sel) sel.value = estado.filtros.ciudad;
  pintarCatalogo(); marcarCiudad();
  document.getElementById("proyectos").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  evento("ciudad", { ciudad: nombre });
}
function marcarCiudad(){
  $$(".ciudad-btn").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.ciudad === estado.filtros.ciudad)));
  mapa3d?.elegir(estado.filtros.ciudad);
}

function iniciarMapa(){
  const cs = ciudadesResumen();
  $("#ciudades").replaceChildren(...cs.map(c => el("button.ciudad-btn", { type: "button", dataset: { ciudad: c.nombre }, "aria-pressed": "false", onclick: () => elegirCiudad(c.nombre) },
    el("span", {}, el("strong", {}, c.nombre), el("span", {}, `${c.cantidad} ${c.cantidad === 1 ? "proyecto" : "proyectos"}`)),
    el("span.dato", {}, `desde ${c.desde}`))));
  if (!estado.webgl) return;
  const cont = $("#mapaLienzo");
  const obs = new IntersectionObserver(async ([e]) => {
    if (!e.isIntersecting) return;
    obs.disconnect();
    try {
      cont.hidden = false;
      const { iniciarMapa } = await import("./mapa3d.js");
      mapa3d = iniciarMapa(cont, cs, { alElegir: elegirCiudad });
      marcarCiudad();
    } catch (err){ cont.hidden = true; console.warn("Mapa 3D no disponible:", err); }
  }, { rootMargin: "500px" });
  obs.observe($("#ciudades"));
}

// ---------- Invitación con resultado de ejemplo ----------

function iniciarInvitacion(){
  const { params } = estado;
  $("#invLista").replaceChildren(...[
    "Sin costo y sin consultar tu buró de crédito",
    "Compara Miti-Miti, Credicasa BIESS, BIESS y bancos",
    "Te decimos cuánto te falta y cómo completarlo",
  ].map(t => el("li", { html: `${icono("check")} ${escapar(t)}` })));
  const perfil = { ingreso: 1500, ahorro: 6000, cuotaEntrada: 150, iess: "36mas", edad: 32, tieneVivienda: false };
  const ev = evaluarPerfil(perfil, params);
  const lista = estado.proyectos.map(p => { const plan = mejorPlan(p.desde, perfil, params); return { p, plan, s: semaforoPlan(plan, params) }; });
  const cerca = lista.filter(x => x.s === "verde").length;
  const plan = mejorPlan(Math.min(ev.presupuesto, 98000), perfil, params);
  $("#ejemplo").replaceChildren(
    el("div.ejemplo-cabeza", {}, el("p.ojo", {}, "Familia con ingreso de USD 1.500 y USD 6.000 ahorrados"), el("span.etiqueta", {}, "Ejemplo")),
    el("span.semaforo.semaforo-verde", {}, "Te alcanza"),
    el("div", {}, el("small", { style: { color: "var(--tinta-2)" } }, "Puede comprar una vivienda de hasta"), el("div.res-monto", {}, dinero(ev.presupuesto))),
    el("div.res-cifras", {},
      el("div.cifra", {}, el("small", {}, "Cuota aprox."), el("strong", {}, dinero(plan?.cuotaTotal || 0))),
      el("div.cifra", {}, el("small", {}, "Crédito"), el("strong", { style: { fontSize: "1rem" } }, plan ? etiquetaPrograma(plan.programa) : "—")),
      el("div.cifra", {}, el("small", {}, "Proyectos"), el("strong", {}, `${cerca} de ${estado.proyectos.length}`)),
    ),
    el("div", { html: regla(ev, lista, estado.proyectos, innerWidth < 640 ? 380 : 560) }),
  );
}

// ---------- Financiamiento ----------

function iniciarFinanciamiento(){
  const { params } = estado;
  $("#programas").replaceChildren(...params.programas.map(pr => {
    const entrada = 1 - Math.max(...pr.financiamiento.map(t => t.porcentaje));
    return el(`article.programa${pr.id === "miti-vip" || pr.id === "credicasa" ? ".programa-destacado" : ""}`, {},
      el("p.ojo", {}, pr.entidad),
      el("h3", {}, pr.nombre),
      el("dl.programa-cifras", {},
        el("div", {}, el("dt", {}, "Tasa"), el("dd", {}, porcentaje(pr.tasa))),
        el("div", {}, el("dt", {}, "Entrada"), el("dd", {}, entrada > 0 ? porcentaje(entrada, 0) : "0 %")),
        el("div", {}, el("dt", {}, "Plazo"), el("dd", {}, `${pr.plazoMax} años`)),
      ),
      el("p", {}, el("strong", { style: { color: "var(--tinta)" } }, pr.paraQuien)),
      el("p", {}, pr.detalle),
      pr.fuente ? el("a", { href: pr.fuente, target: "_blank", rel: "noopener" }, "Fuente") : null,
    );
  }));
  if (params.bonoVis){
    $("#programas").append(el("article.programa", {},
      el("p.ojo", {}, "MIDUVI"),
      el("h3", {}, "Bono VIS de segundo segmento"),
      el("dl.programa-cifras", {},
        el("div", {}, el("dt", {}, "Bono"), el("dd", {}, dinero(params.bonoVis.bono))),
        el("div", {}, el("dt", {}, "Vivienda"), el("dd", {}, `≤ ${dinero(params.bonoVis.precioMax)}`)),
        el("div", {}, el("dt", {}, "SBU 2026"), el("dd", {}, dinero(params.sbu))),
      ),
      el("p", {}, params.bonoVis.detalle),
      el("a", { href: params.bonoVis.fuente, target: "_blank", rel: "noopener" }, "Fuente"),
    ));
  }
  iniciarArriendo();
  const faq = [
    ["¿Qué es el crédito Miti-Miti?", `Es el crédito con tasa subsidiada para la primera vivienda nueva: el Estado paga la mitad de la tasa y tú la otra. Queda en ${porcentaje(programaPorId("miti-vip").tasa)} anual, con 5 % de entrada y hasta 25 años. Sirve para viviendas de hasta ${dinero(programaPorId("miti-vip").precioMax)} si no tienes otra casa a tu nombre.`],
    ["Trabajo con RUC o tengo negocio propio, ¿puedo comprar?", "Sí. Los bancos piden tus declaraciones del SRI de los últimos 2 años y estados de cuenta. Suelen considerar una parte de tus ingresos declarados, por eso el precalificador es más conservador contigo. Las cooperativas y mutualistas también analizan estos casos."],
    ["¿Cuánto necesito de entrada?", "Con Miti-Miti, el 5 %. Con Credicasa del BIESS puedes financiar hasta USD 65.000 con gastos incluidos. Con la banca privada, entre 17 % y 30 %. En los proyectos en construcción, la entrada se puede pagar en cuotas mensuales mientras avanza la obra."],
    ["¿Qué gastos hay además del precio?", "Entre 2 % y 4 % del precio: avalúo del banco, notaría, inscripción en el Registro de la Propiedad, impuesto de alcabala (muchos cantones lo exoneran en vivienda de interés social) y los seguros de desgravamen e incendio, que se pagan con la cuota."],
    ["Vivo fuera del Ecuador, ¿puedo comprar?", "Sí. Varios bancos financian a ecuatorianos en el exterior con su contrato de trabajo y recibos de pago. Puedes firmar con un poder notarial a un familiar. Escríbenos por WhatsApp y te contamos qué documentos preparar según el país donde vives."],
    ["¿La precalificación es una aprobación de crédito?", "No. Es una simulación con las tasas y topes vigentes para que sepas qué te alcanza. La aprobación la da la entidad financiera después de revisar tus documentos y tu historial de crédito."],
  ];
  $("#faq").replaceChildren(...faq.map(([q, a]) => el("details", {}, el("summary", {}, q), el("div", {}, el("p", {}, a)))));
}

function iniciarArriendo(){
  const { params } = estado;
  const cont = $("#arriendo");
  const ids = ["arrMonto", "arrPrecio"];
  const desde = Math.min(...estado.proyectos.map(p => p.desde)), hasta = Math.max(...estado.proyectos.map(p => p.hasta));
  const campo = (id, etiqueta, min, max, paso, valor) => el("label.campo", { for: id }, el("span", {}, etiqueta, " ", el("output.dato", { for: id, id: `${id}Txt` })), el("input", { type: "range", id, min, max, step: paso, value: valor }));
  const resultado = el("div.arriendo-resultado", { "aria-live": "polite" });
  cont.replaceChildren(
    el("div.arriendo-controles", {},
      el("p.ojo", {}, "Arriendo o compra"),
      el("h3", { style: { fontSize: "var(--t-xl)" } }, "¿Cuánto de tu arriendo podría ser cuota de tu casa?"),
      campo(ids[0], "Hoy pago de arriendo", 150, 1200, 10, 380),
      campo(ids[1], "Casa de", Math.floor(desde / 1000) * 1000, Math.ceil(hasta / 1000) * 1000, 500, 85000),
    ),
    resultado,
  );
  const calcular = () => {
    const arr = +$("#arrMonto").value, precio = +$("#arrPrecio").value;
    $("#arrMontoTxt").textContent = `${dinero(arr)}/mes`; $("#arrPrecioTxt").textContent = dinero(precio);
    ids.forEach(id => { const i = $(`#${id}`); i.style.setProperty("--p", `${((i.value - i.min) / (i.max - i.min)) * 100}%`); });
    const plan = planReferencial(precio, params);
    if (!plan){ resultado.replaceChildren(el("p", {}, "Sin crédito disponible para ese precio.")); return; }
    const i = plan.programa.tasa / 12, k = 120;
    const saldo = plan.prestamo * Math.pow(1 + i, k) - plan.cuota * (Math.pow(1 + i, k) - 1) / i;
    const capital = Math.max(0, plan.prestamo - saldo) + plan.entrada;
    const max = Math.max(arr, plan.cuotaTotal);
    resultado.replaceChildren(
      el("div.barras", {},
        el("div.barra-fila", {}, el("span", {}, "Arriendo"), el("div.barra-pista", {}, el("div.barra-valor", { style: { width: `${(arr / max) * 100}%` } })), el("strong.dato", {}, dinero(arr))),
        el("div.barra-fila", {}, el("span", {}, "Cuota"), el("div.barra-pista", {}, el("div.barra-valor.cuota-v", { style: { width: `${(plan.cuotaTotal / max) * 100}%` } })), el("strong.dato", {}, dinero(plan.cuotaTotal))),
      ),
      el("p", {}, `Con ${plan.programa.nombre} (${porcentaje(plan.programa.tasa)}, ${plan.plazo} años) y ${dinero(plan.entrada)} de entrada, la cuota sería de ${dinero(plan.cuotaTotal)} al mes con seguros.`),
      el("p", {}, el("strong", {}, `En 10 años de arriendo pagas ${dinero(arr * 120)}. Con la cuota, en esos 10 años ya serían tuyos ${dinero(capital)} de la casa.`)),
      el("small", { style: { color: "var(--tinta-2)" } }, "Cálculo referencial para primera vivienda nueva, sin contar gastos de cierre ni alícuota."),
    );
  };
  ids.forEach(id => $(`#${id}`).addEventListener("input", calcular));
  calcular();
}

// ---------- Pasos, testimonios y pie ----------

function iniciarPasos(){
  const reservaMin = Math.min(...estado.proyectos.map(p => p.reserva || 0));
  const pasos = [
    ["Precalifícate", "Respondes 11 preguntas y sabes cuánto te presta el banco y qué proyectos te alcanzan.", "90 segundos"],
    ["Elige y visita", "Un asesor te llama con los proyectos de tu presupuesto y agendan la visita a la obra o a la sala de ventas.", "Visitas de lunes a sábado"],
    ["Reserva", "Separas tu unidad y firmas la promesa de compraventa. En obra, la entrada se paga en cuotas.", `Reserva desde ${dinero(reservaMin)}`],
    ["Crédito", "Presentamos tus documentos al banco o al BIESS; hacen el avalúo y aprueban el crédito.", "30 a 60 días aprox."],
    ["Escrituras y llaves", "Firmas en la notaría, se inscribe en el Registro de la Propiedad y recibes tu casa.", "Con acta de entrega"],
  ];
  $("#pasos").replaceChildren(...pasos.map(([t, d, x]) => el("li", {}, el("h3", {}, t), el("p", {}, d), el("span.dato", {}, x))));
}

function iniciarTestimonios(){
  const { sitio } = estado;
  $("#opNota").hidden = !sitio.modoDemo;
  $("#testimonios").replaceChildren(...(sitio.testimonios || []).map(t => el("figure.testimonio", {},
    el("blockquote", {}, `“${t.texto}”`),
    el("figcaption", {}, el("strong", {}, t.nombre), `${t.ciudad} · ${t.programa}${sitio.modoDemo ? " · ejemplo" : ""}`),
  )));
}

function iniciarPie(){
  const { sitio, params } = estado;
  const numero = el("span.dato", {}, sitio.whatsappVisible);
  const correo = el("span.dato", {}, sitio.correo);
  $("#pie").replaceChildren(
    el("div", {},
      el("a.marca", { href: "#inicio" }, el("span.marca-logo", { html: icono("llave") }), el("span.marca-nombre", {}, sitio.marca.toUpperCase())),
      el("p", { style: { marginTop: "12px", maxWidth: "44ch" } }, `${sitio.eslogan}. Te ayudamos a elegir la casa que sí te alcanza y a conseguir el crédito.`),
    ),
    el("div", {}, el("h3", {}, "Contacto"),
      el("ul", {},
        el("li", {}, el("span.copiable", {}, "WhatsApp: ", numero, el("button.btn.btn-fantasma.btn-chico", { type: "button", "aria-label": "Copiar número", html: icono("copiar"), onclick: () => copiar(sitio.whatsappVisible, numero) }))),
        el("li", {}, el("a", { href: enlaceWhatsApp(sitio.whatsapp, "Hola, quiero información de sus proyectos."), target: "_blank", rel: "noopener" }, "Escribir por WhatsApp")),
        el("li", {}, el("span.copiable", {}, "Correo: ", correo, el("button.btn.btn-fantasma.btn-chico", { type: "button", "aria-label": "Copiar correo", html: icono("copiar"), onclick: () => copiar(sitio.correo, correo) }))),
        el("li", {}, sitio.salaDeVentas),
        el("li", {}, sitio.horario),
      )),
    el("div", {}, el("h3", {}, "Enlaces"),
      el("ul", {},
        el("li", {}, el("a", { href: "#proyectos" }, "Proyectos")),
        el("li", {}, el("button.btn.btn-fantasma.btn-chico", { type: "button", "data-precalificar": "", style: { padding: 0, minHeight: 0, color: "var(--verde)" } }, "Precalifícate")),
        el("li", {}, el("a", { href: "#financiamiento" }, "Créditos de vivienda")),
        el("li", {}, el("button.btn.btn-fantasma.btn-chico", { type: "button", style: { padding: 0, minHeight: 0, color: "var(--verde)" }, onclick: abrirPrivacidad }, "Política de privacidad")),
      )),
  );
  $("#pieLegal").replaceChildren(
    el("p", {}, `Los valores de cuota, entrada y presupuesto son simulaciones referenciales con tasas y topes vigentes al ${fechaLarga(params.vigencia)} (SBU ${dinero(params.sbu)}). No constituyen una oferta ni una aprobación de crédito: la decisión es de cada entidad financiera.`),
    el("p", {}, "Fuentes: ", ...params.fuentes.flatMap((f, i) => [i ? " · " : "", el("a", { href: f.url, target: "_blank", rel: "noopener" }, f.titulo)])),
    el("p", {}, `© ${new Date().getFullYear()} ${sitio.marca}. Precios y disponibilidad sujetos a cambio.`),
  );
}

export function abrirPrivacidad(){
  const { sitio } = estado;
  const d = $("#privacidad");
  d.replaceChildren(
    el("div.dialogo-barra", {}, el("h2", { id: "privTitulo" }, "Política de privacidad"), el("button.btn.btn-fantasma.btn-icono", { type: "button", "aria-label": "Cerrar", html: icono("cerrar"), onclick: () => d.close() })),
    el("div.dialogo-cuerpo", {}, el("div.texto-legal", {},
      el("p", {}, `Esta política explica cómo ${sitio.marca} trata tus datos personales según la Ley Orgánica de Protección de Datos Personales del Ecuador (LOPDP).`),
      el("h3", {}, "Responsable"), el("p", {}, `${sitio.marca}. Contacto para temas de datos: ${sitio.correo}.`),
      el("h3", {}, "Qué datos pedimos"), el("p", {}, "Nombre, WhatsApp, correo (opcional) y las respuestas del precalificador: ingresos, deudas, ahorro, tipo de ingreso, aportaciones al IESS, historial de crédito declarado, rango de edad, ciudad y proyecto de interés. No pedimos cédula ni consultamos tu buró de crédito desde este sitio."),
      el("h3", {}, "Para qué los usamos"), el("p", {}, "Para calcular tu precalificación, contactarte con los proyectos que te alcanzan y agendar visitas. Solo si lo autorizas aparte, para enviarte promociones."),
      el("h3", {}, "Base legal"), el("p", {}, "Tu consentimiento libre, específico, informado e inequívoco, que das al marcar la casilla del formulario. Puedes retirarlo cuando quieras."),
      el("h3", {}, "Con quién los compartimos"), el("p", {}, "Con nuestros asesores comerciales. Con bancos, mutualistas, cooperativas o el BIESS solo cuando tú decidas iniciar un trámite de crédito."),
      el("h3", {}, "Cuánto tiempo los guardamos"), el("p", {}, "Hasta 24 meses desde tu último contacto, o menos si pides eliminarlos."),
      el("h3", {}, "Tus derechos"), el("p", {}, `Acceso, rectificación y actualización, eliminación, oposición, portabilidad y suspensión del tratamiento. Escríbenos a ${sitio.correo}. También puedes acudir a la Superintendencia de Protección de Datos Personales.`),
      el("h3", {}, "En tu navegador"), el("p", {}, "Guardamos en tu propio navegador tus favoritos y tu última precalificación para mostrarte qué te alcanza. Puedes borrarlos desde el resultado con «Borrar mis datos de este navegador»."),
    )),
  );
  d.showModal();
}

// ---------- Navegación por ancla (#proyecto-id, #precalificar) ----------

async function rutear(){
  const h = location.hash.slice(1);
  if (h.startsWith("proyecto-")){
    const p = proyectoPorId(h.slice(9));
    if (p){ const { abrirFicha } = await import("./ficha.js"); abrirFicha(p); }
  } else if (h === "precalificar"){
    abrirPrecal();
  }
}

export async function abrirPrecal(opciones = {}){
  const { abrirPrecalificador } = await import("./precalificador.js");
  abrirPrecalificador(opciones);
}

/** Lo llama el precalificador al terminar: repinta el catálogo con "te alcanza". */
export function precalActualizada(precal){
  estado.precal = precal;
  if (precal) guardar(CLAVE_PRECAL, precal); else { try { localStorage.removeItem(CLAVE_PRECAL); } catch {} }
  construirFiltros();
  pintarCatalogo();
}

// ---------- Arranque ----------

async function cargar(ruta){ const r = await fetch(ruta, { cache: "no-cache" }); if (!r.ok) throw new Error(`${ruta}: ${r.status}`); return r.json(); }

async function iniciar(){
  try {
    const [sitio, params, datos] = await Promise.all([cargar("datos/sitio.json"), cargar("datos/parametros-financieros.json"), cargar("datos/proyectos.json")]);
    estado.sitio = sitio;
    estado.params = { ...params, precioMinPortafolio: Math.min(...datos.proyectos.flatMap(p => p.modelos.map(m => m.precio))) };
    estado.proyectos = datos.proyectos.map(p => preparar(p, estado.params));
  } catch (e){
    console.error(e);
    $("#grilla").replaceChildren(el("div.vacio", {}, el("strong", {}, "No pudimos cargar los proyectos."), el("span", {}, "Revisa tu conexión y vuelve a cargar la página.")));
    return;
  }
  const { sitio } = estado;
  $("#avisoDemo").hidden = !sitio.modoDemo;
  $$("[data-marca]").forEach(n => (n.textContent = sitio.marca.toUpperCase()));
  iniciarFranja();
  construirFiltros();
  pintarCatalogo();
  eventosCatalogo();
  iniciarMapa();
  iniciarInvitacion();
  iniciarFinanciamiento();
  iniciarPasos();
  iniciarTestimonios();
  iniciarPie();
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-precalificar]");
    if (b){ e.preventDefault(); abrirPrecal({ proyectoId: b.dataset.precalificar || undefined }); }
  });
  addEventListener("hashchange", rutear);
  rutear();
  iniciarPortada();
  if ("serviceWorker" in navigator && location.protocol === "https:" && !location.hostname.endsWith("claude.ai") && !location.hostname.endsWith("claudeusercontent.com")){
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

iniciar();
