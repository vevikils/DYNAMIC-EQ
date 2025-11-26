
import { BandType, EQBand } from './types';

export const MIN_FREQ = 20;
export const MAX_FREQ = 20000;
export const MIN_GAIN = -30;
export const MAX_GAIN = 30;
export const MIN_Q = 0.1;
export const MAX_Q = 10;
export const NUM_FREQUENCY_POINTS = 500; // For graph resolution
export const NUM_SPECTRUM_POINTS = 100; // For analyzer resolution

export const DEFAULT_BANDS: EQBand[] = [
  { id: 1, type: BandType.LOW_SHELF, frequency: 60, gain: 0, q: 4.0, enabled: true, color: '#ef4444', isDynamic: false, dynamicRange: 6, solo: false }, // red
  { id: 2, type: BandType.PEAK, frequency: 150, gain: 0, q: 4.0, enabled: true, color: '#f97316', isDynamic: false, dynamicRange: 6, solo: false }, // orange
  { id: 3, type: BandType.PEAK, frequency: 400, gain: 0, q: 4.0, enabled: true, color: '#eab308', isDynamic: false, dynamicRange: 6, solo: false }, // yellow
  { id: 4, type: BandType.PEAK, frequency: 1000, gain: 0, q: 4.0, enabled: true, color: '#22c55e', isDynamic: false, dynamicRange: 6, solo: false }, // green
  { id: 5, type: BandType.PEAK, frequency: 2500, gain: 0, q: 4.0, enabled: true, color: '#06b6d4', isDynamic: false, dynamicRange: 6, solo: false }, // cyan
  { id: 6, type: BandType.PEAK, frequency: 6000, gain: 0, q: 4.0, enabled: true, color: '#3b82f6', isDynamic: false, dynamicRange: 6, solo: false }, // blue
  { id: 7, type: BandType.HIGH_SHELF, frequency: 12000, gain: 0, q: 4.0, enabled: true, color: '#a855f7', isDynamic: false, dynamicRange: 6, solo: false }, // purple
];

export const MASTER_GAIN_RANGE = { min: -12, max: 12 };
