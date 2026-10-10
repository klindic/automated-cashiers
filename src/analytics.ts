import type { SimulationSnapshot, ZoneMetrics } from './simulation/types';
const nf = new Intl.NumberFormat('hr-HR', { maximumFractionDigits: 1 });
export const fmt = (value: number) => nf.format(value);
export const clock = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2,'0')}:${Math.floor(seconds % 60).toString().padStart(2,'0')}`;
const duration = (value:number, valid=true) => valid ? `${fmt(value)} s` : '—';
export function updateMetrics(s: SimulationSnapshot) {
  const a = s.zones.tunnel.metrics, b = s.zones.classic.metrics;
  const rows: [string, string, string][] = [
    ['U sustavu / u redu', `${a.inSystem} / ${a.queued}`, `${b.inSystem} / ${b.queued}`],
    ['Prosječno trajanje*', duration(a.averageTime,a.exited>0), duration(b.averageTime,b.exited>0)],
    ['Najdulje trajanje*', duration(a.maxTime,a.exited>0), duration(b.maxTime,b.exited>0)],
    ['Čekanje do utovara¹', duration(a.averageWait,a.arrived>a.queued), duration(b.averageWait,b.arrived>b.queued)],
    ['Izlasci/min · klizni prosjek', fmt(a.exitsPerMinute), fmt(b.exitsPerMinute)],
    ['Iskorištenost blagajni²', `${fmt(a.utilizationPercent)}%`, `${fmt(b.utilizationPercent)}%`],
    ['Zastoj zbog kapaciteta²', `${fmt(a.blockedPercent)}%`, `${fmt(b.blockedPercent)}%`],
  ];
  document.querySelector('#metrics-body')!.innerHTML = rows.map(([label,x,y])=>`<tr><td>${label}</td><td>${x}</td><td>${y}</td></tr>`).join('');
  for(const zone of ['tunnel','classic'] as const) {
    document.getElementById(`${zone}-exited`)!.textContent=String(s.zones[zone].metrics.exited);
    document.getElementById(`${zone}-active`)!.textContent=String(s.zones[zone].metrics.activeLanes);
  }
  document.getElementById('arrivals-total')!.textContent=`${a.arrived} zajedničkih dolazaka`;
}
export function drawChart(s: SimulationSnapshot) {
  const samples = s.samples;
  const w=600,h=180,left=35,right=12,top=16,bottom=27;
  const xMax = Math.max(s.config.duration,s.time);
  const maxCount = Math.max(4,...samples.flatMap(p=>[p.tunnelExited,p.classicExited]));
  const yMax = Math.ceil(maxCount/4)*4;
  const x=(t:number)=>left+(t/xMax)*(w-left-right);
  const y=(n:number)=>h-bottom-(n/yMax)*(h-bottom-top);
  const grid=Array.from({length:5},(_,i)=>{const n=yMax*i/4;return `<line x1="${left}" y1="${y(n)}" x2="${w-right}" y2="${y(n)}" stroke="#2b404d" stroke-width="1" ${i?'stroke-dasharray="3 5"':''}/><text x="${left-10}" y="${y(n)+3}" text-anchor="end">${n}</text>`}).join('');
  const ticks=Array.from({length:6},(_,i)=>`<text x="${x(xMax*i/5)}" y="${h-5}" text-anchor="middle">${fmt(xMax*i/5/60)} min</text>`).join('');
  const path=(key:'tunnelExited'|'classicExited')=>samples.map((p,i)=>`${i?'L':'M'}${x(p.time).toFixed(2)},${y(p[key]).toFixed(2)}`).join(' ');
  const aPath=path('tunnelExited'),bPath=path('classicExited');
  const last=samples.at(-1)!;
  document.getElementById('chart')!.innerHTML=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Kumulativni izlasci: tunelski ${last.tunnelExited}, klasični ${last.classicExited}" preserveAspectRatio="none"><defs><linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#60d5be" stop-opacity=".13"/><stop offset="100%" stop-color="#60d5be" stop-opacity="0"/></linearGradient></defs>${grid}${ticks}<path d="${aPath} L${x(last.time)},${y(0)} L${x(0)},${y(0)} Z" fill="url(#chart-fill)"/><path d="${bPath}" fill="none" stroke="#edb67c" stroke-width="2.4" stroke-linejoin="round"/><path d="${aPath}" fill="none" stroke="#61d6c0" stroke-width="2.4" stroke-linejoin="round"/><circle cx="${x(last.time)}" cy="${y(last.tunnelExited)}" r="3.5" fill="#61d6c0"/><circle cx="${x(last.time)}" cy="${y(last.classicExited)}" r="3.5" fill="#edb67c"/></svg>`;
}
export function summarize(s: SimulationSnapshot) {
  const a=s.zones.tunnel.metrics,b=s.zones.classic.metrics;
  const delta=a.exited-b.exited;
  const percentage=b.exited ? `${delta>=0?'+':''}${fmt(delta/b.exited*100)}%` : 'postotak nije definiran (B = 0)';
  document.getElementById('summary-title')!.textContent=`${a.exited} prema ${b.exited} završenih kupaca`;
  document.getElementById('summary-text')!.textContent=`Na ${clock(s.time)}: razlika A − B je ${delta>=0?'+':''}${delta} kupaca · ${percentage}. U sustavu ostaje ${a.inSystem} / ${b.inSystem} kupaca. Ovaj sažetak ostaje sačuvan tijekom pražnjenja.`;
}
function csvEscape(value: unknown) { return `"${String(value ?? '').replaceAll('"','""')}"`; }
function saveCSV(filename: string, headers: string[], rows: unknown[][]) {
  const csv='\uFEFF'+[headers,...rows].map(row=>row.map(csvEscape).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;anchor.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function exportCSV(kind:'customers'|'samples',s:SimulationSnapshot,horizon:SimulationSnapshot|null) {
  const configKeys=Object.keys(s.config);
  const metaHeaders=['phase','export_time_s','horizon_tunnel_exited','horizon_classic_exited',...configKeys.map(k=>`config_${k}`)];
  const meta=[s.phase,s.time,horizon?.zones.tunnel.metrics.exited ?? '',horizon?.zones.classic.metrics.exited ?? '',...Object.values(s.config)];
  const date=new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
  if(kind==='customers') {
    const headers=[...metaHeaders,'zone','id','items','payment','lane','station','state','arrived_at_s','load_started_at_s','pay_started_at_s','pay_ended_at_s','left_at_s','total_time_s','waiting_time_s'];
    const rows=Object.values(s.zones).flatMap(zone=>zone.customers.map(c=>[...meta,c.zone,c.id,c.items,c.card?'card':'cash',c.lane+1,c.station===null?'':c.station+1,c.state,c.arrivedAt,c.loadStartedAt,c.payStartedAt,c.payEndedAt,c.leftAt,c.leftAt===null?'':c.leftAt-c.arrivedAt,c.loadStartedAt===null?'':c.loadStartedAt-c.arrivedAt]));
    saveCSV(`checkout-kupci-seed-${s.config.seed}-${date}.csv`,headers,rows);
  } else {
    saveCSV(`checkout-uzorci-seed-${s.config.seed}-${date}.csv`,[...metaHeaders,'time_s','arrived_each_zone','tunnel_exited','classic_exited','tunnel_in_system','classic_in_system'],s.samples.map(p=>[...meta,p.time,p.arrived,p.tunnelExited,p.classicExited,p.tunnelInSystem,p.classicInSystem]));
  }
}
export function laneDetail(zone: 'tunnel'|'classic',index:number,s:SimulationSnapshot) {
  const lane=s.zones[zone].lanes[index];
  const states={Idle:'Mirovanje',Active:'U radu',PaymentHold:'Plaćanje — traka stoji',Blocked:'Zastoj — čeka slobodan kapacitet'};
  return `${zone==='tunnel'?'Tunelska':'Klasična'} blagajna ${index+1} · ${states[lane.state]}<br>U redu: ${lane.queue.length} · Artikala na traci: ${lane.items.filter(item=>item.station===null).length}<br>Stanice: ${lane.stations.map(st=>st.customerId===null?'slobodna':`kupac #${st.customerId}`).join(' / ')}`;
}
