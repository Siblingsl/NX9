import bpy
from mathutils import Vector
skin = bpy.data.objects.get("全身皮肤")
eye_l = bpy.data.objects.get("左眼")
iris_l = bpy.data.objects.get("左虹膜")
ec = sum((v.co for v in eye_l.data.vertices), Vector())/len(eye_l.data.vertices)
ic = sum((v.co for v in iris_l.data.vertices), Vector())/len(iris_l.data.vertices)
# lid opening in blender: z~1.62, x~0.03, most -Y verts
cands = [v.co for v in skin.data.vertices if 1.58<=v.co.z<=1.65 and 0.02<=v.co.x<=0.05]
cands.sort(key=lambda p: p.y)
rim = cands[:len(cands)//3]
rc = sum(rim, Vector())/len(rim)
print("eye center", tuple(round(x,4) for x in ec))
print("iris center", tuple(round(x,4) for x in ic))
print("rim center", tuple(round(x,4) for x in rc), "rim_ymin", round(min(p.y for p in rim),4))
print("eye hide", eye_l.hide_get(), eye_l.hide_render, "mat", [m.name for m in eye_l.data.materials])
print("iris hide", iris_l.hide_get(), iris_l.hide_render)
# eye front = min y of eye verts
print("eye y range", round(min(v.co.y for v in eye_l.data.vertices),4), round(max(v.co.y for v in eye_l.data.vertices),4))
print("delta eye_front - rim_front", round(min(v.co.y for v in eye_l.data.vertices) - min(p.y for p in rim),4))
