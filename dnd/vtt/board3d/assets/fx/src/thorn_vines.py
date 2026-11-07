# Pippa's psionic thorn vines for the 3D board (Brandon, November 6, 2026: "animated vines, not long tubes that sway.
# Use Blender, give them joints and curls"). Run headless:
#   blender -b -P thorn_vines.py -- <out.glb>
# Four pieces, each a tapered strand with thorns on a chain of joints (bones), each with two animations:
#   <piece>_grow  - it unfurls out of its root, joint by joint, curled, then straightens (2 s, played once)
#   <piece>_idle  - curls ripple along the joints; the tip coils in, pulls back and reaches out again (looped)
#   <piece>_idle2 - slower, other ways round, the tip coiling tighter (looped)
#   <piece>_pulse - the outer half draws back in toward the root and grows out again (once)
# Pieces (Blender: Z up; the export turns it to Y up), every one rooted at the origin in the ground ("the back ends
# need to connect: growing up from the ground and dangling over the top of the box"): climbover (comes out of the
# ground, climbs 2 up, arches over +X and hangs down the far side, curling at its end), creeper (out of the ground,
# along +X, its tip curling up), climber (spirals up +Z, its tip curling out), tendril (a short corkscrew sprouting up),
# dangler (hangs down -Z; kept, not placed). The board scales and places them in clumps, each clump from one root. The board draws them with its own see-through
# green material, so the material here is only a stand-in.
import bpy, bmesh, math, random, sys
from mathutils import Vector, Matrix

OUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else '//thorn-vines.glb'
FPS = 24
random.seed(11)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = FPS
# Keys close together, joined straight: a quarter of the size of smooth curves, and still smooth to the eye.
bpy.context.preferences.edit.keyframe_new_interpolation_type = 'LINEAR'

mat = bpy.data.materials.new('thorn-vine')
mat.use_nodes = True
bsdf = mat.node_tree.nodes.get('Principled BSDF')
if bsdf:
    bsdf.inputs['Base Color'].default_value = (0.18, 0.55, 0.24, 1)
    bsdf.inputs['Roughness'].default_value = 0.4


def fcurves_of(act):
    """An action's curves (layered actions keep them in channel bags)."""
    try:
        return list(act.fcurves)
    except Exception:
        pass
    out = []
    for layer in act.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                out.extend(bag.fcurves)
    return out


def smooth(u):
    u = max(0.0, min(1.0, u))
    return u * u * (3 - 2 * u)


def spline(points, samples=400):
    """A smooth curve through the points (Catmull-Rom), as a function of 0..1 along its length."""
    pts = [Vector(p) for p in points]
    dense = []
    for i in range(len(pts) - 1):
        p0, p1, p2, p3 = pts[max(i - 1, 0)], pts[i], pts[i + 1], pts[min(i + 2, len(pts) - 1)]
        for k in range(samples // (len(pts) - 1)):
            u = k / (samples // (len(pts) - 1))
            dense.append(0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u))
    dense.append(pts[-1])
    lengths = [0.0]
    for i in range(1, len(dense)):
        lengths.append(lengths[-1] + (dense[i] - dense[i - 1]).length)
    total = lengths[-1]
    def at(t):
        d = max(0.0, min(1.0, t)) * total
        lo, hi = 0, len(lengths) - 1
        while hi - lo > 1:
            mid = (lo + hi) // 2
            if lengths[mid] < d: lo = mid
            else: hi = mid
        span = lengths[hi] - lengths[lo] or 1
        return dense[lo].lerp(dense[hi], (d - lengths[lo]) / span)
    return at


# Out of the ground, up a loose wave about 2, over the top toward +X, and down the far side, curling at the end.
climbover = spline([(0, 0, -0.06), (0.03, 0.04, 0.35), (-0.04, -0.02, 0.8), (0.04, 0.03, 1.25), (-0.02, -0.03, 1.65),
                    (0.0, 0.0, 1.95), (0.1, 0.01, 2.1), (0.24, 0.0, 2.1), (0.33, -0.01, 1.92), (0.36, 0.0, 1.6),
                    (0.33, 0.02, 1.35), (0.4, 0.03, 1.2), (0.47, 0.0, 1.27), (0.43, -0.02, 1.36)])


# Out of the ground, up about 2, turning along +Y at the top and running along it, then coiling round (Brandon: "grouping
# along the top, and curling around").
toprun = spline([(0, 0, -0.06), (0.03, 0.03, 0.4), (-0.03, -0.02, 0.85), (0.03, 0.02, 1.3), (-0.01, 0.0, 1.75),
                 (0.0, 0.12, 2.0), (0.02, 0.4, 2.1), (-0.03, 0.75, 2.05), (0.02, 1.05, 2.1), (0.0, 1.3, 2.06),
                 (0.08, 1.42, 2.1), (0.02, 1.52, 2.2), (-0.07, 1.45, 2.14), (-0.02, 1.36, 2.04), (0.05, 1.42, 2.0)])
# Out of the ground, up about 2, over the top toward -X (in, toward the middle) and coiling there ("somewhere in the middle").
reachin = spline([(0, 0, -0.06), (-0.03, 0.03, 0.45), (0.03, -0.02, 0.9), (-0.02, 0.03, 1.35), (0.0, 0.0, 1.8),
                  (-0.12, 0.02, 2.08), (-0.35, -0.02, 2.16), (-0.6, 0.03, 2.12), (-0.78, 0.0, 2.02), (-0.86, 0.06, 1.88),
                  (-0.8, 0.12, 1.78), (-0.7, 0.08, 1.84), (-0.74, 0.0, 1.95)])


def creeper(t):
    x = t
    y = 0.05 * math.sin(t * 8.0)
    z = 0.025 + 0.025 * math.sin(t * 5.0 + 1.0) - 0.07 * (1 - smooth(t / 0.12))   # out of the ground
    c = smooth((t - 0.78) / 0.22)          # the tip lifts and curls back
    a = c * math.pi * 1.1
    return Vector((x - 0.08 * math.sin(a) * c, y, z + 0.1 * (1 - math.cos(a)) * c))


def climber(t):
    a = t * math.pi * 2 * 1.6
    r = 0.06 + 0.02 * math.sin(t * 7)
    c = smooth((t - 0.82) / 0.18)
    b = c * math.pi * 1.3
    return Vector((math.cos(a) * r + 0.1 * math.sin(b) * c, math.sin(a) * r, t - 0.06 * (1 - math.cos(b)) * c))


def dangler(t):
    c = smooth((t - 0.6) / 0.4)
    a = c * math.pi * 2.0
    return Vector((0.04 * math.sin(t * 6) + 0.08 * math.sin(a) * c, 0.0, -t + 0.1 * (1 - math.cos(a)) * c))


def tendril(t):
    a = t * math.pi * 2 * 2.2
    r = 0.08 * (1 - t * 0.8) * smooth(t / 0.2)
    return Vector((t * 0.4 + math.cos(a) * r, math.sin(a) * r, t * 0.9 - 0.05))


PIECES = [  # name, path, root radius, tip radius, bones, thorn spacing (along 0..1), thorn size, sway, samples
    # More movement (Brandon, November 6, 2026: "a little more mobility ... wiggle around a bit").
    ('climbover', climbover, 0.05, 0.012, 18, 0.028, 0.06, 0.065, 140),
    ('toprun', toprun, 0.05, 0.012, 20, 0.026, 0.06, 0.065, 150),
    ('reachin', reachin, 0.05, 0.012, 18, 0.028, 0.06, 0.065, 140),
    ('creeper', creeper, 0.034, 0.012, 10, 0.075, 0.05, 0.2, 64),
    ('climber', climber, 0.036, 0.012, 12, 0.07, 0.055, 0.16, 64),
    ('tendril', tendril, 0.02, 0.004, 7, 0.0, 0.0, 0.22, 64),
]


def build(name, path, r0, r1, nbones, every, thorn, sway, samples):
    pts = [path(i / samples) for i in range(samples + 1)]
    # parallel transport frames along the strand
    tangents = [(pts[min(i + 1, samples)] - pts[max(i - 1, 0)]).normalized() for i in range(samples + 1)]
    ref = Vector((0, 0, 1)) if abs(tangents[0].z) < 0.9 else Vector((1, 0, 0))
    normals = [tangents[0].cross(ref).normalized()]
    for i in range(1, samples + 1):
        n = normals[-1] - tangents[i] * normals[-1].dot(tangents[i])
        normals.append(n.normalized() if n.length > 1e-6 else normals[-1])
    radial = 6
    bm = bmesh.new()
    params = []                    # how far along (0..1) each vertex is, for the joints' weights
    shades = []                    # each vertex's colour (Brandon, November 6, 2026: "some texture, some variation")
    phase = random.random() * 6.3
    def stem(t):
        # woody brown at the root, green toward the tip, its shade drifting gently along the vine (smooth waves, not a
        # new shade every ring: those read as stripes, Brandon: "slightly less stripyness")
        g = min(1.0, t ** 0.6 * 1.15)
        root, tip = (0.30, 0.22, 0.12), (0.22, 0.40, 0.13)
        blotch = 0.94 + 0.06 * math.sin(t * 9 + phase) + 0.04 * math.sin(t * 23 + phase * 2)
        moss = 0.04 * (1 + math.sin(t * 13 + phase * 3))
        return tuple(min(1.0, (root[c] + (tip[c] - root[c]) * g) * blotch + (moss if c == 1 else 0)) for c in range(3))
    ring_shade = None
    rings = []
    for i, p in enumerate(pts):
        t = i / samples
        rad = r0 + (r1 - r0) * t
        n = normals[i]
        b = tangents[i].cross(n).normalized()
        ring = []
        for j in range(radial):
            a = j / radial * math.pi * 2
            v = bm.verts.new(p + (n * math.cos(a) + b * math.sin(a)) * rad)
            params.append(t)
            ring_shade = ring_shade if j else stem(t)
            shades.append(tuple(min(1.0, c * (0.95 + 0.1 * random.random())) for c in ring_shade))
            ring.append(v)
        rings.append(ring)
    for i in range(samples):
        for j in range(radial):
            k = (j + 1) % radial
            bm.faces.new((rings[i][j], rings[i][k], rings[i + 1][k], rings[i + 1][j]))
    tip = bm.verts.new(pts[-1] + tangents[-1] * r1)
    params.append(1.0)
    shades.append(stem(1.0))
    for j in range(radial):
        bm.faces.new((rings[-1][j], rings[-1][(j + 1) % radial], tip))
    # thorns: little four-sided cones on the surface, pointing out and a little toward the tip
    if every > 0:
        d = every * 0.5
        while d < 0.95:
            i = int(d * samples)
            t = i / samples
            rad = r0 + (r1 - r0) * t
            a = random.random() * math.pi * 2
            n, b = normals[i], tangents[i].cross(normals[i]).normalized()
            out = (n * math.cos(a) + b * math.sin(a)).normalized()
            point = (out + tangents[i] * 0.45).normalized()
            size = thorn * (0.7 + random.random() * 0.6) * (1 - t * 0.5)
            base = pts[i] + out * rad * 0.8
            side1 = out.cross(tangents[i]).normalized()
            side2 = point.cross(side1).normalized()
            w = size * 0.32
            corners = [bm.verts.new(base + (side1 * math.cos(q) + side2 * math.sin(q)) * w) for q in (0, math.pi / 2, math.pi, math.pi * 1.5)]
            apex = bm.verts.new(base + point * size)
            params.extend([t] * 5)
            base_shade = (0.52 + 0.1 * random.random(), 0.42 + 0.08 * random.random(), 0.24)   # tan thorn, its point dark
            shades.extend([base_shade] * 4 + [(0.24, 0.13, 0.08)])
            for c in range(4):
                bm.faces.new((corners[c], corners[(c + 1) % 4], apex))
            bm.faces.new(tuple(reversed(corners)))
            d += every * (0.7 + random.random() * 0.6)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for poly in me.polygons:
        poly.use_smooth = True
    col = me.color_attributes.new(name='Col', type='BYTE_COLOR', domain='POINT')
    for i, c in enumerate(shades):
        col.data[i].color = (c[0], c[1], c[2], 1.0)
    me.color_attributes.active_color = col
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)

    # the joints: a chain of bones along the strand
    arm_data = bpy.data.armatures.new(name + '-rig')
    arm = bpy.data.objects.new(name + '-rig', arm_data)
    scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    bones = []
    for k in range(nbones):
        eb = arm_data.edit_bones.new(f'{name}{k}')
        eb.head = path(k / nbones)
        eb.tail = path((k + 1) / nbones)
        if bones:
            eb.parent = bones[-1]
            eb.use_connect = True
        bones.append(eb)
    names = [b.name for b in bones]
    bpy.ops.object.mode_set(mode='OBJECT')

    # weights: each vertex on its own joint, blended into the next near the ends of each
    groups = [ob.vertex_groups.new(name=n) for n in names]
    for vi, t in enumerate(params):
        f = t * nbones
        b = min(nbones - 1, int(f))
        u = f - b
        if u < 0.5 and b > 0:
            w = 0.5 + u
            groups[b].add([vi], w, 'REPLACE')
            groups[b - 1].add([vi], 1 - w, 'REPLACE')
        elif u >= 0.5 and b < nbones - 1:
            w = 1.5 - u
            groups[b].add([vi], w, 'REPLACE')
            groups[b + 1].add([vi], 1 - w, 'REPLACE')
        else:
            groups[b].add([vi], 1.0, 'REPLACE')
    ob.parent = arm
    mod = ob.modifiers.new('rig', 'ARMATURE')
    mod.object = arm

    for pb in arm.pose.bones:
        pb.rotation_mode = 'XYZ'
    arm.animation_data_create()

    def action(label, frames, pose):
        act = bpy.data.actions.new(f'{name}_{label}')
        arm.animation_data.action = act
        for f in frames:
            for k, pb in enumerate(arm.pose.bones):
                rot, scale = pose(k, f)
                pb.rotation_euler = rot
                pb.scale = (scale, scale, scale)
                pb.keyframe_insert('rotation_euler', frame=f)
                pb.keyframe_insert('scale', frame=f)
        for fc in fcurves_of(act):
            for kp in fc.keyframe_points:
                kp.interpolation = 'LINEAR'
        track = arm.animation_data.nla_tracks.new()
        track.name = act.name
        track.strips.new(act.name, int(frames[0]), act)
        arm.animation_data.action = None

    # grow: each joint opens in turn from a seed, curled in on itself, then straightens with a small overshoot
    grow_end = 2 * FPS
    def grow(k, f):
        start = 1 + k * (grow_end * 0.75 / nbones)
        u = (f - start) / (grow_end * 0.3)
        s = 0.001 if u <= 0 else min(1.0, smooth(u) * 1.06) if u < 1 else 1.0
        curl = 0.9 * (1 - smooth(u)) if u > 0 else 0.9
        return (curl, 0.0, 0.25 * curl), s
    action('grow', [1 + i * 2 for i in range(grow_end // 2 + 1)], grow)

    # idle: a slow wave of curls running out along the joints; the tip coils in, pulls back and reaches out
    loop = 6 * FPS
    def idle(k, f):
        ph = (f - 1) / loop * math.pi * 2
        w = (k / max(1, nbones - 1)) ** 1.3          # the root stays in the ground; the tip moves most
        tipness = smooth((k / max(1, nbones - 1) - 0.55) / 0.45)
        coil = 0.5 - 0.5 * math.cos(ph + k * 0.15)
        rx = sway * w * math.sin(ph * 2 + k * 0.7) + tipness * 0.75 * coil
        rz = sway * 0.8 * w * math.cos(ph + k * 0.9)
        scale = 1.0 - tipness * 0.12 * coil
        return (rx, 0.0, rz), scale
    action('idle', [1 + i * 4 for i in range(loop // 4 + 1)], idle)

    # idle2: slower and other ways round: twists side to side, the tip coiling twice as tight and letting go
    loop2 = 9 * FPS
    def idle2(k, f):
        ph = (f - 1) / loop2 * math.pi * 2
        w = (k / max(1, nbones - 1)) ** 1.1
        tipness = smooth((k / max(1, nbones - 1) - 0.45) / 0.55)
        coil = (0.5 - 0.5 * math.cos(ph * 2 + k * 0.25)) ** 2
        rx = -sway * 0.8 * w * math.sin(ph * 3 + k * 0.5) - tipness * 0.6 * coil
        rz = sway * 1.2 * w * math.sin(ph + k * 0.4)
        ry = 0.25 * tipness * math.sin(ph * 2)
        return (rx, ry, rz), 1.0 - tipness * 0.08 * coil
    action('idle2', [1 + i * 6 for i in range(loop2 // 6 + 1)], idle2)

    # pulse: the outer half draws back in (shrinks toward its root, curling), then grows out again (4 s, once)
    pulse_len = 4 * FPS
    def pulse(k, f):
        ph = (f - 1) / pulse_len
        reach = 0.5 - 0.5 * math.cos(ph * math.pi * 2)          # 0 -> 1 -> 0
        outer = smooth((k / max(1, nbones - 1) - 0.45) / 0.55)
        return (0.7 * outer * reach, 0.0, 0.2 * outer * reach), 1.0 - 0.45 * outer * reach
    action('pulse', [1 + i * 4 for i in range(pulse_len // 4 + 1)], pulse)
    return arm


for spec in PIECES:
    build(*spec)

bpy.ops.export_scene.gltf(
    filepath=OUT, export_format='GLB', export_animations=True, export_animation_mode='ACTIONS',
    export_skins=True, export_yup=True, export_apply=False, export_force_sampling=False, export_optimize_animation_size=True,
    export_def_bones=False, export_materials='EXPORT', export_vertex_color='ACTIVE')
print('EXPORTED', OUT)
