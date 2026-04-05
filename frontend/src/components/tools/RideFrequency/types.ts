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
}

export interface RideFrequencySpeedResult {
  targetSpeed: number;
  actualSpeed: number;
  sampleCount: number;
  sampleRate: number;
  channelResults: ChannelFFTResult[];
}

export interface RideFrequencyPreset {
  name: string;
  speedChannel: string;
  analysisChannels: string[];
  targetSpeeds: string;
  speedTolerance: number;
  speedGradThreshold: number;
  minPoints: number;
  maxFreqHz: number;
}
