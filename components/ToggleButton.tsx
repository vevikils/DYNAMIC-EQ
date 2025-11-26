
import React from 'react';

interface ToggleButtonProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  className?: string;
  color?: string; // Tailwind color class, e.g., 'blue-500'
}

const ToggleButton: React.FC<ToggleButtonProps> = ({
  checked,
  onChange,
  label,
  className = '',
  color = 'blue-500',
}) => {
  const id = React.useId();
  const activeBgClass = checked ? `bg-${color}` : 'bg-gray-700';
  const toggleTranslateClass = checked ? 'translate-x-full' : 'translate-x-0';

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      {label && <label htmlFor={id} className="text-xs text-gray-400 font-medium cursor-pointer">{label}</label>}
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex flex-shrink-0 h-4 w-8 border-2 border-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-${color} focus:ring-offset-gray-900 ${activeBgClass}`}
      >
        <span
          aria-hidden="true"
          className={`pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow transform ring-0 transition ease-in-out duration-200 ${toggleTranslateClass}`}
        ></span>
      </button>
    </div>
  );
};

export default ToggleButton;
