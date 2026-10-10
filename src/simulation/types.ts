export type ZoneId = 'tunnel' | 'classic';
export type TrafficPreset = 'quiet' | 'normal' | 'rush';
export type CustomerState = 'WaitingForLoad' | 'Loading' | 'WaitingForPayment' | 'Paying' | 'Bagging' | 'Leaving' | 'Done';
export type LaneState = 'Idle' | 'Active' | 'PaymentHold' | 'Blocked';
export interface SimulationConfig {
  seed: number; duration: number; numLanes: number; stationsPerLane: number;
  arrivalMin: number; arrivalMax: number; itemsMin: number; itemsMax: number;
  loadTime: number; tunnelScanTime: number; classicScanTime: number;
  payCard: number; payCash: number; cardChance: number;
  bagBase: number; bagPerItem: number; beltSpeed: number; beltLength: number;
  idleDelay: number; wakeThreshold: number; choiceNoise: number;
}
export interface CustomerRecord { id: number; arrival: number; items: number; card: boolean; choiceRandom: number; laneRandom: number; }
export interface CustomerSnapshot {
  id: number; zone: ZoneId; lane: number; items: number; card: boolean;
  state: CustomerState; stateSince: number; arrivedAt: number;
  loadStartedAt: number | null; payStartedAt: number | null; payEndedAt: number | null; leftAt: number | null;
  loadedItems: number; scannedItems: number; packedItems: number; station: number | null; dividerProgress?: number | null;
}
export interface ItemSnapshot { customerId: number; index: number; progress: number; scanned: boolean; station: number | null; }
export interface StationSnapshot { index: number; customerId: number | null; }
export interface LaneSnapshot {
  index: number; state: LaneState; queue: number[];
  loadingCustomerId: number | null; processingCustomerId: number | null; payingCustomerId: number | null;
  stations: StationSnapshot[]; items: ItemSnapshot[]; blockedTime: number; busyTime: number;
}
export interface ZoneMetrics {
  arrived: number; exited: number; inSystem: number; queued: number;
  averageTime: number; maxTime: number; averageWait: number; exitsPerMinute: number;
  activeLanes: number; blockedPercent: number; utilizationPercent: number;
}
export interface ZoneSnapshot { id: ZoneId; customers: CustomerSnapshot[]; lanes: LaneSnapshot[]; metrics: ZoneMetrics; }
export interface Sample { time: number; arrived: number; tunnelExited: number; classicExited: number; tunnelInSystem: number; classicInSystem: number; }
export interface SimulationSnapshot {
  time: number; config: SimulationConfig; phase: 'running' | 'horizon' | 'draining' | 'complete';
  zones: { tunnel: ZoneSnapshot; classic: ZoneSnapshot }; samples: Sample[];
}
