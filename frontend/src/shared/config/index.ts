// Empty origin keeps requests same-origin; tests set an absolute origin because Node cannot resolve relative URLs.
export const apiOrigin = import.meta.env.VITE_API_ORIGIN ?? '';

// Local development always runs on the synthetic mock; a production build opts in explicitly.
// The flag only adds explanatory copy and demo account hints.
export const isDemoStand = import.meta.env.DEV || import.meta.env.VITE_DEMO_STAND === '1';
export const demoEmailCode = isDemoStand ? (import.meta.env.VITE_DEMO_EMAIL_CODE ?? null) : null;
