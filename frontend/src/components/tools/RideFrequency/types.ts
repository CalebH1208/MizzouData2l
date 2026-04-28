import { Backend } from '../../../../wailsjs/go/models';

export interface RideFrequencyToolUIProps {
  fragment: Backend.Data_fragment;
}

export interface ChannelFFTResult {
  channelName: string;
  frequencies: number[];
  amplitudes: number[];
  dominantHz: number;
  dominantAmp: number;
  rideFrequencyHz: number;
  rideFrequencyAmp: number;
  wheelHopHz: number;
  wheelHopAmp: number;
}

export interface RideFrequencyResult {
  sampleRate: number;
  sampleCount: number;
  maxFreqHz: number;
  highpassHz: number;
  detrend: boolean;
  rideBandMin: number;
  rideBandMax: number;
  wheelHopBandMin: number;
  wheelHopBandMax: number;
  segmentLength: number;
  method: string;
  channels: ChannelFFTResult[];
}

export const CHANNEL_COLORS = [
  '#3b82f6',
  '#f97316',
  '#4ade80',
  '#ff00ff',
  '#facc15',
  '#22d3ee',
  '#fb7185',
  '#e879f9',
];
