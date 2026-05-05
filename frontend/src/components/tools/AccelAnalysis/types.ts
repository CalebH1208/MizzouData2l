import { Backend } from '../../../../wailsjs/go/models';

export interface AccelRun {
  index: number;
  name: string;
  startTime: number;
  timerStartTime: number;
  endTime: number;
  duration: number;
  startIdx: number;
  timerStartIdx: number;
  endIdx: number;
  peakMPH: number;
  peakRPM: number;
  distanceTraveled: number;
}

export interface AccelTimeSeries {
  times: number[];
  mph: number[];
  rpm: number[];
  gear: number[];
  throttlePedal: number[];
  throttleBody: number[];
  rlWheelSpeed: number[];
  rrWheelSpeed: number[];
  avgRearWheelSpeed: number[];
  slipRatio: (number | null)[];
}

export interface AccelAnalysisResult {
  runs: AccelRun[];
  timeSeries: AccelTimeSeries;
}

export interface AccelPreset {
  name: string;
  mphChannel: string;
  rpmChannel: string;
  gearChannel: string;
  throttlePedalChannel: string;
  throttleBodyChannel: string;
  rlWheelSpeedChannel: string;
  rrWheelSpeedChannel: string;
  maxRunDuration: number;
  preTimedDistance: number;
  timedDistance: number;
  slipTargetLow: number;
  slipTargetHigh: number;
}

export interface AccelAnalysisToolUIProps {
  fragment: Backend.Data_fragment;
}
