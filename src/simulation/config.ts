import type { SimulationConfig, TrafficPreset } from './types';
export const DEFAULT_CONFIG: SimulationConfig = {
  seed: 12345, duration: 600, numLanes: 4, stationsPerLane: 3,
  arrivalMin: 6, arrivalMax: 20, itemsMin: 2, itemsMax: 30,
  loadTime: 1, tunnelScanTime: .3, classicScanTime: 2,
  payCard: 4, payCash: 15, cardChance: .75,
  bagBase: 3, bagPerItem: 1.5, beltSpeed: 3, beltLength: 12,
  idleDelay: 5, wakeThreshold: 2, choiceNoise: .15,
};
export const TRAFFIC: Record<TrafficPreset, { label: string; min: number; max: number }> = {
  quiet: { label: 'Mirno', min: 15, max: 40 },
  normal: { label: 'Normalno', min: 6, max: 20 },
  rush: { label: 'Špica', min: 2, max: 8 },
};
