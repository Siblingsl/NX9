"""Probe shoulder peaks + ankle lateral spikes on current mpfb-preview.blend.
Coords reported in GLTF frame (x right, y up, z forward)."""
import bpy
import math
from mathutils import Vector


def to_gltf(co):
    return Vector((co.x, co.z, -co.y))


obj = bpy.data.objects.get("身体皮肤") or bpy.data.objects.get("全身皮肤")
assert obj, "missing skin"
pts = [to_gltf(v.co) for v in obj.data.vertices]

print("=== SHOULDER TOP SILHOUETTE (max y per |x| band, outer envelope) ===")
# For each x bin on the right shoulder, find max Y (peak of silhouette)
for xb in range(8, 32, 1):
    x0, x1 = xb / 100.0, (xb + 1) / 100.0
    band = [p for p in pts if x0 <= p.x <= x1 and 1.28 <= p.y <= 1.50 and -0.08 <= p.z <= 0.18]
    if not band:
        continue
    top = max(band, key=lambda p: p.y)
    print(f"  x={xb:02d}-{xb+1:02d}: maxY={top.y*100:.2f}cm  at ({top.x*100:.1f},{top.y*100:.1f},{top.z*100:.1f})")

print("\n=== TOP-20 HIGHEST verts in shoulder cap zone ===")
cap = [p for p in pts if 0.12 <= abs(p.x) <= 0.30 and 1.32 <= p.y <= 1.48 and -0.08 <= p.z <= 0.18]
cap.sort(key=lambda p: -p.y)
for p in cap[:20]:
    print(f"  ({p.x*100:+.1f},{p.y*100:.1f},{p.z*100:+.1f})")

print("\n=== ANKLE / FOOT outer extrema by y band ===")
for yc in range(2, 16, 1):
    y0, y1 = yc / 100.0, (yc + 1) / 100.0
    band = [p for p in pts if y0 <= p.y <= y1 and abs(p.x) < 0.35]
    if not band:
        continue
    # right-side outer
    right = [p for p in band if p.x > 0]
    left = [p for p in band if p.x < 0]
    if not right:
        continue
    rx = max(right, key=lambda p: p.x)
    # also find local spike: verts with |x| in top 5%
    xs = sorted(p.x for p in right)
    p95 = xs[int(len(xs) * 0.95)] if len(xs) >= 8 else xs[-1]
    spikes = [p for p in right if p.x >= p95]
    print(f"  y={yc:02d}-{yc+1:02d}: nR={len(right)} maxX={rx.x*100:.1f}cm "
          f"at z={rx.z*100:+.1f} p95={p95*100:.1f} spikeN={len(spikes)}")

print("\n=== TOP-15 right ankle outer verts (y 0.04-0.14) ===")
ank = [p for p in pts if 0.04 <= p.y <= 0.14 and p.x > 0.05]
ank.sort(key=lambda p: -p.x)
for p in ank[:15]:
    print(f"  ({p.x*100:+.1f},{p.y*100:.1f},{p.z*100:+.1f})")

print("\n=== ANKLE half-width (center vs outer) right ===")
for yc in (5, 7, 9, 11, 13):
    y = yc / 100.0
    band = [p for p in pts if abs(p.y - y) < 0.015 and 0.02 < p.x < 0.28]
    if len(band) < 4:
        continue
    xs = [p.x for p in band]
    lo, hi = min(xs), max(xs)
    print(f"  y={yc}: center={(lo+hi)/2*100:.1f} half={(hi-lo)/2*100:.1f} outer={hi*100:.1f} "
          f"zspan={(max(p.z for p in band)-min(p.z for p in band))*100:.1f}")

print("DONE")
