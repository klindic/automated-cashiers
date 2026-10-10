"""Create the original checkout scanner asset. Run with Blender --background --python."""
from pathlib import Path
import bpy

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public' / 'models'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def material(name, color, metallic=0, emission=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = .3
    if emission:
        bsdf.inputs['Emission Color'].default_value = (*color, 1)
        bsdf.inputs['Emission Strength'].default_value = emission
    return m

shell = material('Porcelain powder-coated aluminium', (.82,.88,.88), .35)
graphite = material('Graphite inset', (.035,.065,.075), .25)
cyan = material('Scanner light guide', (.03,.76,.67), .3, 1.2)
steel = material('Satin steel', (.35,.43,.45), .75)

def box(name, location, dimensions, mat, bevel=.035):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    ob = bpy.context.object
    ob.name = name
    ob.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    ob.data.materials.append(mat)
    if bevel:
        mod = ob.modifiers.new('Manufactured edge radius', 'BEVEL')
        mod.width = bevel
        mod.segments = 3
        ob.modifiers.new('Weighted surface normals', 'WEIGHTED_NORMAL')
    return ob

# Blender Z is vertical. glTF export converts to Y-up. Floor origin remains (0,0,0).
for side in [-1,1]:
    box(f'Scanner side {side}', (side*.79,0,1.47), (.22,1.55,1.06), shell, .065)
    box(f'Internal scanner {side}', (side*.665,0,1.44), (.035,1.27,.57), graphite, .012)
    for end in [-1,1]:
        box(f'Vertical light {side} {end}', (side*.657,end*.63,1.47), (.025,.055,.72), cyan, .012)
    box(f'Foot {side}', (side*.79,0,.88), (.31,1.67,.14), steel)
box('Rounded scanner canopy', (0,0,2.025), (1.8,1.55,.19), shell, .065)
box('Canopy inset', (0,0,1.919), (1.29,1.23,.04), graphite, .015)
for end in [-1,1]:
    box(f'Overhead scanning bar {end}', (0,end*.63,1.89), (1.32,.055,.027), cyan, .012)
box('Top graphite badge', (0,0,2.123), (.54,.65,.018), graphite, .009)
box('Top status stripe', (0,0,2.136), (.07,.42,.018), cyan, .006)

bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'checkout-tunnel.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT / 'checkout-tunnel.glb'), export_format='GLB', use_selection=False, export_apply=True)
print('ASSET_OK: checkout-tunnel.glb; 1.80m wide, 1.67m deep, 2.145m high; origin at floor centre')
