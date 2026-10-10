import { Color3, DynamicTexture, Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';

export function material(scene: Scene, name: string, hex: string, glow = 0): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = Color3.FromHexString(hex);
  m.specularColor = new Color3(.12, .16, .16);
  m.emissiveColor = m.diffuseColor.scale(glow);
  return m;
}
export function box(scene: Scene, name: string, size: number[], pos: number[], mat: StandardMaterial, parent?: TransformNode): Mesh {
  const m = MeshBuilder.CreateBox(name, { width: size[0], height: size[1], depth: size[2] }, scene);
  m.position.set(pos[0], pos[1], pos[2]); m.material = mat;
  if (parent) m.parent = parent;
  m.receiveShadows = true;
  return m;
}
export function cylinder(scene: Scene, name: string, height: number, diameter: number, pos: number[], mat: StandardMaterial, parent?: TransformNode): Mesh {
  const m = MeshBuilder.CreateCylinder(name, { height, diameter, tessellation: 16 }, scene);
  m.position.set(...pos as [number,number,number]); m.material = mat;
  if (parent) m.parent = parent;
  return m;
}
export function label(scene: Scene, text: string, width: number, position: Vector3, color = '#496467', background = 'transparent'): Mesh {
  const texture = new DynamicTexture(`label-${text}`, { width: 1024, height: 128 }, scene, false);
  texture.hasAlpha = true;
  const ctx = texture.getContext();
  ctx.clearRect(0, 0, 1024, 128);
  if (background !== 'transparent') { ctx.fillStyle = background; ctx.fillRect(0, 0, 1024, 128); }
  texture.drawText(text, null, 87, '600 65px Arial', color, null, true);
  const m = new StandardMaterial(`label-mat-${text}`, scene);
  m.diffuseTexture = texture; m.opacityTexture = texture; m.disableLighting = true; m.emissiveColor = Color3.White(); m.backFaceCulling = false;
  const plane = MeshBuilder.CreatePlane(`label-${text}`, { width, height: width / 8 }, scene);
  plane.rotation.x = Math.PI / 2; plane.position = position; plane.material = m; plane.isPickable = false;
  return plane;
}
export interface Person { root: TransformNode; leftArm: TransformNode; rightArm: TransformNode; leftLeg: TransformNode; rightLeg: TransformNode; }
export function person(scene: Scene, name: string, shirt: StandardMaterial, skin: StandardMaterial, pants: StandardMaterial, basket: StandardMaterial, cashier = false): Person {
  const root = new TransformNode(name, scene);
  const body = MeshBuilder.CreateCapsule(`${name}-body`, { height: .63, radius: .235, tessellation: 10 }, scene);
  body.position.y = 1.06; body.material = shirt; body.parent = root;
  const head = MeshBuilder.CreateSphere(`${name}-head`, { diameter: .36, segments: 12 }, scene);
  head.position.y = 1.61; head.material = skin; head.parent = root;
  const hair = MeshBuilder.CreateSphere(`${name}-hair`, { diameter: .365, segments: 12, slice: .47 }, scene);
  hair.position.y = 1.65; hair.material = pants; hair.parent = root;
  function limb(part: string, x: number, y: number, length: number, mat: StandardMaterial) {
    const joint = new TransformNode(`${name}-${part}`, scene); joint.parent = root; joint.position.set(x,y,0);
    const mesh = MeshBuilder.CreateCapsule(`${name}-${part}-mesh`, { height: length, radius: .07, tessellation: 8 }, scene);
    mesh.position.y = -length / 2; mesh.material = mat; mesh.parent = joint;
    return joint;
  }
  const leftArm = limb('left-arm', -.27, 1.28, .57, skin);
  const rightArm = limb('right-arm', .27, 1.28, .57, skin);
  const leftLeg = limb('left-leg', -.12, .8, .72, pants);
  const rightLeg = limb('right-leg', .12, .8, .72, pants);
  if (!cashier) {
    box(scene, `${name}-basket`, [.47,.27,.32], [.37,.57,.12], basket, root);
    const handle = MeshBuilder.CreateTorus(`${name}-handle`, { diameter: .3, thickness: .025, tessellation: 12 }, scene);
    handle.parent = root; handle.position.set(.37,.77,.12); handle.rotation.x = Math.PI / 2; handle.material = pants;
  }
  return { root, leftArm, rightArm, leftLeg, rightLeg };
}
