/* Motor de precalificación hipotecaria (Ecuador).
   Funciones puras: no tocan la página ni la red. Las usa el sitio (app.js), el Worker que
   recibe los clientes (cloudflare/leads-worker.js, para recalcular en el servidor) y las
   pruebas (pruebas/finanzas.test.mjs). Todas las tasas, topes y porcentajes llegan en
   `params` (datos/parametros-financieros.json): aquí no hay números del mercado. */

// ---------- Matemática del crédito (sistema francés, cuota fija) ----------

/** Cuota mensual de un préstamo: tasa nominal anual / 12, plazo en años. */
export function cuotaMensual(monto, tasaAnual, anios){
  if (!(monto > 0) || !(anios > 0)) return 0;
  const i = tasaAnual / 12, n = Math.round(anios * 12);
  if (i === 0) return monto / n;
  return monto * i / (1 - Math.pow(1 + i, -n));
}

/** Cuánto se puede pedir prestado con una cuota mensual dada. */
export function montoMaximo(cuota, tasaAnual, anios){
  if (!(cuota > 0) || !(anios > 0)) return 0;
  const i = tasaAnual / 12, n = Math.round(anios * 12);
  if (i === 0) return cuota * n;
  return cuota * (1 - Math.pow(1 + i, -n)) / i;
}

export const redondear = (x, paso = 1) => Math.round(x / paso) * paso;
const abajo = (x, paso) => Math.floor(x / paso) * paso;

// ---------- Perfil del cliente ----------

/** Perfil con valores por defecto: así las funciones nunca reciben campos vacíos. */
export function normalizarPerfil(p = {}){
  const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : d; };
  return {
    proposito: p.proposito || "primera",          // primera | cambio | inversion
    tieneVivienda: Boolean(p.tieneVivienda),
    ciudad: p.ciudad || "",
    tipoIngreso: p.tipoIngreso || "dependencia",  // dependencia | independiente | negocio | jubilado | exterior
    ingreso: num(p.ingreso),
    codeudor: Boolean(p.codeudor),
    ingresoCodeudor: p.codeudor ? num(p.ingresoCodeudor) : 0,
    deudas: num(p.deudas),
    ahorro: num(p.ahorro),
    cuotaEntrada: num(p.cuotaEntrada),
    iess: p.iess || "no",                         // no | menos36 | 36mas | jubilado
    historial: p.historial || "nose",             // excelente | bueno | atrasos | sin | nose
    edad: num(p.edad, 35),
    arriendo: num(p.arriendo),
    cuando: p.cuando || "averiguando",            // mes | 3m | 6m | averiguando
  };
}

/** Ingreso familiar declarado (bruto de recortes): se compara con los topes de cada programa. */
export const ingresoFamiliar = p => p.ingreso + p.ingresoCodeudor;

/** Ingreso que un banco suele considerar: a independientes y negocios les recorta una parte. */
export function ingresoConsiderado(p, params){
  const f = params.factorIngresoIndependiente ?? 1;
  const recorte = t => (t === "independiente" || t === "negocio") ? f : 1;
  // El codeudor se asume con el mismo tipo de ingreso que el titular.
  return (p.ingreso + p.ingresoCodeudor) * recorte(p.tipoIngreso);
}

/** Dinero que el cliente puede poner para entrada y gastos: ahorro + cuotas durante la obra. */
export function dineroParaEntrada(p, params, meses = params.mesesEntradaEnCuotas ?? 12){
  return p.ahorro + p.cuotaEntrada * meses;
}

const tieneIess = p => p.iess === "36mas" || p.iess === "jubilado" || p.tipoIngreso === "jubilado";

export function plazoPara(programa, p, params){
  return Math.max(0, Math.min(programa.plazoMax, (params.edadMaxFinPlazo ?? 75) - p.edad));
}

export function porcentajeFinanciado(programa, precio){
  const tramos = programa.financiamiento || [{ hastaPrecio: null, porcentaje: 0.8 }];
  for (const t of tramos) if (t.hastaPrecio == null || precio <= t.hastaPrecio) return t.porcentaje;
  return tramos[tramos.length - 1].porcentaje;
}

// ---------- Elegibilidad ----------

/** ¿Puede esta persona usar este programa? Devuelve los motivos si no. */
export function elegibilidad(programa, p, params){
  const motivos = [];
  const req = programa.requiere || {};
  if (req.iess && !tieneIess(p)) motivos.push("Pide 36 aportaciones al IESS (o ser jubilado).");
  if (req.sinVivienda && p.tieneVivienda) motivos.push("Es solo para quien no tiene vivienda propia.");
  if (programa.ingresoFamiliarMax != null && ingresoFamiliar(p) > programa.ingresoFamiliarMax)
    motivos.push(`Tu ingreso familiar supera el tope de ${dinero(programa.ingresoFamiliarMax)}.`);
  if (plazoPara(programa, p, params) < (params.plazoMinimo ?? 5))
    motivos.push("Con tu edad el plazo posible es muy corto.");
  if (p.tipoIngreso === "exterior" && programa.requiere?.iess && p.iess !== "36mas")
    motivos.push("Desde el exterior necesitas aportar al IESS como afiliado voluntario.");
  return { ok: motivos.length === 0, motivos };
}

// ---------- Capacidad de compra por programa ----------

/** Precio máximo de vivienda que esta persona puede comprar con un programa, y qué lo limita. */
export function evaluarPrograma(programa, p, params, opciones = {}){
  const eleg = elegibilidad(programa, p, params);
  const tasa = programa.tasa + (opciones.ajusteTasa || 0);
  const relacion = opciones.relacion ?? programa.relacionCuotaIngreso;
  const plazo = plazoPara(programa, p, params);
  const seguro = params.seguroMensualSobreMonto ?? 0;
  const g = programa.gastosCierre ?? 0.03;

  const cuotaMax = Math.max(0, ingresoConsiderado(p, params) * relacion - p.deudas);
  // La cuota que paga el cliente incluye los seguros: cuota(P) + seguro·P ≤ cuotaMax.
  const porDolar = plazo > 0 ? cuotaMensual(1, tasa, plazo) + seguro : Infinity;
  let montoMax = plazo > 0 ? cuotaMax / porDolar : 0;
  if (programa.montoMax != null) montoMax = Math.min(montoMax, programa.montoMax);

  const A = dineroParaEntrada(p, params);
  const tope = programa.precioMax ?? Infinity;
  // Para cada tramo de financiamiento: precio ≤ (préstamo + A) / (1 + g) y entrada + gastos ≤ A.
  let mejor = { precio: 0, limitante: "ingreso" };
  for (const t of (programa.financiamiento || [{ hastaPrecio: null, porcentaje: 0.8 }])){
    const pct = t.porcentaje;
    const porCredito = (montoMax + A) / (1 + g);
    const porEntrada = (1 - pct + g) > 0 ? A / (1 - pct + g) : Infinity;
    // Con Credicasa (100 %), el préstamo tope obliga a poner la diferencia: ya está en porCredito.
    const limites = [
      ["ingreso", porCredito],
      ["entrada", porEntrada],
      ["tope", tope],
    ];
    if (t.hastaPrecio != null) limites.push(["tramo", t.hastaPrecio]);
    let [limitante, precio] = limites.reduce((a, b) => (b[1] < a[1] ? b : a));
    if (limitante === "tramo") limitante = "tope";
    if (precio > mejor.precio) mejor = { precio, limitante };
  }
  let precioMax = Math.max(0, mejor.precio);
  // Un programa con piso de precio (VIP) no sirve si no se llega al piso.
  const util = precioMax >= (programa.precioMin || 0) && precioMax > 0;
  if (!util) precioMax = 0;

  return {
    programa,
    elegible: eleg.ok,
    motivos: eleg.motivos,
    tasa, plazo, cuotaMax, montoMax,
    dineroEntrada: A,
    precioMax: eleg.ok ? abajo(precioMax, 100) : 0,
    limitante: !util ? "piso" : mejor.limitante,
  };
}

/** Evalúa todos los programas y resume: presupuesto máximo, opción recomendada y rango. */
export function evaluarPerfil(perfil, params){
  const p = normalizarPerfil(perfil);
  const programas = params.programas.map(pr => evaluarPrograma(pr, p, params));
  const utiles = programas.filter(r => r.elegible && r.precioMax > 0);
  const maximo = utiles.reduce((a, b) => (!a || b.precioMax > a.precioMax ? b : a), null);
  // Recomendado: el más barato (menor tasa) que deja comprar algo del portafolio.
  const piso = params.precioMinPortafolio ?? 0;
  const baratos = utiles.filter(r => r.precioMax >= piso).sort((a, b) => a.tasa - b.tasa || b.precioMax - a.precioMax);
  const recomendado = baratos[0] || maximo;

  const presupuesto = maximo ? maximo.precioMax : 0;
  // Rango: conservador con 1 punto más de tasa; optimista con la relación cuota/ingreso más alta.
  const conservador = Math.max(0, ...params.programas.map(pr => evaluarPrograma(pr, p, params, { ajusteTasa: params.ajusteTasaConservador ?? 0.01 })).filter(r => r.elegible).map(r => r.precioMax));
  const optimista = Math.max(presupuesto, ...params.programas.map(pr => evaluarPrograma(pr, p, params, { relacion: Math.max(pr.relacionCuotaIngreso, params.relacionCuotaIngresoOptimista ?? 0.4) })).filter(r => r.elegible).map(r => r.precioMax));

  return { perfil: p, programas, maximo, recomendado, presupuesto, rango: { conservador: Math.min(conservador, presupuesto), optimista } };
}

// ---------- Financiar un precio concreto ----------

/** Cómo se pagaría una vivienda de este precio con un programa: entrada, préstamo, cuota y si alcanza. */
export function planPara(precio, programa, p, params){
  const eleg = elegibilidad(programa, p, params);
  const enRango = precio >= (programa.precioMin || 0) && precio <= (programa.precioMax ?? Infinity);
  const plazo = plazoPara(programa, p, params);
  const pct = porcentajeFinanciado(programa, precio);
  let prestamoMax = precio * pct;
  if (programa.montoMax != null) prestamoMax = Math.min(prestamoMax, programa.montoMax);
  const gastos = precio * (programa.gastosCierre ?? 0.03);
  const seguro = params.seguroMensualSobreMonto ?? 0;
  const relacion = programa.relacionCuotaIngreso;
  const ingresoTiene = ingresoConsiderado(p, params);
  const A = dineroParaEntrada(p, params);
  // Si la cuota no le alcanza con la entrada mínima, el cliente pone más entrada con lo que tiene.
  const cuotaMax = Math.max(0, ingresoTiene * relacion - p.deudas);
  const prestamoPorIngreso = plazo > 0 ? cuotaMax / (cuotaMensual(1, programa.tasa, plazo) + seguro) : 0;
  const prestamo = Math.min(prestamoMax, Math.max(0, prestamoPorIngreso, precio - (A - gastos)));
  const entrada = precio - prestamo;
  const cuota = cuotaMensual(prestamo, programa.tasa, plazo);
  const seguros = prestamo * seguro;
  const ingresoNecesario = (cuota + seguros + p.deudas) / relacion;
  const faltaIngreso = Math.max(0, ingresoNecesario - ingresoTiene);
  const faltaEntrada = Math.max(0, entrada + gastos - A);
  return {
    programa, aplica: eleg.ok && enRango && plazo > 0, motivos: eleg.motivos, enRango,
    precio, plazo, porcentaje: pct, prestamo, entrada, entradaMinima: precio - prestamoMax, gastos, cuota, seguros,
    cuotaTotal: cuota + seguros, ingresoNecesario, faltaIngreso, faltaEntrada,
    alcanza: faltaIngreso < 1 && faltaEntrada < 1,
  };
}

/** El mejor plan para un precio: el que alcanza con la menor cuota, o el más cercano a alcanzar. */
export function mejorPlan(precio, perfil, params){
  const p = normalizarPerfil(perfil);
  const planes = params.programas.map(pr => planPara(precio, pr, p, params)).filter(x => x.aplica);
  if (!planes.length) return null;
  const alcanzan = planes.filter(x => x.alcanza).sort((a, b) => a.cuotaTotal - b.cuotaTotal);
  if (alcanzan.length) return alcanzan[0];
  // Ninguno alcanza: el que necesita menos dinero extra (ingreso faltante equivale a ~1 año de cuotas).
  const costo = x => x.faltaEntrada + x.faltaIngreso * 12 * x.programa.relacionCuotaIngreso;
  return planes.sort((a, b) => costo(a) - costo(b))[0];
}

/** Cuota "desde" para una tarjeta sin perfil: primera vivienda, afiliado al IESS, 35 años. */
export function planReferencial(precio, params){
  const perfil = { tieneVivienda: false, iess: "36mas", edad: 35, ingreso: 1e6, ahorro: 1e7 };
  // Con ingreso y ahorro "infinitos" todos los programas alcanzan: gana el de menor cuota,
  // pero se descartan los topes de ingreso familiar para no exigir un ingreso irreal.
  const sinTopes = { ...params, programas: params.programas.map(pr => ({ ...pr, ingresoFamiliarMax: null })) };
  return mejorPlan(precio, perfil, sinTopes);
}

// ---------- Semáforo, sugerencias y puntaje ----------

/** verde: alcanza · amarillo: casi (con codeudor, más entrada o dentro del margen) · rojo: todavía no. */
export function semaforoPlan(plan, params){
  if (!plan) return "rojo";
  if (plan.alcanza) return "verde";
  const margen = params.margenAmarillo ?? 0.15;
  const extraEntrada = plan.faltaEntrada / Math.max(1, plan.precio);
  const extraIngreso = plan.faltaIngreso / Math.max(1, plan.ingresoNecesario);
  return extraEntrada <= margen && extraIngreso <= margen ? "amarillo" : "rojo";
}

/** Acciones concretas para llegar a un precio. */
export function sugerencias(plan, perfil, params){
  const p = normalizarPerfil(perfil);
  const out = [];
  if (!plan) return ["Este precio no entra en ningún crédito para tu perfil. Habla con un asesor para ver otras opciones."];
  const meses = params.mesesEntradaEnCuotas ?? 12;
  if (plan.faltaEntrada >= 1){
    out.push(`Te faltan ${dinero(plan.faltaEntrada)} para la entrada y los gastos. Pagando ${dinero(Math.ceil(plan.faltaEntrada / meses))} al mes durante ${meses} meses mientras se construye, lo cubres.`);
  }
  if (plan.faltaIngreso >= 1){
    out.push(`El banco pediría un ingreso familiar de ${dinero(plan.ingresoNecesario)} al mes. Te faltan ${dinero(plan.faltaIngreso)}: puedes sumar los ingresos de tu pareja o de un familiar como codeudor.`);
    if (p.deudas > 0) out.push(`Pagar tus deudas actuales (${dinero(p.deudas)} al mes) libera capacidad: cada dólar de deuda resta un dólar de cuota posible.`);
  }
  if (p.historial === "atrasos") out.push("Ponte al día con tus deudas antes de aplicar: el buró de crédito pesa mucho en la aprobación.");
  if (p.historial === "sin") out.push("Sin historial de crédito, una tarjeta o un préstamo pequeño pagado a tiempo durante 6 meses te ayuda.");
  if (!tieneIess(p) && params.programas.some(pr => pr.requiere?.iess && plan.precio <= (pr.precioMax ?? Infinity)))
    out.push("Con 36 aportaciones al IESS podrías usar los créditos del BIESS, con tasas desde 2,99 %.");
  return out;
}

/** Puntaje de 0 a 100 para priorizar la llamada. A ≥ 75, B 50–74, C < 50. */
export function puntaje(perfil, evaluacion, plan, contacto = {}){
  const p = normalizarPerfil(perfil);
  const d = {};
  const precio = plan?.precio || 0;
  const ratio = precio ? evaluacion.presupuesto / precio : (evaluacion.presupuesto > 0 ? 1 : 0);
  d.capacidad = ratio >= 1 ? 30 : ratio >= 0.9 ? 20 : ratio >= 0.8 ? 10 : 0;
  const necesita = plan ? plan.entrada + plan.gastos : 0;
  const tiene = dineroParaEntrada(p, { mesesEntradaEnCuotas: 12 });
  d.entrada = !plan ? (tiene > 0 ? 10 : 0) : tiene >= necesita ? 20 : tiene >= necesita / 2 ? 12 : tiene > 0 ? 5 : 0;
  d.ingreso = { dependencia: p.iess === "36mas" ? 15 : 12, jubilado: 12, independiente: 9, exterior: 8, negocio: 7 }[p.tipoIngreso] ?? 5;
  d.historial = { excelente: 10, bueno: 8, sin: 5, nose: 5, atrasos: 2 }[p.historial] ?? 5;
  d.urgencia = { mes: 15, "3m": 11, "6m": 6, averiguando: 2 }[p.cuando] ?? 2;
  d.contacto = (contacto.whatsapp ? 7 : 0) + (contacto.correo ? 3 : 0);
  const total = Object.values(d).reduce((a, b) => a + b, 0);
  return { total, prioridad: total >= 75 ? "A" : total >= 50 ? "B" : "C", detalle: d };
}

// ---------- Utilidades ----------

const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";   // sin 0/O ni 1/I/L: se dicta sin errores

/** Código corto para seguir al cliente en WhatsApp y en el panel: CASA-7K2M9Q. */
export function codigoCliente(prefijo = "CASA", aleatorio){
  const bytes = new Uint8Array(6);
  if (aleatorio) for (let i = 0; i < 6; i++) bytes[i] = Math.floor(aleatorio() * 256);
  else globalThis.crypto.getRandomValues(bytes);
  return `${prefijo}-${[...bytes].map(b => ALFABETO[b % ALFABETO.length]).join("")}`;
}

export function dinero(x, decimales = 0){
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", minimumFractionDigits: decimales, maximumFractionDigits: decimales }).format(x);
}
export const porcentaje = (x, dec = 2) => new Intl.NumberFormat("es-EC", { style: "percent", maximumFractionDigits: dec }).format(x);

/** Días desde la vigencia de los parámetros: el sitio avisa cuando pasan de `revisarCadaDias`. */
export function diasDesde(fechaISO, hoy = new Date()){
  return Math.floor((hoy - new Date(fechaISO + "T00:00:00")) / 86400000);
}
