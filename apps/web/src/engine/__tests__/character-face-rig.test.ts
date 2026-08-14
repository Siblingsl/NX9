import { describe, expect, it } from 'vitest';
import type { CharacterProfile } from '@nx9/shared';
import {
  FACE_RIG_PARAMS,
  applyFaceRigPreset,
  buildCharacterBiblePrompt,
  buildCharacterFaceRigPrompt,
  buildFaceRigPrompt,
  countFaceRigDeviations,
  describeFaceRig,
  emptyFaceRig,
  faceRigHash,
  faceRigSkipBodyIds,
  faceRigSideValue,
  faceRigValue,
  getFaceRig,
  isFaceRigNeutral,
  resetFaceRigGroup,
  setFaceRigSideValue,
  setFaceRigValue,
} from '@nx9/shared';

function charWith(rig: unknown): CharacterProfile {
  return {
    id: 'c1',
    name: '林默',
    creative: { faceRig: rig as never },
  } as CharacterProfile;
}

describe('捏脸参数 · 归一化', () => {
  it('缺省返回空 rig，且判定为中性', () => {
    const rig = getFaceRig(undefined);
    expect(rig.version).toBe(1);
    expect(isFaceRigNeutral(rig)).toBe(true);
    expect(countFaceRigDeviations(rig)).toBe(0);
  });

  it('夹取值域、取整、丢弃 0 与非法值', () => {
    const rig = getFaceRig({
      version: 1,
      values: {
        shape: { jawWidth: -999, faceLength: 12.6, chinLength: 0, templeWidth: Number.NaN },
      },
    });
    expect(rig.values?.shape?.jawWidth).toBe(-100);
    expect(rig.values?.shape?.faceLength).toBe(13);
    expect(rig.values?.shape?.chinLength).toBeUndefined();
    expect(rig.values?.shape?.templeWidth).toBeUndefined();
  });

  it('丢弃未知参数与错组参数', () => {
    const rig = getFaceRig({
      version: 1,
      values: {
        shape: { notAParam: 80, eyeSize: 80 },
        eyes: { eyeSize: 60 },
      },
    } as never);
    expect(rig.values?.shape).toBeUndefined();
    expect(rig.values?.eyes?.eyeSize).toBe(60);
  });

  it('从 CharacterProfile 与从裸 rig 读取等价', () => {
    const rig = setFaceRigValue(emptyFaceRig(), 'jawWidth', -55);
    expect(faceRigValue(getFaceRig(charWith(rig)), 'jawWidth')).toBe(-55);
  });
});

describe('捏脸参数 · 写入', () => {
  it('写 0 等于删除，指纹回到中性', () => {
    const rig = setFaceRigValue(emptyFaceRig(), 'jawWidth', -55);
    expect(faceRigHash(rig)).not.toBe('0');
    const cleared = setFaceRigValue(rig, 'jawWidth', 0);
    expect(cleared.values?.shape).toBeUndefined();
    expect(faceRigHash(cleared)).toBe('0');
  });

  it('重置分组只清本组', () => {
    let rig = setFaceRigValue(emptyFaceRig(), 'jawWidth', -55);
    rig = setFaceRigValue(rig, 'eyeSize', 60);
    rig = resetFaceRigGroup(rig, 'shape');
    expect(faceRigValue(rig, 'jawWidth')).toBe(0);
    expect(faceRigValue(rig, 'eyeSize')).toBe(60);
  });

  it('应用预设只覆盖预设写到的项', () => {
    const base = setFaceRigValue(emptyFaceRig(), 'eyeSize', 60);
    const next = applyFaceRigPreset(base, 'square');
    expect(next.presetId).toBe('square');
    expect(faceRigValue(next, 'jawWidth')).toBe(60);
    expect(faceRigValue(next, 'eyeSize')).toBe(60);
  });

  it('未知预设不改动参数', () => {
    const base = setFaceRigValue(emptyFaceRig(), 'eyeSize', 60);
    const next = applyFaceRigPreset(base, 'not-exist');
    expect(next.presetId).toBeUndefined();
    expect(faceRigValue(next, 'eyeSize')).toBe(60);
  });
});

describe('捏脸参数 · 左右不对称扩展值', () => {
  it('写单侧值登记 asymmetric，未写一侧回退基础值', () => {
    let rig = setFaceRigValue(emptyFaceRig(), 'jawWidth', 40);
    rig = setFaceRigSideValue(rig, 'jawWidth', 'L', 80);
    expect(rig.asymmetric).toContain('jawWidth');
    expect(faceRigSideValue(rig, 'jawWidth', 'L')).toBe(80);
    expect(faceRigSideValue(rig, 'jawWidth', 'R')).toBe(40);
  });

  it('写基础值清除该 id 的 sideValues', () => {
    let rig = setFaceRigSideValue(emptyFaceRig(), 'jawWidth', 'L', 80);
    rig = setFaceRigValue(rig, 'jawWidth', 0);
    expect(rig.sideValues).toBeUndefined();
  });

  it('写 0 清单侧，两侧都清则删除 sideValues', () => {
    let rig = setFaceRigSideValue(emptyFaceRig(), 'jawWidth', 'L', 80);
    rig = setFaceRigSideValue(rig, 'jawWidth', 'L', 0);
    expect(rig.sideValues).toBeUndefined();
  });

  it('重置分组同时清该组 sideValues', () => {
    let rig = setFaceRigSideValue(emptyFaceRig(), 'jawWidth', 'L', 80);
    rig = setFaceRigValue(rig, 'eyeSize', 60);
    rig = resetFaceRigGroup(rig, 'shape');
    expect(rig.sideValues).toBeUndefined();
    expect(faceRigValue(rig, 'eyeSize')).toBe(60);
  });

  it('指纹纳入 sideValues', () => {
    const a = setFaceRigSideValue(emptyFaceRig(), 'jawWidth', 'L', 80);
    const b = setFaceRigSideValue(emptyFaceRig(), 'jawWidth', 'L', 81);
    expect(faceRigHash(a)).not.toBe(faceRigHash(b));
    const sym = setFaceRigValue(emptyFaceRig(), 'jawWidth', 80);
    expect(faceRigHash(a)).not.toBe(faceRigHash(sym));
  });
});

describe('捏脸参数 · 编译', () => {
  it('全中性不产出任何文本', () => {
    expect(buildFaceRigPrompt(emptyFaceRig())).toBe('');
    expect(buildCharacterFaceRigPrompt(charWith(emptyFaceRig()))).toBe('');
  });

  it('死区内的轻微偏离不写进 Prompt', () => {
    const rig = setFaceRigValue(emptyFaceRig(), 'jawWidth', 19);
    expect(buildFaceRigPrompt(rig)).toBe('');
    expect(countFaceRigDeviations(rig)).toBe(0);
  });

  it('只写偏离项，且按正负取对应语义词', () => {
    let rig = setFaceRigValue(emptyFaceRig(), 'jawWidth', -55);
    rig = setFaceRigValue(rig, 'eyeSize', 80);
    const text = buildFaceRigPrompt(rig);
    expect(text).toContain('下颌收窄（明显）');
    expect(text).toContain('眼睛大而圆（强烈）');
    expect(text).not.toContain('下颌方阔');
    expect(text).not.toContain('鼻梁');
  });

  it('强度分档覆盖四段', () => {
    const word = (v: number) => buildFaceRigPrompt(setFaceRigValue(emptyFaceRig(), 'jawWidth', v));
    expect(word(25)).toContain('（轻微）');
    expect(word(50)).toContain('（明显）');
    expect(word(75)).toContain('（强烈）');
    expect(word(95)).toContain('（极致）');
  });

  it('按分组归句，脸型与体型分属不同句子', () => {
    let rig = setFaceRigValue(emptyFaceRig(), 'jawWidth', -55);
    rig = setFaceRigValue(rig, 'muscleMass', 60);
    const text = buildFaceRigPrompt(rig);
    expect(text).toContain('脸型：');
    expect(text).toContain('体型：');
  });

  it('groups 白名单可只编译面部，体型不外泄', () => {
    let rig = setFaceRigValue(emptyFaceRig(), 'jawWidth', -55);
    rig = setFaceRigValue(rig, 'muscleMass', 60);
    const faceOnly = buildFaceRigPrompt(rig, { groups: ['shape', 'eyes'] });
    expect(faceOnly).toContain('脸型：');
    expect(faceOnly).not.toContain('体型：');
  });

  it('条目过多时降级为只写强偏离项', () => {
    let rig = emptyFaceRig();
    for (const p of FACE_RIG_PARAMS) rig = setFaceRigValue(rig, p.id, 25);
    rig = setFaceRigValue(rig, 'jawWidth', 80);
    const text = buildFaceRigPrompt(rig);
    expect(text).toContain('下颌方阔（强烈）');
    expect(text).not.toContain('（轻微）');
  });

  it('可省略抬头与一致性句', () => {
    const rig = setFaceRigValue(emptyFaceRig(), 'jawWidth', -55);
    const bare = buildFaceRigPrompt(rig, { omitPriorityNote: true, omitConsistencyNote: true });
    expect(bare).not.toContain('最高优先级');
    expect(bare).not.toContain('一致性：');
    expect(bare).toContain('下颌收窄（明显）');
  });

  it('不对称解锁项写进说明', () => {
    const rig = { ...setFaceRigValue(emptyFaceRig(), 'eyeTilt', 60), asymmetric: ['eyeTilt'] };
    expect(buildFaceRigPrompt(rig)).toContain('允许左右轻微不对称：眼角倾斜');
  });
});

describe('捏脸参数 · 与 bodyMetrics 去重', () => {
  it('实测值命中的维度被跳过，其余照写', () => {
    const skip = faceRigSkipBodyIds({ shoulderWidth: '42cm', legLength: '' });
    expect(skip).toContain('shoulderWidth');
    expect(skip).not.toContain('legRatio');

    let rig = setFaceRigValue(emptyFaceRig(), 'shoulderWidth', 70);
    rig = setFaceRigValue(rig, 'muscleMass', 60);
    const text = buildFaceRigPrompt(rig, { groups: ['body'], skipIds: skip });
    expect(text).not.toContain('宽肩平直');
    expect(text).toContain('肌肉线条明显');
  });

  it('无实测值时不跳过任何维度', () => {
    expect(faceRigSkipBodyIds(undefined)).toEqual([]);
  });
});

describe('捏脸参数 · 注入角色 Prompt', () => {
  it('中性角色的 Bible Prompt 不出现面部结构段', () => {
    const text = buildCharacterBiblePrompt(charWith(emptyFaceRig()));
    expect(text).not.toContain('面部结构');
  });

  it('有偏离时 Bible Prompt 出现面部结构段', () => {
    const rig = setFaceRigValue(emptyFaceRig(), 'noseBridgeHeight', 70);
    const text = buildCharacterBiblePrompt(charWith(rig));
    expect(text).toContain('## 面部结构（参数锁）');
    expect(text).toContain('鼻梁高挺');
  });

  it('体型参数落在身体数据段，不混进面部结构段', () => {
    const rig = setFaceRigValue(emptyFaceRig(), 'muscleMass', 60);
    expect(buildCharacterFaceRigPrompt(charWith(rig))).toBe('');
    expect(buildCharacterBiblePrompt(charWith(rig))).toContain('## 身体数据');
  });
});

describe('捏脸参数 · 指纹', () => {
  it('与写入顺序无关', () => {
    let a = setFaceRigValue(emptyFaceRig(), 'jawWidth', -55);
    a = setFaceRigValue(a, 'eyeSize', 60);
    let b = setFaceRigValue(emptyFaceRig(), 'eyeSize', 60);
    b = setFaceRigValue(b, 'jawWidth', -55);
    expect(faceRigHash(a)).toBe(faceRigHash(b));
  });

  it('取值变化即指纹变化', () => {
    const a = setFaceRigValue(emptyFaceRig(), 'jawWidth', -55);
    const b = setFaceRigValue(emptyFaceRig(), 'jawWidth', -54);
    expect(faceRigHash(a)).not.toBe(faceRigHash(b));
  });

  it('不受 updatedAt / presetId 影响', () => {
    const a = setFaceRigValue(emptyFaceRig(), 'jawWidth', -55);
    const b = { ...a, updatedAt: 1, presetId: 'square' };
    expect(faceRigHash(a)).toBe(faceRigHash(b));
  });
});

describe('捏脸参数 · 可读摘要', () => {
  it('逐项给出取值与语义词', () => {
    const rig = setFaceRigValue(emptyFaceRig(), 'jawWidth', -55);
    expect(describeFaceRig(rig)).toEqual(['下颌宽 -55 · 下颌收窄（明显）']);
  });
});

describe('捏脸参数 · 字典自检', () => {
  it('45 项、id 唯一、分组合法', () => {
    expect(FACE_RIG_PARAMS.length).toBe(45);
    expect(new Set(FACE_RIG_PARAMS.map((p) => p.id)).size).toBe(45);
    for (const p of FACE_RIG_PARAMS) {
      expect(p.low.trim()).not.toBe('');
      expect(p.high.trim()).not.toBe('');
    }
  });

  it('P1 视口切片 6 项都在字典里', () => {
    for (const id of [
      'faceLength',
      'jawWidth',
      'eyeSpacing',
      'noseBridgeHeight',
      'shoulderWidth',
      'heightFeel',
    ]) {
      expect(FACE_RIG_PARAMS.some((p) => p.id === id)).toBe(true);
    }
    expect(FACE_RIG_PARAMS.find((p) => p.id === 'heightFeel')?.driver).toBe('bone');
    expect(FACE_RIG_PARAMS.find((p) => p.id === 'shoulderWidth')?.driver).toBe('bone');
  });
});
