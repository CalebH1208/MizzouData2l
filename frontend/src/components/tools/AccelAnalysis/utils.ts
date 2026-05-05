import { AccelPreset } from './types';

const STORAGE_KEY = 'accel_analysis_presets';

export function loadPresets(): AccelPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as AccelPreset[];
  } catch {
    return [];
  }
}

export function savePresets(presets: AccelPreset[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}
