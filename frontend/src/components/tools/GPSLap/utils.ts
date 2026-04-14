import { Preset } from './types';
import { seedPresetsIfNeeded } from '../../../utils/seedPresets';

export const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371000;
  const lat1Rad = lat1 * Math.PI / 180;
  const lat2Rad = lat2 * Math.PI / 180;
  const deltaLat = (lat2 - lat1) * Math.PI / 180;
  const deltaLon = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(deltaLat/2) * Math.sin(deltaLat/2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) *
    Math.sin(deltaLon/2) * Math.sin(deltaLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
};

export const getTickInterval = (range: number): number => {
  const idealTicks = 8;
  const rawInterval = range / idealTicks;
  const possibleIntervals = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

  for (const interval of possibleIntervals) {
    if (rawInterval <= interval) {
      return interval;
    }
  }
  return 5000;
};

export const loadPresets = (): Preset[] => {
  seedPresetsIfNeeded('gpsLapAnalysisPresets');
  const savedPresets = localStorage.getItem('gpsLapAnalysisPresets');
  if (savedPresets) {
    try {
      return JSON.parse(savedPresets);
    } catch (e) {
      console.error('Failed to load presets:', e);
      return [];
    }
  }
  return [];
};

export const savePresetsToStorage = (presets: Preset[]): void => {
  localStorage.setItem('gpsLapAnalysisPresets', JSON.stringify(presets));
};

export const commonEmojis = ['🏎️', '🏁', '⚡', '🔥', '💨', '⭐', '🚀', '💎', '👑', '🎯', '🏆', '💪'];
