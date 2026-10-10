import {
  ArcRotateCamera, Color3, Color4, DirectionalLight, Engine, HemisphericLight, ImportMeshAsync,
  Mesh, MeshBuilder, Scene, ShadowGenerator, StandardMaterial, TransformNode, Vector3,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import type { CustomerSnapshot, LaneSnapshot, SimulationConfig, SimulationSnapshot, ZoneId } from '../simulation/types';
import { box, cylinder, label, material, person, type Person } from './geometry';

export interface CheckoutScene {
  update(snapshot: SimulationSnapshot): void;
  focus(zone: 'all' | ZoneId): void;
  resize(): void;
  dispose(): void;
  onSelect?: (zone: ZoneId, lane: number) => void;
}
interface LaneView { root: TransformNode; light: StandardMaterial; stations: StandardMaterial[]; fallback: TransformNode; }
const LANE_GAP = 6.6;
const beltStart = -5.7, beltEnd = 1.2;
const stateColors = { Idle: '#8a999c', Active: '#19b69a', PaymentHold: '#f3b640', Blocked: '#ed6268' };

export function createCheckoutScene(canvas: HTMLCanvasElement, config: SimulationConfig): CheckoutScene {
  const engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: false });
  engine.setHardwareScalingLevel(Math.max(1, window.devicePixelRatio / 1.6));
  const scene = new Scene(engine);
  scene.clearColor = Color4.FromHexString('#e8efefff');
  scene.ambientColor = new Color3(.28,.3,.32);
  const zoneWidth = config.numLanes * LANE_GAP + 1.2;
  const zoneCenters: Record<ZoneId, number> = { tunnel: -(zoneWidth + 2) / 2, classic: (zoneWidth + 2) / 2 };
  const fullWidth = zoneWidth * 2 + 6;
  const camera = new ArcRotateCamera('overview', -Math.PI / 2 + .11, .72, fullWidth * .92, new Vector3(0,0,.3), scene);
  camera.attachControl(canvas, true); camera.lowerBetaLimit = .25; camera.upperBetaLimit = 1.35;
  camera.lowerRadiusLimit = 8; camera.upperRadiusLimit = fullWidth * 1.8; camera.wheelPrecision = 18;
  camera.panningSensibility = 45; camera.minZ = .1; camera.maxZ = 400;
  const ambient = new HemisphericLight('sky', new Vector3(0,1,0), scene); ambient.intensity = .66;
  ambient.groundColor = Color3.FromHexString('#95aaa8');
  const sunlight = new DirectionalLight('sun', new Vector3(-.4,-1,.25), scene);
  sunlight.position.set(12,30,-15); sunlight.intensity = .82;
  const shadow = new ShadowGenerator(2048, sunlight); shadow.useBlurExponentialShadowMap = true; shadow.blurKernel = 32; shadow.darkness = .5;
  const mats = {
    floor: material(scene,'porcelain','#f7f9f7'), edge: material(scene,'platform edge','#aebfbd'),
    dark: material(scene,'belt rubber','#35484c'), steel: material(scene,'steel','#b7c5c6'),
    white: material(scene,'enamel','#edf3f2'), tunnel: material(scene,'teal','#16b6a3'), classic: material(scene,'coral','#e4a35e'),
    rail: material(scene,'rail','#7e9598'), ink: material(scene,'ink','#294247'),
    skin: material(scene,'skin','#d7a47f'), pants: material(scene,'trousers','#30434d'), basket: material(scene,'basket','#d6ac67'),
    screen: material(scene,'screen','#193e47', .3), line: material(scene,'line','#e0e8e6'), bag: material(scene,'paper bag','#c6b593'),
  };
  const shirts = ['#456a88','#d88c65','#587b69','#a287ac','#d5b052','#5ca7b5'].map((c,i) => material(scene,`shirt-${i}`,c));
  const itemMats = ['#ebba64','#e87b60','#8aa875','#84b6c3','#f0ede1'].map((c,i) => material(scene,`grocery-${i}`,c));
  const base = box(scene,'floating-foundation',[fullWidth,.4,23],[0,-.3,.5],mats.edge);
  base.receiveShadows = true;
  const laneViews = new Map<string,LaneView>();
  const customers = new Map<string,Person>();
  const items = new Map<string,Mesh>();
  const dividers = new Map<string,Mesh>();
  const bags = new Map<string,Mesh>();
  const routed = new Map<string,{ mesh: Mesh; zone: ZoneId; lane: number; customerId: number; station: number; started: number }>();
  let previousItems = new Map<string,{ zone: ZoneId; lane: number; customerId: number; index: number }>();
  const cashiers: Person[] = [];
  const key = (zone: ZoneId, lane: number) => `${zone}-${lane}`;
  const laneX = (zone: ZoneId, lane: number) => zoneCenters[zone] + (lane - (config.numLanes - 1)/2)*LANE_GAP;
  function stationX(index: number, count: number) { return (index - (count-1)/2) * 1.65; }
  const controller: CheckoutScene = {
    update, focus, resize: () => { engine.resize(); frameFocusedZone(); }, dispose: () => { disposed = true; scene.dispose(); engine.dispose(); },
  };
  let disposed = false;
  let focusedZone: 'all' | ZoneId = 'all';
  let previousTime = -1;
  function terminal(parent: TransformNode, x: number, z: number) {
    cylinder(scene,'terminal-stand', .55,.08,[x,1.1,z],mats.rail,parent);
    const screen = box(scene,'payment-screen',[.48,.35,.075],[x,1.45,z],mats.screen,parent);
    screen.rotation.x = -.22;
    box(scene,'card-reader',[.18,.06,.23],[x,1.04,z-.25],mats.ink,parent);
  }
  function conveyor(parent: TransformNode, x: number, z: number, width: number, depth: number, angle = 0) {
    const root = new TransformNode('conveyor-module',scene); root.parent=parent; root.position.set(x,0,z); root.rotation.y=angle;
    box(scene,'belt-cabinet',[width+.16,.72,depth],[0,.45,0],mats.white,root);
    box(scene,'moving-surface',[width,.09,depth-.05],[0,.86,0],mats.dark,root);
    for (const side of [-1,1]) box(scene,'brushed-rail',[.065,.09,depth],[side*(width/2+.025),.96,0],mats.steel,root);
    for (let j=0;j<Math.floor(depth/.45);j++) box(scene,'belt-seam',[width-.05,.005,.014],[0,.909,-depth/2+.3+j*.45],mats.rail,root);
    for (const dz of [-depth/2+.2,depth/2-.2]) box(scene,'cabinet-foot',[width*.8,.12,.15],[0,.04,dz],mats.ink,root);
  }
  for (const zone of ['tunnel','classic'] as const) {
    const accent = mats[zone];
    const platform = box(scene,`${zone}-floor`,[zoneWidth,.12,22],[zoneCenters[zone],-.02,.5],mats.floor);
    platform.receiveShadows = true;
    box(scene,`${zone}-accent`,[zoneWidth,.03,.12],[zoneCenters[zone],.06,-9],accent);
    label(scene,zone==='tunnel'?'A  /  TUNELSKI SUSTAV':'B  /  KLASIČNE BLAGAJNE',Math.min(zoneWidth-1,17),new Vector3(zoneCenters[zone],.075,-10.1),zone==='tunnel'?'#188b80':'#ad763f');
    label(scene,'IZLAZ  ↑',3,new Vector3(zoneCenters[zone],.08,9.6),'#6c8988');
    for (let lane=0;lane<config.numLanes;lane++) {
      const root = new TransformNode(key(zone,lane),scene); root.position.x = laneX(zone,lane);
      root.metadata = {zone,lane};
      conveyor(root,0,(beltStart+beltEnd)/2,1.28,beltEnd-beltStart);
      box(scene,'lane-accent',[.045,.3,6.8],[-.746,.61,-2.25],accent,root);
      for (let j=0;j<3;j++) {
        const arrow = MeshBuilder.CreateCylinder('flow-arrow',{height:.012,diameter:.36,tessellation:3},scene);
        arrow.parent=root; arrow.position.set(.99,.085,-4.5+j*1.7); arrow.material=accent;
      }
      const light = material(scene,`${key(zone,lane)}-status`,stateColors.Idle,.45);
      cylinder(scene,'status-mast',2.6,.045,[-.94,1.3,-5.15],mats.rail,root);
      cylinder(scene,'status-light',.22,.19,[-.94,2.7,-5.15],light,root);
      label(scene,`${String(lane+1).padStart(2,'0')}`,1.5,new Vector3(root.position.x,.08,-7),'#496467');
      box(scene,'queue-mark',[.06,.02,1.25],[-1.72,.065,-6.85],mats.line,root);
      terminal(root,1.05,.68);
      const fallback = new TransformNode('scanner-fallback',scene); fallback.parent=root; fallback.position.z=-1.56;
      if (zone==='tunnel') {
        box(scene,'scanner-roof',[1.8,.19,1.55],[0,2.025,0],mats.white,fallback);
        for(const s of [-1,1]) {
          box(scene,'scanner-side',[.22,1.06,1.55],[s*.79,1.47,0],mats.white,fallback);
          box(scene,'scanner-light',[.035,.7,.07],[s*.66,1.47,-.65],accent,fallback);
        }
      } else {
        fallback.setEnabled(false);
        box(scene,'cashier-counter',[1.0,.8,1.4],[-1.17,.48,beltEnd],mats.white,root);
        box(scene,'manual-scan-window',[.85,.035,.8],[0,.93,beltEnd],mats.screen,root);
        terminal(root,-1.1,beltEnd+.35);
        const clerk=person(scene,`cashier-${lane}`,accent,mats.skin,mats.pants,mats.basket,true);
        clerk.root.parent=root; clerk.root.position.set(-1.7,.07,beltEnd); clerk.root.rotation.y=Math.PI/2;
        cashiers.push(clerk);
      }
      const stationCount = zone==='tunnel'?config.stationsPerLane:1;
      const stationMaterials: StandardMaterial[]=[];
      for(let s=0;s<stationCount;s++) {
        const sx=stationX(s,stationCount), sz=5.35;
        if(zone==='tunnel') {
          const dx=sx, dz=2.65;
          conveyor(root,sx/2,2.55,.74,Math.hypot(dx,dz),Math.atan2(dx,dz));
        } else conveyor(root,0,2.7,1.2,2.8);
        box(scene,'packing-cabinet',[1.48,.78,1.65],[sx,.43,sz],mats.white,root);
        box(scene,'packing-bed',[1.4,.055,1.54],[sx,.85,sz],mats.steel,root);
        for(const side of [-1,1]) box(scene,'packing-rail',[.055,.2,1.6],[sx+side*.71,.99,sz],mats.white,root);
        const st = material(scene,`${key(zone,lane)}-station-${s}`,'#b7cfca',.12);stationMaterials.push(st);
        box(scene,'station-status',[1.36,.12,.05],[sx,.73,sz+.84],st,root);
        label(scene,`S${s+1}`,1,new Vector3(root.position.x+sx,.085,7.8),'#6c8988');
        box(scene,'paper-bag',[.32,.48,.25],[sx+.45,1.1,sz+.35],mats.bag,root);
      }
      laneViews.set(key(zone,lane),{root,light,stations:stationMaterials,fallback});
    }
  }
  // Original Blender GLB replaces each procedural emergency fallback once loaded.
  ImportMeshAsync(`${import.meta.env.BASE_URL}models/checkout-tunnel.glb`,scene).then(result=>{
    if(disposed) return;
    const original=result.meshes[0]; original.setEnabled(false);
    for(let lane=0;lane<config.numLanes;lane++) {
      const view=laneViews.get(key('tunnel',lane))!;
      const clone=original.clone(`scanner-glb-${lane}`,view.root);
      if(clone) { clone.setEnabled(true); clone.position.set(0,0,-1.56); view.fallback.setEnabled(false); for(const mesh of clone.getChildMeshes()) shadow.addShadowCaster(mesh); }
    }
    for(const mesh of result.meshes) if(mesh instanceof Mesh) shadow.addShadowCaster(mesh);
  }).catch(error=>console.warn('Scanner GLB unavailable; using procedural scanner.',error));
  for(const mesh of scene.meshes) {
    if(!mesh.name.startsWith('label')) shadow.addShadowCaster(mesh);
  }
  scene.onPointerObservable.add(info=>{
    if(info.type!==1 || !info.pickInfo?.hit) return;
    let node=info.pickInfo.pickedMesh as TransformNode|null;
    while(node && !node.metadata?.zone) node=node.parent as TransformNode|null;
    if(node?.metadata) controller.onSelect?.(node.metadata.zone,node.metadata.lane);
  });
  function frameFocusedZone() {
    // Fit all eight bounds corners against BOTH frustum axes, including depth.
    // A fixed radius crops this wide layout when analytics narrows the canvas.
    const aspect = engine.getRenderWidth() / Math.max(1, engine.getRenderHeight());
    const tanVertical = Math.tan(camera.fov / 2);
    const tanHorizontal = tanVertical * aspect;
    const outward = new Vector3(Math.cos(camera.alpha) * Math.sin(camera.beta), Math.cos(camera.beta), Math.sin(camera.alpha) * Math.sin(camera.beta));
    const right = Vector3.Cross(Vector3.Up(), outward).normalize();
    const up = Vector3.Cross(outward, right).normalize();
    const halfWidth = (focusedZone === 'all' ? fullWidth : zoneWidth) / 2;
    let radius = 8;
    for (const x of [-halfWidth, halfWidth]) for (const y of [-.6, 3]) for (const z of [-11.5, 11.5]) {
      const corner = new Vector3(x, y, z);
      const depth = Vector3.Dot(corner, outward);
      radius = Math.max(radius, depth + Math.abs(Vector3.Dot(corner, right)) / tanHorizontal, depth + Math.abs(Vector3.Dot(corner, up)) / tanVertical);
    }
    camera.upperRadiusLimit = Math.max(fullWidth * 2.5, radius * 1.5);
    camera.radius = radius * 1.09;
  }
  function focus(zone: 'all' | ZoneId) {
    focusedZone = zone;
    camera.inertialAlphaOffset = camera.inertialBetaOffset = camera.inertialRadiusOffset = 0;
    camera.inertialPanningX = camera.inertialPanningY = 0;
    engine.resize();
    camera.setTarget(new Vector3(zone==='all'?0:zoneCenters[zone],0,.5));
    camera.alpha=-Math.PI/2+.11; camera.beta=.72;
    frameFocusedZone();
  }
  function customerPosition(c: CustomerSnapshot, lane: LaneSnapshot): Vector3 {
    const x=laneX(c.zone,c.lane);
    switch(c.state) {
      case 'WaitingForLoad': {
        const index=Math.max(0,lane.queue.indexOf(c.id));
        // Fold long queues into adjacent columns so all waiting people stay on the platform.
        return new Vector3(x-1.3-(Math.floor(index/4)%3)*.68,.07,-5.6-(index%4)*.86);
      }
      case 'Loading': return new Vector3(x+1.12,.07,-4.8);
      case 'WaitingForPayment': return new Vector3(x+1.25,.07,-.9-(lane.processingCustomerId===c.id?0:.85));
      case 'Paying': return new Vector3(x+1.38,.07,.95);
      case 'Bagging': return new Vector3(x+stationX(c.station??0,c.zone==='tunnel'?config.stationsPerLane:1),.07,6.83);
      default: return new Vector3(x,.07,9);
    }
  }
  function update(snapshot: SimulationSnapshot) {
    if (snapshot.time < previousTime) {
      for (const route of routed.values()) route.mesh.dispose();
      routed.clear();
      previousItems.clear();
    }
    previousTime = snapshot.time;
    const seenPeople=new Set<string>(), seenItems=new Set<string>(), seenDividers=new Set<string>(), seenBags=new Set<string>();
    const currentItems=new Map<string,{zone: ZoneId; lane:number; customerId:number; index:number}>();
    for (const zone of ['tunnel','classic'] as const) for(const lane of snapshot.zones[zone].lanes) for(const item of lane.items) if (item.station === null)
      currentItems.set(`${zone}-${item.customerId}-${item.index}`,{zone,lane:lane.index,customerId:item.customerId,index:item.index});
    for(const [id,old] of previousItems) if(!currentItems.has(id)) {
      const delivered=snapshot.zones[old.zone].lanes[old.lane]?.items.find(item=>item.customerId===old.customerId && item.index===old.index && item.station!==null);
      const mesh=items.get(id);
      if(mesh && delivered?.station!=null) {
        items.delete(id);routed.set(id,{mesh,zone:old.zone,lane:old.lane,customerId:old.customerId,station:delivered.station,started:snapshot.time});
      }
    }
    previousItems=currentItems;
    for(const[id,r]of routed) {
      const stillPresent=snapshot.zones[r.zone].lanes[r.lane]?.items.some(item=>`${r.zone}-${item.customerId}-${item.index}`===id && item.station!==null);
      const t=Math.min(1,Math.max(0,(snapshot.time-r.started)/.8));
      if(t>=1 || !stillPresent){r.mesh.dispose();routed.delete(id);continue;}
      r.mesh.position.set(laneX(r.zone,r.lane)+stationX(r.station,r.zone==='tunnel'?config.stationsPerLane:1)*t,1.04,beltEnd+(5.25-beltEnd)*t);
    }
    for(const zone of ['tunnel','classic'] as const) {
      const state=snapshot.zones[zone];
      for(const lane of state.lanes) {
        const view=laneViews.get(key(zone,lane.index)); if(!view) continue;
        const color=Color3.FromHexString(stateColors[lane.state]);
        view.light.diffuseColor=color; view.light.emissiveColor=color.scale(.5);
        lane.stations.forEach((station,i)=>{const m=view.stations[i];if(m)m.diffuseColor=Color3.FromHexString(station.customerId===null?'#b7cfca':'#f3b640');});
        for(const item of lane.items) {
          if (item.station !== null) continue;
          const id=`${zone}-${item.customerId}-${item.index}`;seenItems.add(id);
          let mesh=items.get(id);
          if(!mesh) {
            mesh=item.index%3===0?cylinder(scene,id,.3,.19,[0,0,0],itemMats[item.index%itemMats.length]):box(scene,id,[.24,.22,.22],[0,0,0],itemMats[item.index%itemMats.length]);
            items.set(id,mesh);shadow.addShadowCaster(mesh);
          }
          mesh.position.set(laneX(zone,lane.index)+(item.index%3-1)*.29,1.05,beltStart+item.progress*(beltEnd-beltStart));
        }
        // Delivered goods remain in the snapshot until packed. Their station field
        // is authoritative; never draw these entries on the main belt as well.
        for (const station of lane.stations) {
          const delivered = lane.items.filter(item=>item.station===station.index).slice(0,18);
          delivered.forEach((item,j)=>{
            const id=`${zone}-${item.customerId}-${item.index}`;
            if (routed.has(id)) return;
            seenBags.add(id); let mesh=bags.get(id);
            if(!mesh){mesh=box(scene,`routed-${id}`,[.2,.18,.2],[0,0,0],itemMats[item.index%itemMats.length]);bags.set(id,mesh);}
            mesh.position.set(laneX(zone,lane.index)+stationX(station.index,zone==='tunnel'?config.stationsPerLane:1)+(j%4-1.5)*.24,.97+Math.floor(j/12)*.19,4.97+Math.floor(j%12/4)*.25);
          });
        }
      }
      for(const c of state.customers) {
        if(c.state==='Done') continue;
        const id=`${zone}-${c.id}`, lane=state.lanes[c.lane];if(!lane)continue;
        seenPeople.add(id);let p=customers.get(id);
        if(!p) {p=person(scene,id,shirts[c.id%shirts.length],mats.skin,mats.pants,mats.basket);customers.set(id,p);for(const mesh of p.root.getChildMeshes()) shadow.addShadowCaster(mesh);}
        const target=customerPosition(c,lane);
        // The cosmetic interpolation is driven only by simulated time: pause freezes every pose.
        const since=snapshot.time-c.stateSince;
        const walk=Math.max(0,1-since/1.2);
        p.root.position.copyFrom(target);p.root.position.z-=walk*.65;
        p.root.rotation.y=c.state==='Bagging'?Math.PI:c.state==='Loading'?-Math.PI/2:0;
        const swing=Math.sin(snapshot.time*7+c.id)*.45;
        p.leftLeg.rotation.x=walk*swing;p.rightLeg.rotation.x=-walk*swing;
        const work=c.state==='Loading'||c.state==='Bagging'||c.state==='Paying';
        p.leftArm.rotation.x=work?-.65+Math.sin(snapshot.time*4)*.12:walk*swing;
        p.rightArm.rotation.x=work?-.5-Math.sin(snapshot.time*4)*.12:-walk*swing;
        const progress=(c as CustomerSnapshot & {dividerProgress?:number|null}).dividerProgress;
        if(zone==='tunnel' && progress!=null) {
          seenDividers.add(id);let d=dividers.get(id);
          if(!d){d=box(scene,`divider-${id}`,[1.05,.085,.09],[0,0,0],mats.tunnel);dividers.set(id,d);}
          d.position.set(laneX(zone,c.lane),.99,beltStart+progress*(beltEnd-beltStart));
        }

      }
    }
    for(const [id,p]of customers)if(!seenPeople.has(id)){p.root.dispose();customers.delete(id);}
    for(const [map,seen]of [[items,seenItems],[dividers,seenDividers],[bags,seenBags]] as const)for(const[id,mesh]of map)if(!seen.has(id)){mesh.dispose();map.delete(id);}
    cashiers.forEach((p,i)=>{
      const active=snapshot.zones.classic.lanes[i]?.state==='Active';
      p.leftArm.rotation.x=active?-.65+Math.sin(snapshot.time*4)*.2:-.15;
      p.rightArm.rotation.x=active?-.65-Math.sin(snapshot.time*4)*.2:-.15;
    });
  }
  focus('all');
  engine.runRenderLoop(()=>scene.render());
  return controller;
}
