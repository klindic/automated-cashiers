import './styles.css';
import { Simulation } from './simulation/engine';
import { DEFAULT_CONFIG, TRAFFIC } from './simulation/config';
import type { SimulationConfig, SimulationSnapshot, TrafficPreset, ZoneId } from './simulation/types';
import { createCheckoutScene, type CheckoutScene } from './scene/createScene';
import { icons, mountUI } from './ui';
import { updateMetrics, drawChart, clock, summarize, exportCSV, laneDetail } from './analytics';

mountUI(document.getElementById('app')!);
const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
let config={...DEFAULT_CONFIG};
let sim=new Simulation(config);
let scene:CheckoutScene;
let snapshot=sim.snapshot();
let horizon:SimulationSnapshot|null=null;
let playing=true, speed=1, preset:TrafficPreset='normal';
let selected:{zone:ZoneId;lane:number}|null=null;
let lastFrame=performance.now(),lastUI=0,lastChartSample=-1;
let toastTimer:ReturnType<typeof setTimeout>;
function toast(message:string){el('toast').textContent=message;el('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el('toast').hidden=true,3500);}
function updatePlayback(){
  const ended=snapshot.phase==='horizon'||snapshot.phase==='complete';
  el<HTMLButtonElement>('play').disabled=ended;
  el('play').innerHTML=`${playing?icons.pause:icons.play}<span>${playing?'Pauziraj':'Pokreni'}</span>`;
  el('status-label').innerHTML=snapshot.phase==='complete'?'Pokus završen':snapshot.phase==='horizon'?'Kraj dolazaka':snapshot.phase==='draining'?(playing?'Pražnjenje':'Pauzirano'):(playing?'<i class="running-dot"></i> U tijeku':'Pauzirano');
}
function createView(){
  scene=createCheckoutScene(el<HTMLCanvasElement>('scene'),config);
  scene.onSelect=(zone,lane)=>{selected={zone,lane};el('selection').hidden=false;el('selection').innerHTML=laneDetail(zone,lane,snapshot);};
  scene.update(snapshot);el('scene-loading').hidden=true;
}
function renderUI(){
  updateMetrics(snapshot);
  el<HTMLButtonElement>('export-customers').disabled=snapshot.zones.tunnel.metrics.arrived===0;
  el('clock').textContent=clock(snapshot.time);
  el('duration-label').textContent=` / ${clock(config.duration)}`;
  el('progress-bar').style.width=`${Math.min(100,snapshot.time/config.duration*100)}%`;
  if(snapshot.samples.length!==lastChartSample){drawChart(snapshot);lastChartSample=snapshot.samples.length;}
  if(selected)el('selection').innerHTML=laneDetail(selected.zone,selected.lane,snapshot);
  updatePlayback();
}
function restart(next:SimulationConfig){
  const geometryChanged=next.numLanes!==config.numLanes||next.stationsPerLane!==config.stationsPerLane;
  config={...next};sim=new Simulation(config);snapshot=sim.snapshot();horizon=null;playing=true;lastFrame=performance.now();selected=null;lastChartSample=-1;
  el('selection').hidden=true;el('horizon-summary').hidden=true;el<HTMLButtonElement>('drain').disabled=false;el('drain').textContent='Isprazni preostale redove →';
  if(geometryChanged){scene.dispose();createView();document.querySelectorAll('[data-camera]').forEach(b=>b.classList.toggle('selected',(b as HTMLElement).dataset.camera==='all'));}
  scene.update(snapshot);renderUI();
}
function markDirty(){el<HTMLButtonElement>('apply').disabled=false;el('config-hint').textContent='Promjene vrijede nakon novog pokusa.';}
function readConfig():SimulationConfig|null {
  const fields=[el<HTMLInputElement>('seed'),...Array.from(document.querySelectorAll<HTMLInputElement>('[data-config]'))];
  for(const field of fields){if(!field.checkValidity()||field.value===''){field.reportValidity();toast('Provjeri vrijednosti postavki.');return null;}}
  const next={...config,seed:Number(el<HTMLInputElement>('seed').value),numLanes:Number(el<HTMLSelectElement>('lanes').value),stationsPerLane:Number(el<HTMLSelectElement>('stations').value),duration:Number(el<HTMLSelectElement>('duration').value),arrivalMin:TRAFFIC[preset].min,arrivalMax:TRAFFIC[preset].max};
  document.querySelectorAll<HTMLInputElement>('[data-config]').forEach(input=>{(next as unknown as Record<string,number>)[input.dataset.config!]=Number(input.value);});
  return next;
}
el('apply').addEventListener('click',()=>{const next=readConfig();if(!next)return;restart(next);el<HTMLButtonElement>('apply').disabled=true;el('config-hint').textContent='Obje zone koriste isti niz kupaca.';toast('Novi pokus pokrenut s odabranim postavkama.');});
document.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach(button=>button.addEventListener('click',()=>{preset=button.dataset.preset as TrafficPreset;document.querySelectorAll('[data-preset]').forEach(b=>b.classList.toggle('selected',b===button));el('arrival-label').textContent=`Jedan kupac svakih ${TRAFFIC[preset].min}–${TRAFFIC[preset].max} sekundi`;markDirty();}));
document.querySelectorAll('#lanes,#stations,#duration,#seed,[data-config]').forEach(input=>input.addEventListener('input',markDirty));
el('speed').addEventListener('input',()=>{speed=Number(el<HTMLInputElement>('speed').value);el('speed-output').textContent=`${speed}×`;});
el('play').addEventListener('click',()=>{playing=!playing;lastFrame=performance.now();updatePlayback();});
el('reset').addEventListener('click',()=>{restart(config);toast('Ponovljen isti pokus i isti niz kupaca.');});
el('drain').addEventListener('click',()=>{sim.drain();snapshot=sim.snapshot();playing=snapshot.phase!=='complete';lastFrame=performance.now();el<HTMLButtonElement>('drain').disabled=true;el('drain').textContent=playing?'Pražnjenje u tijeku…':'Svi kupci su završili';renderUI();});
document.querySelectorAll<HTMLButtonElement>('[data-camera]').forEach(button=>button.addEventListener('click',()=>{scene.focus(button.dataset.camera as 'all'|ZoneId);document.querySelectorAll('[data-camera]').forEach(b=>b.classList.toggle('selected',b===button));}));
el('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.querySelector('.scene-panel')!.requestFullscreen();}catch{toast('Puni zaslon nije dostupan u ovom pregledniku.');}});
el('export-toggle').addEventListener('click',()=>el('export-menu').hidden=!el('export-menu').hidden);
for(const kind of ['customers','samples'] as const)el(`export-${kind}`).addEventListener('click',()=>{exportCSV(kind,snapshot,horizon);el('export-menu').hidden=true;toast('CSV s postavkama pokusa pripremljen.');});
document.addEventListener('click',event=>{if(!(event.target as Element).closest('.export-wrap'))el('export-menu').hidden=true;});
document.addEventListener('visibilitychange',()=>{lastFrame=performance.now();});
window.addEventListener('resize',()=>scene?.resize());
new ResizeObserver(()=>scene?.resize()).observe(document.querySelector('.scene-panel')!);
document.addEventListener('keydown',event=>{if(event.code==='Space'&&event.target===document.body){event.preventDefault();if(!el<HTMLButtonElement>('play').disabled)el('play').click();}if(event.key==='Escape'){selected=null;el('selection').hidden=true;}});
function frame(now:number){
  // Never turn a sleeping/background tab into an enormous unreviewable simulation jump.
  const dt=Math.max(0,Math.min((now-lastFrame)/1000,.25));lastFrame=now;
  if(playing&&!document.hidden){sim.advance(dt*speed);snapshot=sim.snapshot();
    if(snapshot.phase==='horizon'){playing=false;horizon=snapshot;summarize(horizon);el('horizon-summary').hidden=false;}
    if(snapshot.phase==='complete'){playing=false;el('drain').textContent='Svi kupci su završili';}
    scene.update(snapshot);
  }
  if(now-lastUI>150){renderUI();lastUI=now;}
  requestAnimationFrame(frame);
}
try{createView();renderUI();requestAnimationFrame(frame);}catch(error){playing=false;el('scene-loading').innerHTML='<div class="error-box">3D prikaz nije se uspio pokrenuti. Provjeri podršku za WebGL u pregledniku i osvježi stranicu.</div>';console.error(error);updatePlayback();}
// Read-only snapshot for reproducible browser QA; no model mutation is exposed.
Object.defineProperty(window,'checkoutLab',{value:{snapshot:()=>sim.snapshot(),horizon:()=>structuredClone(horizon)},writable:false});
