
import { EQBand, BandType, FrequencyPoint } from '../types';
import { MIN_GAIN, MAX_GAIN, MIN_Q, MAX_Q } from '../constants';

/**
 * Calculates the gain in dB for a single PEAK band at a given frequency.
 */
const calculatePeakBandGain = (
  currentFreq: number,
  band: EQBand
): number => {
  if (band.gain === 0 || !band.enabled) return 0;

  const centerFreq = band.frequency;
  const q = Math.max(0.1, band.q);
  const maxGain = band.gain;

  const logCurrentFreq = Math.log2(currentFreq);
  const logCenterFreq = Math.log2(centerFreq);
  const bandwidthFactor = 1.0 / q; 
  const octavesDifference = Math.abs(logCurrentFreq - logCenterFreq);
  const spreadFactor = 2.0; 
  const attenuation = Math.pow(octavesDifference / (bandwidthFactor * spreadFactor), 2);

  if (q < 0.2) return 0;
  return maxGain / (1 + attenuation);
};

/**
 * Calculates the gain in dB for a single SHELF band at a given frequency.
 */
const calculateShelfBandGain = (
  currentFreq: number,
  band: EQBand,
  isLowShelf: boolean
): number => {
  if (band.gain === 0 || !band.enabled) return 0;

  const cutoffFreq = band.frequency;
  const maxGain = band.gain;
  const q = Math.max(0.1, band.q);
  const visualTransitionWidthOctaves = 1.5 / q;

  const logCurrentFreq = Math.log2(currentFreq);
  const logCutoffFreq = Math.log2(cutoffFreq);

  let position = (logCurrentFreq - logCutoffFreq) / visualTransitionWidthOctaves;

  if (isLowShelf) {
    position = -position;
  }

  const normalizedGainFactor = 1 / (1 + Math.exp(-position * 3));
  return maxGain * normalizedGainFactor;
};

export const calculateOverallFrequencyResponse = (
  bands: EQBand[],
  masterGain: number,
  minFreq: number,
  maxFreq: number,
  numPoints: number,
): FrequencyPoint[] => {
  const points: FrequencyPoint[] = [];
  const logMin = Math.log10(minFreq);
  const logMax = Math.log10(maxFreq);

  for (let i = 0; i < numPoints; i++) {
    const logFreq = logMin + (logMax - logMin) * (i / (numPoints - 1));
    const currentFreq = Math.pow(10, logFreq);

    let totalGain = masterGain;

    for (const band of bands) {
      if (!band.enabled) continue;
      switch (band.type) {
        case BandType.PEAK:
          totalGain += calculatePeakBandGain(currentFreq, band);
          break;
        case BandType.LOW_SHELF:
          totalGain += calculateShelfBandGain(currentFreq, band, true);
          break;
        case BandType.HIGH_SHELF:
          totalGain += calculateShelfBandGain(currentFreq, band, false);
          break;
      }
    }
    // No hard clamping here to allow the curve to visually exceed bounds slightly if needed
    points.push({ frequency: currentFreq, gain: totalGain });
  }
  return points;
};

/**
 * Generates simulated spectrum data (RTA).
 * It creates a base "pink noise" slope and adds random jitter.
 * It also applies the current EQ curve to the noise, so visual changes reflect in the analyzer.
 * 
 * @param smoothing 0.0 to 1.0. 0 = fast/instant, 1 = slow/smooth.
 */
export const generateSimulatedSpectrum = (
  bands: EQBand[],
  masterGain: number,
  minFreq: number,
  maxFreq: number,
  numPoints: number,
  previousSpectrum: FrequencyPoint[] | null,
  smoothing: number = 0.5 
): FrequencyPoint[] => {
  const points: FrequencyPoint[] = [];
  const logMin = Math.log10(minFreq);
  const logMax = Math.log10(maxFreq);

  // Pre-calculate EQ curve to apply to noise
  const eqCurve = calculateOverallFrequencyResponse(bands, masterGain, minFreq, maxFreq, numPoints);

  for (let i = 0; i < numPoints; i++) {
    const logFreq = logMin + (logMax - logMin) * (i / (numPoints - 1));
    const currentFreq = Math.pow(10, logFreq);

    // 1. Base Noise Floor (Pink Noise Simulation)
    // Boosted level to be visible within the default -30dB to +30dB graph range.
    // Flatter slope (1.5dB/oct) to keep highs visible.
    let baseLevel = -12 - (Math.log2(currentFreq / 100) * 1.5);
    
    // 2. Add randomness (Jitter)
    // Higher frequencies flicker faster/more
    const randomOffset = (Math.random() - 0.5) * 12; 

    // 3. Apply the EQ Curve to the spectrum!
    // This makes the bars move according to the "power" adjustments you make.
    const eqGainAtFreq = eqCurve[i].gain;
    
    let targetGain = baseLevel + randomOffset + eqGainAtFreq;

    // 4. Temporal Smoothing (Attack/Decay)
    if (previousSpectrum && previousSpectrum[i]) {
        const prev = previousSpectrum[i].gain;
        
        // Calculate interpolation factor (alpha) based on smoothing setting.
        // smoothing 0 -> speed 1.0 (very fast)
        // smoothing 0.9 -> speed 0.1 (very slow)
        const s = Math.max(0, Math.min(0.98, smoothing));
        const speed = 1.0 - s;

        // Attack (signal increasing) is usually faster than decay (signal falling) in meters
        const attackAlpha = Math.max(0.05, speed * 0.9);
        const decayAlpha = Math.max(0.01, speed * 0.2); 

        const alpha = targetGain > prev ? attackAlpha : decayAlpha;
        
        targetGain = prev + (targetGain - prev) * alpha;
    }

    // Clamp for sanity
    targetGain = Math.max(-100, Math.min(30, targetGain));

    points.push({ frequency: currentFreq, gain: targetGain });
  }

  return points;
};
