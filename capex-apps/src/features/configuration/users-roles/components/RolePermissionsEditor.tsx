import React, { useCallback, useMemo, useState } from 'react';
import {
  DATA_OPERATION_LEVELS,
  SCREEN_PERMISSION_PAGES,
} from '@/lib/pagePermissions';
import {
  SCREEN_BUTTON_OPERATIONS,
  describePermissionCrud,
} from '@/lib/screenButtonOperations';
import { formatHierarchyDisplayLabel } from '@/lib/terminology';
import {
  Page,
  PAGE_TO_HIERARCHY_MAP,
  PERMISSION_LEVELS,
  type HierarchyLevel,
  type PermissionLevel,
  type UserRole,
} from '@/types';

export { DATA_OPERATION_LEVELS, SCREEN_PERMISSION_PAGES };

type BoardItem = {
  id: string;
  label: string;
  level: HierarchyLevel;
  subtitle?: string;
};

type RolePermissionsEditorProps = {
  selectedRole: UserRole;
  onUpdatePermission: (level: HierarchyLevel, permission: PermissionLevel) => void;
};

type EditorViewMode = 'board' | 'table';
type DragSource = 'screen' | 'crud' | 'button';

function getPermissionForRole(role: UserRole, level: HierarchyLevel): PermissionLevel {
  return role.permissions.find((p) => p.hierarchy === level)?.permission ?? 'Hide';
}

const PermissionBoard: React.FC<{
  title: string;
  description: string;
  items: BoardItem[];
  source: DragSource;
  getPermission: (level: HierarchyLevel) => PermissionLevel;
  onDrop: (level: HierarchyLevel, permission: PermissionLevel) => void;
}> = ({ title, description, items, source, getPermission, onDrop }) => {
  const [draggedLevel, setDraggedLevel] = useState<HierarchyLevel | null>(null);
  const [dragSource, setDragSource] = useState<DragSource | null>(null);

  const itemsByPermission = useMemo(() => {
    const map = new Map<PermissionLevel, BoardItem[]>();
    for (const p of PERMISSION_LEVELS) map.set(p, []);
    for (const item of items) {
      const perm = getPermission(item.level);
      map.get(perm)?.push(item);
    }
    return map;
  }, [items, getPermission]);

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, level: HierarchyLevel) => {
    e.dataTransfer.setData('hierarchyLevel', level);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedLevel(level);
    setDragSource(source);
  };

  const handleDragEnd = () => {
    setDraggedLevel(null);
    setDragSource(null);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, permission: PermissionLevel) => {
    e.preventDefault();
    const level = e.dataTransfer.getData('hierarchyLevel') as HierarchyLevel;
    if (!level || dragSource !== source) return;
    onDrop(level, permission);
    setDraggedLevel(null);
    setDragSource(null);
  };

  return (
    <section className="space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-siloam-text-primary">{title}</h4>
        <p className="text-xs text-siloam-text-secondary mt-0.5">{description}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        {PERMISSION_LEVELS.map((permission) => (
          <div
            key={`${source}-${permission}`}
            className="bg-siloam-bg border border-siloam-border rounded-lg p-3 min-h-[200px]"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleDrop(e, permission)}
          >
            <p className="text-xs font-semibold text-siloam-text-secondary uppercase mb-2">{permission}</p>
            <div className="space-y-2">
              {(itemsByPermission.get(permission) ?? []).map((item) => (
                <div
                  key={`${source}-${item.id}`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, item.level)}
                  onDragEnd={handleDragEnd}
                  className={`bg-siloam-surface border border-siloam-border rounded-md p-2.5 cursor-move ${
                    draggedLevel === item.level && dragSource === source ? 'opacity-50 ring-2 ring-siloam-blue/30' : ''
                  }`}
                >
                  <p className="text-sm font-semibold text-siloam-text-primary leading-snug">{item.label}</p>
                  {item.subtitle ? (
                    <p className="text-xs text-siloam-text-secondary mt-1">{item.subtitle}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export const RolePermissionsEditor: React.FC<RolePermissionsEditorProps> = ({
  selectedRole,
  onUpdatePermission,
}) => {
  const [viewMode, setViewMode] = useState<EditorViewMode>('board');

  const getPermission = useCallback(
    (level: HierarchyLevel) => getPermissionForRole(selectedRole, level),
    [selectedRole],
  );

  const screenRows = useMemo(
    () =>
      SCREEN_PERMISSION_PAGES.map((page) => {
        const level = PAGE_TO_HIERARCHY_MAP[page];
        const permission = getPermissionForRole(selectedRole, level);
        return {
          page,
          level,
          permission,
          menuVisible: permission !== 'Hide',
        };
      }),
    [selectedRole],
  );

  const crudRows = useMemo(
    () =>
      DATA_OPERATION_LEVELS.map((level) => ({
        level,
        permission: getPermissionForRole(selectedRole, level),
      })),
    [selectedRole],
  );

  const screenBoardItems: BoardItem[] = useMemo(
    () =>
      screenRows.map((row) => ({
        id: row.page,
        label: row.page,
        level: row.level,
        subtitle: `Level: ${formatHierarchyDisplayLabel(row.level)}`,
      })),
    [screenRows],
  );

  const crudBoardItems: BoardItem[] = useMemo(
    () =>
      crudRows.map((row) => ({
        id: row.level,
        label: formatHierarchyDisplayLabel(row.level),
        level: row.level,
      })),
    [crudRows],
  );

  const handleBoardDrop = (level: HierarchyLevel, permission: PermissionLevel) => {
    onUpdatePermission(level, permission);
  };

  return (
    <div className="bg-siloam-surface rounded-xl shadow-soft border border-siloam-border p-4 md:p-5 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 border-b border-siloam-border pb-4">
        <div>
          <h3 className="text-base font-semibold text-siloam-text-primary">Izin Role — {selectedRole.roleName}</h3>
          <p className="text-sm text-siloam-text-secondary mt-1">
            <strong>Akses Screen</strong> hanya mengontrol menu sidebar (buka halaman). Untuk edit data
            (mis. Budget Plan), set minimal <strong>View &amp; Update</strong> pada{' '}
            <strong>Akses Screen → Budget Network</strong>, atau modul <strong>Network</strong> /{' '}
            <strong>Budget</strong> di Hak Operasi Data, atau baris <strong>Budget Network</strong> di
            Aksi Button. Setelah ubah, klik <strong>Save Changes</strong>.
          </p>
        </div>
        <div
          className="inline-flex rounded-xl border border-siloam-border bg-siloam-bg p-1 shrink-0"
          role="tablist"
          aria-label="Mode tampilan izin"
        >
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'board'}
            onClick={() => setViewMode('board')}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              viewMode === 'board'
                ? 'bg-siloam-blue text-white shadow-sm'
                : 'text-siloam-text-secondary hover:text-siloam-text-primary'
            }`}
          >
            Board (drag)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'table'}
            onClick={() => setViewMode('table')}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              viewMode === 'table'
                ? 'bg-siloam-blue text-white shadow-sm'
                : 'text-siloam-text-secondary hover:text-siloam-text-primary'
            }`}
          >
            Tabel (edit)
          </button>
        </div>
      </div>

      {viewMode === 'board' ? (
        <div className="space-y-8">
          <PermissionBoard
            title="Akses Screen (Navigasi)"
            description="Satu kartu = satu halaman. Hide = tidak muncul di sidebar; View Only atau lebih = menu tampil sesuai izin."
            items={screenBoardItems}
            source="screen"
            getPermission={getPermission}
            onDrop={handleBoardDrop}
          />
          <PermissionBoard
            title="Hak Operasi Data (CRUD)"
            description="Geser modul data ke kolom izin operasi yang sesuai."
            items={crudBoardItems}
            source="crud"
            getPermission={getPermission}
            onDrop={handleBoardDrop}
          />
          <PermissionBoard
            title="Aksi Button per Screen"
            description="Izin tombol Create/Edit/Save per layar. FS Create/Input: set FS Update ≥ View, Update & Create (FC Unit)."
            items={SCREEN_BUTTON_OPERATIONS.map((row) => ({
              id: row.id,
              label: row.screenLabel,
              level: row.operationLevel,
              subtitle: row.buttonsDescription,
            }))}
            source="button"
            getPermission={getPermission}
            onDrop={handleBoardDrop}
          />
        </div>
      ) : (
        <div className="space-y-6">
          <section className="space-y-2">
            <h4 className="text-sm font-semibold text-siloam-text-primary">Akses Screen (Navigasi)</h4>
            <p className="text-xs text-siloam-text-secondary">
              Setiap baris = satu halaman. Hide menyembunyikan menu di sidebar untuk role ini.
            </p>
            <div className="border border-siloam-border rounded-lg overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[640px]">
                <thead className="bg-siloam-sidebar text-xs uppercase text-siloam-text-secondary">
                  <tr>
                    <th className="px-3 py-2.5">Halaman</th>
                    <th className="px-3 py-2.5">Level izin</th>
                    <th className="px-3 py-2.5">Akses role</th>
                    <th className="px-3 py-2.5">Menu sidebar</th>
                  </tr>
                </thead>
                <tbody>
                  {screenRows.map((row) => (
                    <tr key={`screen-${row.page}`} className="border-t border-siloam-border bg-siloam-surface">
                      <td className="px-3 py-2.5 font-medium text-siloam-text-primary">{row.page}</td>
                      <td className="px-3 py-2.5 text-siloam-text-secondary text-xs">{formatHierarchyDisplayLabel(row.level)}</td>
                      <td className="px-3 py-2.5">
                        <select
                          value={row.permission}
                          onChange={(e) =>
                            onUpdatePermission(row.level, e.target.value as PermissionLevel)
                          }
                          className="w-full max-w-xs border border-siloam-border rounded-lg px-2 py-1.5 bg-white text-sm"
                          aria-label={`Izin ${row.page}`}
                        >
                          {PERMISSION_LEVELS.map((p) => (
                            <option key={`screen-opt-${row.page}-${p}`} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`text-xs font-semibold px-2 py-1 rounded-full ${
                            row.menuVisible ? 'bg-siloam-green/10 text-siloam-green' : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {row.menuVisible ? 'Tampil' : 'Sembunyi'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-2">
            <h4 className="text-sm font-semibold text-siloam-text-primary">Hak Operasi Data (CRUD)</h4>
            <div className="border border-siloam-border rounded-lg overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-siloam-sidebar text-xs uppercase text-siloam-text-secondary">
                  <tr>
                    <th className="px-3 py-2.5">Modul data</th>
                    <th className="px-3 py-2.5">Izin operasi</th>
                  </tr>
                </thead>
                <tbody>
                  {crudRows.map((row) => (
                    <tr key={`crud-${row.level}`} className="border-t border-siloam-border bg-siloam-surface">
                      <td className="px-3 py-2.5 font-medium text-siloam-text-primary">{formatHierarchyDisplayLabel(row.level)}</td>
                      <td className="px-3 py-2.5">
                        <select
                          value={row.permission}
                          onChange={(e) =>
                            onUpdatePermission(row.level, e.target.value as PermissionLevel)
                          }
                          className="w-full max-w-xs border border-siloam-border rounded-lg px-2 py-1.5 bg-white text-sm"
                          aria-label={`Izin CRUD ${row.level}`}
                        >
                          {PERMISSION_LEVELS.map((p) => (
                            <option key={`crud-opt-${row.level}-${p}`} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-2">
            <h4 className="text-sm font-semibold text-siloam-text-primary">Aksi Button per Screen (CRUD)</h4>
            <p className="text-xs text-siloam-text-secondary">
              Atur tombol Create / Edit / Save per layar. Untuk <strong>Create &amp; input FS</strong>, set izin{' '}
              <strong>FS Update</strong> minimal ke &quot;View, Update &amp; Create&quot; (disarankan untuk role{' '}
              <strong>FC Unit</strong>).
            </p>
            <div className="border border-siloam-border rounded-lg overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[720px]">
                <thead className="bg-siloam-sidebar text-xs uppercase text-siloam-text-secondary">
                  <tr>
                    <th className="px-3 py-2.5">Screen / Button</th>
                    <th className="px-3 py-2.5">Level izin</th>
                    <th className="px-3 py-2.5">Izin button</th>
                    <th className="px-3 py-2.5">Aksi yang diizinkan</th>
                  </tr>
                </thead>
                <tbody>
                  {SCREEN_BUTTON_OPERATIONS.map((row) => {
                    const permission = getPermissionForRole(selectedRole, row.operationLevel);
                    return (
                      <tr key={`btn-${row.id}`} className="border-t border-siloam-border bg-siloam-surface">
                        <td className="px-3 py-2.5">
                          <p className="font-medium text-siloam-text-primary">{row.screenLabel}</p>
                          <p className="text-xs text-siloam-text-secondary mt-0.5">{row.buttonsDescription}</p>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-siloam-text-secondary">{formatHierarchyDisplayLabel(row.operationLevel)}</td>
                        <td className="px-3 py-2.5">
                          <select
                            value={permission}
                            onChange={(e) =>
                              onUpdatePermission(row.operationLevel, e.target.value as PermissionLevel)
                            }
                            className="w-full max-w-xs border border-siloam-border rounded-lg px-2 py-1.5 bg-white text-sm"
                            aria-label={`Izin button ${row.screenLabel}`}
                          >
                            {PERMISSION_LEVELS.map((p) => (
                              <option key={`btn-opt-${row.id}-${p}`} value={p}>
                                {p}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-siloam-text-secondary">
                          {describePermissionCrud(permission)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
