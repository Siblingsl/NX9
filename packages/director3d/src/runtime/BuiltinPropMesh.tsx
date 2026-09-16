import { DoubleSide } from 'three';
import type { BuiltinAssetDef, BuiltinAssetPart } from '../presets/builtinAssets';
import { lookupBuiltinAsset, resolvePartArgs } from '../presets/builtinAssets';

/** 单个几何部件。参数换算与内置资产规格共用 resolvePartArgs，避免两处尺寸口径漂移。 */
function BuiltinPart({ part }: { part: BuiltinAssetPart }) {
  const args = resolvePartArgs(part);
  const rotation = part.rotation
    ? (part.rotation.map((deg) => (deg * Math.PI) / 180) as [number, number, number])
    : undefined;
  const material = (
    <meshStandardMaterial
      color={part.color}
      side={part.geometry === 'plane' ? DoubleSide : undefined}
    />
  );
  return (
    <mesh castShadow receiveShadow position={part.position} rotation={rotation}>
      {part.geometry === 'sphere' ? (
        <sphereGeometry args={args as [number, number, number]} />
      ) : part.geometry === 'cylinder' ? (
        <cylinderGeometry args={args as [number, number, number, number]} />
      ) : part.geometry === 'cone' ? (
        <coneGeometry args={args as [number, number]} />
      ) : part.geometry === 'plane' ? (
        <planeGeometry args={args as [number, number]} />
      ) : (
        <boxGeometry args={args as [number, number, number]} />
      )}
      {material}
    </mesh>
  );
}

/** 内置模型本体：数据来自 BuiltinAssetDef，无需任何外部文件。 */
export function BuiltinAssetMesh({ asset }: { asset: BuiltinAssetDef }) {
  return (
    <group>
      {asset.parts.map((part, index) => (
        <BuiltinPart key={`${asset.id}-part-${index}`} part={part} />
      ))}
    </group>
  );
}

/**
 * 按 id 渲染内置模型。id 无法识别时渲染占位说明体块，
 * 避免图层里出现「看不见也选不中」的幽灵对象。
 */
export function BuiltinPropMesh({ assetId }: { assetId: string }) {
  const asset = lookupBuiltinAsset(assetId);
  if (!asset) {
    return (
      <mesh castShadow receiveShadow position={[0, 0.5, 0]}>
        <boxGeometry args={[0.6, 1, 0.6]} />
        <meshStandardMaterial color="#b07a7a" wireframe />
      </mesh>
    );
  }
  return <BuiltinAssetMesh asset={asset} />;
}
