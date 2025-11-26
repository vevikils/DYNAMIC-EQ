
import React from 'react';
import { EQBand, BandType } from '../types';
import Slider from './Slider';
import ToggleButton from './ToggleButton';
import { MIN_FREQ, MAX_FREQ, MIN_GAIN, MAX_GAIN, MIN_Q, MAX_Q } from '../constants';

interface EQBandControlProps {
  band: EQBand;
  onBandChange: (id: number, updatedBand: Partial<EQBand>) => void;
}

const EQBandControl: React.FC<EQBandControlProps> = ({ band, onBandChange }) => {
  const handleSliderChange = (param: keyof EQBand, value: number) => {
    onBandChange(band.id, { [param]: value });
  };

  const handleTypeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    onBandChange(band.id, { type: event.target.value as BandType });
  };

  const handleToggleChange = (enabled: boolean) => {
    onBandChange(band.id, { enabled });
  };

  const handleDynamicChange = (isDynamic: boolean) => {
    onBandChange(band.id, { isDynamic });
  };

  return (
    <div className="flex items-center space-x-6 bg-slate-800/90 backdrop-blur-md p-4 rounded-xl border border-slate-700 shadow-2xl animate-fade-in-up">
      {/* Band Info / Toggle */}
      <div className="flex flex-col items-center justify-center space-y-2 border-r border-slate-700 pr-6">
        <div className="flex items-center space-x-2">
           <div className="w-3 h-3 rounded-full" style={{ backgroundColor: band.color }}></div>
           <span className="text-white font-bold text-lg">Band {band.id}</span>
        </div>
        <div className="flex flex-col gap-2">
          
          <div className="flex items-center space-x-2">
             <ToggleButton
                checked={band.enabled}
                onChange={handleToggleChange}
                color={band.color.replace('#', '')} 
                label="On"
              />
              {/* Solo Button */}
              <button
                onClick={() => onBandChange(band.id, { solo: !band.solo })}
                className={`w-8 h-6 rounded flex items-center justify-center text-xs font-bold border transition-all ${
                    band.solo 
                    ? 'bg-yellow-500 border-yellow-400 text-black shadow-[0_0_10px_rgba(234,179,8,0.5)]' 
                    : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:border-slate-400 hover:text-slate-200'
                }`}
                title="Solo Band"
              >
                S
              </button>
          </div>

          {/* Dynamic Toggle */}
          <div className="flex items-center space-x-2">
            <label className="text-xs text-gray-400 font-medium cursor-pointer w-4">Dyn</label>
            <button
                onClick={() => handleDynamicChange(!band.isDynamic)}
                className={`w-8 h-4 rounded-full border border-slate-500 flex items-center transition-colors ${band.isDynamic ? 'bg-blue-600 border-blue-500' : 'bg-transparent'}`}
            >
                <div className={`w-2 h-2 bg-white rounded-full mx-1 transition-transform ${band.isDynamic ? 'translate-x-3' : ''}`}></div>
            </button>
          </div>
        </div>
        
        <select
          value={band.type}
          onChange={handleTypeChange}
          className="bg-slate-900 text-gray-300 text-xs rounded border border-slate-600 focus:outline-none focus:border-blue-500 p-1 mt-1 w-24"
        >
          {Object.values(BandType).map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
      </div>

      {/* Sliders */}
      <div className="flex space-x-6">
        <Slider
          label="Freq"
          min={MIN_FREQ}
          max={MAX_FREQ}
          step={1}
          value={band.frequency}
          onChange={(val) => handleSliderChange('frequency', val)}
          valueSuffix="Hz"
          className={!band.enabled ? 'opacity-40 pointer-events-none grayscale' : ''}
        />
        <Slider
          label="Gain"
          min={MIN_GAIN}
          max={MAX_GAIN}
          step={0.1}
          value={band.gain}
          onChange={(val) => handleSliderChange('gain', val)}
          valueSuffix="dB"
          className={!band.enabled ? 'opacity-40 pointer-events-none grayscale' : ''}
        />
        <Slider
          label="Q"
          min={MIN_Q}
          max={MAX_Q}
          step={0.01}
          value={band.q}
          onChange={(val) => handleSliderChange('q', val)}
          className={!band.enabled ? 'opacity-40 pointer-events-none grayscale' : ''}
        />
        {/* Dynamic Range Slider - Only visible if Dynamic is ON */}
        {band.isDynamic && (
           <div className="animate-fade-in pl-2 border-l border-slate-700">
             <Slider
               label="Range"
               min={0}
               max={12}
               step={0.5}
               value={band.dynamicRange || 6}
               onChange={(val) => handleSliderChange('dynamicRange', val)}
               valueSuffix="dB"
             />
           </div>
        )}
      </div>
    </div>
  );
};

export default EQBandControl;
