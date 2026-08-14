import {
  ACESFilmicToneMapping,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Raycaster,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
} from 'three';
import type { Object3D } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { emptyFaceRig, getFaceRig, type CharacterFaceRig } from '@nx9/shared';
import { applyFaceRigToObject } from './apply-face-rig';
import { createProxyCharacter } from './procedural-body';
import { loadCharacterModel } from './character-model-loader';
import {
  CANONICAL_FACE_VIEW_HEIGHT,
  CANONICAL_FACE_VIEW_WIDTH,
  applyCameraPreset,
  createCanonicalFaceCamera,
  type SculptCameraPresetId,
} from './sculpt-cameras';
import {
  assertSculptMeshContract,
  type SculptCompatibilityReport,
  type SculptModelSource,
} from './sculpt-contract';
import { SCULPT_HANDLES, applyHandleDrag } from './sculpt-handles';
import { createSculptLights } from './sculpt-lights';

export interface SculptViewState {
  faceRig: CharacterFaceRig;
  previewNeutral?: boolean;
  modelSource?: SculptModelSource;
  /** P2：对称联动开关；关闭后带 side 的 Handle 写左右扩展值 */
  symmetric?: boolean;
}

export interface CharacterSculptSceneOptions {
  onCompatibility?: (report: SculptCompatibilityReport) => void;
  onError?: (message: string) => void;
  /** P2：控制点拖拽松手后回传最终 faceRig（拖中只改网格，不写库） */
  onFaceRigCommit?: (rig: CharacterFaceRig) => void;
}

export interface CharacterModelLoadOutcome {
  source: SculptModelSource;
  report: SculptCompatibilityReport;
  warnings: string[];
}

/**
 * 命令式捏模场景：事件驱动渲染，禁止空闲 RAF。
 * P1 只加载代理网格；定妆导出走独立离屏 Renderer（FACE-P3）。
 * P2 增加 Handle.* 控制点拾取拖拽、对称开关与机位预设。
 */
export class CharacterSculptScene {
  private readonly renderer: WebGLRenderer;
  private readonly scene: Scene;
  private readonly camera: PerspectiveCamera;
  private readonly controls: OrbitControls;
  private actor: Object3D;
  private readonly handleLayer = new Group();
  private readonly raycaster = new Raycaster();
  private readonly pointerNdc = new Vector2();
  private state: SculptViewState;
  private destroyed = false;
  private dragHandleId: string | null = null;
  private dragStart = { x: 0, y: 0 };
  private dragStartRig: CharacterFaceRig | null = null;
  private readonly onChange = () => this.render();

  private readonly onPointerDown = (e: PointerEvent) => {
    if (this.destroyed || e.button !== 0) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    this.pointerNdc.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hits = this.raycaster.intersectObjects(this.handleLayer.children, false);
    const hit = hits[0];
    if (!hit) return;
    this.dragHandleId = String(hit.object.userData.handleId ?? '');
    if (!this.dragHandleId) return;
    this.dragStart = { x: e.clientX, y: e.clientY };
    this.dragStartRig = getFaceRig(this.state.faceRig);
    this.controls.enabled = false;
    this.renderer.domElement.style.cursor = 'grabbing';
    try {
      this.renderer.domElement.setPointerCapture(e.pointerId);
    } catch {
      // 某些环境不允许捕获时仍可跟随 pointermove
    }
  };

  private readonly onPointerMove = (e: PointerEvent) => {
    if (!this.dragHandleId || !this.dragStartRig) return;
    const dx = e.clientX - this.dragStart.x;
    const dy = this.dragStart.y - e.clientY;
    const next = applyHandleDrag(this.dragStartRig, this.dragHandleId, dx, dy, {
      symmetric: this.state.symmetric !== false,
    });
    this.state = { ...this.state, faceRig: next };
    this.applyRig();
    this.render();
  };

  private readonly onPointerUp = (e: PointerEvent) => {
    if (!this.dragHandleId || !this.dragStartRig) return;
    this.options.onFaceRigCommit?.(getFaceRig(this.state.faceRig));
    this.dragHandleId = null;
    this.dragStartRig = null;
    this.controls.enabled = true;
    this.renderer.domElement.style.cursor = '';
    try {
      if (this.renderer.domElement.hasPointerCapture(e.pointerId)) {
        this.renderer.domElement.releasePointerCapture(e.pointerId);
      }
    } catch {
      // 忽略释放失败
    }
  };

  constructor(
    mount: HTMLDivElement,
    initial: SculptViewState,
    private readonly options: CharacterSculptSceneOptions = {},
  ) {
    this.state = {
      ...initial,
      faceRig: getFaceRig(initial.faceRig),
      modelSource: initial.modelSource ?? 'proxy',
      symmetric: initial.symmetric ?? true,
    };

    const width = Math.max(1, mount.clientWidth);
    const height = Math.max(1, mount.clientHeight);

    this.renderer = new WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(width, height, false);
    mount.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';

    this.scene = new Scene();
    this.scene.background = new Color('#E7EDF2');

    this.camera = new PerspectiveCamera(32, width / height, 0.05, 40);
    this.camera.position.set(0, 1.25, 2.55);
    this.camera.lookAt(0, 1.15, 0);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;
    this.controls.target.set(0, 1.15, 0);
    this.controls.minDistance = 0.8;
    this.controls.maxDistance = 6;
    this.controls.addEventListener('change', this.onChange);

    for (const light of createSculptLights()) this.scene.add(light);

    this.handleLayer.name = 'SculptHandles';
    for (const def of SCULPT_HANDLES) {
      const marker = new Mesh(
        new SphereGeometry(0.028, 16, 12),
        new MeshBasicMaterial({ color: 0xff8a3d, transparent: true, opacity: 0.85 }),
      );
      marker.name = def.name;
      marker.position.set(...def.position);
      marker.userData.handleId = def.id;
      this.handleLayer.add(marker);
    }
    this.scene.add(this.handleLayer);

    this.actor = createProxyCharacter();
    this.scene.add(this.actor);
    this.applyRig();
    const report = assertSculptMeshContract(this.actor, 'proxy');
    this.options.onCompatibility?.(report);
    this.render();

    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.addEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.addEventListener('pointerup', this.onPointerUp);
  }

  setState(next: SculptViewState): void {
    if (this.destroyed) return;
    this.state = {
      ...this.state,
      ...next,
      faceRig: getFaceRig(next.faceRig),
      symmetric: next.symmetric ?? this.state.symmetric,
    };
    this.applyRig();
    this.render();
  }

  setSize(width: number, height: number): void {
    if (this.destroyed || width < 1 || height < 1) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.render();
  }

  setCameraPreset(presetId: SculptCameraPresetId): void {
    if (this.destroyed) return;
    applyCameraPreset(this.camera, this.controls, presetId);
    this.render();
  }

  resetCamera(): void {
    this.setCameraPreset('face');
  }

  getCompatibilityReport(): SculptCompatibilityReport {
    return assertSculptMeshContract(this.actor, this.state.modelSource ?? 'proxy');
  }

  /**
   * B2：尝试加载正式基模；manifest 缺失 / 契约不合格 / 加载失败时回退代理。
   */
  async loadCharacterModel(options: { glbUrl?: string; manifestUrl?: string } = {}): Promise<CharacterModelLoadOutcome> {
    const before = assertSculptMeshContract(this.actor, this.state.modelSource ?? 'proxy');
    if (this.destroyed) return { source: this.state.modelSource ?? 'proxy', report: before, warnings: [] };
    const result = await loadCharacterModel({ glbUrl: options.glbUrl, manifestUrl: options.manifestUrl });
    if (this.destroyed) {
      return { source: 'proxy', report: assertSculptMeshContract(this.actor, 'proxy'), warnings: result.warnings };
    }
    const previous = this.actor;
    this.scene.remove(previous);
    this.actor = result.root;
    this.scene.add(this.actor);
    this.state = { ...this.state, modelSource: result.source };
    this.applyRig();
    const report = assertSculptMeshContract(this.actor, result.source);
    this.options.onCompatibility?.(report);
    this.render();
    this.disposeObject3D(previous);
    return { source: result.source, report, warnings: result.warnings };
  }

  /**
   * FACE-P3：固定像素 + 规范机位离屏渲染，返回 PNG data URL。
   * 中性对照时按当前参数导出；禁止用预览 canvas 拉伸冒充定妆。
   */
  exportCanonicalImage(rig?: CharacterFaceRig): string | null {
    if (this.destroyed) return null;
    this.applyRig();

    const exportRig = getFaceRig(rig ?? this.state.faceRig);
    const exportActor = this.actor.clone(true);
    applyFaceRigToObject(exportActor, exportRig);

    let exportRenderer: WebGLRenderer | null = null;
    try {
      exportRenderer = new WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
      exportRenderer.outputColorSpace = SRGBColorSpace;
      exportRenderer.toneMapping = ACESFilmicToneMapping;
      exportRenderer.toneMappingExposure = 1.05;
      exportRenderer.setPixelRatio(1);
      exportRenderer.setSize(CANONICAL_FACE_VIEW_WIDTH, CANONICAL_FACE_VIEW_HEIGHT, false);

      const exportScene = new Scene();
      exportScene.background = new Color('#E7EDF2');

      for (const light of createSculptLights()) exportScene.add(light);
      exportScene.add(exportActor);

      const exportCamera = createCanonicalFaceCamera();
      exportRenderer.render(exportScene, exportCamera);
      exportRenderer.render(exportScene, exportCamera);
      const dataUrl = exportRenderer.domElement.toDataURL('image/png');
      return dataUrl;
    } finally {
      exportRenderer?.dispose();
      exportRenderer?.forceContextLoss();
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.removeEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.removeEventListener('pointerup', this.onPointerUp);
    this.controls.removeEventListener('change', this.onChange);
    this.controls.dispose();
    this.scene.remove(this.actor);
    this.scene.remove(this.handleLayer);
    this.disposeObject3D(this.actor);
    this.handleLayer.traverse((obj) => {
      const mesh = obj as { geometry?: { dispose: () => void }; material?: { dispose: () => void } };
      mesh.geometry?.dispose();
      mesh.material?.dispose();
    });
    const canvas = this.renderer.domElement;
    canvas.parentElement?.removeChild(canvas);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  private disposeObject3D(root: Object3D): void {
    root.traverse((obj) => {
      const mesh = obj as { geometry?: { dispose: () => void }; material?: { dispose: () => void } | Array<{ dispose: () => void }> };
      mesh.geometry?.dispose();
      if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
      else mesh.material?.dispose();
    });
  }

  private applyRig(): void {
    const rig = this.state.previewNeutral ? emptyFaceRig() : this.state.faceRig;
    applyFaceRigToObject(this.actor, rig);
  }

  private render(): void {
    if (this.destroyed) return;
    this.renderer.render(this.scene, this.camera);
  }
}
