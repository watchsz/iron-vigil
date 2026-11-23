# Export headless d'un .blend en .glb, avec vérifications (budgets, échelle, sol, actions).
# blender -b assets-src/x.blend --python-exit-code 1 --python tools/blender/export.py -- public/assets
import bpy, os, sys

BUDGET = {"tower": 1200, "enemy": 900, "boss": 1500, "decor": 1500}  # triangles max par objet racine
ACTIONS = {"idle", "walk", "attack", "die"}

out_dir = sys.argv[sys.argv.index("--") + 1]
name = os.path.splitext(os.path.basename(bpy.data.filepath))[0]
deps = bpy.context.evaluated_depsgraph_get()
errors = []

roots = [o for o in bpy.context.scene.objects if o.parent is None and o.type in {"MESH", "ARMATURE"}]
if not roots:
    errors.append("aucun objet à exporter")
for o in roots:
    kind = o.name.split("_")[0]
    if kind not in BUDGET:
        errors.append(f"{o.name}: préfixe inconnu (attendu {', '.join(BUDGET)}_…)")
        continue
    meshes = [o] + [c for c in o.children_recursive if c.type == "MESH"]
    tris = 0
    for m in meshes:
        if m.type != "MESH":
            continue
        me = m.evaluated_get(deps).to_mesh()
        me.calc_loop_triangles()
        tris += len(me.loop_triangles)
        m.evaluated_get(deps).to_mesh_clear()
    if tris > BUDGET[kind]:
        errors.append(f"{o.name}: {tris} triangles > budget {BUDGET[kind]}")
    if any(abs(s - 1) > 1e-4 for s in o.scale):
        errors.append(f"{o.name}: échelle non appliquée {tuple(o.scale)}")
    zmin = min((m.matrix_world @ v.co).z for m in meshes if m.type == "MESH" for v in m.data.vertices)
    on_ground = o.name.endswith("_ground") or abs(zmin) <= 0.01  # le sol lui-même plonge sous 0 sur ses bords
    if not on_ground or abs(o.location.z) > 0.01:
        errors.append(f"{o.name}: doit être posé au sol avec l'origine au sol (z min {zmin:.3f}, origine {o.location.z:.3f})")
    print(f"{o.name}: {tris} triangles (budget {BUDGET[kind]})")

bad = [a.name for a in bpy.data.actions if a.name not in ACTIONS]
if bad:
    errors.append(f"actions mal nommées {bad} (attendu {sorted(ACTIONS)})")

if errors:
    raise SystemExit("ÉCHEC " + name + ":\n  " + "\n  ".join(errors))

os.makedirs(out_dir, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=os.path.join(out_dir, name + ".glb"), export_format="GLB", export_apply=True)
print(f"exporté {name}.glb")
