export interface RuntimeConfig {
  databasePath: string;
  legacyImageRoot?: string;
}

export function runtimeConfig(): RuntimeConfig {
  return {
    databasePath:
      import.meta.env.COMICS_DB_PATH ?? '../output/comics.d1.sqlite',
    legacyImageRoot: import.meta.env.LEGACY_IMAGE_ROOT,
  };
}
