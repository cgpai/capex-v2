
import React from 'react';
import { Page, User, UserRole } from '../../../types';
import type { NavItemConfig } from '../../../constants';
import { getPrimaryRoleDisplayName } from '../../../lib/userRoleResolution';
import { useAuthStore } from '../../../stores/authStore';

const SIDEBAR_COLLAPSED_KEY = 'capex-sidebar-collapsed';

interface NavItemProps {
  icon: React.ReactElement<React.SVGProps<SVGSVGElement>>;
  label: Page;
  isActive: boolean;
  isCollapsed: boolean;
  onClick: () => void;
  onPrefetch?: () => void;
}

const NavItem: React.FC<NavItemProps> = ({ icon, label, isActive, isCollapsed, onClick, onPrefetch }) => (
  <li
    className={`flex items-center rounded-xl cursor-pointer transition-colors ${
      isCollapsed ? 'justify-center p-2.5 my-1' : 'p-3 my-1'
    } ${
      isActive
        ? 'bg-white text-[#4f39f6] shadow-soft'
        : 'text-white/85 hover:bg-white/15 hover:text-white'
    }`}
    onClick={onClick}
    onMouseEnter={onPrefetch}
    onFocus={onPrefetch}
    role="menuitem"
    aria-current={isActive ? 'page' : undefined}
    title={isCollapsed ? label : undefined}
  >
    {React.cloneElement(icon, {
      className: isCollapsed ? 'h-6 w-6' : 'h-6 w-6 mr-3',
      'aria-hidden': true,
    })}
    {!isCollapsed && <span className="font-medium truncate">{label}</span>}
  </li>
);
NavItem.displayName = 'NavItem';

interface AppBrandProps {
  isCollapsed: boolean;
}

const AppBrand: React.FC<AppBrandProps> = ({ isCollapsed }) => (
  <div
    className={`bg-white/95 rounded-xl shadow-soft mb-4 flex items-center justify-center select-none ${
      isCollapsed ? 'p-2 min-h-[2.5rem]' : 'p-4 min-h-[4rem]'
    }`}
  >
    {isCollapsed ? (
      <span className="text-lg font-bold text-[#4f39f6] tracking-tight" title="Capex Pro">
        CP
      </span>
    ) : (
      <span className="text-xl md:text-2xl font-bold text-[#4f39f6] tracking-tight">
        Capex Pro
      </span>
    )}
  </div>
);
AppBrand.displayName = 'AppBrand';

const CloseIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const ChevronLeftIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
  </svg>
);

const ChevronRightIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
);

const ProfileIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const LogoutIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
  </svg>
);

interface SidebarProps {
  activePage: Page;
  onNavigate: (page: Page) => void;
  /** Prefetch rute Next.js + data saat hover/fokus menu (nav terasa instan). */
  onNavItemPrefetch?: (page: Page) => void;
  currentUser: User | null;
  /** Item navigasi yang sudah difilter izin role (dihitung di App). */
  visibleNavItems: readonly NavItemConfig[];
  showProfileNav: boolean;
  allRoles: UserRole[];
  /** true saat assignments/role matrix belum siap — skeleton menu, bukan empty deny. */
  navLoading?: boolean;
  className?: string;
  isOpen: boolean;
  onClose: () => void;
  onLogout?: () => void;
}

function readCollapsedPreference(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
}

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = React.useState(false);

  React.useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 768px)');
    const update = () => setIsDesktop(mediaQuery.matches);
    update();
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, []);

  return isDesktop;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activePage,
  onNavigate,
  onNavItemPrefetch,
  currentUser,
  visibleNavItems,
  showProfileNav,
  allRoles,
  navLoading = false,
  className,
  isOpen,
  onClose,
  onLogout,
}) => {
  const isDesktop = useIsDesktop();
  const [isCollapsed, setIsCollapsed] = React.useState(false);

  React.useEffect(() => {
    setIsCollapsed(readCollapsedPreference());
  }, []);

  const toggleCollapsed = React.useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      return next;
    });
  }, []);

  const initials = React.useMemo(() => {
    const name = (currentUser?.username || '').trim();
    if (!name) return 'U';
    const parts = name.split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] || '';
    const second = (parts.length > 1 ? parts[1]?.[0] : parts[0]?.[1]) || '';
    return (first + second).toUpperCase() || 'U';
  }, [currentUser?.username]);

  const authRoles = useAuthStore((s) => s.roles);
  const roleLabel = getPrimaryRoleDisplayName(currentUser, allRoles, authRoles);
  const showCollapsed = isCollapsed && isDesktop;

  return (
    <div className={`relative shrink-0 ${className ?? ''}`}>
      <aside
        className={`bg-[#4f39f6] shadow-lg flex flex-col border-r border-[#3e2dd0] z-50 h-full
          transition-[width,transform,padding] duration-300 ease-in-out
          fixed inset-y-0 left-0 w-64 p-4
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          md:relative md:translate-x-0
          ${showCollapsed ? 'md:w-[4.5rem] md:p-2' : 'md:w-64 md:p-4'}`}
      >
        <div className="shrink-0">
          <div className="flex justify-between items-center">
            <AppBrand isCollapsed={showCollapsed} />
            <button
              onClick={onClose}
              className="p-2 md:hidden"
              aria-label="Close navigation menu"
            >
              <CloseIcon />
            </button>
          </div>
        </div>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden" aria-label="Main Navigation">
        <ul role="menu">
          {navLoading ? (
            <li className="space-y-2 px-1 py-2" aria-busy="true" aria-label="Memuat menu">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`rounded-xl bg-white/15 animate-pulse ${
                    showCollapsed ? 'h-10 w-10 mx-auto' : 'h-10 w-full'
                  }`}
                />
              ))}
            </li>
          ) : (
            visibleNavItems.map((item) => (
              <NavItem
                key={item.label}
                icon={item.icon}
                label={item.label}
                isActive={activePage === item.label}
                isCollapsed={showCollapsed}
                onClick={() => onNavigate(item.label)}
                onPrefetch={() => onNavItemPrefetch?.(item.label)}
              />
            ))
          )}
        </ul>
      </nav>

      <div className="mt-auto pt-4 border-t border-white/20">
        <div className={`flex flex-col ${showCollapsed ? 'items-center space-y-2' : 'space-y-3'}`}>
          {currentUser && (
            <div
              className={`flex items-center rounded-lg bg-white/10 border border-white/20 ${
                showCollapsed ? 'justify-center p-2' : 'p-2'
              }`}
              title={showCollapsed ? `${currentUser.username} — ${roleLabel}` : undefined}
            >
              <div
                aria-label="User initials"
                className={`w-8 h-8 rounded-full border border-white/40 shadow-sm flex-shrink-0 bg-white text-[#4f39f6] flex items-center justify-center font-bold text-xs select-none ${
                  showCollapsed ? '' : 'mr-2'
                }`}
              >
                {initials}
              </div>
              {!showCollapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">
                    {currentUser.username}
                  </p>
                  <p className="text-xs text-white/75 truncate">
                    {roleLabel}
                  </p>
                </div>
              )}
            </div>
          )}

          {showProfileNav && (
            <button
              onClick={() => onNavigate(Page.Profile)}
              title={showCollapsed ? 'My Profile' : undefined}
              className={`flex items-center text-sm font-medium rounded-lg transition-colors ${
                showCollapsed ? 'justify-center p-2.5 w-full' : 'justify-start w-full px-3 py-2'
              } ${
                activePage === Page.Profile
                  ? 'bg-white text-[#4f39f6]'
                  : 'text-white/85 hover:bg-white/15 hover:text-white'
              }`}
            >
              <ProfileIcon />
              {!showCollapsed && <span className="ml-2">My Profile</span>}
            </button>
          )}

          {onLogout && (
            <button
              onClick={onLogout}
              title={showCollapsed ? 'Logout' : undefined}
              className={`flex items-center text-sm font-medium rounded-lg text-white/90 hover:bg-white/15 hover:text-white transition-colors ${
                showCollapsed ? 'justify-center p-2.5 w-full' : 'justify-start w-full px-3 py-2'
              }`}
              aria-label="Logout"
            >
              <LogoutIcon />
              {!showCollapsed && <span className="ml-2">Logout</span>}
            </button>
          )}
        </div>
      </div>
    </aside>

      <button
        type="button"
        onClick={toggleCollapsed}
        className={`hidden md:flex absolute z-[60] items-center justify-center
          w-7 h-9 rounded-r-lg shadow-md
          bg-white text-[#4f39f6] border border-[#3e2dd0]/30 border-l-0
          hover:bg-[#4f39f6] hover:text-white hover:border-[#4f39f6]
          transition-colors duration-200
          right-0 translate-x-full
          ${showCollapsed ? 'top-3' : 'top-5'}`}
        aria-label={showCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={showCollapsed ? 'Perluas sidebar' : 'Susutkan sidebar'}
      >
        {showCollapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
      </button>
    </div>
  );
};

Sidebar.displayName = 'Sidebar';
