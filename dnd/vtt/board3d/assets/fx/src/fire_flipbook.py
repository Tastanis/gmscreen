# Zepha's flames for the 3D board (Brandon, November 6, 2026: "those aren't flames. Don't you have fire assets in Blender
# or something you could make"). Blender's own fire simulation (Mantaflow), rendered frame by frame and packed into one
# sheet of flame frames (a flipbook) that the board plays on its flame cards. Run headless:
#   blender -b -P fire_flipbook.py -- <out.png> [work folder]
# The sheet is COLS x ROWS frames of W x H pixels, the flame on black (the board adds it, so black is nothing).
import bpy, os, sys, numpy as np

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else '//fire-flipbook.png'
WORK = args[1] if len(args) > 1 else os.path.join(os.path.dirname(OUT), '_fire_work')
COLS, ROWS, W, H = 8, 4, 128, 256
FRAMES = COLS * ROWS
START = 40                      # the fire has settled into a steady burn by then
os.makedirs(WORK, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.frame_start, scene.frame_end = 1, START + FRAMES

# The domain: a tall box the flame burns in; the flow: a small disc of fuel at its foot.
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 1))
domain = bpy.context.active_object
domain.scale = (1.0, 1.0, 2.0)
mod = domain.modifiers.new('Fluid', 'FLUID')
mod.fluid_type = 'DOMAIN'
ds = mod.domain_settings
ds.domain_type = 'GAS'
ds.resolution_max = 128
ds.cache_type = 'ALL'
ds.cache_directory = os.path.join(WORK, 'cache')
ds.use_adaptive_domain = False
ds.vorticity = 0.35
ds.flame_vorticity = 1.1
ds.burning_rate = 1.0                  # burns out lower: the tip fades inside the frame (second pass)
ds.flame_smoke = 0.0
ds.flame_ignition = 1.25
ds.flame_max_temp = 1.6
ds.alpha = 1.0
ds.beta = 1.6

bpy.ops.mesh.primitive_cylinder_add(radius=0.16, depth=0.06, location=(0, 0, 0.1))
flow = bpy.context.active_object
fm = flow.modifiers.new('Fluid', 'FLUID')
fm.fluid_type = 'FLOW'
fs = fm.flow_settings
fs.flow_type = 'FIRE'
fs.flow_behavior = 'INFLOW'
fs.flow_source = 'MESH'
fs.fuel_amount = 1.1
fs.surface_distance = 1.2
fs.use_initial_velocity = True
fs.velocity_normal = 0.6
flow.hide_render = True

# The flame drawn by its own heat: emission from the 'flame' grid, coloured by blackbody; no smoke drawn.
mat = bpy.data.materials.new('fire')
mat.use_nodes = True
nt = mat.node_tree
for n in list(nt.nodes):
    nt.nodes.remove(n)
outn = nt.nodes.new('ShaderNodeOutputMaterial')
vol = nt.nodes.new('ShaderNodeVolumePrincipled')
vol.inputs['Density'].default_value = 0.0
attr = nt.nodes.new('ShaderNodeAttribute'); attr.attribute_name = 'flame'
mult = nt.nodes.new('ShaderNodeMath'); mult.operation = 'MULTIPLY'; mult.inputs[1].default_value = 8.0     # a softer core: at 14 the base was a white block
temp = nt.nodes.new('ShaderNodeMath'); temp.operation = 'MULTIPLY_ADD'; temp.inputs[1].default_value = 2600.0; temp.inputs[2].default_value = 1100.0
bb = nt.nodes.new('ShaderNodeBlackbody')
nt.links.new(attr.outputs['Fac'], mult.inputs[0])
nt.links.new(attr.outputs['Fac'], temp.inputs[0])
nt.links.new(temp.outputs[0], bb.inputs['Temperature'])
nt.links.new(mult.outputs[0], vol.inputs['Emission Strength'])
nt.links.new(bb.outputs['Color'], vol.inputs['Emission Color'])
nt.links.new(vol.outputs['Volume'], outn.inputs['Volume'])
domain.data.materials.append(mat)

# Bake the simulation.
bpy.context.view_layer.objects.active = domain
domain.select_set(True)
with bpy.context.temp_override(object=domain, active_object=domain, selected_objects=[domain]):
    bpy.ops.fluid.bake_all()
print('BAKED')

# A camera straight at the flame, the domain filling the frame; black behind.
cam_data = bpy.data.cameras.new('cam')
cam_data.type = 'ORTHO'
cam_data.ortho_scale = 2.0
cam = bpy.data.objects.new('cam', cam_data)
scene.collection.objects.link(cam)
cam.location = (0, -6, 1.0)
cam.rotation_euler = (1.5708, 0, 0)
scene.camera = cam
world = bpy.data.worlds.new('w'); world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0, 0, 0, 1)
scene.world = world
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 24
scene.cycles.volume_step_rate = 1.0
scene.render.resolution_x, scene.render.resolution_y = W, H
scene.render.resolution_percentage = 100
scene.render.film_transparent = False
scene.view_settings.view_transform = 'Standard'
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGB'

sheet = np.zeros((ROWS * H, COLS * W, 4), dtype=np.float32)
for i in range(FRAMES):
    scene.frame_set(START + i)
    path = os.path.join(WORK, f'f{i:03d}.png')
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(path)
    px = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4)   # bottom row first
    bpy.data.images.remove(img)
    col, row = i % COLS, i // COLS
    # the sheet's first row of frames is at its top
    y0 = (ROWS - 1 - row) * H
    sheet[y0:y0 + H, col * W:(col + 1) * W] = px
    print('FRAME', i)
out = bpy.data.images.new('fire-flipbook', COLS * W, ROWS * H, alpha=True)
sheet[..., 3] = 1.0
out.pixels = sheet.ravel()
out.filepath_raw = OUT
out.file_format = 'PNG'
out.save()
print('SAVED', OUT)
