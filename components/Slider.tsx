
import React from 'react';

interface SliderProps {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  className?: string;
  valueSuffix?: string;
}

const Slider: React.FC<SliderProps> = ({
  label,
  min,
  max,
  step,
  value,
  onChange,
  className = '',
  valueSuffix = '',
}) => {
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onChange(parseFloat(event.target.value));
  };

  const handleTextChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const num = parseFloat(event.target.value);
    if (!isNaN(num) && num >= min && num <= max) {
      onChange(num);
    } else if (event.target.value === '' || event.target.value === '-') {
      // Allow temporary empty or '-' input for better UX
      onChange(value); // Don't change actual value yet
    }
  };

  const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    let num = parseFloat(event.target.value);
    if (isNaN(num)) {
      num = value; // Revert to current value if invalid
    }
    onChange(Math.max(min, Math.min(max, num))); // Clamp to min/max
  };

  return (
    <div className={`flex flex-col items-center gap-1 ${className}`}>
      <label className="text-xs text-gray-400 font-medium whitespace-nowrap">{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleChange}
        className="w-full h-2 bg-gray-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-md
                   [&::-moz-range-thumb]:bg-blue-500 [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full"
      />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value.toFixed(label === 'Freq' ? 0 : 1)}
        onChange={handleTextChange}
        onBlur={handleBlur}
        className="w-16 h-6 bg-gray-800 text-gray-200 text-center text-xs rounded-sm border border-gray-700 focus:outline-none focus:border-blue-500 transition-colors"
      />
      {valueSuffix && <span className="text-xs text-gray-500">{valueSuffix}</span>}
    </div>
  );
};

export default Slider;
