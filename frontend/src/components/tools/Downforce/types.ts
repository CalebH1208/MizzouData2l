import { Backend } from '../../../../wailsjs/go/models';

export interface DownforceToolUIProps {
  fragment: Backend.Data_fragment;
}

export interface DownforceResult {
  targetSpeed: number;
  actualSpeed: number;
  blockStartIdx: number;
  blockEndIdx: number;
  pointCount: number;
  avgSusPotFL: number;
  avgSusPotFR: number;
  avgSusPotRL: number;
  avgSusPotRR: number;
  displacementFL: number;
  displacementFR: number;
  displacementRL: number;
  displacementRR: number;
  wheelDispFL: number;
  wheelDispFR: number;
  wheelDispRL: number;
  wheelDispRR: number;
  downforceFL: number;
  downforceFR: number;
  downforceRL: number;
  downforceRR: number;
  totalDownforce: number;
  frontDownforce: number;
  rearDownforce: number;
  frontPercent: number;
}

export interface DownforcePreset {
  name: string;
  speedChannel: string;
  rpmChannel: string;
  accelChannel: string;
  susPotFL: string;
  susPotFR: string;
  susPotRL: string;
  susPotRR: string;
  zeroFL: number;
  zeroFR: number;
  zeroRL: number;
  zeroRR: number;
  motionRatioFront: number;
  motionRatioRear: number;
  springRateFront: number;
  springRateRear: number;
  targetSpeeds: string;
  speedTolerance: number;
  speedGradThreshold: number;
  rpmGradThreshold: number;
  minPoints: number;
}

export type PlotType = 'displacement' | 'corner' | 'total' | 'balance';
