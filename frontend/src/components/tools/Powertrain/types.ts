import { Backend } from '../../../../wailsjs/go/models';

export interface PowertrainKPIs {
  maxEGT1: number;
  maxEGT2: number;
  maxEGT3: number;
  maxEGT4: number;
  medianEGT1: number;
  medianEGT2: number;
  medianEGT3: number;
  medianEGT4: number;
  p90EGT1: number;
  p90EGT2: number;
  p90EGT3: number;
  p90EGT4: number;
  timeAboveWarning1: number;
  timeAboveWarning2: number;
  timeAboveWarning3: number;
  timeAboveWarning4: number;
  timeAboveCritical1: number;
  timeAboveCritical2: number;
  timeAboveCritical3: number;
  timeAboveCritical4: number;
  maxEGTSpread: number;
  medianEGTSpread: number;
  p90EGTSpread: number;
  maxImbalanceRatio: number;
  p90ImbalanceRatio: number;
  medianLambda: number;
  p10Lambda: number;
  p90Lambda: number;
  targetLambda: number;
  timeInRange: number;
  timeRich: number;
  timeLean: number;
  medianDeviation: number;
  egtWarningThreshold: number;
  egtCriticalThreshold: number;
}

export interface PowertrainPreset {
  name: string;
  egt1Channel: string;
  egt2Channel: string;
  egt3Channel: string;
  egt4Channel: string;
  lambdaChannel: string;
  rpmChannel: string;
  tpsChannel: string;
  coolantTempChannel: string;
  coolantTempOutChannel: string;
  oilTempChannel: string;
  mapChannel: string;
  lambdaTarget: number;
  lambdaRangeLow: number;
  lambdaRangeHigh: number;
  egtWarningThreshold: number;
  egtCriticalThreshold: number;
  smoothingWindow: number;
}

export interface PowertrainToolUIProps {
  fragment: Backend.Data_fragment;
}
