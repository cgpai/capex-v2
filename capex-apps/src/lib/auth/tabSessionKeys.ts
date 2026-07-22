/** localStorage: epoch ms when all browser tabs became hidden. */
export const LS_TAB_HIDDEN_SINCE = 'capex.tab.hiddenSince';

/** Ephemeral key — set/remove to signal forced logout across tabs (storage event). */
export const LS_TAB_LOGOUT_SIGNAL = 'capex.tab.logoutSignal';

/** BroadcastChannel name for cross-tab session events. */
export const TAB_SESSION_CHANNEL = 'capex.tab.session';

/** localStorage: epoch ms when session was refreshed by another tab. */
export const LS_SESSION_REFRESHED_AT = 'capex.auth.sessionRefreshedAt';

/** Epoch ms when current login session started — ignore older tab-hidden timestamps. */
export const LS_SESSION_AUTH_SINCE = 'capex.auth.sessionSince';

import { TAB_HIDDEN_TIMEOUT_MS } from './authConstants';

export { TAB_HIDDEN_TIMEOUT_MS };

/** @deprecated Use TAB_HIDDEN_TIMEOUT_MS */
export const TAB_SESSION_TIMEOUT_MS = TAB_HIDDEN_TIMEOUT_MS;
