import { EQPreset } from '../types';

const PRESETS_STORAGE_KEY = 'vevi-eq1-presets';

/**
 * Loads presets from localStorage.
 * @returns An array of EQPreset or null if no presets are found or parsing fails.
 */
export const loadPresetsFromLocalStorage = (): EQPreset[] | null => {
  try {
    const jsonString = localStorage.getItem(PRESETS_STORAGE_KEY);
    if (jsonString) {
      return JSON.parse(jsonString) as EQPreset[];
    }
  } catch (error) {
    console.error('Error loading presets from localStorage:', error);
  }
  return null;
};

/**
 * Saves presets to localStorage.
 * @param presets The array of EQPreset to save.
 */
export const savePresetsToLocalStorage = (presets: EQPreset[]): void => {
  try {
    localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
  } catch (error) {
    console.error('Error saving presets to localStorage:', error);
  }
};
