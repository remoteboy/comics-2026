/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly COMICS_DB_PATH?: string;
  readonly LEGACY_IMAGE_ROOT?: string;
  readonly ZAP_SUPABASE_URL?: string;
  readonly ZAP_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly ZAP_ACCESS_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
