/**
 * DNA Ink — the three.js scene.
 *
 * Framework-free on purpose: it owns a `<canvas>` and nothing else, so React is
 * only responsible for mounting it, driving `render()` from the shared ticker,
 * and calling `dispose()`. See `src/components/scene/dna-ink/` for that leaf.
 *
 * Two point clouds live in a spinner group (local-Y rotation) inside a tilted
 * group, so the ink swirls with the strand. Both are MULTIPLY-blended: the dye
 * darkens the white water rather than glowing on black.
 *
 * Adapté de Dantora (github : projet « dantora », domaine public — licence Unlicense,
 * copie autorisée) : src/lib/scene/dna-ink/scene.ts. Recopié tel quel ; seuls changent
 * cet en-tête, les chemins d'import et un mode « image fixe »
 * (`setFrozen`, pour prefers-reduced-motion et les écrans tactiles).
 */

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

import { DNA_INK_CONFIG, type DnaInkConfig, type HexColor } from "./helix-config";
import {
  ATMO_FRAGMENT_SHADER,
  ATMO_VERTEX_SHADER,
  FINAL_FRAGMENT_SHADER,
  FINAL_VERTEX_SHADER,
  HELIX_FRAGMENT_SHADER,
  HELIX_VERTEX_SHADER,
  INK_FRAGMENT_SHADER,
  INK_VERTEX_SHADER,
} from "./helix-shaders";

/** Camera FOV / near / far — framing constants, not tunables. */
const CAMERA_FOV = 45;
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 200;
/** Fog is inert (the point materials are unlit) but keeps the clear colour honest. */
const FOG_FAR = 22;
/** Easing factor applied to the raw pointer each frame — the lazy camera drift. */
const POINTER_EASE = 0.05;
/** Easing factor for the projected world-space cursor. */
const CURSOR_EASE = 0.15;
/** Easing factor for the cursor-deform strength ramp. */
const ACTIVITY_EASE = 0.08;
/** Seconds of pointer stillness after which the deform relaxes away. */
const POINTER_IDLE_SECONDS = 3;
/** Longest frame delta the spin integrator will accept (tab-switch guard). */
const MAX_FRAME_DELTA = 0.05;
/** Entrance fade: delay, then duration, in seconds. */
const APPEAR_DELAY = 0.2;
const APPEAR_DURATION = 1.6;
/** Point-count changes reallocate buffers — coalesce a slider drag into one rebuild. */
const REBUILD_DEBOUNCE_MS = 120;
/**
 * Drawing-buffer height at which `helixSize` / `inkSize` read as calibrated.
 *
 * `gl_PointSize` is device pixels, so without normalising against the buffer
 * the same sprite covers a larger *share* of a small canvas: narrowing the
 * window packed the cloud tighter and MULTIPLY blending turned the overlap into
 * a darker, shifted colour. 800 design px at a 2× pixel-ratio cap.
 */
const REFERENCE_BUFFER_HEIGHT = 1600;
/**
 * Required by `MultiplyBlending` on modern three.
 *
 * The reference sketch ran three r143, where non-premultiplied multiply fell
 * back to `blendFunc(ZERO, SRC_COLOR)`. That branch is gone: since r16x the
 * renderer logs *"MultiplyBlending requires material.premultipliedAlpha = true"*
 * and sets **no** blend function at all, so the clouds draw with whatever state
 * the previous material left behind. The premultiplied path,
 * `blendFuncSeparate(DST_COLOR, ONE_MINUS_SRC_ALPHA, ZERO, ONE)`, reduces to
 * exactly `dst * src` because every fragment here writes `alpha = 1.0` — i.e.
 * it reproduces r143 bit-for-bit.
 */
const PREMULTIPLIED_ALPHA = true;

/**
 * Bounding spheres of the seed buffers, set rather than computed. The clouds
 * are placed in the vertex shader and never culled (`frustumCulled = false`),
 * so the sphere only feeds the renderer's transparent sort — and computing it
 * walked every seed on the first frame (tens of ms at 4× CPU). Seeds are
 * uniform in [0, 64)³ (`createSeedGeometry`), the atmosphere in [-1, 1]³ —
 * these are the spheres `computeBoundingSphere` arrives at.
 */
const SEED_SPHERE = new THREE.Sphere(new THREE.Vector3(32, 32, 32), 32 * Math.sqrt(3));
const ATMO_SPHERE = new THREE.Sphere(new THREE.Vector3(0, 0, 0), Math.sqrt(3));

/**
 * Hand the main thread back between build steps, so a step is a short task
 * rather than one long one (optimize-3d-scene §3). `setTimeout`, not rAF: a
 * background tab still finishes the build.
 */
const yieldToMain = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));

/**
 * Write a `#rrggbb` into a `THREE.Color` **without** colour management.
 *
 * `Color.setHex()` would treat the value as sRGB and convert it into the linear
 * working space, but nothing in this pipeline ever encodes back: the composer's
 * copy pass is a custom shader with no `<colorspace_fragment>`, so whatever
 * lands in the framebuffer is what you see. Raw components keep the clear
 * colour matching `hexToVec3`, which is how every palette colour reaches the
 * shaders. `setRGB` defaults to the working space, so it is a no-op conversion.
 */
const writeHexToColor = (hex: HexColor, target: THREE.Color): THREE.Color => {
  const n = parseInt(hex.slice(1), 16);
  return target.setRGB(
    ((n >> 16) & 255) / 255,
    ((n >> 8) & 255) / 255,
    (n & 255) / 255,
  );
};

const hexToVec3 = (hex: HexColor): THREE.Vector3 => {
  const n = parseInt(hex.slice(1), 16);
  return new THREE.Vector3(
    ((n >> 16) & 255) / 255,
    ((n >> 8) & 255) / 255,
    (n & 255) / 255,
  );
};

/** Every uniform shared by the helix and ink materials. */
interface DnaInkUniforms {
  uTime: THREE.IUniform<number>;
  uAppear: THREE.IUniform<number>;
  uHelixA: THREE.IUniform<THREE.Vector3>;
  uHelixB: THREE.IUniform<THREE.Vector3>;
  uInkCore: THREE.IUniform<THREE.Vector3>;
  uInkMid: THREE.IUniform<THREE.Vector3>;
  uInkEdge: THREE.IUniform<THREE.Vector3>;
  uHelixSize: THREE.IUniform<number>;
  uInkSize: THREE.IUniform<number>;
  uBrightness: THREE.IUniform<number>;
  uHelixOpacity: THREE.IUniform<number>;
  uInkOpacity: THREE.IUniform<number>;
  uInkGrow: THREE.IUniform<number>;
  uRadius: THREE.IUniform<number>;
  uHeight: THREE.IUniform<number>;
  uTwist: THREE.IUniform<number>;
  uThick: THREE.IUniform<number>;
  uWave: THREE.IUniform<number>;
  uEmitRate: THREE.IUniform<number>;
  uSpread: THREE.IUniform<number>;
  uRise: THREE.IUniform<number>;
  uTurb: THREE.IUniform<number>;
  uNoiseFreq: THREE.IUniform<number>;
  uNoiseEvolve: THREE.IUniform<number>;
  uCursor: THREE.IUniform<THREE.Vector3>;
  uRepelRadius: THREE.IUniform<number>;
  uRepelStrength: THREE.IUniform<number>;
  uActivity: THREE.IUniform<number>;
  uPixelScale: THREE.IUniform<number>;
}

interface AtmoUniforms {
  uTime: THREE.IUniform<number>;
  uColor: THREE.IUniform<THREE.Vector3>;
  uRes: THREE.IUniform<THREE.Vector2>;
}

type PointCloud = THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;

/** Random seed buffer — the shaders hash each position into a point identity. */
const createSeedGeometry = (count: number): THREE.BufferGeometry => {
  const geometry = new THREE.BufferGeometry();
  const seeds = new Float32Array(count * 3);
  for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random() * 64;
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(seeds, 3));
  geometry.boundingSphere = SEED_SPHERE.clone();
  return geometry;
};

const disposeCloud = (cloud: PointCloud): void => {
  cloud.geometry.dispose();
  cloud.material.dispose();
};

export class DnaInkScene {
  private config: DnaInkConfig;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly composer: EffectComposer;
  private readonly finalPass: ShaderPass;
  /** Stand-in for the copy pass's full-screen quad, only to pre-link its program. */
  private readonly copyQuadGeometry = new THREE.PlaneGeometry(2, 2);
  /** Shared by the clear colour and the scene background — mutated in place. */
  private readonly bgColor = new THREE.Color();
  private readonly fog: THREE.Fog;

  private readonly tiltGroup: THREE.Group;
  private readonly spinner: THREE.Group;
  private readonly uniforms: DnaInkUniforms;
  private readonly atmoUniforms: AtmoUniforms;

  /** Built in steps by `prepare()` — null until then. */
  private helix: PointCloud | null = null;
  private ink: PointCloud | null = null;
  private atmo: PointCloud | null = null;
  /** `prepare()` has finished: clouds built, programs linked, targets allocated. */
  private ready = false;
  private disposed = false;

  /** Raw pointer in NDC, and the eased value the camera actually follows. */
  private readonly pointerTarget = { x: 0, y: 0 };
  private readonly pointer = { x: 0, y: 0 };
  private readonly cursorWorld = new THREE.Vector3();
  private pointerActive = false;
  private pointerLastMove = 0;
  private pointerActivity = 0;

  private spinPhase = 0;
  /**
   * Scene clock, accumulated from **clamped** frame deltas.
   *
   * Never `performance.now()`. Ink position is a pure function of `uTime`
   * (`life = fract(seed + uTime * emitRate)`), so a wall clock makes the whole
   * cloud teleport whenever the browser drops frames — which is exactly what
   * fast scrolling does. Accumulating clamped deltas means the worst a stall
   * can cost is `MAX_FRAME_DELTA` of drift, and the plume stays continuous.
   */
  private elapsed = 0;
  private lastFrame: number;
  /**
   * Wall clock at construction, used **only** for the entrance fade.
   *
   * `uAppear` must not ride the frame-accumulated clock: it is a one-shot
   * intro, and if the browser throttles rAF the scene otherwise sits stuck
   * half-faded — reading as a small, faint tangle instead of a helix. A jump
   * here is invisible (the fade is already over); a jump in `uTime` is not.
   */
  private startedAt: number;

  /** Last size handed to `setSize`, replayed when the pixel-ratio clamp changes. */
  private width = 0;
  private height = 0;
  private rebuildTimer: ReturnType<typeof setTimeout> | null = null;

  /** Scratch vectors — reused every frame so the loop allocates nothing. */
  private readonly ndc = new THREE.Vector3();
  private readonly rayDir = new THREE.Vector3();
  private readonly cursorTarget = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement, config: DnaInkConfig = DNA_INK_CONFIG) {
    this.config = config;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });

    this.scene = new THREE.Scene();
    // One Color instance backs the clear colour, the scene background and the
    // fog, so `syncBackground()` only has to mutate it in place.
    this.scene.background = this.bgColor;
    this.fog = new THREE.Fog(this.bgColor, 0, FOG_FAR);
    this.scene.fog = this.fog;

    this.camera = new THREE.PerspectiveCamera(
      CAMERA_FOV,
      1,
      CAMERA_NEAR,
      CAMERA_FAR,
    );
    this.camera.position.set(0, 0, config.camDist);
    this.scene.add(this.camera);

    // The reference sketch also built two bloom composers whose render targets
    // were assigned to uniforms the final shader never samples — three full
    // scene renders per frame for an image that was thrown away. Only the
    // composite path is kept; the output is identical, at a third of the cost.
    this.finalPass = new ShaderPass({
      uniforms: {
        iTime: { value: 0 },
        tDiffuse: { value: null },
        uBg: { value: new THREE.Vector3() },
        uFlameA: { value: new THREE.Vector3() },
        uFlameB: { value: new THREE.Vector3() },
        uFlameAmt: { value: 0 },
      },
      vertexShader: FINAL_VERTEX_SHADER,
      fragmentShader: FINAL_FRAGMENT_SHADER,
    });
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(this.finalPass);

    this.uniforms = {
      uTime: { value: 0 },
      uAppear: { value: 0 },
      uHelixA: { value: new THREE.Vector3() },
      uHelixB: { value: new THREE.Vector3() },
      uInkCore: { value: new THREE.Vector3() },
      uInkMid: { value: new THREE.Vector3() },
      uInkEdge: { value: new THREE.Vector3() },
      uHelixSize: { value: 0 },
      uInkSize: { value: 0 },
      uBrightness: { value: 0 },
      uHelixOpacity: { value: 0 },
      uInkOpacity: { value: 0 },
      uInkGrow: { value: 0 },
      uRadius: { value: 0 },
      uHeight: { value: 0 },
      uTwist: { value: 0 },
      uThick: { value: 0 },
      uWave: { value: 0 },
      uEmitRate: { value: 0 },
      uSpread: { value: 0 },
      uRise: { value: 0 },
      uTurb: { value: 0 },
      uNoiseFreq: { value: 0 },
      uNoiseEvolve: { value: 0 },
      uCursor: { value: new THREE.Vector3() },
      uRepelRadius: { value: 0 },
      uRepelStrength: { value: 0 },
      uActivity: { value: 0 },
      uPixelScale: { value: 1 },
    };
    this.atmoUniforms = {
      uTime: { value: 0 },
      uColor: { value: new THREE.Vector3() },
      uRes: { value: new THREE.Vector2(1, 1) },
    };
    this.writeUniforms();
    this.syncBackground();

    this.tiltGroup = new THREE.Group();
    this.spinner = new THREE.Group();
    this.tiltGroup.add(this.spinner);
    this.scene.add(this.tiltGroup);

    const now = performance.now();
    this.startedAt = now;
    this.lastFrame = now / 1000;
    this.pointerLastMove = now;

    void this.prepare();
  }

  /**
   * The rest of the build, one short task per step: each cloud's buffers, the
   * composer's render targets, the programs (linked off the main thread where
   * `KHR_parallel_shader_compile` exists). Built in one go — renderer, 200k
   * seeds, first-frame compile, target allocation — it was two long tasks at
   * load, under the preloader that waits for this scene (optimize-3d-scene §3).
   * `render()` draws nothing until it finishes; the entrance fade starts then.
   */
  private async prepare(): Promise<void> {
    await yieldToMain();
    if (this.disposed) return;
    this.helix = this.createCloud(
      this.config.helixCount,
      HELIX_VERTEX_SHADER,
      HELIX_FRAGMENT_SHADER,
    );

    await yieldToMain();
    if (this.disposed) return;
    this.ink = this.createCloud(
      this.config.inkCount,
      INK_VERTEX_SHADER,
      INK_FRAGMENT_SHADER,
    );
    this.spinner.add(this.helix, this.ink);
    this.atmo = this.createAtmosphere();
    this.scene.add(this.atmo);

    await yieldToMain();
    if (this.disposed) return;
    this.sized = true;
    this.applySize();

    await yieldToMain();
    if (this.disposed) return;
    // The RenderPass draws into the composer's read buffer: allocate both
    // targets now rather than on the first frame.
    if (this.width > 0) {
      this.renderer.initRenderTarget(this.composer.readBuffer);
      this.renderer.initRenderTarget(this.composer.writeBuffer);
    }

    await yieldToMain();
    if (this.disposed) return;
    // Compiled with the read buffer bound — the target is part of a program's
    // cache key, so compiling against the canvas would link programs the
    // RenderPass never uses and the first frame would compile again.
    this.renderer.setRenderTarget(this.composer.readBuffer);
    const linked = this.renderer.compileAsync(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    // The final copy pass draws to the canvas: link its program too, against
    // the canvas, so the first frame compiles nothing.
    const quad = new THREE.Mesh(this.copyQuadGeometry, this.finalPass.material);
    const copyLinked = this.renderer.compileAsync(quad, this.camera);
    await Promise.all([linked, copyLinked]);
    if (this.disposed) return;

    // One throwaway draw into the read buffer (the first real frame clears
    // and redraws it): uploads the clouds' buffers and reads the programs'
    // uniforms in a step of its own instead of in the first frame.
    await yieldToMain();
    if (this.disposed) return;
    this.renderer.setRenderTarget(this.composer.readBuffer);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);

    const now = performance.now();
    this.startedAt = now;
    this.lastFrame = now / 1000;
    this.ready = true;
  }

  /**
   * Repaint the backdrop from `config.bgColor`.
   *
   * The reference sketch exposed `bgColor` in its panel but hardcoded `0xffffff`
   * in all three places that actually decide the backdrop — clear colour, scene
   * background, fog — so the swatch did nothing. Wiring it up is what makes the
   * MULTIPLY-blended clouds sit on tinted paper instead of pure white.
   */
  private syncBackground(): void {
    writeHexToColor(this.config.bgColor, this.bgColor);
    this.renderer.setClearColor(this.bgColor, 1);
    this.fog.color.copy(this.bgColor);
  }

  /** Push every colour/scalar from `this.config` into its uniform. */
  private writeUniforms(): void {
    const c = this.config;
    const u = this.uniforms;

    u.uHelixA.value.copy(hexToVec3(c.helixColorA));
    u.uHelixB.value.copy(hexToVec3(c.helixColorB));
    u.uInkCore.value.copy(hexToVec3(c.inkCore));
    u.uInkMid.value.copy(hexToVec3(c.inkMid));
    u.uInkEdge.value.copy(hexToVec3(c.inkEdge));
    u.uHelixSize.value = c.helixSize;
    u.uInkSize.value = c.inkSize;
    u.uBrightness.value = c.brightness;
    u.uHelixOpacity.value = c.helixOpacity;
    u.uInkOpacity.value = c.inkOpacity;
    u.uInkGrow.value = c.inkGrow;
    u.uRadius.value = c.radius;
    u.uHeight.value = c.height;
    u.uTwist.value = c.twist;
    u.uThick.value = c.strandThick;
    u.uWave.value = c.wave;
    u.uEmitRate.value = c.emitRate;
    u.uSpread.value = c.spread;
    u.uRise.value = c.rise;
    u.uTurb.value = c.turbulence;
    u.uNoiseFreq.value = c.noiseFreq;
    u.uNoiseEvolve.value = c.noiseEvolve;
    u.uRepelRadius.value = c.pointerRadius;
    u.uRepelStrength.value = c.pointerStrength;

    this.atmoUniforms.uColor.value.copy(hexToVec3(c.atmoColor));

    // Inert on white paper — kept wired so the flame composite can be revived.
    this.finalPass.uniforms.uBg.value.copy(hexToVec3(c.bgColor));
    this.finalPass.uniforms.uFlameA.value.copy(hexToVec3(c.flameColor));
    this.finalPass.uniforms.uFlameB.value.copy(hexToVec3(c.flameColor2));
    this.finalPass.uniforms.uFlameAmt.value = c.flameAmt;
  }

  /**
   * Swap in a new settings object. Colours and scalars take effect on the next
   * frame; anything that changes a buffer size (`helixCount`, `inkCount`,
   * `atmoCount`, `atmoSize`) schedules a debounced geometry rebuild, so
   * dragging a count slider does not reallocate on every input event.
   */
  applyConfig(next: DnaInkConfig): void {
    const previous = this.config;
    this.config = next;
    this.writeUniforms();
    this.syncBackground();

    if (next.maxPixelRatio !== previous.maxPixelRatio) {
      this.setSize(this.width, this.height);
    }

    const buffersChanged =
      next.helixCount !== previous.helixCount ||
      next.inkCount !== previous.inkCount ||
      next.atmoCount !== previous.atmoCount ||
      next.atmoSize !== previous.atmoSize;

    if (!buffersChanged) return;

    if (this.rebuildTimer !== null) clearTimeout(this.rebuildTimer);
    this.rebuildTimer = setTimeout(() => {
      this.rebuildTimer = null;
      this.rebuildClouds();
    }, REBUILD_DEBOUNCE_MS);
  }

  private rebuildClouds(): void {
    if (!this.ready || !this.helix || !this.ink || !this.atmo) return;
    this.spinner.remove(this.helix, this.ink);
    disposeCloud(this.helix);
    disposeCloud(this.ink);

    this.helix = this.createCloud(
      this.config.helixCount,
      HELIX_VERTEX_SHADER,
      HELIX_FRAGMENT_SHADER,
    );
    this.ink = this.createCloud(
      this.config.inkCount,
      INK_VERTEX_SHADER,
      INK_FRAGMENT_SHADER,
    );
    this.spinner.add(this.helix, this.ink);

    this.scene.remove(this.atmo);
    disposeCloud(this.atmo);
    this.atmo = this.createAtmosphere();
    this.scene.add(this.atmo);
  }

  private createCloud(
    count: number,
    vertexShader: string,
    fragmentShader: string,
  ): PointCloud {
    const points = new THREE.Points(
      createSeedGeometry(Math.round(count)),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms as unknown as Record<string, THREE.IUniform>,
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.MultiplyBlending,
        premultipliedAlpha: PREMULTIPLIED_ALPHA,
      }),
    );
    // Points are placed entirely in the vertex shader, so their bounding sphere
    // says nothing about where they end up — culling would drop the whole cloud.
    points.frustumCulled = false;
    return points;
  }

  private createAtmosphere(): PointCloud {
    const count = Math.round(this.config.atmoCount);
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const seeds = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = 2 * Math.random() - 1;
      positions[i * 3 + 1] = 2 * Math.random() - 1;
      positions[i * 3 + 2] = 2 * Math.random() - 1;
      sizes[i] = this.config.atmoSize * (0.4 + Math.random());
      seeds[i] = Math.random();
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute("size", new THREE.Float32BufferAttribute(sizes, 1));
    geometry.setAttribute("seed", new THREE.Float32BufferAttribute(seeds, 1));
    geometry.boundingSphere = ATMO_SPHERE.clone();

    const points = new THREE.Points(
      geometry,
      new THREE.ShaderMaterial({
        uniforms: this.atmoUniforms as unknown as Record<
          string,
          THREE.IUniform
        >,
        vertexShader: ATMO_VERTEX_SHADER,
        fragmentShader: ATMO_FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.MultiplyBlending,
        premultipliedAlpha: PREMULTIPLIED_ALPHA,
      }),
    );
    points.frustumCulled = false;
    return points;
  }

  /**
   * Resize the drawing buffer. Pass CSS pixels; the pixel-ratio clamp from
   * `config.maxPixelRatio` is applied here.
   */
  setSize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;

    this.width = width;
    this.height = height;
    // Before the staged build has run its sizing step the size is only
    // recorded — resizing the drawing buffer belongs to that step, not to the
    // task that created the context.
    if (this.sized) this.applySize();
  }

  /** `sized` once `prepare()` has sized the buffers; later sizes apply at once. */
  private sized = false;

  private applySize(): void {
    const { width, height } = this;
    if (width <= 0 || height <= 0) return;

    const pixelRatio = Math.min(
      window.devicePixelRatio,
      this.config.maxPixelRatio,
    );

    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);

    this.atmoUniforms.uRes.value.set(width * pixelRatio, height * pixelRatio);
    // Both clouds scale with the drawing buffer, exactly as the atmosphere
    // already did via `uRes.y / 900.0`. `helixSize` / `inkSize` in the config
    // are calibrated against REFERENCE_BUFFER_HEIGHT.
    this.uniforms.uPixelScale.value =
      (height * pixelRatio) / REFERENCE_BUFFER_HEIGHT;
  }

  /**
   * Rewind the animation to its canonical starting pose.
   *
   * The helix spins continuously (`config.spin`), so without this every return
   * to a scene block showed it at whatever angle it happened to have reached —
   * scroll away, come back, and the model is rotated differently. Resetting on
   * re-entry makes arriving at the block deterministic: the same pose, every
   * time, in both scenes.
   *
   * `uAppear` is left alone — the intro fade should not replay.
   */
  resetClock(): void {
    this.elapsed = 0;
    this.spinPhase = 0;
    this.lastFrame = performance.now() / 1000;
    // The pointer easing state is part of the pose: a stale target left over
    // from the previous visit would swing the camera while the block re-enters.
    this.pointerTarget.x = 0;
    this.pointerTarget.y = 0;
    this.pointer.x = 0;
    this.pointer.y = 0;
    this.cursorWorld.set(0, 0, 0);
    this.pointerActivity = 0;
    this.pointerActive = false;
  }

  /**
   * Feed a pointer position in normalised device coordinates (-1…1).
   *
   * Clamped hard: NDC is computed against the canvas rect, and when that rect
   * is scrolled far off screen the raw value reaches ±15 and beyond. Fed to the
   * parallax unclamped, that dragged the camera to y ≈ −45 (measured) — looking
   * down the helix axis from triple distance, which is the "small knot at a
   * different angle" every one of those bug reports showed.
   */
  setPointer(ndcX: number, ndcY: number): void {
    this.pointerTarget.x = clamp(ndcX, -1, 1);
    this.pointerTarget.y = clamp(ndcY, -1, 1);
    this.pointerActive = true;
    this.pointerLastMove = performance.now();
  }

  /**
   * Ajout PharmaBoost (absent de Dantora) : l'image fixe. Gelée, la scène ne fait plus
   * avancer son horloge ni le fondu d'apparition — une seule image complète suffit,
   * pour prefers-reduced-motion et les écrans tactiles.
   */
  private frozen = false;
  setFrozen(frozen: boolean): void {
    this.frozen = frozen;
  }

  /** Called when the pointer leaves the window — relaxes the deform. */
  clearPointer(): void {
    this.pointerActive = false;
  }

  /**
   * Project the eased cursor onto the z=0 plane through the origin, so the
   * deform bulge tracks the pointer in the same world the helix lives in.
   */
  private updateCursorWorld(): void {
    this.cursorTarget.set(0, 0, 0);

    if (this.pointerActive) {
      this.ndc.set(this.pointer.x, this.pointer.y, 0.5).unproject(this.camera);
      this.rayDir.copy(this.ndc).sub(this.camera.position).normalize();
      const dz = this.rayDir.z;
      if (Math.abs(dz) > 1e-4) {
        const distance = -this.camera.position.z / dz;
        if (distance > 0 && Number.isFinite(distance)) {
          this.cursorTarget
            .copy(this.camera.position)
            .addScaledVector(this.rayDir, distance);
        }
      }
    }

    this.cursorWorld.lerp(this.cursorTarget, CURSOR_EASE);

    const idleSeconds = (performance.now() - this.pointerLastMove) / 1000;
    const wanted =
      this.pointerActive && idleSeconds < POINTER_IDLE_SECONDS ? 1 : 0;
    this.pointerActivity += (wanted - this.pointerActivity) * ACTIVITY_EASE;
  }

  /** Live uniform/camera values, for the dev controls panel and diagnostics. */
  inspect(): Record<string, number> {
    return {
      appear: this.uniforms.uAppear.value,
      pixelScale: this.uniforms.uPixelScale.value,
      elapsed: this.elapsed,
      spinPhase: this.spinPhase,
      camX: this.camera.position.x,
      camY: this.camera.position.y,
      camZ: this.camera.position.z,
      aspect: this.camera.aspect,
      width: this.width,
      height: this.height,
      helixSize: this.uniforms.uHelixSize.value,
      brightness: this.uniforms.uBrightness.value,
    };
  }

  /**
   * Advance and draw one frame. Safe to call from the shared ticker. Returns
   * whether a frame was drawn — false until `prepare()` has finished.
   */
  render(): boolean {
    if (!this.ready || !this.atmo) return false;
    const now = performance.now();
    const wallClock = now / 1000;
    const delta = this.frozen ? 0 : Math.min(MAX_FRAME_DELTA, wallClock - this.lastFrame);
    this.lastFrame = wallClock;
    this.elapsed += delta;

    this.pointer.x = lerp(this.pointer.x, this.pointerTarget.x, POINTER_EASE);
    this.pointer.y = lerp(this.pointer.y, this.pointerTarget.y, POINTER_EASE);

    this.uniforms.uTime.value = this.elapsed;

    this.tiltGroup.rotation.z = this.config.tilt;
    this.spinPhase += delta * this.config.spin;
    this.spinner.rotation.y = this.spinPhase;

    this.camera.position.x = this.pointer.x * this.config.parallax;
    this.camera.position.y = this.pointer.y * this.config.parallax;
    this.camera.position.z = this.config.camDist;
    this.camera.lookAt(0, 0, 0);

    this.updateCursorWorld();
    this.uniforms.uCursor.value.copy(this.cursorWorld);
    this.uniforms.uActivity.value = this.pointerActivity;

    // Wall clock, not `elapsed` — see the field's note.
    const sinceMount = (now - this.startedAt) / 1000;
    this.uniforms.uAppear.value = this.frozen
      ? 1
      : clamp((sinceMount - APPEAR_DELAY) / APPEAR_DURATION, 0, 1);

    // Motes ride along with the camera so the field never thins out.
    this.atmoUniforms.uTime.value = this.elapsed * this.config.atmoSpeed * 8;
    this.atmo.position.copy(this.camera.position);
    this.finalPass.uniforms.iTime.value = this.elapsed;

    this.composer.render();
    return true;
  }

  /** Release every GPU resource. Call from the mounting component's cleanup. */
  dispose(): void {
    this.disposed = true;
    if (this.rebuildTimer !== null) clearTimeout(this.rebuildTimer);
    for (const cloud of [this.helix, this.ink, this.atmo]) {
      if (cloud) disposeCloud(cloud);
    }
    this.finalPass.dispose();
    this.copyQuadGeometry.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }
}
