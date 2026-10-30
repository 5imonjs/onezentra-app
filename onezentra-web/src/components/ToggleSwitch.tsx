'use client';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  description?: string;
}

const sizeClasses = {
  sm: { track: 'w-8 h-4.5', thumb: 'w-3.5 h-3.5', translate: 'translate-x-3.5' },
  md: { track: 'w-10 h-5.5', thumb: 'w-4.5 h-4.5', translate: 'translate-x-4.5' },
  lg: { track: 'w-12 h-6.5', thumb: 'w-5.5 h-5.5', translate: 'translate-x-5.5' },
};

export default function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
  size = 'md',
  label,
  description,
}: ToggleSwitchProps) {
  const s = sizeClasses[size];

  return (
    <label className={`inline-flex items-center gap-3 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label || undefined}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`
          relative inline-flex items-center rounded-full transition-all duration-200 ease-in-out min-w-11 min-h-11 p-[10px]
          ${s.track}
          ${checked ? 'bg-primary-600 shadow-sm shadow-primary-600/30' : 'bg-gray-200'}
          ${disabled ? '' : 'hover:shadow-md'}
          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600
        `}
      >
        <span
          className={`
            inline-block rounded-full bg-white shadow-sm transform transition-transform duration-200 ease-in-out
            ${s.thumb}
            ${checked ? s.translate : 'translate-x-0.5'}
          `}
          aria-hidden="true"
        />
      </button>
      {(label || description) && (
        <div className="flex flex-col">
          {label && <span className="text-sm font-medium text-gray-700">{label}</span>}
          {description && <span className="text-xs text-muted-foreground">{description}</span>}
        </div>
      )}
    </label>
  );
}
