/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_ORIGIN?: string;
  readonly VITE_DEMO_STAND?: string;
  readonly VITE_DEMO_EMAIL_CODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
