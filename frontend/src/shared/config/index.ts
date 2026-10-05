// Empty origin keeps requests same-origin; tests set an absolute origin because Node cannot resolve relative URLs.
export const apiOrigin = import.meta.env.VITE_API_ORIGIN ?? '';

// A public demonstration stand runs on the synthetic mock; this flag only adds explanatory copy.
export const isDemoStand = import.meta.env.VITE_DEMO_STAND === '1';
export const demoEmailCode = isDemoStand ? (import.meta.env.VITE_DEMO_EMAIL_CODE ?? null) : null;
