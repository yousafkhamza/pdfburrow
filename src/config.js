// Build-time settings. All can be overridden with environment variables (GitHub repository
// variables), so moving to a custom domain or switching on ads needs no code change.
// See docs/ADSENSE.md.

const env = (typeof process !== 'undefined' && process.env) || {};
const clean = (value) => (typeof value === 'string' ? value.trim() : '');

export const SITE_NAME = 'pdfburrow';
export const AUTHOR = 'Yousaf K Hamza';
export const AUTHOR_URL = 'https://yousafkhamza.github.io';
export const REPO_URL = 'https://github.com/yousafkhamza/pdfburrow';
export const UPDATED = '2026-11-25';

/** Public URL without a trailing slash. */
export const SITE_URL = (clean(env.SITE_URL) || 'https://yousafkhamza.github.io/pdfburrow').replace(/\/+$/, '');

/** "/pdfburrow/" on github.io, "/" on a custom domain. */
export const BASE_PATH = new URL(`${SITE_URL}/`).pathname;

export const ADSENSE_CLIENT = clean(env.ADSENSE_CLIENT);
export const ADS_ENABLED = clean(env.ADS_ENABLED) === 'true' && /^ca-pub-\d{10,20}$/.test(ADSENSE_CLIENT);
export const AD_SLOTS = {
  tool: clean(env.ADSENSE_SLOT_TOOL),
  guide: clean(env.ADSENSE_SLOT_GUIDE),
  home: clean(env.ADSENSE_SLOT_HOME),
};
export const GOOGLE_SITE_VERIFICATION = clean(env.GOOGLE_SITE_VERIFICATION);
