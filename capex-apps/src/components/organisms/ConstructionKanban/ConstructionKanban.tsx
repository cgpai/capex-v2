
import React from 'react';
import { EnrichedAsset, BDDPriority, AssetTagConfig } from '../../../types';
import { formatCurrency } from '../../../lib/formatter';
import { ProgressBar } from '../../molecules/ProgressBar/ProgressBar';

interface ConstructionKanbanProps {
    assets: EnrichedAsset[];
    tags: AssetTagConfig[];
    onDropOnColumn: (assetId: string, tagId: string | null) => void;
    onAssetClick: (asset: EnrichedAsset) => void;
    canEditUnassigned?: boolean; // Whether user can edit UNASSIGNED bucket
}

interface KanbanColumnProps {
    title: string;
    assets: EnrichedAsset[];
    tagId: string | null;
    onDrop: (assetId: string, tagId: string | null) => void;
    colorClass: string;
    onAssetClick: (asset: EnrichedAsset) => void;
    isDisabled?: boolean; // Whether this column is disabled for drag-drop
}

const AssetCard: React.FC<{ asset: EnrichedAsset; onClick: () => void }> = ({ asset, onClick }) => {
    const handleDragStart = (e: React.DragEvent) => {
        e.dataTransfer.setData('assetId', asset.id);
        e.dataTransfer.effectAllowed = 'move';
    };

    return (
        <div
            draggable
            onDragStart={handleDragStart}
            onClick={onClick}
            className="bg-white p-4 rounded-xl border border-siloam-border shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition-all space-y-3 group"
        >
            <div>
                <h4 className="font-bold text-siloam-text-primary line-clamp-2 group-hover:text-siloam-blue transition-colors">{asset.assetName}</h4>
                <p className="text-xs text-siloam-text-secondary mt-1 line-clamp-1">{asset.projectCode} - {asset.projectName}</p>
            </div>
            
            <div className="flex justify-between items-center text-xs">
                <span className="bg-siloam-sidebar px-2 py-1 rounded text-siloam-text-primary font-medium truncate max-w-[120px]" title={asset.huName}>
                    {asset.huName}
                </span>
                <span className="font-mono font-semibold">{formatCurrency(asset.budgetPlan)}</span>
            </div>

            <div>
                <div className="flex justify-between text-xs mb-1">
                    <span className="text-siloam-text-secondary">Progress</span>
                    <span className="font-bold">{Math.round(asset.completionRate || 0)}%</span>
                </div>
                <ProgressBar value={asset.completionRate || 0} className="h-1.5" />
            </div>
        </div>
    );
};

const KanbanColumn: React.FC<KanbanColumnProps> = ({ title, assets, tagId, onDrop, colorClass, onAssetClick, isDisabled = false }) => {
    const [isDragOver, setIsDragOver] = React.useState(false);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(true);
    };

    const handleDragLeave = () => {
        setIsDragOver(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        if (isDisabled) return; // Don't allow drop if disabled
        const assetId = e.dataTransfer.getData('assetId');
        if (assetId) {
            onDrop(assetId, tagId);
        }
    };

    return (
        <div
            className={`flex-1 min-w-[280px] flex flex-col bg-siloam-bg rounded-xl border-2 transition-colors duration-200 h-full ${isDisabled ? 'opacity-60' : ''} ${isDragOver && !isDisabled ? 'border-siloam-blue bg-siloam-blue/5' : 'border-transparent'}`}
            onDragOver={isDisabled ? undefined : handleDragOver}
            onDragLeave={isDisabled ? undefined : handleDragLeave}
            onDrop={isDisabled ? undefined : handleDrop}
        >
            <div className={`p-3 rounded-t-xl border-b border-siloam-border/50 flex justify-between items-center ${colorClass}`}>
                <h3 className="font-bold text-sm uppercase tracking-wide">{title}</h3>
                <span className="bg-white/50 text-xs font-bold px-2 py-0.5 rounded-full min-w-[1.5rem] text-center">
                    {assets.length}
                </span>
            </div>
            <div className="p-3 space-y-3 overflow-y-auto flex-1 custom-scrollbar">
                {assets.map(asset => (
                    <AssetCard key={asset.id} asset={asset} onClick={() => onAssetClick(asset)} />
                ))}
                {assets.length === 0 && (
                    <div className="text-center py-8 text-siloam-text-secondary text-xs italic border-2 border-dashed border-siloam-border/50 rounded-lg">
                        Drop items here
                    </div>
                )}
            </div>
        </div>
    );
};

export const ConstructionKanban: React.FC<ConstructionKanbanProps> = ({ assets, tags, onDropOnColumn, onAssetClick, canEditUnassigned = true }) => {
    
    // Group assets by tagId
    const assetsByTag = React.useMemo(() => {
        const groups: Record<string, EnrichedAsset[]> = {};
        // Initialize 'unassigned'
        groups['unassigned'] = [];
        // Initialize for all tags
        tags.forEach(tag => groups[tag.id] = []);

        assets.forEach(asset => {
            if (asset.bddPriority && groups[asset.bddPriority]) {
                groups[asset.bddPriority].push(asset);
            } else {
                groups['unassigned'].push(asset);
            }
        });
        return groups;
    }, [assets, tags]);

    return (
        <div className="flex gap-4 h-full overflow-x-auto pb-2 px-2">
            {/* Always show Unassigned first */}
            <KanbanColumn
                title="UNASSIGNED"
                assets={assetsByTag['unassigned']}
                tagId={null}
                onDrop={canEditUnassigned ? onDropOnColumn : () => {}} // Disable drop if not allowed
                colorClass="bg-gray-200 text-gray-700"
                onAssetClick={onAssetClick}
                isDisabled={!canEditUnassigned}
            />
            
            {/* Dynamic Columns based on Tags */}
            {tags.map(tag => (
                <KanbanColumn
                    key={tag.id}
                    title={tag.name}
                    assets={assetsByTag[tag.id] || []}
                    tagId={tag.id}
                    onDrop={onDropOnColumn}
                    colorClass={tag.color || 'bg-blue-100 text-blue-800'}
                    onAssetClick={onAssetClick}
                />
            ))}
        </div>
    );
};
