import { Backend } from '../../../../wailsjs/go/models';

export interface BrakeAnalysisToolUIProps {
  fragment: Backend.Data_fragment;
}

export interface BrakeAnalysisPreset {
  name: string;
  mphChannel: string;
  lonAccelChannel: string;
  brakePressureChannel: string;
  vehicleMass: number;
  brakeThreshold: number;
  smoothingWindow: number;
}
