import type { CustomerRecord, CustomerSnapshot, LaneSnapshot, LaneState, Sample, SimulationConfig, SimulationSnapshot, ZoneId, ZoneMetrics, ZoneSnapshot } from './types';

const STEP = .1;
const SPACING = .8;
const EPS = 1e-8;
const round = (n: number) => Math.round(n * 1e9) / 1e9;
interface Customer extends CustomerSnapshot { delivered: number; nextLoadAt: number; bagEndsAt: number; payEndsAt: number; }
interface Token { customerId: number; index: number; divider: boolean; position: number; scanned: boolean; scanEndsAt: number | null; }
interface Lane {
  index: number; state: LaneState; queue: number[]; loading: number | null; paying: number | null;
  stations: (number | null)[]; tokens: Token[]; busyTime: number; blockedTime: number; emptySince: number | null;
}
interface Zone { id: ZoneId; customers: Customer[]; byId: Map<number, Customer>; lanes: Lane[]; }

/** A fixed-step model: durations are resolved at 0.1 s precision, independent of render frames. */
export class Simulation {
  private readonly config: SimulationConfig;
  private readonly records: CustomerRecord[];
  private nextArrival = 0;
  private time = 0;
  private requestedTime = 0;
  private phase: SimulationSnapshot['phase'] = 'running';
  private readonly zones: Record<ZoneId, Zone>;
  private readonly samples: Sample[] = [];
  constructor(config: SimulationConfig) {
    this.validate(config);
    this.config = { ...config };
    this.records = this.generate();
    this.zones = { tunnel: this.makeZone('tunnel'), classic: this.makeZone('classic') };
    this.sample();
  }

  advance(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds < 0) throw new Error('advance expects finite, non-negative seconds');
    if (this.phase === 'horizon' || this.phase === 'complete') return;
    this.requestedTime += seconds;
    const target = this.phase === 'running' ? Math.min(this.requestedTime, this.config.duration) : this.requestedTime;
    while (this.time + EPS < target) {
      // Return to the absolute tick grid after a fractional horizon, preserving samples at 10, 20, ...
      const nextTick = round((Math.floor(this.time / STEP + EPS) + 1) * STEP);
      const dt = round(this.phase === 'running' ? Math.min(nextTick - this.time, this.config.duration - this.time) : nextTick - this.time);
      if (this.time + dt > target + EPS) break;
      this.time = round(this.time + dt);
      if (this.phase === 'running') {
        while (this.nextArrival < this.records.length && this.records[this.nextArrival].arrival <= this.time + EPS) {
          const record = this.records[this.nextArrival++];
          this.arrive(this.zones.tunnel, record); this.arrive(this.zones.classic, record);
        }
      }
      for (const zone of Object.values(this.zones)) for (const lane of zone.lanes) this.tickLane(zone, lane, dt);
      if (Math.abs(this.time / 10 - Math.round(this.time / 10)) < EPS) this.sample();
      if (this.phase === 'running' && this.time >= this.config.duration - EPS) {
        this.phase = 'horizon'; this.sample(); break;
      }
      if (this.phase === 'draining' && Object.values(this.zones).every(z=>z.customers.every(c=>c.state==='Done'))) {
        this.phase = 'complete'; this.sample(); break;
      }
    }
  }

  /** End new arrivals now (normally called at the horizon); advance() performs the drain. */
  drain(): void {
    if (this.phase === 'complete' || this.phase === 'draining') return;
    this.phase = 'draining'; this.requestedTime = this.time;
    if (Object.values(this.zones).every(z=>z.customers.every(c=>c.state==='Done'))) this.phase='complete';
  }

  snapshot(): SimulationSnapshot {
    return { time: this.time, config: { ...this.config }, phase: this.phase,
      zones: { tunnel: this.zoneSnapshot(this.zones.tunnel), classic: this.zoneSnapshot(this.zones.classic) },
      samples: this.samples.map(s=>({ ...s })) };
  }

  private validate(c: SimulationConfig): void {
    for (const [key, value] of Object.entries(c)) if (!Number.isFinite(value)) throw new Error(`Invalid ${key}`);
    for (const key of ['duration','arrivalMin','arrivalMax','loadTime','tunnelScanTime','classicScanTime','payCard','payCash','beltSpeed','beltLength'] as const) {
      if(c[key] <= 0) throw new Error(`${key} must be positive`);
    }
    for (const key of ['numLanes','stationsPerLane','itemsMin','itemsMax','wakeThreshold'] as const) {
      if(!Number.isInteger(c[key]) || c[key] < 1) throw new Error(`${key} must be a positive integer`);
    }
    if(c.itemsMax<c.itemsMin || c.arrivalMax<c.arrivalMin || c.beltLength<SPACING) throw new Error('Invalid range');
    if(c.bagBase<0 || c.bagPerItem<0 || c.idleDelay<0 || c.cardChance<0 || c.cardChance>1 || c.choiceNoise<0 || c.choiceNoise>1) throw new Error('Invalid probability or duration');
  }
  private generate(): CustomerRecord[] {
    let seed = this.config.seed >>> 0;
    const random = () => { seed += 0x6D2B79F5; let t=seed; t=Math.imul(t ^ t>>>15, t|1); t^=t+Math.imul(t^t>>>7,t|61); return ((t^t>>>14)>>>0)/4294967296; };
    const records: CustomerRecord[]=[];
    let arrival=0;
    while (true) {
      arrival=round(arrival+this.config.arrivalMin+random()*(this.config.arrivalMax-this.config.arrivalMin));
      if(arrival>this.config.duration+EPS) break;
      records.push({ id: records.length+1, arrival, items: this.config.itemsMin+Math.floor(random()*(this.config.itemsMax-this.config.itemsMin+1)), card: random()<this.config.cardChance, choiceRandom: random(), laneRandom: random() });
    }
    return records;
  }
  private makeZone(id: ZoneId): Zone {
    return { id, customers: [], byId: new Map(), lanes: Array.from({length:this.config.numLanes}, (_,index)=>({ index, state:'Idle', queue:[], loading:null, paying:null, stations: Array(id==='tunnel'?this.config.stationsPerLane:1).fill(null), tokens:[], busyTime:0, blockedTime:0, emptySince:-this.config.idleDelay })) };
  }
  private arrive(zone: Zone, record: CustomerRecord): void {
    const load = (lane: Lane) => zone.customers.filter(c=>c.lane===lane.index && c.state!=='Done').length;
    let candidates=zone.lanes;
    if(zone.id==='tunnel') {
      const active=zone.lanes.filter(l=>l.state!=='Idle' || load(l)>0), idle=zone.lanes.filter(l=>l.state==='Idle' && load(l)===0);
      candidates=active.length===0 ? [idle[0]] : idle.length && active.every(l=>load(l)>=this.config.wakeThreshold) ? [idle[0]] : active;
    }
    const lane=record.choiceRandom<this.config.choiceNoise ? candidates[Math.floor(record.laneRandom*candidates.length)] : [...candidates].sort((a,b)=>load(a)-load(b)||a.index-b.index)[0];
    const customer: Customer = { id:record.id, zone:zone.id, lane:lane.index, items:record.items, card:record.card, state:'WaitingForLoad', stateSince:this.time, arrivedAt:record.arrival, loadStartedAt:null, payStartedAt:null, payEndedAt:null, leftAt:null, loadedItems:0, scannedItems:0, packedItems:0, station:null, dividerProgress:null, delivered:0, nextLoadAt:0, bagEndsAt:Infinity, payEndsAt:Infinity };
    zone.customers.push(customer); zone.byId.set(customer.id,customer); lane.queue.push(customer.id); lane.emptySince=null;
  }
  private change(customer: Customer, state: Customer['state']): void { customer.state=state; customer.stateSince=this.time; }

  private tickLane(zone: Zone, lane: Lane, dt: number): void {
    // Charge the interval to its previous status, never count blocked time as productive work.
    if(lane.state==='Active' || lane.state==='PaymentHold') lane.busyTime=round(lane.busyTime+dt);
    if(lane.state==='Blocked') lane.blockedTime=round(lane.blockedTime+dt);
    for (const owner of lane.stations) if(owner!==null) {
      const c=zone.byId.get(owner)!;
      if(c.state==='Bagging') {
        const duration=this.config.bagBase+c.items*this.config.bagPerItem;
        c.packedItems=Math.min(c.items, Math.floor(c.items*(1-(c.bagEndsAt-this.time)/Math.max(duration,STEP))));
        if(this.time+EPS>=c.bagEndsAt) { c.packedItems=c.items; c.leftAt=this.time; this.change(c,'Done'); lane.stations[c.station!]=null; }
      }
    }
    const held=lane.paying!==null;
    if(held) this.pauseScanner(lane,dt);
    if(lane.paying!==null) {
      const c=zone.byId.get(lane.paying)!;
      if(this.time+EPS>=c.payEndsAt) {
        c.payEndedAt=this.time; c.bagEndsAt=round(this.time+this.config.bagBase+c.items*this.config.bagPerItem);
        this.change(c,'Bagging'); lane.paying=null;
      }
    }
    let blocked=false;
    if(!held) blocked=this.moveBelt(zone,lane,dt);
    if(lane.loading===null && lane.queue.length) {
      lane.loading=lane.queue.shift()!;
      const c=zone.byId.get(lane.loading)!; c.loadStartedAt=this.time; c.nextLoadAt=round(this.time+this.config.loadTime); this.change(c,'Loading');
    }
    if(lane.loading!==null) {
      const c=zone.byId.get(lane.loading)!, last=lane.tokens.at(-1);
      const clear=!last || last.position>=SPACING-EPS;
      if(clear && this.time+EPS>=c.nextLoadAt) {
        if(c.loadedItems<c.items) {
          lane.tokens.push({customerId:c.id,index:c.loadedItems,divider:false,position:0,scanned:false,scanEndsAt:null}); c.loadedItems++;
          c.nextLoadAt=round(this.time+(c.loadedItems===c.items && zone.id==='tunnel'?0:this.config.loadTime));
          if(zone.id==='classic' && c.loadedItems===c.items) { this.change(c,'WaitingForPayment'); lane.loading=null; }
        } else {
          lane.tokens.push({customerId:c.id,index:-1,divider:true,position:0,scanned:true,scanEndsAt:null});
          c.dividerProgress=0; this.change(c,'WaitingForPayment'); lane.loading=null;
        }
      }
    }
    const nonempty=lane.loading!==null || lane.queue.length>0 || lane.tokens.length>0 || lane.paying!==null || lane.stations.some(s=>s!==null);
    if(nonempty) lane.emptySince=null;
    else if(lane.emptySince===null) lane.emptySince=this.time;
    lane.state=lane.paying!==null ? 'PaymentHold' : blocked ? 'Blocked' : nonempty || (lane.emptySince!==null && this.time-lane.emptySince<this.config.idleDelay-EPS) ? 'Active' : 'Idle';
  }

  private beginPayment(zone: Zone, lane: Lane, c: Customer): void {
    if(zone.id==='classic') { c.station=0; lane.stations[0]=c.id; }
    c.payStartedAt=this.time; c.payEndsAt=round(this.time+(c.card?this.config.payCard:this.config.payCash));
    lane.paying=c.id; this.change(c,'Paying'); c.dividerProgress=null;
  }
  private pauseScanner(lane: Lane, dt: number): void {
    for(const token of lane.tokens) {
      if(!token.scanned && token.scanEndsAt!==null) token.scanEndsAt=round(token.scanEndsAt+dt);
    }
  }
  private moveBelt(zone: Zone, lane: Lane, dt: number): boolean {
    const length=this.config.beltLength, scanner=zone.id==='tunnel'?length*.6:length;
    let blocked=false, ahead=Infinity;
    const front=lane.tokens[0];
    if(zone.id==='tunnel' && front && front.position>=length-EPS && zone.byId.get(front.customerId)!.station===null && lane.stations.every(s=>s!==null)) {
      this.pauseScanner(lane,dt); return true;
    }
    if(zone.id==='classic') {
      const pending=zone.customers.find(c=>c.lane===lane.index && c.scannedItems===c.items && c.payStartedAt===null);
      if(pending) {
        if(lane.stations[0]===null) { this.beginPayment(zone,lane,pending); return false; }
        return true;
      }
    }
    for(let i=0;i<lane.tokens.length;) {
      const token=lane.tokens[i], c=zone.byId.get(token.customerId)!;
      if(lane.paying!==null || blocked) break;
      let destination=Math.min(length,token.position+this.config.beltSpeed*dt,ahead-SPACING);
      if(!token.divider && !token.scanned) {
        destination=Math.min(destination,scanner);
        if(token.position>=scanner-EPS) {
          // One scanner per lane. Ordered tokens and spacing prevent a second article entering it.
          if(token.scanEndsAt===null) token.scanEndsAt=round(this.time+(zone.id==='tunnel'?this.config.tunnelScanTime:this.config.classicScanTime));
          if(this.time+EPS>=token.scanEndsAt) { token.scanned=true; c.scannedItems++; }
          else destination=token.position;
        }
      }
      token.position=round(Math.max(token.position,destination));
      if(!token.divider && !token.scanned && token.position>=scanner-EPS && token.scanEndsAt===null) {
        token.scanEndsAt=round(this.time+(zone.id==='tunnel'?this.config.tunnelScanTime:this.config.classicScanTime));
      }
      if(token.divider) c.dividerProgress=token.position/length;
      if(token.position>=length-EPS && (token.divider || token.scanned)) {
        if(zone.id==='tunnel') {
          if(c.station===null) {
            const station=lane.stations.indexOf(null);
            if(station<0) { blocked=true; break; }
            c.station=station; lane.stations[station]=c.id;
          }
          if(token.divider) this.beginPayment(zone,lane,c); else c.delivered++;
          lane.tokens.splice(i,1); continue;
        }
        // Classic articles are removed into a small scanned-goods buffer, leaving the
        // scanner available during previous bagging. Payment requires the bagging place.
        c.delivered++;
        lane.tokens.splice(i,1);
        if(c.scannedItems===c.items) {
          if(lane.stations[0]===null) this.beginPayment(zone,lane,c);
          else { blocked=true; break; }
        }
        continue;
      }
      ahead=token.position; i++;
    }
    if(zone.id==='classic' && lane.paying===null) {
      const waiting=zone.customers.find(c=>c.lane===lane.index && c.scannedItems===c.items && c.payStartedAt===null);
      if(waiting) {
        if(lane.stations[0]===null) this.beginPayment(zone,lane,waiting);
        else blocked=true;
      }
    }
    return blocked;
  }
  private metrics(zone: Zone): ZoneMetrics {
    const done=zone.customers.filter(c=>c.leftAt!==null), loaded=zone.customers.filter(c=>c.loadStartedAt!==null);
    const durations=done.map(c=>c.leftAt!-c.arrivedAt);
    const denominator=this.time*this.config.numLanes;
    return { arrived:zone.customers.length, exited:done.length, inSystem:zone.customers.length-done.length,
      queued:zone.customers.filter(c=>c.state==='WaitingForLoad').length,
      averageTime:durations.length?durations.reduce((a,b)=>a+b,0)/durations.length:0, maxTime:durations.length?Math.max(...durations):0,
      averageWait:loaded.length?loaded.reduce((n,c)=>n+c.loadStartedAt!-c.arrivedAt,0)/loaded.length:0,
      exitsPerMinute:done.filter(c=>c.leftAt!>this.time-60).length*60/Math.max(Math.min(this.time,60),STEP),
      activeLanes:zone.lanes.filter(l=>l.state!=='Idle').length,
      blockedPercent:denominator?zone.lanes.reduce((n,l)=>n+l.blockedTime,0)/denominator*100:0,
      utilizationPercent:denominator?zone.lanes.reduce((n,l)=>n+l.busyTime,0)/denominator*100:0 };
  }
  private zoneSnapshot(zone: Zone): ZoneSnapshot {
    const customers: CustomerSnapshot[]=zone.customers.map(c=>({ id:c.id,zone:c.zone,lane:c.lane,items:c.items,card:c.card,state:c.state,stateSince:c.stateSince,arrivedAt:c.arrivedAt,loadStartedAt:c.loadStartedAt,payStartedAt:c.payStartedAt,payEndedAt:c.payEndedAt,leftAt:c.leftAt,loadedItems:c.loadedItems,scannedItems:c.scannedItems,packedItems:c.packedItems,station:c.station,dividerProgress:c.dividerProgress }));
    const lanes: LaneSnapshot[]=zone.lanes.map(l=>({ index:l.index,state:l.state,queue:[...l.queue],loadingCustomerId:l.loading,
      processingCustomerId:l.paying ?? l.tokens[0]?.customerId ?? null,payingCustomerId:l.paying,
      stations:l.stations.map((customerId,index)=>({index,customerId})),blockedTime:l.blockedTime,busyTime:l.busyTime,
      items:[...l.tokens.filter(t=>!t.divider).map(t=>({customerId:t.customerId,index:t.index,progress:t.position/this.config.beltLength,scanned:t.scanned,station:null})),
        ...zone.customers.filter(c=>c.lane===l.index && c.state!=='Done' && c.station!==null).flatMap(c=>Array.from({length:Math.max(0,c.delivered-c.packedItems)},(_,i)=>({customerId:c.id,index:c.packedItems+i,progress:1,scanned:true,station:c.station}))) ] }));
    return {id:zone.id,customers,lanes,metrics:this.metrics(zone)};
  }
  private sample(): void {
    if(this.samples.at(-1)?.time===this.time) return;
    const a=this.metrics(this.zones.tunnel), b=this.metrics(this.zones.classic);
    this.samples.push({time:this.time,arrived:a.arrived,tunnelExited:a.exited,classicExited:b.exited,tunnelInSystem:a.inSystem,classicInSystem:b.inSystem});
  }
}
