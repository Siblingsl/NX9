import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  HemisphereLight,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { emptyFaceRig, getFaceRig, type CharacterFaceRig } from '@nx9/shared';
import { applyFaceRigToObject } from './apply-face-rig';
import { createProxyCharacter } from './procedural-body';
import {
  assertSculptMeshContract,
  type SculptCompatibilityReport,
  type SculptModelSource,
} from './sculpt-contract';

export interface SculptViewState {
  faceRig: CharacterFaceRig;
  previewNeutral?: boolean;
  modelSource?: SculptModelSource;
}

export interface CharacterSculptSceneOptions {
  onCompatibility?: (report: SculptCompatibilityReport) => void;
  onError?: (message: string) => void;
}

/**
 * 命令式捏模场景：事件驱动渲染，禁止空闲 RAF。
 * P1 只加载代理网格；exportImage 留到 P3。
 */
export class CharacterSculptScene {
  private readonly renderer: WebGLRenderer;
  private readonly scene: Scene;
  private readonly camera: PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly actor = createProxyCharacter();
  private state: SculptViewState;
  private destroyed = false;
  private readonly onChange = () => this.render();

  constructor(
    mount: HTMLDivElement,
    initial: SculptViewState,
    private readonly options: CharacterSculptSceneOptions = {},
  ) {
    this.state = {
      ...initial,
      faceRig: getFaceRig(initial.faceRig),
      modelSource: initial.modelSource ?? 'proxy',
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

    this.scene.add(new HemisphereLight(0xf2f5ff, 0x3d342c, 0.72));
    const key = new DirectionalLight(0xfff6ea, 1.15);
    key.position.set(1.4, 2.2, 1.8);
    const fill = new DirectionalLight(0xd7e4ff, 0.45);
    fill.position.set(-1.6, 1.2, 0.8);
    const rim = new DirectionalLight(0xffffff, 0.35);
    rim.position.set(-0.4, 1.8, -1.8);
    this.scene.add(key, fill, rim);

    this.scene.add(this.actor);
    this.applyRig();
    const report = assertSculptMeshContract(this.actor, 'proxy');
    this.options.onCompatibility?.(report);
    this.render();
  }

  setState(next: SculptViewState): void {
    if (this.destroyed) return;
    this.state = {
      ...this.state,
      ...next,
      faceRig: getFaceRig(next.faceRig),
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

  resetCamera(): void {
    if (this.destroyed) return;
    this.camera.position.set(0, 1.25, 2.55);
    this.controls.target.set(0, 1.15, 0);
    this.controls.update();
    this.render();
  }

  getCompatibilityReport(): SculptCompatibilityReport {
    return assertSculptMeshContract(this.actor, this.state.modelSource ?? 'proxy');
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.controls.removeEventListener('change', this.onChange);
    this.controls.dispose();
    this.scene.remove(this.actor);
    this.actor.traverse((obj) => {
      const mesh = obj as { geometry?: { dispose: () => void }; material?: { dispose: () => void } | Array<{ dispose: () => void }> };
      mesh.geometry?.dispose();
      if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
      else mesh.material?.dispose();
    });
    const canvas = this.renderer.domElement;
    canvas.parentElement?.removeChild(canvas);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
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
