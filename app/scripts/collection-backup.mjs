import {
  createCollectionBackup,
  verifyCollectionBackup,
  restoreCollectionBackup,
} from './lib/collection-backup.mjs';
const [action, ...args] = process.argv.slice(2);
const values = new Map();
const flags = new Set(['remote', 'allow-missing-covers', 'database-only']);
try {
  for (let i = 0; i < args.length; i++) {
    const key = args[i].replace(/^--/, '');
    if (
      !args[i].startsWith('--') ||
      !['output', 'database', 'covers', 'bucket', 'backup', ...flags].includes(
        key,
      )
    )
      throw new Error('Unknown backup option.');
    const value = flags.has(key) ? true : args[++i];
    if (
      value === undefined ||
      (typeof value === 'string' && value.startsWith('--'))
    )
      throw new Error('Missing option value.');
    values.set(key, [...(values.get(key) ?? []), value]);
  }
  const get = (key) => values.get(key)?.at(-1);
  const options = { allowMissingCovers: get('allow-missing-covers') === true };
  if (action === 'create') {
    const result = await createCollectionBackup({
      output: get('output'),
      databasePath: get('database'),
      coversRoots: values.get('covers') ?? [],
      bucket: get('bucket'),
      remote: get('remote') === true,
      databaseOnly: get('database-only') === true,
      onProgress: (message) => console.log(message),
      ...options,
    });
    console.log(
      `Backup saved: ${result.path}\nCoverage: ${result.manifest.coverage}; ${result.manifest.covers.length} cover files; ${result.manifest.missingCovers.length} missing.`,
    );
  } else if (action === 'verify') {
    if (!get('backup')) throw new Error('Supply --backup DIRECTORY.');
    const manifest = verifyCollectionBackup(get('backup'), options);
    console.log(
      `Backup verified: ${manifest.totals.copies} copies; ${manifest.covers.length} cover files; coverage ${manifest.coverage}.`,
    );
  } else if (action === 'restore') {
    if (!get('backup')) throw new Error('Supply --backup DIRECTORY.');
    console.log(
      `Recovered copy created: ${restoreCollectionBackup(get('backup'), get('output'), options)}`,
    );
  } else
    throw new Error('Use create, verify or restore. See docs/operations.md.');
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Backup operation failed.',
  );
  process.exitCode = 1;
}
