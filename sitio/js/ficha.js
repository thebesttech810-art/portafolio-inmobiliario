/* Ficha de un proyecto (se abre con #proyecto-<id>): galería de renders, maqueta 3D interactiva,
   plano referencial por modelo, tabla de modelos con cuota, calculadora, plan de pagos,
   amenidades, cercanía y botones para precalificarse o agendar la visita por WhatsApp. */
import { $, $$, el, icono, banos, mesAnio, copiar, enlaceWhatsApp, evento } from "./ui.js";
import { dinero, porcentaje, planPara, mejorPlan, normalizarPerfil, cuotaMensual, porcentajeFinanciado } from "./finanzas.js";
import { estado, situacion, cargarImagen, abrirPrecal } from "./app.js";
import { planoSVG } from "./plano.js";

const ETAPAS = { inmediata: "Entrega inmediata", construccion: "En construcción", planos: "En planos" };
const VISTAS = [["frente", "Fachada"], ["jardin", "Patio"], ["aerea", "Aérea"], ["noche", "De noche"]];
let visor = null;

function cerrarVisor(){ visor?.destruir(); visor = null; }

/** Perfil para calcular cuotas en la ficha: el del cliente o uno de primera vivienda con IESS. */
function perfilFicha(){
  return estado.precal?.perfil || { tieneVivienda: false, iess: "36mas", edad: 35, ingreso: 1e6, ahorro: 0 };
}

function planesDelModelo(precio){
  const p = normalizarPerfil(perfilFicha());
  const params = estado.precal ? estado.params : { ...estado.params, programas: estado.params.programas.map(pr => ({ ...pr, ingresoFamiliarMax: null })) };
  return params.programas.map(pr => ({ pr, plan: planPara(precio, pr, p, params) })).filter(x => x.plan.aplica);
}

export function abrirFicha(p){
  const d = $("#ficha");
  cerrarVisor();
  let modelo = 0, pestana = "renders", vista = "frente";
  const sit = situacion(p);

  const barra = el("div.dialogo-barra", {},
    el("button.btn.btn-fantasma.btn-icono", { type: "button", "aria-label": "Volver a los proyectos", html: icono("atras"), onclick: () => d.close() }),
    el("h2", { id: "fichaTitulo" }, p.nombre),
    el("button.btn.btn-fantasma.btn-icono", { type: "button", "aria-label": "Copiar enlace del proyecto", html: icono("compartir"), onclick: () => copiar(location.href.split("#")[0] + `#proyecto-${p.id}`) }),
    el("button.btn.btn-fantasma.btn-icono", { type: "button", "aria-label": "Cerrar", html: icono("cerrar"), onclick: () => d.close() }),
  );

  // ----- Galería -----
  const panel = el("div.panel-galeria");
  const tira = el("div.miniaturas");
  const pestanas = el("div.pestanas", { role: "tablist", "aria-label": "Cómo ver el proyecto" });
  const tabs = [["renders", "Renders"], ...(estado.webgl ? [["maqueta", "Maqueta 3D"]] : []), ["plano", "Plano"]];
  tabs.forEach(([id, t]) => pestanas.append(el("button.pestana", { type: "button", role: "tab", id: `tab-${id}`, "aria-selected": String(id === pestana), "aria-controls": "panelGaleria", onclick: () => { pestana = id; pintarGaleria(); } }, t)));
  const galeria = el("div.ficha-galeria", {}, pestanas, el("div", { id: "panelGaleria", role: "tabpanel" }, panel, tira));

  function pintarGaleria(){
    $$(".pestana", pestanas).forEach(b => b.setAttribute("aria-selected", String(b.id === `tab-${pestana}`)));
    cerrarVisor();
    panel.replaceChildren(); tira.replaceChildren();
    panel.className = "panel-galeria"; panel.hidden = false;
    if (pestana === "renders"){
      cargarImagen(panel, p, vista, 1200, 900);
      panel._cargar?.();
      if (p.fotos?.length > 1 || !p.fotos?.length){
        const fuentes = p.fotos?.length ? p.fotos.map((f, i) => [i, `Foto ${i + 1}`]) : VISTAS;
        for (const [v, t] of fuentes){
          const b = el("button.miniatura", { type: "button", "aria-pressed": String(v === vista), "aria-label": `Ver ${t}` }, el("span", {}, t));
          b.addEventListener("click", () => { vista = v; if (p.fotos?.length) { panel.querySelector("img")?.remove(); panel.prepend(el("img", { src: p.fotos[v], alt: `${p.nombre}, foto ${v + 1}`, class: "cargada" })); $$(".miniatura", tira).forEach(x => x.setAttribute("aria-pressed", String(x === b))); } else pintarGaleria(); });
          if (!p.fotos?.length) cargarImagen(b, p, v, 320, 240); else b.prepend(el("img", { src: p.fotos[v], alt: "" }));
          b._cargar?.();
          tira.append(b);
        }
      }
    } else if (pestana === "maqueta"){
      const canvas = el("canvas", { "aria-label": `Maqueta 3D de ${p.nombre}. Arrastra para girarla.` });
      const ayuda = el("span.visor-ayuda", {}, "Arrastra para girar · pellizca o usa la rueda para acercar");
      const horas = [["Día", 11, "sol"], ["Atardecer", 17.9, "sol"], ["Noche", 20.4, "luna"]];
      const ctr = el("div.visor-controles");
      horas.forEach(([t, h, ic], i) => ctr.append(el("button.chip", { type: "button", "aria-pressed": String(i === 0), html: `${icono(ic)} ${t}`, onclick: e => { visor?.hora(h); $$("[data-hora]", ctr).forEach(x => x.setAttribute("aria-pressed", "false")); e.currentTarget.setAttribute("aria-pressed", "true"); }, dataset: { hora: h } })));
      const exp = el("button.chip", { type: "button", "aria-pressed": "false", html: `${icono("capas")} Abrir por pisos` });
      exp.addEventListener("click", () => { const si = exp.getAttribute("aria-pressed") !== "true"; exp.setAttribute("aria-pressed", String(si)); visor?.explotar(si); });
      ctr.append(exp);
      panel.append(canvas, ayuda, ctr);
      import("./visor3d.js").then(({ abrirVisor }) => {
        if (!d.open || pestana !== "maqueta") return;
        visor = abrirVisor(canvas, p);
        visor.hora(11);
        setTimeout(() => ayuda.remove(), 4000);
      }).catch(() => { panel.replaceChildren(el("p", { style: { padding: "20px" } }, "La maqueta 3D no está disponible en este navegador.")); });
      evento("maqueta3d", { proyecto: p.id });
    } else {
      panel.hidden = true;
      const m = p.modelos[modelo];
      const chips = el("div.chips", { role: "group", "aria-label": "Modelo" }, ...p.modelos.map((x, i) => el("button.chip", { type: "button", "aria-pressed": String(i === modelo), onclick: () => { modelo = i; pintarGaleria(); pintarModelos(); pintarCalculo(); } }, `${x.nombre} · ${x.m2} m²`)));
      tira.className = "panel-plano";
      tira.append(chips, el("div", { html: planoSVG(m, p.tipo, p.estilo?.pisos || 1) }), el("small.nota-legal", {}, "Plano referencial generado a partir de las áreas del modelo. La distribución real está en el plano arquitectónico del proyecto."));
    }
  }

  // ----- Información -----
  const info = el("div.ficha-info");
  const tablaModelos = el("div.tabla-scroll");
  const calc = el("div.calc");
  const pagos = el("ol.linea-pagos");

  function pintarModelos(){
    const filas = p.modelos.map((m, i) => {
      const plan = estado.precal ? mejorPlan(m.precio, estado.precal.perfil, estado.params) : planesDelModelo(m.precio).sort((a, b) => a.plan.cuotaTotal - b.plan.cuotaTotal)[0]?.plan;
      const tr = el("tr", { "aria-selected": String(i === modelo), tabindex: "0", onclick: () => { modelo = i; pintarModelos(); pintarCalculo(); if (pestana === "plano") pintarGaleria(); },
        onkeydown: e => { if (e.key === "Enter" || e.key === " "){ e.preventDefault(); e.currentTarget.click(); } } },
        el("td", {}, el("strong", {}, m.nombre)),
        el("td.num", {}, `${m.m2} m²`), el("td.num", {}, m.habitaciones), el("td.num", {}, banos(m.banos)), el("td.num", {}, m.parqueaderos),
        el("td.num", {}, m.patio ? `${m.patio} m²` : "—"),
        el("td.num", {}, dinero(m.precio)),
        el("td.num", {}, plan ? `${dinero(plan.cuotaTotal)}` : "—"),
        el("td.num", {}, m.disponibles <= 3 ? el("span.etiqueta.etiqueta-luz", {}, m.disponibles) : m.disponibles),
      );
      return tr;
    });
    tablaModelos.replaceChildren(el("table.tabla", {},
      el("caption.solo-lector", {}, "Modelos disponibles. Elige uno para ver su cálculo y su plano."),
      el("thead", {}, el("tr", {}, ...["Modelo", "Área", "Dorm.", "Baños", "Parq.", "Patio", "Precio", estado.precal ? "Tu cuota" : "Cuota", "Quedan"].map((t, i) => el(i ? "th.num" : "th", { scope: "col" }, t)))),
      el("tbody", {}, ...filas)));
  }

  function pintarCalculo(){
    const m = p.modelos[modelo];
    const opciones = planesDelModelo(m.precio);
    if (!opciones.length){ calc.replaceChildren(el("p", {}, "Este precio no entra en los créditos configurados.")); return; }
    opciones.sort((a, b) => a.plan.cuotaTotal - b.plan.cuotaTotal);
    let elegido = calc._programa && opciones.find(o => o.pr.id === calc._programa) ? calc._programa : opciones[0].pr.id;
    const pr = () => opciones.find(o => o.pr.id === elegido).pr;
    const minEntrada = () => Math.max(0, 1 - porcentajeFinanciado(pr(), m.precio), pr().montoMax != null ? 1 - pr().montoMax / m.precio : 0);
    let entradaPct = Math.max(minEntrada(), calc._entrada ?? minEntrada()), anios = Math.min(pr().plazoMax, calc._anios ?? pr().plazoMax);
    const sel = el("select", { id: "calcPrograma" }, ...opciones.map(o => el("option", { value: o.pr.id }, `${o.pr.nombre} · ${porcentaje(o.pr.tasa)}`)));
    sel.value = elegido;
    const rEntrada = el("input", { type: "range", id: "calcEntrada", min: 0, max: 0.5, step: 0.01 });
    const rPlazo = el("input", { type: "range", id: "calcPlazo", min: 5, max: 30, step: 1 });
    const oEntrada = el("output.dato", { for: "calcEntrada" }), oPlazo = el("output.dato", { for: "calcPlazo" });
    const cifras = el("div.calc-cifras", { "aria-live": "polite" });
    const recalcular = () => {
      const programa = pr();
      rEntrada.min = minEntrada().toFixed(2); rPlazo.max = programa.plazoMax;
      entradaPct = Math.max(minEntrada(), Math.min(0.5, entradaPct)); anios = Math.min(programa.plazoMax, Math.max(5, anios));
      rEntrada.value = entradaPct; rPlazo.value = anios;
      [rEntrada, rPlazo].forEach(i => i.style.setProperty("--p", `${((i.value - i.min) / (i.max - i.min || 1)) * 100}%`));
      const entrada = m.precio * entradaPct, prestamo = m.precio - entrada;
      const cuota = cuotaMensual(prestamo, programa.tasa, anios), seguros = prestamo * (estado.params.seguroMensualSobreMonto || 0);
      const gastos = m.precio * (programa.gastosCierre ?? 0.03);
      const deudas = estado.precal?.perfil?.deudas || 0;
      const ingreso = (cuota + seguros + deudas) / programa.relacionCuotaIngreso;
      oEntrada.textContent = `${porcentaje(entradaPct, 0)} · ${dinero(entrada)}`; oPlazo.textContent = `${anios} años`;
      cifras.replaceChildren(
        el("div.cifra.cifra-grande", {}, el("small", {}, "Cuota mensual con seguros"), el("strong", {}, dinero(cuota + seguros))),
        el("div.cifra", {}, el("small", {}, "Préstamo"), el("strong", {}, dinero(prestamo))),
        el("div.cifra", {}, el("small", {}, "Gastos de cierre aprox."), el("strong", {}, dinero(gastos))),
        el("div.cifra", {}, el("small", {}, "Ingreso familiar necesario"), el("strong", {}, dinero(ingreso))),
      );
      calc._programa = elegido; calc._entrada = entradaPct; calc._anios = anios;
      pintarPagos(programa, entrada, prestamo, cuota + seguros, anios, gastos);
    };
    sel.addEventListener("change", () => { elegido = sel.value; entradaPct = minEntrada(); anios = pr().plazoMax; recalcular(); });
    rEntrada.addEventListener("input", () => { entradaPct = +rEntrada.value; recalcular(); });
    rPlazo.addEventListener("input", () => { anios = +rPlazo.value; recalcular(); });
    calc.replaceChildren(
      el("label.campo", { for: "calcPrograma" }, el("span", {}, `Crédito para el modelo ${m.nombre} (${dinero(m.precio)})`), sel),
      el("label.campo", { for: "calcEntrada" }, el("span", {}, "Entrada ", oEntrada), rEntrada),
      el("label.campo", { for: "calcPlazo" }, el("span", {}, "Plazo ", oPlazo), rPlazo),
      cifras,
    );
    recalcular();
  }

  function pintarPagos(programa, entrada, prestamo, cuota, anios, gastos){
    const reserva = Math.min(p.reserva || 0, entrada);
    const resto = Math.max(0, entrada - reserva);
    const enCuotas = p.entradaCuotasMeses > 0 && p.etapa !== "inmediata";
    pagos.replaceChildren(
      el("li", {}, el("div", {}, el("strong", {}, "Reserva"), el("small", {}, "Separas tu unidad y firmas la promesa de compraventa")), el("span.dato", {}, dinero(reserva))),
      el("li", {}, el("div", {}, el("strong", {}, "Resto de la entrada"), el("small", {}, enCuotas ? `${p.entradaCuotasMeses} cuotas de ${dinero(resto / p.entradaCuotasMeses)} mientras se construye` : "Al firmar la promesa o antes de escriturar")), el("span.dato", {}, dinero(resto))),
      el("li", {}, el("div", {}, el("strong", {}, "Gastos de cierre"), el("small", {}, "Avalúo, notaría, Registro de la Propiedad y alcabala")), el("span.dato", {}, dinero(gastos))),
      el("li", {}, el("div", {}, el("strong", {}, `Crédito ${programa.corto}`), el("small", {}, `${dinero(prestamo)} a ${anios} años desde la entrega (${mesAnio(p.entrega)})`)), el("span.dato", {}, `${dinero(cuota)}/mes`)),
    );
  }

  function bloquePersonal(){
    if (!sit) return el("div.calc", {},
      el("strong", {}, "¿Te alcanza para este proyecto?"),
      el("p", { style: { color: "var(--tinta-2)" } }, "En 90 segundos te decimos cuánto te presta el banco y con qué crédito pagarías este proyecto."),
      el("div", {}, el("button.btn.btn-luz", { type: "button", onclick: () => { $("#ficha").close(); abrirPrecal({ proyectoId: p.id }); } }, "Precalificarme para este proyecto")));
    const txt = { verde: "Te alcanza", amarillo: "Casi te alcanza", rojo: "Todavía no te alcanza" }[sit.semaforo];
    const plan = sit.plan;
    return el("div.calc", {},
      el("span", { class: `semaforo semaforo-${sit.semaforo}` }, txt),
      plan ? el("p", {}, `Con ${plan.programa.nombre} (${porcentaje(plan.programa.tasa)}), el modelo de ${dinero(p.desde)} quedaría en ${dinero(plan.cuotaTotal)} al mes, con ${dinero(plan.entrada + plan.gastos)} entre entrada y gastos.`) : el("p", {}, "Ningún crédito cubre este precio con tu perfil."),
      plan && plan.faltaEntrada >= 1 ? el("p", { style: { color: "var(--alerta)" } }, `Te faltan ${dinero(plan.faltaEntrada)} para la entrada y los gastos.`) : null,
      plan && plan.faltaIngreso >= 1 ? el("p", { style: { color: "var(--alerta)" } }, `El banco pediría ${dinero(plan.faltaIngreso)} más de ingreso familiar al mes (puedes sumar un codeudor).`) : null,
    );
  }

  const maxMin = Math.max(30, ...p.cercania.map(c => c.min));
  info.append(
    el("div", {}, el("p.ojo", {}, `${p.ciudad} · ${p.sector}`), el("h1", { style: { marginTop: "8px" } }, p.nombre)),
    el("div.ficha-estado", {},
      el("span.etiqueta", {}, ETAPAS[p.etapa]),
      el("span.etiqueta", {}, p.etapa === "inmediata" ? "Lista para escriturar" : `Entrega: ${mesAnio(p.entrega)}`),
      el("span.etiqueta.etiqueta-luz", {}, `${p.disponibles} unidades disponibles`),
      ...p.creditos.map(id => el("span.etiqueta.etiqueta-ok", {}, estado.params.programas.find(x => x.id === id).corto)),
    ),
    p.etapa !== "inmediata" ? el("div.avance", {}, el("div.avance-pista", { role: "progressbar", "aria-valuenow": p.avance, "aria-valuemin": 0, "aria-valuemax": 100, "aria-label": "Avance de obra" }, el("div", { style: { width: `${p.avance}%` } })), el("small", {}, `Avance de obra: ${p.avance} %`)) : null,
    el("p", {}, p.descripcion),
    bloquePersonal(),
    el("section.bloque", {}, el("h3", {}, "Modelos y precios"), tablaModelos),
    el("section.bloque", {}, el("h3", {}, "Calcula tu cuota"), calc),
    el("section.bloque", {}, el("h3", {}, "Cómo pagarías"), pagos),
    el("section.bloque", {}, el("h3", {}, "Amenidades"), el("div.chips", {}, ...p.amenidades.map(a => el("span.etiqueta", {}, a)))),
    el("section.bloque", {}, el("h3", {}, "Qué tienes cerca"),
      el("ul.cercania", {}, ...p.cercania.map(c => el("li", {}, el("span", {}, c.lugar), el("span.dato", {}, `${c.min} min`), el("div.barra-pista", {}, el("div.barra-valor", { style: { width: `${(c.min / maxMin) * 100}%` } }))))),
      el("p", {}, el("a", { href: `https://www.google.com/maps?q=${p.coordenadas[0]},${p.coordenadas[1]}`, target: "_blank", rel: "noopener", html: `${icono("pin")} Ver la ubicación en Google Maps` }))),
    el("section.bloque", {}, el("h3", {}, "Datos del proyecto"),
      el("div.tabla-scroll", {}, el("table.tabla", {}, el("tbody", {},
        el("tr", {}, el("th", { scope: "row" }, "Constructora"), el("td", {}, p.constructora)),
        el("tr", {}, el("th", { scope: "row" }, "Alícuota estimada"), el("td", {}, `${dinero(p.alicuota)} al mes`)),
        el("tr", {}, el("th", { scope: "row" }, "Reserva"), el("td", {}, dinero(p.reserva))),
        el("tr", {}, el("th", { scope: "row" }, "Entrada en cuotas"), el("td", {}, p.entradaCuotasMeses && p.etapa !== "inmediata" ? `Hasta ${p.entradaCuotasMeses} meses` : "No aplica")),
      )))),
  );

  const codigo = estado.precal?.codigo;
  const mensajeVisita = () => {
    const m = p.modelos[modelo];
    return `Hola, me interesa ${p.nombre} en ${p.ciudad}, modelo ${m.nombre} (${dinero(m.precio)}).${codigo ? ` Ya me precalifiqué en la web (código ${codigo}).` : ""} Quiero agendar una visita.`;
  };
  const acciones = el("div.ficha-acciones", {},
    el("button.btn.btn-luz", { type: "button", onclick: () => { d.close(); abrirPrecal({ proyectoId: p.id }); } }, sit ? "Mi resultado" : "¿Me alcanza?"),
    el("a.btn.btn-wa", { href: enlaceWhatsApp(estado.sitio.whatsapp, mensajeVisita()), target: "_blank", rel: "noopener", html: `${icono("whatsapp")} Agendar visita`, onclick: e => { e.currentTarget.href = enlaceWhatsApp(estado.sitio.whatsapp, mensajeVisita()); evento("agendar_visita", { proyecto: p.id, meta: "Schedule" }); } }),
  );

  d.replaceChildren(barra, el("div.dialogo-cuerpo", {}, el("div.ficha", {}, galeria, info), acciones));
  pintarGaleria(); pintarModelos(); pintarCalculo();
  if (!d.open) d.showModal();
  d.querySelector(".dialogo-cuerpo").scrollTop = 0;
  d.onclose = () => {
    cerrarVisor();
    if (location.hash === `#proyecto-${p.id}`){ try { history.replaceState(null, "", location.pathname + location.search); } catch {} }
  };
  evento("ver_proyecto", { proyecto: p.id });
}
