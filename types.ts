
export enum BandType {
  PEAK = 'Peak',
  LOW_SHELF = 'Low-Shelf',
  HIGH_SHELF = 'High-Shelf',
}

export interface EQBand {
  id: number;
  frequency: number; // Hz
  gain: number;      // dB
  q: number;         // Quality factor
  type: BandType;
  enabled: boolean;
  color: string; // For visualization
  isDynamic?: boolean;
  dynamicRange?: number;
  solo?: boolean;
}

export interface FrequencyPoint {
  frequency: number;
  gain: number;
}

export interface EQPreset {
  id: string; // Unique identifier for the preset
  name: string;
  bands: EQBand[];
  masterGain: number;
}
