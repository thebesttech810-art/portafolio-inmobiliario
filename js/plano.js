/* Plano referencial de cada modelo, dibujado en SVG a partir de sus m², dormitorios, baños y patio.
   Reparte los ambientes en dos franjas (social al frente, privada al fondo) y por pisos si la casa
   tiene dos plantas. Sirve para que el cliente se imagine la distribución; no es plano de obra. */

const n1 = x => new Intl.NumberFormat("es-EC", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(x);
const n2 = x => new Intl.NumberFormat("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(x);

function ambientes(modelo, dosPisos){
  const hab = modelo.habitaciones, completos = Math.floor(modelo.banos), medio = modelo.banos % 1 !== 0;
  const dorm = [{ n: "Dormitorio principal", c: "Dorm. ppal.", p: 17, t: "privado" }];
  for (let i = 2; i <= hab; i++) dorm.push({ n: `Dormitorio ${i}`, c: `Dorm. ${i}`, p: 11.5, t: "privado" });
  const banos = Array.from({ length: completos }, (_, i) => ({ n: i === 0 && hab > 1 ? "Baño principal" : "Baño", c: "Baño", p: 4.6, t: "humedo" }));
  const social = [{ n: "Sala y comedor", c: "Sala", p: 30, t: "social" }, { n: "Cocina", c: "Cocina", p: 11, t: "social" }];
  const servicio = [
    ...(medio ? [{ n: "Medio baño", c: "½ baño", p: 2.8, t: "humedo" }] : []),
    { n: "Lavandería", c: "Lav.", p: 3.6, t: "humedo" },
  ];
  if (!dosPisos){
    return [{ titulo: "Planta única", frente: [...social], fondo: [...dorm, ...banos, ...servicio] }];
  }
  const esc = { n: "Escalera", c: "Esc.", p: 5.5, t: "circ" };
  const pb = { titulo: "Planta baja", frente: social, fondo: [esc, ...servicio] };
  if (modelo.m2 >= 115) pb.fondo.unshift({ n: "Estudio", c: "Estudio", p: 8, t: "privado" });
  const pa = { titulo: "Planta alta", frente: dorm.slice(0, 2), fondo: [...dorm.slice(2), ...banos, { n: "Hall", c: "Hall", p: 4.5, t: "circ" }] };
  return [pb, pa];
}

/** SVG del plano. tipo: "casa" | "departamento"; pisos: de la maqueta. */
export function planoSVG(modelo, tipo, pisos){
  const dosPisos = tipo === "casa" && pisos >= 2;
  const plantas = ambientes(modelo, dosPisos);
  const area = modelo.m2 / plantas.length;
  const relacion = tipo === "departamento" ? 1.3 : 0.86;     // ancho / fondo
  const W = Math.sqrt(area * relacion), D = area / W;
  const S = 34;                                              // píxeles por metro
  const patioFondo = tipo === "casa" && modelo.patio ? modelo.patio / W : 0;
  const margen = 46, sep = 56;
  const anchoPlanta = W * S;
  const vbW = margen * 2 + plantas.length * anchoPlanta + (plantas.length - 1) * sep;
  const vbH = margen + 34 + D * S + patioFondo * S + 62;
  const arriba = patioFondo * S;   // el patio va detrás de la casa: arriba en el dibujo
  let svg = `<svg class="plano" viewBox="0 0 ${vbW.toFixed(0)} ${vbH.toFixed(0)}" role="img" aria-label="Plano referencial del modelo ${modelo.nombre}: ${modelo.m2} metros cuadrados, ${modelo.habitaciones} dormitorios">`;
  plantas.forEach((pl, k) => {
    const ox = margen + k * (anchoPlanta + sep), oy = margen + 22 + arriba;
    svg += `<g transform="translate(${ox.toFixed(1)} ${oy.toFixed(1)})">`;
    svg += `<text class="plano-titulo" x="0" y="${-30 - arriba}">${pl.titulo} · ${n1(area)} m²</text>`;
    // Cota del ancho (por encima del patio si lo hay).
    const yc = -12 - (k === 0 ? arriba : 0);
    svg += `<g class="plano-cota"><line x1="0" y1="${yc}" x2="${anchoPlanta}" y2="${yc}"/><line x1="0" y1="${yc - 5}" x2="0" y2="${yc + 5}"/><line x1="${anchoPlanta}" y1="${yc - 5}" x2="${anchoPlanta}" y2="${yc + 5}"/></g>`;
    svg += `<text class="plano-medida" x="${anchoPlanta / 2}" y="${yc - 4}" text-anchor="middle">${n2(W)} m</text>`;
    // Cota del fondo.
    svg += `<g class="plano-cota"><line x1="-12" y1="0" x2="-12" y2="${D * S}"/><line x1="-17" y1="0" x2="-7" y2="0"/><line x1="-17" y1="${D * S}" x2="-7" y2="${D * S}"/></g>`;
    svg += `<text class="plano-medida" transform="translate(-17 ${(D * S) / 2}) rotate(-90)" text-anchor="middle">${n2(D)} m</text>`;
    const pesoFr = pl.frente.reduce((a, b) => a + b.p, 0), pesoFo = pl.fondo.reduce((a, b) => a + b.p, 0);
    const dFondo = D * (pesoFo / (pesoFr + pesoFo)), dFrente = D - dFondo;
    // Fondo arriba (atrás de la casa), frente abajo (hacia la calle).
    const filas = [[pl.fondo, 0, dFondo], [pl.frente, dFondo, dFrente]];
    for (const [lista, y0, alto] of filas){
      const total = lista.reduce((a, b) => a + b.p, 0);
      let x = 0;
      for (const a of lista){
        const w = W * (a.p / total);
        const px = x * S, py = y0 * S, pw = w * S, ph = alto * S;
        svg += `<rect class="plano-ambiente plano-${a.t}" x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${pw.toFixed(1)}" height="${ph.toFixed(1)}"/>`;
        const nombre = pw > 92 ? a.n : a.c;
        const cabe = pw > 40 && ph > 34;
        if (cabe){
          svg += `<text class="plano-nombre" x="${(px + pw / 2).toFixed(1)}" y="${(py + ph / 2 - 3).toFixed(1)}" text-anchor="middle">${nombre}</text>`;
          svg += `<text class="plano-m2" x="${(px + pw / 2).toFixed(1)}" y="${(py + ph / 2 + 12).toFixed(1)}" text-anchor="middle">${n1(w * alto)} m²</text>`;
        }
        x += w;
      }
    }
    svg += `<rect class="plano-muro" x="0" y="0" width="${anchoPlanta.toFixed(1)}" height="${(D * S).toFixed(1)}"/>`;
    // Puerta principal en planta baja: un vano en el muro del frente.
    if (k === 0) svg += `<line class="plano-vano" x1="${(anchoPlanta * 0.62).toFixed(1)}" y1="${(D * S).toFixed(1)}" x2="${(anchoPlanta * 0.62 + 30).toFixed(1)}" y2="${(D * S).toFixed(1)}"/><path class="plano-puerta" d="M${(anchoPlanta * 0.62).toFixed(1)} ${(D * S).toFixed(1)} a30 30 0 0 0 30 -30"/>`;
    if (patioFondo && k === 0){
      // El patio queda detrás: se dibuja arriba del plano, con línea punteada.
      svg += `<rect class="plano-patio" x="0" y="${(-arriba).toFixed(1)}" width="${anchoPlanta.toFixed(1)}" height="${arriba.toFixed(1)}"/>`;
      svg += `<text class="plano-m2" x="${anchoPlanta / 2}" y="${(-patioFondo * S / 2 + 4).toFixed(1)}" text-anchor="middle">Patio ${n1(modelo.patio)} m²</text>`;
    }
    svg += `<text class="plano-calle" x="${anchoPlanta / 2}" y="${(D * S + 24).toFixed(1)}" text-anchor="middle">${k === 0 ? "Frente · calle" : "Frente"}</text>`;
    svg += `</g>`;
  });
  // Escala gráfica.
  const ex = vbW - margen - 5 * S, ey = vbH - 10;
  svg += `<g class="plano-cota"><line x1="${ex}" y1="${ey}" x2="${ex + 5 * S}" y2="${ey}"/>${[0, 1, 2, 5].map(m => `<line x1="${ex + m * S}" y1="${ey - 4}" x2="${ex + m * S}" y2="${ey + 4}"/>`).join("")}</g>`;
  svg += [0, 1, 2, 5].map(m => `<text class="plano-escala" x="${ex + m * S}" y="${ey - 7}" text-anchor="middle">${m}</text>`).join("") + `<text class="plano-escala" x="${ex + 5 * S + 6}" y="${ey + 3}">m</text>`;
  svg += `</svg>`;
  return svg;
}
