import React from 'react';

interface SlicerPanelProps {
  title: string;
  options: string[];
  selectedOption: string | null;
  onSelectOption: (option: string | null) => void;
}

const SlicerButton: React.FC<{ label: string; isSelected: boolean; onClick: () => void }> = ({ label, isSelected, onClick }) => (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap ${
        isSelected
          ? 'bg-siloam-blue text-white shadow-soft'
          : 'bg-siloam-surface text-siloam-text-secondary hover:bg-siloam-border hover:text-siloam-text-primary'
      }`}
    >
      {label}
    </button>
  );

export const SlicerPanel: React.FC<SlicerPanelProps> = ({ title, options, selectedOption, onSelectOption }) => {
  return (
    <div>
      <h4 className="text-sm font-semibold text-siloam-text-secondary mb-2">{title}</h4>
      <div className="flex items-center gap-2 flex-wrap">
        <SlicerButton
          label="All"
          isSelected={selectedOption === null}
          onClick={() => onSelectOption(null)}
        />
        {options.map(option => (
          <SlicerButton
            key={option}
            label={option}
            isSelected={selectedOption === option}
            onClick={() => onSelectOption(selectedOption === option ? null : option)}
          />
        ))}
      </div>
    </div>
  );
};
