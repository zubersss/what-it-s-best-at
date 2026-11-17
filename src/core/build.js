// Build stamp injected by Vite (see vite.config.js).
/* global __BUILD__ */
export const BUILD = typeof __BUILD__ !== 'undefined' ? __BUILD__ : { commit: 'dev', time: '' };
