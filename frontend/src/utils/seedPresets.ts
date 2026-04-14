import defaultGraphPresets from '../assets/defaultPresets/graphPresets.json';
import defaultScatterPresets from '../assets/defaultPresets/scatterPlotPresets.json';
import defaultPowertrainPresets from '../assets/defaultPresets/powertrainToolPresets.json';
import defaultDownforcePresets from '../assets/defaultPresets/downforceToolPresets.json';
import defaultRideFrequencyPresets from '../assets/defaultPresets/rideFrequencyToolPresets.json';
import defaultShiftAnalysisPresets from '../assets/defaultPresets/shiftAnalysisPresets.json';
import defaultGpsLapPresets from '../assets/defaultPresets/gpsLapAnalysisPresets.json';

const SEEDED_FLAG_PREFIX = '__seeded__';

const DEFAULTS: Record<string, unknown> = {
  graphPresets: defaultGraphPresets,
  scatterPlotPresets: defaultScatterPresets,
  powertrainToolPresets: defaultPowertrainPresets,
  downforceToolPresets: defaultDownforcePresets,
  rideFrequencyToolPresets: defaultRideFrequencyPresets,
  shiftAnalysisPresets: defaultShiftAnalysisPresets,
  gpsLapAnalysisPresets: defaultGpsLapPresets,
};

export function seedPresetsIfNeeded(storageKey: string): void {
  const seededFlag = `${SEEDED_FLAG_PREFIX}${storageKey}`;

  if (localStorage.getItem(seededFlag)) {
    return;
  }

  const existing = localStorage.getItem(storageKey);
  if (existing !== null) {
    localStorage.setItem(seededFlag, '1');
    return;
  }

  const defaults = DEFAULTS[storageKey];
  if (defaults === undefined) {
    return;
  }

  const payload = Array.isArray(defaults) ? defaults : (defaults as { presets?: unknown[] }).presets ?? defaults;

  if (Array.isArray(payload) && payload.length === 0) {
    localStorage.setItem(seededFlag, '1');
    return;
  }

  localStorage.setItem(storageKey, JSON.stringify(payload));
  localStorage.setItem(seededFlag, '1');
}

export function exportAllPresetsToConsole(): void {
  const keys = Object.keys(DEFAULTS);
  const dump: Record<string, unknown> = {};
  for (const key of keys) {
    const value = localStorage.getItem(key);
    dump[key] = value ? JSON.parse(value) : [];
  }
  console.log('=== PRESET EXPORT ===');
  console.log('Copy each block into frontend/src/assets/defaultPresets/<key>.json');
  for (const [key, value] of Object.entries(dump)) {
    console.log(`\n--- ${key}.json ---`);
    console.log(JSON.stringify(value, null, 2));
  }
  (window as unknown as { __presetDump?: unknown }).__presetDump = dump;
  console.log('\nFull dump also available as window.__presetDump');
}

if (typeof window !== 'undefined') {
  (window as unknown as { exportAllPresetsToConsole?: () => void }).exportAllPresetsToConsole = exportAllPresetsToConsole;
}
