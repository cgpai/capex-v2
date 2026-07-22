'use client';

import React from 'react';
import type { DuplicateAssetHit, DuplicateProjectHit } from '../../../services/duplicateDetectionApi';

type DuplicateSuggestionPanelProps =
  | {
      entityType: 'project';
      hits: DuplicateProjectHit[];
      isSearching: boolean;
      huId?: string | null;
      onUseExisting: (hit: DuplicateProjectHit) => void;
      onCreateNew: () => void;
      onLoadMore?: () => void;
      hasMore?: boolean;
    }
  | {
      entityType: 'asset';
      hits: DuplicateAssetHit[];
      isSearching: boolean;
      projectId?: string | null;
      huId?: string | null;
      onUseExisting: (hit: DuplicateAssetHit) => void;
      onCreateNew: () => void;
      onLoadMore?: () => void;
      hasMore?: boolean;
    };

export const DuplicateSuggestionPanel: React.FC<DuplicateSuggestionPanelProps> = (props) => {
  const { isSearching, onCreateNew, onLoadMore, hasMore } = props;
  const projectHits = props.entityType === 'project' ? props.hits : [];
  const assetHits = props.entityType === 'asset' ? props.hits : [];

  const hitCount = props.entityType === 'project' ? projectHits.length : assetHits.length;
  if (!isSearching && hitCount === 0) return null;

  const title =
    props.entityType === 'project' ? 'Similar Projects Found' : 'Similar Assets Found';

  const canUseProject = (hit: DuplicateProjectHit) =>
    !props.huId || hit.hospitalUnitId === props.huId;

  const canUseAsset = (hit: DuplicateAssetHit) =>
    props.entityType === 'asset' && (!props.projectId || hit.projectId === props.projectId);

  return (
    <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50/80 p-4 text-sm shadow-sm">
      <div className="mb-3 flex items-center gap-2 font-semibold text-amber-900">
        <span aria-hidden>⚠</span>
        <span>{title}</span>
        {isSearching ? <span className="text-xs font-normal text-amber-700">Searching…</span> : null}
      </div>

      {hitCount > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-amber-200 bg-white">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-amber-100/60 text-amber-900">
              {props.entityType === 'project' ? (
                <tr>
                  <th className="px-3 py-2 font-semibold">Project Code</th>
                  <th className="px-3 py-2 font-semibold">Project Name</th>
                  <th className="px-3 py-2 font-semibold">Hospital Unit</th>
                  <th className="px-3 py-2 font-semibold" />
                </tr>
              ) : (
                <tr>
                  <th className="px-3 py-2 font-semibold">Asset Code</th>
                  <th className="px-3 py-2 font-semibold">Asset Name</th>
                  <th className="px-3 py-2 font-semibold">Category</th>
                  <th className="px-3 py-2 font-semibold">Project</th>
                  <th className="px-3 py-2 font-semibold" />
                </tr>
              )}
            </thead>
            <tbody>
              {props.entityType === 'project'
                ? projectHits.map((hit) => (
                    <tr key={hit.id} className="border-t border-amber-100">
                      <td className="px-3 py-2 font-mono font-bold text-siloam-text-primary">
                        {hit.projectCode}
                      </td>
                      <td className="px-3 py-2">{hit.projectName}</td>
                      <td className="px-3 py-2 text-siloam-text-secondary">{hit.huName ?? '—'}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          disabled={!canUseProject(hit)}
                          title={
                            canUseProject(hit)
                              ? 'Use this project'
                              : 'Project belongs to a different hospital unit'
                          }
                          onClick={() => props.onUseExisting(hit)}
                          className="rounded-lg bg-siloam-blue px-2 py-1 text-xs font-semibold text-white hover:bg-siloam-blue/90 disabled:cursor-not-allowed disabled:bg-gray-300"
                        >
                          Use Existing
                        </button>
                      </td>
                    </tr>
                  ))
                : assetHits.map((hit) => (
                    <tr key={hit.id} className="border-t border-amber-100">
                      <td className="px-3 py-2 font-mono font-bold text-siloam-text-primary">
                        {hit.assetCode}
                      </td>
                      <td className="px-3 py-2">{hit.assetName}</td>
                      <td className="px-3 py-2">{hit.categoryName ?? '—'}</td>
                      <td className="px-3 py-2 text-siloam-text-secondary">
                        {hit.projectCode ? `${hit.projectCode}` : hit.projectName ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          disabled={!canUseAsset(hit)}
                          title={
                            canUseAsset(hit)
                              ? 'Use this asset'
                              : 'Asset belongs to a different project'
                          }
                          onClick={() => props.onUseExisting(hit)}
                          className="rounded-lg bg-siloam-blue px-2 py-1 text-xs font-semibold text-white hover:bg-siloam-blue/90 disabled:cursor-not-allowed disabled:bg-gray-300"
                        >
                          Use Existing
                        </button>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {hasMore && onLoadMore ? (
        <button
          type="button"
          onClick={onLoadMore}
          className="mt-2 text-xs font-semibold text-siloam-blue hover:underline"
        >
          Load more matches
        </button>
      ) : null}

      <p className="mt-3 text-amber-900">
        Would you like to use an existing {props.entityType === 'project' ? 'Project' : 'Asset'}{' '}
        instead?
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onCreateNew}
          className="rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
        >
          Create New
        </button>
      </div>
    </div>
  );
};
