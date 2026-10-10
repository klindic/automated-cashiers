import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportCSV } from './analytics';
import { Simulation } from './simulation/engine';
import { DEFAULT_CONFIG } from './simulation/config';
import type { SimulationSnapshot } from './simulation/types';

// Parse quoted fields, escaped quotes and CRLF independently of the exporter.
function parseCSV(text: string): Record<string, string>[] {
  const table: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '"') {
      if (quoted && input[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (ch === ',' || ch === '\n')) {
      row.push(cell); cell = '';
      if (ch === '\n') { table.push(row); row = []; }
    } else if (ch !== '\r' || quoted) cell += ch;
  }
  expect(quoted).toBe(false);
  row.push(cell); table.push(row);
  const headers = table.shift()!;
  expect(new Set(headers).size).toBe(headers.length);
  return table.map(values => {
    expect(values.length).toBe(headers.length);
    return Object.fromEntries(headers.map((header, i) => [header, values[i]]));
  });
}

describe('CSV exports from actual simulation snapshots', () => {
  const blobs: Blob[] = [];
  const anchor = { href: '', download: '', click: vi.fn() };
  beforeEach(() => {
    vi.useFakeTimers();
    blobs.length = 0;
    anchor.click.mockClear();
    vi.stubGlobal('document', { createElement: vi.fn((tag: string) => {
      expect(tag).toBe('a'); return anchor;
    }) });
    vi.spyOn(URL, 'createObjectURL').mockImplementation(blob => {
      expect(blob).toBeInstanceOf(Blob);
      blobs.push(blob as Blob); return 'blob:csv-test';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function makeRun() {
    const sim = new Simulation({ ...DEFAULT_CONFIG, seed: 54321, duration: 80,
      numLanes: 1, stationsPerLane: 2, arrivalMin: 2, arrivalMax: 2,
      itemsMin: 2, itemsMax: 4 });
    sim.advance(80);
    const horizon = sim.snapshot();
    expect(horizon.phase).toBe('horizon');
    return { sim, horizon };
  }
  async function capture(kind: 'customers' | 'samples', snapshot: SimulationSnapshot, horizon: SimulationSnapshot) {
    exportCSV(kind, snapshot, horizon);
    expect(anchor.click).toHaveBeenCalled();
    expect(anchor.href).toBe('blob:csv-test');
    expect(anchor.download).toContain('seed-54321-');
    expect(anchor.download).toMatch(/\.csv$/);
    expect(blobs.at(-1)!.type).toBe('text/csv;charset=utf-8;');
    return parseCSV(await blobs.at(-1)!.text());
  }
  function checkMetadata(rows: Record<string, string>[], snapshot: SimulationSnapshot, horizon: SimulationSnapshot) {
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.phase).toBe(snapshot.phase);
      expect(Number(row.export_time_s)).toBe(snapshot.time);
      expect(Number(row.horizon_tunnel_exited)).toBe(horizon.zones.tunnel.metrics.exited);
      expect(Number(row.horizon_classic_exited)).toBe(horizon.zones.classic.metrics.exited);
      for (const [key, value] of Object.entries(snapshot.config)) expect(row[`config_${key}`]).toBe(String(value));
    }
  }

  it('exports identical customer inputs in both zones, with blank unfinished timestamps', async () => {
    const { horizon } = makeRun();
    const rows = await capture('customers', horizon, horizon);
    checkMetadata(rows, horizon, horizon);
    expect(rows.length).toBe(horizon.zones.tunnel.metrics.arrived * 2);
    const shared = (zone: string) => rows.filter(row => row.zone === zone)
      .map(row => [row.id, row.arrived_at_s, row.items, row.payment]);
    expect(shared('tunnel')).toEqual(shared('classic'));
    expect(rows.some(row => row.left_at_s === '')).toBe(true);
    expect(rows.some(row => row.left_at_s !== '')).toBe(true);
    expect(rows.some(row => row.load_started_at_s === '')).toBe(true);
    for (const row of rows) {
      const customer = horizon.zones[row.zone as 'tunnel' | 'classic'].customers.find(c => c.id === Number(row.id))!;
      expect(row.payment).toBe(customer.card ? 'card' : 'cash');
      const times = [
        ['arrived_at_s', customer.arrivedAt], ['load_started_at_s', customer.loadStartedAt],
        ['pay_started_at_s', customer.payStartedAt], ['pay_ended_at_s', customer.payEndedAt],
        ['left_at_s', customer.leftAt],
      ] as const;
      for (const [column, timestamp] of times) {
        if (timestamp === null) expect(row[column]).toBe('');
        else { expect(Number.isFinite(Number(row[column]))).toBe(true); expect(Number(row[column])).toBe(timestamp); }
      }
      expect(row.total_time_s).toBe(customer.leftAt === null ? '' : String(customer.leftAt - customer.arrivedAt));
      expect(row.waiting_time_s).toBe(customer.loadStartedAt === null ? '' : String(customer.loadStartedAt - customer.arrivedAt));
      expect(Number(row.lane)).toBe(customer.lane + 1);
      expect(row.station).toBe(customer.station === null ? '' : String(customer.station + 1));
    }
  });

  it('preserves horizon counts in customer exports during and after draining', async () => {
    const { sim, horizon } = makeRun();
    const original = JSON.stringify(horizon);
    sim.drain(); sim.advance(10);
    const draining = sim.snapshot();
    expect(draining.phase).toBe('draining');
    checkMetadata(await capture('customers', draining, horizon), draining, horizon);
    sim.advance(10000);
    const complete = sim.snapshot();
    expect(complete.phase).toBe('complete');
    const rows = await capture('customers', complete, horizon);
    checkMetadata(rows, complete, horizon);
    expect(rows.every(row => row.left_at_s !== '' && Number.isFinite(Number(row.left_at_s)))).toBe(true);
    expect(complete.zones.tunnel.metrics.exited).toBeGreaterThan(horizon.zones.tunnel.metrics.exited);
    expect(JSON.stringify(horizon)).toBe(original);
  });

  it('exports horizon and drained time-series values with matching customer conservation', async () => {
    const { sim, horizon } = makeRun();
    sim.drain(); sim.advance(10000);
    const complete = sim.snapshot();
    for (const snapshot of [horizon, complete]) {
      const rows = await capture('samples', snapshot, horizon);
      checkMetadata(rows, snapshot, horizon);
      expect(rows.length).toBe(snapshot.samples.length);
      rows.forEach((row, i) => {
        const sample = snapshot.samples[i];
        expect(Number(row.time_s)).toBe(sample.time);
        expect(Number(row.arrived_each_zone)).toBe(sample.arrived);
        expect(Number(row.tunnel_exited)).toBe(sample.tunnelExited);
        expect(Number(row.classic_exited)).toBe(sample.classicExited);
        expect(Number(row.tunnel_in_system)).toBe(sample.tunnelInSystem);
        expect(Number(row.classic_in_system)).toBe(sample.classicInSystem);
        for (const zone of ['tunnel', 'classic']) {
          expect(Number(row[`${zone}_exited`]) + Number(row[`${zone}_in_system`])).toBe(Number(row.arrived_each_zone));
        }
        expect(Number.isFinite(Number(row.time_s))).toBe(true);
      });
      expect(Number(rows.at(-1)!.time_s)).toBe(snapshot.time);
    }
  });
});
