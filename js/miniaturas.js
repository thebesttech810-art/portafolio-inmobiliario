/* Renders de cada proyecto para las tarjetas y la galería, hechos en el navegador con la misma
   maqueta 3D (casa3d.js). Un solo renderizador fuera de pantalla dibuja una vista a la vez, la
   convierte en imagen y libera la memoria. Si el proyecto tiene fotos reales, el sitio usa esas. */
import { WebGLRenderer, Scene, PerspectiveCamera, Vector3, SRGBColorSpace, ACESFilmicToneMapping, PCFShadowMap } from "../vendor/three.js";
import { crearLote, crearPaisaje, crearAmbiente, ajustarNoche, fusionar, liberar, crearMateriales } from "./casa3d.js";

let renderer = null;
const cache = new Map();
let cola = Promise.resolve();

function obtenerRenderer(w, h){
  if (!renderer){
    renderer = new WebGLRenderer({ canvas: document.createElement("canvas"), antialias: true, preserveDrawingBuffer: true, powerPreference: "low-power" });
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;
  }
  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  return renderer;
}

export const VISTAS = {
  frente: { dir: [0.78, 0.2, 1], hora: null, etiqueta: "Fachada" },
  jardin: { dir: [-0.9, 0.42, -0.75], hora: 17.4, etiqueta: "Patio y jardín" },
  aerea: { dir: [0.35, 1.35, 0.8], hora: 11.5, etiqueta: "Vista aérea" },
  noche: { dir: [-0.55, 0.3, 1], hora: 20.2, etiqueta: "De noche" },
};

/** Arma la escena de un proyecto: lote, entorno, cielo y cámara. La usa también el visor. */
export function escenaProyecto(proyecto, { hora, fusion = true } = {}){
  const e = proyecto.estilo || {};
  const escena = new Scene();
  const M = crearMateriales(e);
  let lote = crearLote(proyecto, { materiales: M });
  const alto = (e.forma === "torre" ? (e.pisos || 8) * 3 + 3 : (e.pisos || 2) * 2.9 + 2);
  if (fusion) lote = fusionar(lote);
  escena.add(lote, crearPaisaje(e, M, proyecto.id));
  const amb = crearAmbiente(escena, { sombra: Math.max(22, alto * 0.9), mapa: 2048 });
  const noche = amb.hora(hora ?? e.hora ?? 16);
  ajustarNoche(M, noche);
  return { escena, M, amb, lote, alto, ancho: lote.userData.ancho };
}

export function encuadre(camara, alto, ancho, dir, aspecto){
  const objetivo = new Vector3(0, Math.min(alto * 0.36, 16), -1);
  const tam = Math.max(ancho * 0.5, alto * 1.12);
  const dist = tam / Math.tan((camara.fov * Math.PI) / 360) / Math.min(1.25, Math.max(0.85, aspecto));
  camara.position.copy(new Vector3(...dir).normalize().multiplyScalar(dist)).add(objetivo);
  camara.lookAt(objetivo);
  return objetivo;
}

function dibujar(proyecto, vista, ancho, alto){
  const v = VISTAS[vista] || VISTAS.frente;
  const r = obtenerRenderer(ancho, alto);
  const { escena, alto: h, ancho: w } = escenaProyecto(proyecto, { hora: v.hora ?? undefined });
  const camara = new PerspectiveCamera(32, ancho / alto, 0.5, 1200);
  encuadre(camara, h, w, v.dir, ancho / alto);
  r.render(escena, camara);
  return new Promise(res => r.domElement.toBlob(b => { liberar(escena); res(b ? URL.createObjectURL(b) : null); }, "image/webp", 0.86));
}

/** Imagen (URL de blob) de un proyecto en una vista. Se dibujan de una en una, en orden. */
export function render(proyecto, vista = "frente", ancho = 640, alto = 480){
  const clave = `${proyecto.id}|${vista}|${ancho}x${alto}`;
  if (cache.has(clave)) return cache.get(clave);
  const p = (cola = cola.then(() => new Promise(res => {
    const hacer = () => { try { dibujar(proyecto, vista, ancho, alto).then(res, () => res(null)); } catch { res(null); } };
    (window.requestIdleCallback || setTimeout)(hacer, { timeout: 300 });
  })));
  cache.set(clave, p);
  return p;
}
