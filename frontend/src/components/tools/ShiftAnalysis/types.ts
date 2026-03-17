import { Backend } from '../../../../wailsjs/go/models';

export interface ShiftAnalysisToolUIProps {
  fragment: Backend.Data_fragment;
}

export interface ShiftEvent {
  index: number;
  startTime: number;
  endTime: number;
  fromGear: number;
  toGear: number;
  isUpshift: boolean;
  deltaTReaction: number;
  deltaTDuration: number;
  preShiftRPM: number;
  postShiftRPM: number;
  peakRPM: number;
  rpmDrop: number;
  preShiftSpeed: number;
  postShiftSpeed: number;
  pneumaticPressure: number;
  deltaRPMError: number;
  shiftEnergyLoss: number;
  shiftFailed: boolean;
  gForceDrop: number;
  preShiftMaxG: number;
  shiftMinG: number;
  recoveryTime: number;
}

export interface OverlayCurve {
  shiftIndex: number;
  gearPair: string;
  points: Array<{ time: number; gForce: number }>;
}

export interface ScatterPoint {
  x: number;
  y: number;
  gearPair: string;
  index: number;
}

export interface PressurePoint {
  pressure: number;
  duration: number;
  gearPair: string;
  index: number;
}

export interface TrendLine {
  slope: number;
  intercept: number;
  rSquared: number;
  points: number[];
}

export interface ToolResult extends Backend.Tool_result {
  data: {
    mode: string;
    shifts: ShiftEvent[];
    visualization: any;
  };
}

export interface Preset {
  name: string;
  rpmChannel: string;
  gearChannel: string;
  speedChannel: string;
  longGChannel: string;
  shiftRequestChannel: string;
  pressureChannel: string;
  gearRatios: number[];
  flipLongG: boolean;
}
