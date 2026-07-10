/**
 * Three.js viewer for the HCS. Data points are one InstancedMesh of
 * octahedra (a single draw call regardless of point count), the trajectory
 * is one vertex-colored line, and dimension guide circles are drawn on
 * demand for a single probe row — dimensions are never per-point scene
 * objects, which is what keeps 10k+ points fast.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { circlePoint, framesForRow, type Frame, type HCSConfig } from '../hcs/geometry';

/** ANTz convention: dimension circles colored R, G, B, C, M, Y in order. */
const DIM_COLORS = [0xff2222, 0x22cc22, 0x3366ff, 0x00cccc, 0xcc00cc, 0xcccc00];

export class HCSViewer {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private stereo = new THREE.StereoCamera();
  private stereoEnabled = false;

  private points: THREE.InstancedMesh | null = null;
  private line: THREE.Line | null = null;
  private guides = new THREE.Group();

  private positions: Float32Array<ArrayBufferLike> = new Float32Array(0);
  private valid: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
  private rowCount = 0;
  private visibleCount = 0;
  private pointSize = 1.5;
  private lineVisible = true;

  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private tmpMatrix = new THREE.Matrix4();
  private tmpColor = new THREE.Color();

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x000000);
    this.scene.add(this.guides);

    const grid = new THREE.GridHelper(800, 16, 0x223366, 0x111a33);
    this.scene.add(grid);

    this.camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 100000);
    this.camera.position.set(180, 220, 320);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    // Scene units are ~hundreds, so a few units of eye separation reads well.
    this.stereo.eyeSep = 5;

    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    const dir = new THREE.DirectionalLight(0xffffff, 1.4);
    dir.position.set(200, 400, 250);
    this.scene.add(ambient, dir);

    window.addEventListener('resize', () => {
      this.camera.aspect = container.clientWidth / container.clientHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(container.clientWidth, container.clientHeight);
    });

    const animate = () => {
      requestAnimationFrame(animate);
      this.controls.update();
      this.renderFrame();
    };
    animate();
  }

  /** Render once — normal, or side-by-side stereo when enabled. */
  private renderFrame(): void {
    if (!this.stereoEnabled) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    // Cross-eyed stereo (GlyphViz-style): the RIGHT eye's view is drawn on
    // the LEFT half and vice versa, so crossing your eyes fuses the image.
    this.scene.updateMatrixWorld();
    this.camera.updateMatrixWorld();
    this.stereo.update(this.camera);
    const size = this.renderer.getSize(new THREE.Vector2());
    const w = Math.floor(size.x / 2);
    const h = size.y;
    this.renderer.setScissorTest(true);
    this.renderer.setScissor(0, 0, w, h);
    this.renderer.setViewport(0, 0, w, h);
    this.renderer.render(this.scene, this.stereo.cameraR);
    this.renderer.setScissor(w, 0, size.x - w, h);
    this.renderer.setViewport(w, 0, size.x - w, h);
    this.renderer.render(this.scene, this.stereo.cameraL);
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, size.x, size.y);
  }

  /** Toggle cross-eyed side-by-side stereo. */
  setStereo(enabled: boolean): void {
    this.stereoEnabled = enabled;
  }

  /** Eye separation in world units (scene scale ≈ hundreds, so try 2–10). */
  setEyeSeparation(sep: number): void {
    this.stereo.eyeSep = sep;
  }

  get stereoActive(): boolean {
    return this.stereoEnabled;
  }

  /** Replace the plotted dataset. Colors follow time order (rainbow),
   * matching the red→orange→green→blue→purple ramp used in ANTz. */
  setData(positions: Float32Array, valid: Uint8Array): void {
    this.positions = positions;
    this.valid = valid;
    this.rowCount = valid.length;
    this.visibleCount = this.rowCount;
    this.rebuildPoints();
    this.rebuildLine();
  }

  private rebuildPoints(): void {
    if (this.points) {
      this.scene.remove(this.points);
      this.points.geometry.dispose();
      (this.points.material as THREE.Material).dispose();
      this.points = null;
    }
    if (this.rowCount === 0) return;

    const geo = new THREE.OctahedronGeometry(1);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.1 });
    const mesh = new THREE.InstancedMesh(geo, mat, this.rowCount);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    for (let i = 0; i < this.rowCount; i++) {
      const s = this.valid[i] ? this.pointSize : 0;
      this.tmpMatrix.makeScale(s, s, s);
      this.tmpMatrix.setPosition(this.positions[i * 3], this.positions[i * 3 + 1], this.positions[i * 3 + 2]);
      mesh.setMatrixAt(i, this.tmpMatrix);
      mesh.setColorAt(i, this.timeColor(i));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.points = mesh;
    this.scene.add(mesh);
    this.applyVisibleCount();
  }

  private rebuildLine(): void {
    if (this.line) {
      this.scene.remove(this.line);
      this.line.geometry.dispose();
      (this.line.material as THREE.Material).dispose();
      this.line = null;
    }
    if (this.rowCount < 2) return;

    // Connect only consecutive valid rows; break the line at invalid rows by
    // collapsing them onto the previous valid position (cheap and invisible).
    const pos = new Float32Array(this.rowCount * 3);
    const col = new Float32Array(this.rowCount * 3);
    let lastValid = -1;
    for (let i = 0; i < this.rowCount; i++) {
      const src = this.valid[i] ? i : lastValid;
      if (this.valid[i]) lastValid = i;
      const j = src >= 0 ? src : i;
      pos[i * 3] = this.positions[j * 3];
      pos[i * 3 + 1] = this.positions[j * 3 + 1];
      pos[i * 3 + 2] = this.positions[j * 3 + 2];
      const c = this.timeColor(i);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7 });
    this.line = new THREE.Line(geo, mat);
    this.line.visible = this.lineVisible;
    this.scene.add(this.line);
    this.applyVisibleCount();
  }

  private timeColor(i: number): THREE.Color {
    const t = this.rowCount > 1 ? i / (this.rowCount - 1) : 0;
    return this.tmpColor.setHSL(0.83 * t, 1.0, 0.55).clone();
  }

  /** Animation playhead: show only the first k points/segments. */
  setVisibleCount(k: number): void {
    this.visibleCount = Math.max(0, Math.min(k, this.rowCount));
    this.applyVisibleCount();
  }

  private applyVisibleCount(): void {
    if (this.points) this.points.count = this.visibleCount;
    if (this.line) this.line.geometry.setDrawRange(0, this.visibleCount);
  }

  get totalRows(): number {
    return this.rowCount;
  }

  setPointSize(size: number): void {
    this.pointSize = size;
    if (!this.points) return;
    for (let i = 0; i < this.rowCount; i++) {
      const s = this.valid[i] ? size : 0;
      this.tmpMatrix.makeScale(s, s, s);
      this.tmpMatrix.setPosition(this.positions[i * 3], this.positions[i * 3 + 1], this.positions[i * 3 + 2]);
      this.points.setMatrixAt(i, this.tmpMatrix);
    }
    this.points.instanceMatrix.needsUpdate = true;
  }

  setLineVisible(show: boolean): void {
    this.lineVisible = show;
    if (this.line) this.line.visible = show;
  }

  /** Draw the chain of dimension circles a probe row walks through,
   * colored R,G,B,C,M,Y by dimension, with a small marker at each chosen
   * angle. Pass null to clear. */
  showGuidesForRow(row: number[] | null, cfg: HCSConfig): void {
    this.guides.clear();
    if (!row) return;
    const { frames, angles } = framesForRow(row, cfg);
    frames.forEach((frame, d) => {
      const color = DIM_COLORS[d % DIM_COLORS.length];
      this.guides.add(this.circleLine(frame, color));
      // Marker at the value's position on this dimension circle.
      const p = circlePoint(frame, angles[d]);
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(0.6, frame.radius * 0.05)),
        new THREE.MeshBasicMaterial({ color }),
      );
      marker.position.set(p[0], p[1], p[2]);
      this.guides.add(marker);
    });
  }

  private circleLine(frame: Frame, color: number): THREE.LineLoop {
    const SEGMENTS = 96;
    const pos = new Float32Array(SEGMENTS * 3);
    for (let s = 0; s < SEGMENTS; s++) {
      const theta = -180 + (360 * s) / SEGMENTS;
      const p = circlePoint(frame, theta);
      pos[s * 3] = p[0];
      pos[s * 3 + 1] = p[1];
      pos[s * 3 + 2] = p[2];
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return new THREE.LineLoop(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8 }));
  }

  /** Row index under the pointer, or null. Stereo-aware: picks within
   * whichever half the pointer is in, using that half's eye camera. */
  pickRow(event: PointerEvent): number | null {
    if (!this.points) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const fx = (event.clientX - rect.left) / rect.width;
    const fy = (event.clientY - rect.top) / rect.height;
    let camera: THREE.Camera = this.camera;
    if (this.stereoEnabled) {
      this.stereo.update(this.camera);
      // Cross-eyed layout: left half shows the right eye, right half the left.
      const inLeftHalf = fx < 0.5;
      const eye = inLeftHalf ? this.stereo.cameraR : this.stereo.cameraL;
      // StereoCamera.update writes projectionMatrix directly; raycasting
      // unprojects via projectionMatrixInverse, so sync it here.
      eye.projectionMatrixInverse.copy(eye.projectionMatrix).invert();
      camera = eye;
      this.pointer.x = (inLeftHalf ? fx / 0.5 : (fx - 0.5) / 0.5) * 2 - 1;
    } else {
      this.pointer.x = fx * 2 - 1;
    }
    this.pointer.y = -fy * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, camera as THREE.PerspectiveCamera);
    const hits = this.raycaster.intersectObject(this.points, false);
    const id = hits[0]?.instanceId;
    return id === undefined ? null : id;
  }

  screenshotDataURL(): string {
    this.renderFrame();
    return this.renderer.domElement.toDataURL('image/png');
  }
}
