import { Backend } from '../../../../wailsjs/go/models';

export interface XYScatterToolUIProps {
  fragment: Backend.Data_fragment;
}

export interface ScatterPoint {
  x: number;
  y: number;
  color?: number;
}

export interface GraphPreset {
  name: string;
  xChannel: string;
  yChannel: string;
  colorChannel: string;
}

export interface ZoomState {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface BoundsConfig {
  xMin: string;
  xMax: string;
  yMin: string;
  yMax: string;
  colorMin: string;
  colorMax: string;
  enabled: boolean;
  squared: boolean;
}
