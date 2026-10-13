import { catalogIdentitySql } from '@/features/catalog/repository';
import { database } from '@/db';
import type { MutationDatabase, MutationStatement } from '@/db/database';
import { coverStorage } from '@/covers/runtime';
import type { CoverStorage, UploadedCover } from '@/covers/upload';
import { getVariant, listVariantCredits } from './variant.repository';
import { formInteger, formText, validRequestId } from './write-form';

export class MetadataEditConflict extends Error {
  constructor() {
    super(
      'This comic changed while you were editing. Reload its latest details before saving.',
    );
  }
}
export interface MetadataEditInput {
  requestId: string;
  variantId: number;
  expectedVersion: number;
  variantName: string;
  storyTitle: string | null;
  firstAppearanceOf: string | null;
  details: string | null;
  publisherName: string | null;
  coverPriceCents: number | null;
  credits: { name: string; role: string | null }[];
}
export async function getEditableMetadata(
  id: number,
  db: MutationDatabase = database(),
) {
  const variant = await getVariant(id, db);
  if (!variant) return undefined;
  const [revision, credits] = await Promise.all([
    db.get<{ editVersion: number }>(
      'SELECT edit_version AS editVersion FROM variants WHERE id = ?',
      [id],
    ),
    listVariantCredits(id, db),
  ]);
  return { ...variant, editVersion: revision!.editVersion, credits };
}
export function metadataFromForm(
  data: FormData,
  variantId: number,
): MetadataEditInput {
  const text = (name: string, limit: number) => {
    const value = formText(data, name);
    if (value.length > limit) throw new Error(`${name} is too long.`);
    return value || null;
  };
  const coverPrice = formText(data, 'coverPrice');
  if (coverPrice && !/^\d+(\.\d{1,2})?$/.test(coverPrice))
    throw new Error(
      'Cover price must be a non-negative amount with up to two decimal places.',
    );
  const [dollars, fraction = ''] = coverPrice.split('.');
  const cents = coverPrice
    ? Number(dollars) * 100 + Number(fraction.padEnd(2, '0'))
    : null;
  const names = data.getAll('creatorName');
  const roles = data.getAll('creatorRole');
  if (names.length !== roles.length || names.length > 100)
    throw new Error('Enter up to 100 valid creator credits.');
  const credits = names.flatMap((name, index) => {
    const role = roles[index];
    if (typeof name !== 'string' || typeof role !== 'string')
      throw new Error('Invalid creator credit.');
    if (!name.trim()) return [];
    return [{ name: name.trim(), role: role.trim() || null }];
  });
  return {
    requestId: formText(data, 'requestId'),
    variantId,
    expectedVersion: formInteger(data, 'expectedVersion'),
    variantName: text('variantName', 500) ?? '',
    storyTitle: text('storyTitle', 1000),
    firstAppearanceOf: text('firstAppearanceOf', 1000),
    details: text('details', 20000),
    publisherName: text('publisherName', 500),
    coverPriceCents: cents,
    credits,
  };
}
export async function saveMetadata(
  input: MetadataEditInput,
  cover?: UploadedCover,
  db: MutationDatabase = database(),
  storage: CoverStorage = coverStorage,
): Promise<void> {
  validRequestId(input.requestId);
  if (
    !Number.isSafeInteger(input.variantId) ||
    input.variantId < 1 ||
    !Number.isSafeInteger(input.expectedVersion) ||
    input.expectedVersion < 0
  )
    throw new Error('Invalid comic edit.');
  for (const [value, limit] of [
    [input.variantName, 500],
    [input.storyTitle, 1000],
    [input.firstAppearanceOf, 1000],
    [input.details, 20000],
    [input.publisherName, 500],
  ] as const)
    if (value !== null && (typeof value !== 'string' || value.length > limit))
      throw new Error('Comic details are too long or invalid.');
  if (
    input.coverPriceCents !== null &&
    (!Number.isSafeInteger(input.coverPriceCents) || input.coverPriceCents < 0)
  )
    throw new Error('Invalid cover price.');
  if (
    !Array.isArray(input.credits) ||
    input.credits.length > 100 ||
    input.credits.some(
      (credit) =>
        !credit ||
        typeof credit.name !== 'string' ||
        !credit.name.trim() ||
        credit.name.length > 500 ||
        (credit.role !== null &&
          (typeof credit.role !== 'string' || credit.role.length > 100)),
    )
  )
    throw new Error('Enter valid creator names and roles (up to 100 credits).');
  const credits = input.credits.filter(
    (credit, index, all) =>
      all.findIndex(
        (other) =>
          other.name.toLocaleLowerCase() === credit.name.toLocaleLowerCase() &&
          other.role?.toLocaleLowerCase() === credit.role?.toLocaleLowerCase(),
      ) === index,
  );
  const inputJson = JSON.stringify({
    input,
    coverDigest: cover?.digest ?? null,
  });
  const replay = async () => {
    const previous = await db.get<{ inputJson: string }>(
      'SELECT input_json AS inputJson FROM comic_metadata_edits WHERE request_id = ?',
      [input.requestId],
    );
    if (!previous) return false;
    if (previous.inputJson !== inputJson)
      throw new Error(
        'This save request was already used. Reload and try again.',
      );
    return true;
  };
  if (await replay()) return;
  const before = await getEditableMetadata(input.variantId, db);
  if (!before || before.editVersion !== input.expectedVersion)
    throw new MetadataEditConflict();
  const now = new Date().toISOString();
  const imageKey = cover
    ? `uploaded-${crypto.randomUUID()}.${cover.extension}`
    : before.imageKey;
  const statements: MutationStatement[] = [
    {
      sql: 'INSERT INTO comic_metadata_edits(request_id, variant_id, expected_version, input_json, before_json, created_at) VALUES (?, ?, (SELECT edit_version FROM variants WHERE id = ? AND edit_version = ?), ?, ?, ?)',
      parameters: [
        input.requestId,
        input.variantId,
        input.variantId,
        input.expectedVersion,
        inputJson,
        JSON.stringify(before),
        now,
      ],
    },
  ];
  if (input.publisherName)
    statements.push({
      sql: `INSERT INTO publishers(name, created_at, updated_at) SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 WHERE (${catalogIdentitySql('publisher')}) IS NOT NULL)`,
      parameters: [input.publisherName, now, now, input.publisherName],
    });
  statements.push(
    {
      sql: `UPDATE variants SET name = ?, story_title = ?, first_appearance_of = ?, details = ?,
      publisher_id = (${catalogIdentitySql('publisher')}), cover_price_cents = ?, image_key = ?, edit_version = edit_version + 1, updated_at = ? WHERE id = ?`,
      parameters: [
        input.variantName,
        input.storyTitle,
        input.firstAppearanceOf,
        input.details,
        input.publisherName,
        input.coverPriceCents,
        imageKey,
        now,
        input.variantId,
      ],
    },
    {
      sql: 'DELETE FROM variant_credits WHERE variant_id = ?',
      parameters: [input.variantId],
    },
  );
  for (const credit of credits)
    statements.push(
      {
        sql: `INSERT INTO creators(name, created_at, updated_at) SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 WHERE (${catalogIdentitySql('creator')}) IS NOT NULL)`,
        parameters: [credit.name, now, now, credit.name],
      },
      {
        sql: `INSERT INTO variant_credits(variant_id, creator_id, role, created_at, updated_at) SELECT ?, id, ?, ?, ? FROM creators WHERE id = (${catalogIdentitySql('creator')})`,
        parameters: [input.variantId, credit.role, now, now, credit.name],
      },
    );
  statements.push({
    sql: "DELETE FROM variant_credits WHERE variant_id=? AND id NOT IN (SELECT MIN(id) FROM variant_credits WHERE variant_id=? GROUP BY creator_id,COALESCE(role,''))",
    parameters: [input.variantId, input.variantId],
  });
  if (cover) {
    try {
      await storage.put(imageKey!, cover);
    } catch {
      throw new Error(
        'The cover could not be stored. Your comic details have not been changed. Please choose the image again and retry.',
      );
    }
  }
  try {
    await db.batch(statements);
  } catch (cause) {
    if (cover)
      await storage.remove(imageKey!).catch(() => {
        /* An unreferenced unique object may be cleaned up later. */
      });
    if (await replay()) return;
    const latest = await getEditableMetadata(input.variantId, db);
    if (!latest || latest.editVersion !== input.expectedVersion)
      throw new MetadataEditConflict();
    throw cause;
  }
}
