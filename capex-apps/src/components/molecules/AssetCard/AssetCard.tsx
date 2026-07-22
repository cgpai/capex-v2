import React from 'react';
import { EnrichedAsset } from '../../../types';
import { ProgressBar } from '../ProgressBar/ProgressBar';

interface AssetCardProps {
    asset: EnrichedAsset;
    isSelected: boolean;
    onClick: () => void;
    onMouseEnter?: () => void;
}

export const AssetCard: React.FC<AssetCardProps> = ({ asset, isSelected, onClick, onMouseEnter }) => {
    return (
        <button
            onClick={onClick}
            onMouseEnter={onMouseEnter}
            className={`
                w-full text-left p-4 rounded-xl border transition-all duration-200
                ${isSelected 
                    ? 'bg-siloam-blue/5 border-siloam-blue shadow-lg' 
                    : 'bg-siloam-surface border-siloam-border hover:border-siloam-blue/50 hover:shadow-md'
                }
            `}
        >
            <div className="flex justify-between items-start gap-2">
                <h3 className="font-bold text-siloam-text-primary pr-2 flex items-center gap-2">
                    {asset.assetName}
                    {asset.actionableTaskCount && asset.actionableTaskCount > 0 && (
                        <span
                            className="bg-siloam-blue text-white text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full"
                            title={`${asset.actionableTaskCount} open tasks for you`}
                        >
                            {asset.actionableTaskCount}
                        </span>
                    )}
                </h3>
                <div className="flex-shrink-0 text-right">
                    <p className="text-xs font-semibold text-siloam-text-secondary">{asset.huName}</p>
                    <p className="text-xs text-siloam-text-secondary">{asset.archetypeName}</p>
                </div>
            </div>
            <p className="text-xs text-siloam-text-secondary mt-1">{asset.projectName}</p>

            <div className="mt-4">
                <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-siloam-text-secondary">Completion</span>
                    <span className="text-xs font-semibold text-siloam-text-primary">{Math.round(asset.completionRate || 0)}%</span>
                </div>
                <ProgressBar value={asset.completionRate || 0} />
            </div>
        </button>
    );
};

AssetCard.displayName = 'AssetCard';
