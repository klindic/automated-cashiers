import { describe, expect, it } from 'vitest';
import { Simulation } from './engine';
import { DEFAULT_CONFIG } from './config';
import type { SimulationConfig } from './types';
const config = (overrides: Partial<SimulationConfig> = {}) => ({ ...DEFAULT_CONFIG, duration: 120, ...overrides });

describe('deterministic checkout simulation', () => {
  it('replays identically and receives the same customers in both zones', () => {
    const a = new Simulation(config()), b = new Simulation(config());
    a.advance(120); b.advance(120);
    expect(a.snapshot()).toEqual(b.snapshot());
    const records = (zone: 'tunnel' | 'classic') => a.snapshot().zones[zone].customers.map(c => [c.id, c.arrivedAt, c.items, c.card]);
    expect(records('tunnel')).toEqual(records('classic'));
  });
  it('is independent of advance chunking and preserves previous snapshots', () => {
    const a = new Simulation(config()), b = new Simulation(config());
    const old = b.snapshot(), serialized = JSON.stringify(old);
    a.advance(120);
    for (let i = 0; i < 12000; i++) b.advance(.01);
    expect(b.snapshot()).toEqual(a.snapshot());
    expect(JSON.stringify(old)).toBe(serialized);
  });
  it('stops at the horizon, then drains without new arrivals or lost customers', () => {
    const sim = new Simulation(config({ arrivalMin: 1, arrivalMax: 1 }));
    sim.advance(1000);
    const horizon = sim.snapshot();
    expect(horizon.time).toBe(120);
    expect(horizon.phase).toBe('horizon');
    expect(horizon.zones.tunnel.metrics.arrived).toBe(120);
    sim.drain(); sim.advance(10000);
    const done = sim.snapshot();
    expect(done.phase).toBe('complete');
    for (const zone of Object.values(done.zones)) {
      expect(zone.metrics.arrived).toBe(120);
      expect(zone.metrics.exited).toBe(120);
      expect(zone.metrics.inSystem).toBe(0);
      expect(zone.lanes.flatMap(l => l.items)).toHaveLength(0);
    }
  });
  it('maintains capacity, finite belt spacing, ownership and customer conservation under stress', () => {
    const sim = new Simulation(config({ numLanes: 1, stationsPerLane: 1, arrivalMin: .5, arrivalMax: .5, itemsMin: 2, itemsMax: 6, bagBase: 25, duration: 90 }));
    let blocked = false;
    for (let i = 0; i < 900; i++) {
      sim.advance(.1);
      for (const zone of Object.values(sim.snapshot().zones)) {
        expect(zone.metrics.arrived).toBe(zone.metrics.exited + zone.metrics.inSystem);
        for (const lane of zone.lanes) {
          if (zone.id === 'tunnel' && lane.state === 'Blocked') blocked = true;
          const owners = lane.stations.flatMap(s => s.customerId === null ? [] : [s.customerId]);
          expect(new Set(owners).size).toBe(owners.length);
          for (const station of lane.stations) if (station.customerId !== null) {
            const c = zone.customers.find(c => c.id === station.customerId)!;
            expect(c.station).toBe(station.index); expect(c.leftAt).toBeNull();
          }
          const belt = lane.items.filter(item => item.station === null).map(item => item.progress).sort((a,b)=>a-b);
          for (let k = 1; k < belt.length; k++) expect((belt[k]-belt[k-1])*12).toBeGreaterThanOrEqual(.799999);
          expect(belt.length).toBeLessThanOrEqual(16);
        }
      }
    }
    expect(blocked).toBe(true);
  });
  it('assigns the lowest available station and allows the reserved owner to finish on a full lane', () => {
    const sim = new Simulation(config({ numLanes: 1, stationsPerLane: 3, arrivalMin: 2, arrivalMax: 2, itemsMin: 2, itemsMax: 2, bagBase: 80, duration: 90 }));
    const previous = new Map<number, number>();
    let sawAll = false;
    for (let i=0; i<900; i++) {
      sim.advance(.1);
      const zone = sim.snapshot().zones.tunnel, lane = zone.lanes[0];
      const assigned = zone.customers.filter(c => c.station !== null && !previous.has(c.id));
      for (const customer of assigned) {
        for (let s=0; s<customer.station!; s++) expect(lane.stations[s].customerId).not.toBeNull();
        previous.set(customer.id, customer.station!);
      }
      if (lane.stations.every(s=>s.customerId !== null)) sawAll = true;
    }
    expect([...previous.values()].slice(0,3)).toEqual([0,1,2]);
    expect(sawAll).toBe(true);
    sim.drain(); sim.advance(10000);
    expect(sim.snapshot().phase).toBe('complete');
  });
  it('stops belt motion during payment, but permits loading into the free entry', () => {
    const sim = new Simulation(config({ numLanes: 1, arrivalMin: .5, arrivalMax: .5, itemsMin: 2, itemsMax: 2, payCard: 12, cardChance: 1, duration: 50 }));
    let checked = 0;
    for (let i=0; i<499; i++) {
      const before = sim.snapshot().zones.tunnel.lanes[0]; sim.advance(.1);
      const after = sim.snapshot().zones.tunnel.lanes[0];
      if (before.state === 'PaymentHold' && after.state === 'PaymentHold' && before.payingCustomerId === after.payingCustomerId) {
        for (const item of before.items.filter(x=>x.station===null)) {
          expect(after.items.find(x=>x.customerId===item.customerId && x.index===item.index)?.progress).toBe(item.progress);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
  it('overlaps classic scanning with previous bagging and waits for its only station before payment', () => {
    const sim = new Simulation(config({ numLanes: 1, arrivalMin: 1, arrivalMax: 1, itemsMin: 2, itemsMax: 2, bagBase: 40, duration: 100 }));
    let overlap = false, waiting = false;
    for(let i=0;i<1000;i++) {
      sim.advance(.1); const cs = sim.snapshot().zones.classic.customers;
      if(cs.some(c=>c.state==='Bagging') && cs.some(c=>c.payStartedAt === null && c.scannedItems>0)) overlap=true;
      if(cs.some(c=>c.state==='Bagging') && cs.some(c=>c.payStartedAt === null && c.scannedItems===c.items)) waiting=true;
      expect(cs.filter(c=>c.state==='Paying' || c.state==='Bagging').length).toBeLessThanOrEqual(1);
    }
    expect(overlap).toBe(true); expect(waiting).toBe(true);
  });
});

describe('timing and resource policy', () => {
  it('matches a hand-computed one-article checkout timeline', () => {
    const sim = new Simulation(config({ duration: 10, numLanes: 1, arrivalMin: 10, arrivalMax: 10,
      itemsMin: 1, itemsMax: 1, cardChance: 1, loadTime: 1, beltLength: 12, beltSpeed: 3,
      tunnelScanTime: .3, classicScanTime: 2, payCard: 4, bagBase: 3, bagPerItem: 3 }));
    sim.advance(10); sim.drain(); sim.advance(100);
    const {classic,tunnel}=sim.snapshot().zones;
    // Arrival 10, loading 1, belt 12/3=4, cashier scan 2, payment 4, bagging 3+3=6.
    expect(classic.customers[0].payStartedAt).toBe(17);
    expect(classic.customers[0].payEndedAt).toBe(21);
    expect(classic.customers[0].leftAt).toBe(27);
    // Tunnel scan adds .3 s; divider follows at least .8/3 s behind the last article.
    // 10+1+4+.3+.8/3 = 15.566..., resolved on the next 0.1-second tick.
    expect(tunnel.customers[0].payStartedAt).toBe(15.6);
    expect(tunnel.customers[0].leftAt).toBe(25.6);
  });
  it('wakes a lane from an empty system, wakes another at the load threshold and returns idle', () => {
    const sim = new Simulation(config({ duration: 3, numLanes: 3, arrivalMin: 1, arrivalMax: 1, itemsMin: 1, itemsMax: 1, choiceNoise: 0 }));
    expect(sim.snapshot().zones.tunnel.metrics.activeLanes).toBe(0);
    sim.advance(1);
    expect(sim.snapshot().zones.tunnel.customers[0].lane).toBe(0);
    sim.advance(2);
    expect(sim.snapshot().zones.tunnel.customers.map(c=>c.lane)).toEqual([0,0,1]);
    const idle = new Simulation(config({ duration: 100, arrivalMin: 60, arrivalMax: 60, itemsMin: 1, itemsMax: 1 }));
    idle.advance(100);
    expect(idle.snapshot().zones.tunnel.metrics.activeLanes).toBe(0);
  });
  it('accounts productive and blocked occupancy separately', () => {
    const sim = new Simulation(config({numLanes: 1, stationsPerLane:1, arrivalMin:1, arrivalMax:1,itemsMin:1,itemsMax:1,bagBase:100,duration:90}));
    sim.advance(90);
    const zone=sim.snapshot().zones.tunnel, lane=zone.lanes[0];
    expect(lane.blockedTime).toBeGreaterThan(0);
    expect(zone.metrics.utilizationPercent).toBeCloseTo(lane.busyTime/90*100, 9);
    expect(zone.metrics.blockedPercent).toBeCloseTo(lane.blockedTime/90*100, 9);
    expect(lane.busyTime+lane.blockedTime).toBeLessThanOrEqual(90);
  });
});

describe('scenario acceptance and regression checks', () => {
  for(const [preset,min,max] of [['quiet',15,40],['normal',6,20],['rush',2,8]] as const) {
    for(const numLanes of [1,4]) for(const stationsPerLane of [1,3]) {
      it(`drains ${preset}, ${numLanes} lane(s), ${stationsPerLane} station(s) without deadlock`, () => {
        const sim=new Simulation(config({duration:600,arrivalMin:min,arrivalMax:max,numLanes,stationsPerLane}));
        sim.advance(600); const horizon=sim.snapshot(), frozen=JSON.stringify(horizon);
        expect(horizon.phase).toBe('horizon');
        sim.drain(); sim.advance(20000);
        const final=sim.snapshot(); expect(final.phase).toBe('complete');
        expect(JSON.stringify(horizon)).toBe(frozen);
        for(const zone of Object.values(final.zones)) {
          expect(zone.metrics.arrived).toBe(horizon.zones[zone.id].metrics.arrived);
          expect(zone.metrics.exited).toBe(zone.metrics.arrived);
          expect(zone.customers.every(c=>c.loadedItems===c.items && c.scannedItems===c.items && c.packedItems===c.items)).toBe(true);
          expect(zone.lanes.every(l=>l.stations.every(s=>s.customerId===null))).toBe(true);
        }
      });
    }
  }
  it('produces identical horizon and drained results for 1× and 20× frame advances', () => {
    const slow=new Simulation(config({duration:75})), fast=new Simulation(config({duration:75}));
    for(let frame=0;frame<4500;frame++) slow.advance(1/60);
    for(let frame=0;frame<225;frame++) fast.advance(20/60);
    expect(slow.snapshot().phase).toBe('horizon');
    expect(slow.snapshot()).toEqual(fast.snapshot());
    slow.drain(); fast.drain();
    for(let frame=0;frame<60000 && slow.snapshot().phase!=='complete';frame++) slow.advance(1/60);
    for(let frame=0;frame<3000 && fast.snapshot().phase!=='complete';frame++) fast.advance(20/60);
    expect(slow.snapshot().phase).toBe('complete');
    expect(slow.snapshot()).toEqual(fast.snapshot());
  });
  it('freezes every existing article and divider during persistent capacity blocking', () => {
    const sim=new Simulation(config({numLanes:1,stationsPerLane:1,arrivalMin:1,arrivalMax:1,itemsMin:4,itemsMax:4,bagBase:80,duration:90}));
    let verified=0;
    for(let tick=0;tick<900;tick++) {
      const before=sim.snapshot().zones.tunnel; sim.advance(.1); const after=sim.snapshot().zones.tunnel;
      if(before.lanes[0].state!=='Blocked' || after.lanes[0].state!=='Blocked') continue;
      for(const item of before.lanes[0].items.filter(i=>i.station===null)) {
        const current=after.lanes[0].items.find(i=>i.customerId===item.customerId && i.index===item.index);
        expect(current).toEqual(item); verified++;
      }
      for(const customer of before.customers.filter(c=>c.dividerProgress!=null)) expect(after.customers.find(c=>c.id===customer.id)?.dividerProgress).toBe(customer.dividerProgress);
    }
    expect(verified).toBeGreaterThan(0);
  });
  it('includes an arrival exactly on a fractional horizon and preserves it while draining', () => {
    const sim=new Simulation(config({duration:.15,arrivalMin:.15,arrivalMax:.15}));
    sim.advance(.15);
    const horizon=sim.snapshot(); expect(horizon.time).toBe(.15); expect(horizon.phase).toBe('horizon');
    expect(horizon.zones.tunnel.customers.map(c=>c.arrivedAt)).toEqual([.15]);
    expect(horizon.zones.classic.metrics.arrived).toBe(1);
    sim.drain(); sim.advance(1000); expect(sim.snapshot().phase).toBe('complete');
    expect(sim.snapshot().samples.some(sample=>sample.time===10)).toBe(true);
  });
});

describe('scanner service during stopped conveyors', () => {
  it('requires the configured scanner service time even across a long capacity block', () => {
    const scanTime=3;
    const sim=new Simulation(config({duration:180,numLanes:1,stationsPerLane:1,arrivalMin:2,arrivalMax:2,
      itemsMin:4,itemsMax:4,loadTime:.2,tunnelScanTime:scanTime,payCard:1,cardChance:1,bagBase:70}));
    const work=new Map<string,number>(), paused=new Set<string>(); let resumedAndScanned=0;
    for(let tick=0;tick<1800;tick++) {
      const before=sim.snapshot().zones.tunnel.lanes[0]; sim.advance(.1); const after=sim.snapshot().zones.tunnel.lanes[0];
      for(const item of before.items.filter(i=>i.station===null && !i.scanned && Math.abs(i.progress-.6)<1e-6)) {
        const key=`${item.customerId}:${item.index}`;
        if(before.state==='Active') work.set(key,(work.get(key)??0)+.1);
        if(before.state==='Blocked') paused.add(key);
        const current=after.items.find(i=>i.customerId===item.customerId && i.index===item.index);
        if(current?.scanned && paused.has(key)) {
          // Releasing capacity at the end of a tick can contribute that one tick.
          expect(work.get(key)??0).toBeGreaterThanOrEqual(scanTime-.100001);
          resumedAndScanned++;
        }
      }
    }
    expect(resumedAndScanned).toBeGreaterThan(0);
  });
});
