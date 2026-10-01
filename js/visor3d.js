/* Maqueta interactiva en la ficha de cada proyecto: se gira con el dedo o el mouse, se puede ver
   de día, al atardecer o de noche, y "abrir" por pisos (vista explosionada) para entender cómo
   se reparte la casa. Usa la misma escena que los renders (miniaturas.js). */
import { WebGLRenderer, PerspectiveCamera, SRGBColorSpace, ACESFilmicToneMapping, PCFShadowMap, OrbitControls } from "../vendor/three.js";
import { escenaProyecto, encuadre } from "./miniaturas.js";
import { ajustarNoche, liberar } from "./casa3d.js";

export function abrirVisor(canvas, proyecto){
  const reducir = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));

  // Sin fusionar: cada piso queda separado para la vista explosionada.
  const { escena, M, amb, lote, alto, ancho } = escenaProyecto(proyecto, { fusion: false });
  const partes = lote.userData.edificacion?.userData.partes || [];
  const base = partes.map(p => p.position.y);
  const separacion = proyecto.estilo?.forma === "torre" ? 1.6 : 2.6;

  const camara = new PerspectiveCamera(35, 1, 0.5, 1500);
  const objetivo = encuadre(camara, alto, ancho, [0.85, 0.35, 1], 1.4);
  const controles = new OrbitControls(camara, canvas);
  controles.target.copy(objetivo);
  controles.enableDamping = true;
  controles.enablePan = false;
  controles.minDistance = Math.max(12, alto * 0.8);
  controles.maxDistance = camara.position.distanceTo(objetivo) * 1.6;
  controles.maxPolarAngle = Math.PI * 0.47;
  controles.autoRotate = !reducir;
  controles.autoRotateSpeed = 0.6;
  controles.update();
  controles.addEventListener("start", () => { controles.autoRotate = false; });

  let hora = proyecto.estilo?.hora ?? 16, horaMeta = hora, abierto = 0, abiertoMeta = 0, vivo = true, ancho0 = 0, alto0 = 0;
  function medir(){
    const r = canvas.getBoundingClientRect();
    if (r.width === ancho0 && r.height === alto0) return;
    ancho0 = r.width; alto0 = r.height;
    renderer.setSize(ancho0, alto0, false);
    camara.aspect = ancho0 / alto0; camara.updateProjectionMatrix();
  }
  function cuadro(){
    if (!vivo) return;
    requestAnimationFrame(cuadro);
    medir();
    if (Math.abs(horaMeta - hora) > 0.001){
      hora += reducir ? horaMeta - hora : (horaMeta - hora) * 0.1;
      ajustarNoche(M, amb.hora(hora));
    }
    if (Math.abs(abiertoMeta - abierto) > 0.001){
      abierto += reducir ? abiertoMeta - abierto : (abiertoMeta - abierto) * 0.12;
      partes.forEach((p, i) => { p.position.y = base[i] + i * separacion * abierto; });
    }
    controles.update();
    renderer.render(escena, camara);
  }
  cuadro();

  return {
    hora(h){ horaMeta = h; },
    explotar(si){ abiertoMeta = si ? 1 : 0; controles.autoRotate = false; },
    girar(si){ controles.autoRotate = si; },
    destruir(){ vivo = false; controles.dispose(); liberar(escena); renderer.dispose(); renderer.forceContextLoss?.(); },
  };
}
