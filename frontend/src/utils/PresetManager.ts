export interface GraphConfig {
  title: string;
  channelNames: string[];
  useSplitAxis: boolean;
  channelColors?: {
    [channelName: string]: string;
  };
}

export interface GraphPreset {
  id: string;
  name: string;
  createdAt: number;
  lastUsedAt: number;
  order: number;
  viewportStart?: number;
  viewportEnd?: number;
  graphs: GraphConfig[];
}

const STORAGE_KEY = 'graphPresets';
const LAST_SESSION_ID = '__last_session__';

function generateId(): string {
  return `preset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function loadPresets(): GraphPreset[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return [];
    }

    let presets = JSON.parse(saved) as GraphPreset[];

    presets = presets.map((p, idx) => ({
      ...p,
      order: p.order !== undefined ? p.order : idx
    }));

    presets.sort((a, b) => {
      if (a.id === LAST_SESSION_ID) return -1;
      if (b.id === LAST_SESSION_ID) return 1;
      return a.order - b.order;
    });

    return presets;
  } catch (error) {
    console.error('Failed to load graph presets:', error);
    return [];
  }
}

export function savePreset(preset: GraphPreset): void {
  try {
    const presets = loadPresets();

    const existingIndex = presets.findIndex(p => p.id === preset.id);
    if (existingIndex >= 0) {
      presets[existingIndex] = preset;
    } else {
      presets.push(preset);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch (error) {
    console.error('Failed to save graph preset:', error);
    throw new Error('Failed to save preset');
  }
}

export function deletePreset(id: string): void {
  try {
    const presets = loadPresets();
    const filtered = presets.filter(p => p.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Failed to delete graph preset:', error);
    throw new Error('Failed to delete preset');
  }
}

export function updatePreset(id: string, updates: Partial<GraphPreset>): void {
  try {
    const presets = loadPresets();
    const index = presets.findIndex(p => p.id === id);

    if (index < 0) {
      throw new Error(`Preset with id ${id} not found`);
    }

    presets[index] = { ...presets[index], ...updates };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch (error) {
    console.error('Failed to update graph preset:', error);
    throw new Error('Failed to update preset');
  }
}

export function duplicatePreset(id: string): GraphPreset | null {
  try {
    const presets = loadPresets();
    const original = presets.find(p => p.id === id);

    if (!original) {
      return null;
    }

    const duplicate: GraphPreset = {
      ...original,
      id: generateId(),
      name: `${original.name} (Copy)`,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    };

    savePreset(duplicate);
    return duplicate;
  } catch (error) {
    console.error('Failed to duplicate graph preset:', error);
    return null;
  }
}

export function createPreset(
  name: string,
  graphs: GraphConfig[],
  viewportStart?: number,
  viewportEnd?: number
): GraphPreset {
  const presets = loadPresets();
  const maxOrder = presets.reduce((max, p) =>
    p.id === LAST_SESSION_ID ? max : Math.max(max, p.order), -1
  );

  return {
    id: generateId(),
    name,
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
    order: maxOrder + 1,
    viewportStart,
    viewportEnd,
    graphs,
  };
}

export function createLastSessionPreset(
  graphs: GraphConfig[],
  viewportStart?: number,
  viewportEnd?: number
): GraphPreset {
  return {
    id: LAST_SESSION_ID,
    name: '__Last Session__',
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
    order: -1,
    viewportStart,
    viewportEnd,
    graphs,
  };
}

export function matchChannelName(
  presetChannelName: string,
  availableChannels: string[]
): string | null {
  if (availableChannels.includes(presetChannelName)) {
    return presetChannelName;
  }

  const lowerName = presetChannelName.toLowerCase();
  const match = availableChannels.find(ch => ch.toLowerCase() === lowerName);

  return match || null;
}

export function updateLastUsed(id: string): void {
  try {
    updatePreset(id, { lastUsedAt: Date.now() });
  } catch (error) {
    console.error('Failed to update last used time:', error);
  }
}

export function reorderPresets(reorderedPresets: GraphPreset[]): void {
  try {
    const presetsWithNewOrder = reorderedPresets.map((p, idx) => ({
      ...p,
      order: p.id === LAST_SESSION_ID ? -1 : idx
    }));

    localStorage.setItem(STORAGE_KEY, JSON.stringify(presetsWithNewOrder));
  } catch (error) {
    console.error('Failed to reorder presets:', error);
    throw new Error('Failed to reorder presets');
  }
}
