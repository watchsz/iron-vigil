# Outils de modélisation partagés, chargés dans Blender (MCP) avec :
#   exec(open("<repo>/tools/blender/lib.py").read())
import bpy, bmesh, math, random
from mathutils import Vector

# ---------- scène ----------
def reset_scene(save_path):
    for o in list(bpy.data.objects): bpy.data.objects.remove(o)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.armatures, bpy.data.actions):
        for d in list(coll):
            d.use_fake_user = False
            coll.remove(d)
    bpy.ops.wm.save_as_mainfile(filepath=save_path)

# ---------- primitives (toutes ajoutées à PARTS) ----------
PARTS = []
def mat(name):
    return bpy.data.materials.get(name) or bpy.data.materials.new(name)
def add(op, m, **kw):
    op(**kw); o = bpy.context.active_object
    o.data.materials.clear(); o.data.materials.append(m); PARTS.append(o); return o
def box(size, loc, m, rot=(0, 0, 0)):
    o = add(bpy.ops.mesh.primitive_cube_add, m, size=1, location=loc, rotation=rot); o.scale = size; return o
def cone(r1, r2, d, loc, m, rot=(0, 0, 0), v=4):
    return add(bpy.ops.mesh.primitive_cone_add, m, vertices=v, radius1=r1, radius2=r2, depth=d, location=loc, rotation=rot)
def bar(p, q, w, m):
    p, q = Vector(p), Vector(q); d = q - p
    o = box((w, w, d.length), (p + q) / 2, m)
    o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    return o
def spike(a, b, r, m, v=4):
    a, b = Vector(a), Vector(b); d = b - a
    o = cone(r, 0, d.length, (a + b) / 2, m, v=v)
    o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    return o
def rock(loc, size, m, seed, subdiv=1):
    """Rocher anguleux : icosphère écrasée et bosselée."""
    rnd = random.Random(seed)
    o = add(bpy.ops.mesh.primitive_ico_sphere_add, m, subdivisions=subdiv, radius=1, location=loc)
    for v in o.data.vertices:
        v.co *= rnd.uniform(0.75, 1.15)
    o.scale = size; o.rotation_euler = (rnd.uniform(-0.2, 0.2), rnd.uniform(-0.2, 0.2), rnd.uniform(0, 6.28))
    return o

def join(name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in PARTS: o.select_set(True)
    bpy.context.view_layer.objects.active = PARTS[0]
    bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = o.data.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    PARTS.clear()
    return o

def jitter(o, material_name, amount, seed=1, axes=(1, 1, 0)):
    rnd = random.Random(seed)
    idx = [i for i, m in enumerate(o.data.materials) if m.name == material_name]
    bm = bmesh.new(); bm.from_mesh(o.data); done = set()
    for f in bm.faces:
        if f.material_index not in idx: continue
        for v in f.verts:
            if v in done: continue
            done.add(v)
            v.co += Vector([rnd.uniform(-amount, amount) * a for a in axes])
    bm.to_mesh(o.data); bm.free()

def settle(o):
    """Origine au sol : z min = 0."""
    z = min(v.co.z for v in o.data.vertices)
    for v in o.data.vertices: v.co.z -= z

def tris(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)

# ---------- matériaux procéduraux (cuits ensuite dans un atlas) ----------
def _tree(m):
    m.use_nodes = True; nt = m.node_tree; nt.nodes.clear(); return nt.nodes, nt.links
def _ramp(N, stops):
    r = N.new("ShaderNodeValToRGB"); el = r.color_ramp.elements
    while len(el) < len(stops): el.new(0.5)
    for e, (p, c) in zip(el, stops): e.position = p; e.color = (*c, 1)
    return r
def _coords(N, L, s):
    tc = N.new("ShaderNodeTexCoord"); mp = N.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = s
    L.new(tc.outputs["Object"], mp.inputs["Vector"]); return mp.outputs[0]
def _noise(N, L, v, s, d=6):
    n = N.new("ShaderNodeTexNoise"); n.inputs["Scale"].default_value = s; n.inputs["Detail"].default_value = d
    L.new(v, n.inputs["Vector"]); return n.outputs["Fac"]
def _mul(N, L, a, b):
    m = N.new("ShaderNodeMix"); m.data_type = 'RGBA'; m.blend_type = 'MULTIPLY'; m.inputs[0].default_value = 1
    ins = [i for i in m.inputs if i.type == 'RGBA']; L.new(a, ins[0]); L.new(b, ins[1])
    return next(x for x in m.outputs if x.type == 'RGBA')
def _finish(N, L, c, dist):
    ao = N.new("ShaderNodeAmbientOcclusion"); ao.inputs["Distance"].default_value = dist; L.new(c, ao.inputs["Color"])
    b = N.new("ShaderNodeBsdfPrincipled"); out = N.new("ShaderNodeOutputMaterial")
    L.new(ao.outputs["Color"], b.inputs["Base Color"]); L.new(b.outputs[0], out.inputs[0])

def mat_stone(name="stone_black", block=(2.2, 2.2, 3.2)):
    """Blocs irréguliers (voronoi 3D), joints noirs, salissures."""
    m = mat(name); N, L = _tree(m); v = _coords(N, L, block)
    vor = N.new("ShaderNodeTexVoronoi"); vor.feature = 'DISTANCE_TO_EDGE'; L.new(v, vor.inputs["Vector"])
    j = _ramp(N, [(0.0, (0.003, 0.003, 0.004)), (0.09, (0.045, 0.043, 0.05))]); L.new(vor.outputs["Distance"], j.inputs[0])
    var = _ramp(N, [(0.3, (0.3, 0.28, 0.28)), (0.7, (0.85, 0.8, 0.78))]); L.new(_noise(N, L, v, 3), var.inputs[0])
    dirt = _ramp(N, [(0.45, (1, 1, 1)), (0.65, (0.5, 0.35, 0.3))]); L.new(_noise(N, L, v, 1.2, 3), dirt.inputs[0])
    _finish(N, L, _mul(N, L, _mul(N, L, j.outputs[0], var.outputs[0]), dirt.outputs[0]), 0.3); return m
def mat_rock(name="rock"):
    """Roche brute : pas de joints, strates et taches."""
    m = mat(name); N, L = _tree(m); v = _coords(N, L, (1, 1, 1))
    base = _ramp(N, [(0.35, (0.02, 0.019, 0.02)), (0.65, (0.07, 0.065, 0.065))]); L.new(_noise(N, L, v, 4, 10), base.inputs[0])
    w = N.new("ShaderNodeTexWave"); w.bands_direction = 'Z'; w.inputs["Scale"].default_value = 3; w.inputs["Distortion"].default_value = 6
    L.new(v, w.inputs["Vector"])
    st = _ramp(N, [(0.3, (0.7, 0.68, 0.7)), (0.7, (1, 1, 1))]); L.new(w.outputs["Fac"], st.inputs[0])
    _finish(N, L, _mul(N, L, base.outputs[0], st.outputs[0]), 0.4); return m
def mat_ground(name="ground_ash"):
    """Terre brûlée, cendres et taches de sang séché."""
    m = mat(name); N, L = _tree(m); v = _coords(N, L, (1, 1, 1))
    base = _ramp(N, [(0.3, (0.025, 0.018, 0.014)), (0.7, (0.075, 0.06, 0.05))]); L.new(_noise(N, L, v, 1.5, 8), base.inputs[0])
    grit = _ramp(N, [(0.4, (0.6, 0.6, 0.6)), (0.6, (1, 1, 1))]); L.new(_noise(N, L, v, 30, 4), grit.inputs[0])
    blood = _ramp(N, [(0.62, (1, 1, 1)), (0.7, (0.55, 0.12, 0.08))]); L.new(_noise(N, L, v, 0.6, 3), blood.inputs[0])
    _finish(N, L, _mul(N, L, _mul(N, L, base.outputs[0], grit.outputs[0]), blood.outputs[0]), 0.5); return m
def mat_wood(name="wood_dark"):
    m = mat(name); N, L = _tree(m); v = _coords(N, L, (3, 3, 3))
    w = N.new("ShaderNodeTexWave"); w.wave_type = 'BANDS'; w.bands_direction = 'Z'
    w.inputs["Scale"].default_value = 3; w.inputs["Distortion"].default_value = 4; L.new(v, w.inputs["Vector"])
    r = _ramp(N, [(0.1, (0.03, 0.015, 0.008)), (0.9, (0.075, 0.04, 0.02))]); L.new(w.outputs["Fac"], r.inputs[0])
    _finish(N, L, r.outputs[0], 0.25); return m
def mat_iron(name="iron_rust"):
    m = mat(name); N, L = _tree(m); v = _coords(N, L, (1, 1, 1))
    r = _ramp(N, [(0.45, (0.02, 0.018, 0.018)), (0.62, (0.07, 0.025, 0.01)), (0.8, (0.14, 0.045, 0.015))])
    L.new(_noise(N, L, v, 18, 8), r.inputs[0]); _finish(N, L, r.outputs[0], 0.15); return m
def mat_bone(name="bone"):
    m = mat(name); N, L = _tree(m); v = _coords(N, L, (1, 1, 1))
    r = _ramp(N, [(0.3, (0.2, 0.15, 0.08)), (0.7, (0.5, 0.42, 0.28))]); L.new(_noise(N, L, v, 40, 4), r.inputs[0])
    _finish(N, L, r.outputs[0], 0.05); return m
def mat_cloth(name="cloth_blood"):
    m = mat(name); N, L = _tree(m); v = _coords(N, L, (1, 1, 1))
    r = _ramp(N, [(0.35, (0.03, 0.002, 0.002)), (0.6, (0.17, 0.01, 0.008))]); L.new(_noise(N, L, v, 12, 8), r.inputs[0])
    _finish(N, L, r.outputs[0], 0.1); return m
def mat_ember(name="ember", strength=3.0):
    """Émissif : reste un matériau séparé (non cuit) pour garder l'émission."""
    m = mat(name); N, L = _tree(m)
    b = N.new("ShaderNodeBsdfPrincipled"); out = N.new("ShaderNodeOutputMaterial")
    b.inputs["Base Color"].default_value = (0.9, 0.15, 0.02, 1)
    b.inputs["Emission Color"].default_value = (1.0, 0.18, 0.02, 1); b.inputs["Emission Strength"].default_value = strength
    L.new(b.outputs[0], out.inputs[0]); return m

# ---------- cuisson ----------
def bake(o, size=256, keep=("ember",), rig=None):
    """UV auto + cuisson de la couleur diffuse (avec AO) dans un atlas ; remplace les matériaux sauf `keep`."""
    sc = bpy.context.scene
    if rig: rig.data.pose_position = 'REST'
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.004); bpy.ops.uv.pack_islands(margin=0.004)
    bpy.ops.object.mode_set(mode='OBJECT')
    img = bpy.data.images.new(o.name + "_atlas", size, size)
    for s in o.material_slots:
        if s.material.name in keep: continue
        nt = s.material.node_tree; t = nt.nodes.new("ShaderNodeTexImage"); t.image = img; nt.nodes.active = t
    sc.render.engine = 'CYCLES'; sc.cycles.samples = 32; sc.cycles.device = 'CPU'
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'}, margin=2)
    img.pack()
    baked = bpy.data.materials.new(o.name); baked.use_nodes = True
    nt = baked.node_tree; nt.nodes.clear()
    t = nt.nodes.new("ShaderNodeTexImage"); t.image = img; t.interpolation = 'Closest'
    b = nt.nodes.new("ShaderNodeBsdfPrincipled"); b.inputs["Roughness"].default_value = 0.9
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(t.outputs["Color"], b.inputs["Base Color"]); nt.links.new(b.outputs[0], out.inputs[0])
    for s in o.material_slots:
        s.material.use_fake_user = True  # garde les procéduraux pour re-cuire
        if s.material.name not in keep: s.material = baked
    if rig: rig.data.pose_position = 'POSE'
    return img
