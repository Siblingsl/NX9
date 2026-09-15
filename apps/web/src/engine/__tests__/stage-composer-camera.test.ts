import { describe, expect, it } from 'vitest';
import {
  angleLabel,
  applyOrbitToCamera,
  buildCameraPrompt,
  describeCameraShot,
  focalLengthMm,
  getOrbit,
  interpolateCamera,
  setOrbit,
  shotLabel,
  viewLabel,
  type DirectorCameraShot,
} from '@nx9/director3d';

function cam(partial?: Partial<DirectorCameraShot>): DirectorCameraShot {
  return {
    id: 'c1',
    name: 'Cam',
    fov: 50,
    transform: { position: [0, 1.6, 4], rotation: [0, 0, 0], scale: [1, 1, 1] },
    target: [0, 1, 0],
    captures: [],
    ...partial,
  };
}

describe('Stage Composer camera geometry D3-01~03', () => {
  it('getOrbit / setOrbit round-trips azimuth elevation distance', () => {
    const target = { x: 0, y: 1, z: 0 };
    const pos = setOrbit(45, 12, 3.5, target);
    const o = getOrbit(pos, target);
    expect(o.az).toBeCloseTo(45, 0);
    expect(o.el).toBeCloseTo(12, 0);
    expect(o.dist).toBeCloseTo(3.5, 1);
  });

  it('angleLabel and shotLabel classify eye-level medium', () => {
    expect(angleLabel(0)).toBe('EYE LEVEL');
    expect(angleLabel(20)).toBe('HIGH ANGLE');
    expect(angleLabel(-25)).toBe('LOW ANGLE');
    expect(shotLabel(2.2, 50).includes('SHOT') || shotLabel(2.2, 50).includes('WIDE')).toBe(true);
  });

  it('buildCameraPrompt emits film vocabulary not raw xyz', () => {
    const prompt = buildCameraPrompt(cam(), { move: 'dolly-in', subjectYawDeg: 0 });
    expect(prompt.toLowerCase()).toMatch(/mm/);
    expect(prompt.toLowerCase()).toMatch(/dolly|eye|angle|shot|view/);
    expect(prompt).not.toMatch(/position \(/);
  });

  it('describeCameraShot exposes lens mm', () => {
    const d = describeCameraShot(cam({ fov: 40 }));
    expect(d.lensMm).toBe(focalLengthMm(40));
    expect(d.view).toContain('view');
  });

  it('applyOrbitToCamera updates position via sphere', () => {
    const next = applyOrbitToCamera(cam(), { az: 90, el: 5, dist: 2.5 });
    const o = getOrbit(
      { x: next.transform.position[0], y: next.transform.position[1], z: next.transform.position[2] },
      { x: next.target[0], y: next.target[1], z: next.target[2] },
    );
    expect(o.az).toBeCloseTo(90, 0);
    expect(o.dist).toBeCloseTo(2.5, 1);
  });

  it('interpolateCamera blends A→B', () => {
    const a = cam();
    const b = applyOrbitToCamera(cam(), { az: 120, dist: 5, fov: 35 });
    const mid = interpolateCamera(a, b, 0.5);
    expect(mid.fov).toBeGreaterThan(35);
    expect(mid.fov).toBeLessThan(50);
  });

  it('viewLabel distinguishes front vs profile', () => {
    expect(viewLabel(0, 0)).toContain('front');
    expect(viewLabel(90, 0)).toContain('profile');
  });
});

describe('prompt skin wiring', () => {
  it('skins runway / luma / hailuo differently', async () => {
    const { skinCameraPrompt } = await import('@nx9/director3d');
    const base = 'medium shot, eye-level shot, front view, ~24mm full-frame lens, camera movement: slow dolly in';
    expect(skinCameraPrompt(base, 'runway', 'dolly-in')).toMatch(/^slowly dollies in/);
    expect(skinCameraPrompt(base, 'luma', 'dolly-in')).toContain('camera push in');
    expect(skinCameraPrompt(base, 'hailuo', 'dolly-in')).toContain('[Push in]');
  });
});

describe('prompt detail toggles + timeline sample', () => {
  it('omits lens and dof when toggled off', async () => {
    const { describeCameraShot } = await import('@nx9/director3d');
    const full = describeCameraShot(cam(), { move: 'static' });
    expect(full.prompt).toMatch(/mm/);
    const slim = describeCameraShot(cam(), {
      move: 'static',
      details: {
        shotSize: true,
        angle: true,
        view: false,
        lens: false,
        dof: false,
        dutch: false,
        movement: false,
        framing: false,
        subjectFacing: false,
        atmosphere: false,
      },
    });
    expect(slim.prompt).not.toMatch(/mm/);
    expect(slim.prompt).not.toMatch(/camera movement/);
    expect(slim.parts.length).toBe(2);
  });

  it('includes dof phrase when enabled', async () => {
    const { describeCameraShot } = await import('@nx9/director3d');
    const d = describeCameraShot(cam({ fov: 30 }), {
      details: {
        shotSize: false,
        angle: false,
        view: false,
        lens: false,
        dof: true,
        dutch: false,
        movement: false,
        framing: false,
        subjectFacing: false,
        atmosphere: false,
      },
    });
    expect(d.prompt.toLowerCase()).toMatch(/depth|bokeh|focus/);
  });

  it('samples multi-key timeline via interpolate', async () => {
    const { buildTimelineKeys, sampleTimeline, applyOrbitToCamera } = await import('@nx9/director3d');
    const a = cam({ id: 'a' });
    const b = applyOrbitToCamera(cam({ id: 'b' }), { az: 90, dist: 5, fov: 35 });
    const keys = buildTimelineKeys([a, b], 'a');
    expect(keys).toHaveLength(2);
    const mid = sampleTimeline(keys, 0.5);
    expect(mid).toBeTruthy();
    expect(mid!.fov).toBeGreaterThan(35);
    expect(mid!.fov).toBeLessThan(50);
  });
});

describe('quad + mobile shell contracts', () => {
  it('lists four quad panes', async () => {
    const { listQuadPanes } = await import('@nx9/director3d');
    expect(listQuadPanes().map((p) => p.id)).toEqual(['camera', 'top', 'left', 'right']);
  });

  it('DirectorCanvas pauses via frameloop never and keeps persist marker', async () => {
    const { readFileSync } = await import('fs');
    const { resolve } = await import('path');
    const src = readFileSync(
      resolve(__dirname, '../../../../../packages/director3d/src/canvas/DirectorCanvas.tsx'),
      'utf-8',
    );
    expect(src).toContain("frameloop = renderPaused ? 'never' : 'always'");
    expect(src).toContain('data-persist-gl');
    expect(src).toContain('activeQuadPane');
    expect(src).toContain('onPointerDownCapture');
  });

  it('stage CSS includes mobile dock breakpoint', async () => {
    const { readFileSync } = await import('fs');
    const { resolve } = await import('path');
    const css = readFileSync(
      resolve(__dirname, '../../../../../packages/director3d/src/styles/stage-deck.css'),
      'utf-8',
    );
    expect(css).toContain('nx9-stage-mobile-dock');
    expect(css).toContain('@media (max-width: 900px)');
    expect(css).toContain('nx9-stage-view-track.is-active');
    expect(css).toContain('nx9-stage-joint-block');
  });
});

describe('pose joint fine-tune D3-16', () => {
  it('mergePose layers offsets on preset', async () => {
    const { mergePose, lookupPose, setJointAxis } = await import('@nx9/director3d');
    const base = lookupPose('stand');
    const merged = mergePose('stand', { armR: [20, 0, 0], head: [0, 15, 0] });
    expect(merged.armR[0]).toBe(base.armR[0] + 20);
    expect(merged.head[1]).toBe(base.head[1] + 15);
    expect(merged.armL).toEqual(base.armL);
    const cleared = setJointAxis({ armR: [20, 0, 0] }, 'armR', 0, 0);
    expect(cleared.armR).toBeUndefined();
  });

  it('FlyRig listens for right-button look', async () => {
    const { readFileSync } = await import('fs');
    const { resolve } = await import('path');
    const src = readFileSync(
      resolve(__dirname, '../../../../../packages/director3d/src/canvas/DirectorCanvas.tsx'),
      'utf-8',
    );
    expect(src).toContain('e.button !== 2');
    expect(src).toContain('右键环顾');
  });
});
