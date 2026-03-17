export interface LapEvent {
  index: number;
  name: string;
  emoji: string;
  startTime: number;
  endTime: number;
  duration: number;
  totalDistance: number;
  avgSpeed: number;
  maxSpeed: number;
  minSpeed: number;
  avgLatAccel: number;
  avgLongAccel: number;
  maxLatAccel: number;
  maxLongAccel: number;
  gSum95Percentile: number;
  brakeWork: number;
  fullThrottlePct: number;
  coastDistancePct: number;
  throttleHesitation: number;
  distanceGrid: number[];
  timeAtDistance: number[];
  speedAtDistance: number[];
  latAccelAtDistance: number[];
  longAccelAtDistance: number[];
  curvatureAtDistance: number[];
  gSumAtDistance: number[];
  latLonTrace: [number, number][];
  rawTimes: number[];
  rawThrottle: number[];
  rawBrake: number[];
  rawSteering: number[];
  rawSpeed: number[];
}

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export interface ToolResultData {
  allLaps: LapEvent[];
  boundingBox: BoundingBox;
  lapColors: string[];
}

export interface Preset {
  name: string;
  latChannel: string;
  lonChannel: string;
  speedChannel: string;
  latAccelChannel: string;
  longAccelChannel: string;
  brakeChannel: string;
  throttleChannel: string;
  steeringChannel: string;
  startLine: [[number, number], [number, number]] | null;
  finishLine: [[number, number], [number, number]] | null;
}

export interface LapCustomization {
  name: string;
  emoji: string;
}

export type MapMode = 'gate-placement' | 'lap-replay' | 'overlay';
