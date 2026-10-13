import { catalogIdentitySql } from '@/features/catalog/repository';
import { database } from '@/db';
import type { MutationDatabase, MutationStatement } from '@/db/database';
import { coverStorage } from '@/covers/runtime';
import type { CoverStorage, UploadedCover } from '@/covers/upload';
import {
  fetchCopyValuation,
  type CopyValuation,
} from '@/features/collection/copy-valuation';
import type { MetadataEditInput } from '@/features/collection/metadata-edit';
import { parsePurchaseDate } from '@/features/collection/purchase-details';
import { validRequestId } from '@/features/collection/write-form';
import { liveValuationStatements } from '@/features/valuation/write';
import {
  issueNumber,
  IntakeMetadataUnavailable,
  loadIntakeLookup,
  validateLocalTitle,
  zapCoverMetadata,
} from './catalog';
import { downloadProviderCover } from './images';
import type { IntakeLookup, IntakeZapClient } from './types';

export interface IntakeInput {
  requestId: string;
  lookupId: string | null;
  coverId: string | null;
  localSeriesId: number | null;
  titleName: string;
  titleYear: number | null;
  titleStatus: 'ongoing' | 'ended';
  number: string;
  issueType: 'issue' | 'annual';
  gradeTenths: number | null;
  quantity: number;
  boxId: number | null;
  purchasePriceCents: number | null;
  purchaseDate: string | null;
  valueMode: 'zap' | 'manual' | 'unknown';
  manualValueCents: number | null;
  manualMetadata: MetadataEditInput | null;
}
export interface IntakeResult {
  holdingId: number;
  variantId: number;
  seriesId: number;
  warnings: string[];
}
interface Dependencies {
  db?: MutationDatabase;
  zap?: IntakeZapClient;
  storage?: CoverStorage;
  download?: typeof downloadProviderCover;
}
interface Fragment {
  sql: string;
  parameters: (string | number | null)[];
}
export async function saveIntake(
  input: IntakeInput,
  photo?: UploadedCover,
  dependencies: Dependencies = {},
): Promise<IntakeResult> {
  const db = dependencies.db ?? database();
  const storage = dependencies.storage ?? coverStorage;
  validRequestId(input.requestId);
  const positive = (value: number, label: string, minimum = 1) => {
    if (!Number.isSafeInteger(value) || value < minimum)
      throw new Error(`Enter a valid ${label}.`);
  };
  positive(input.quantity, 'quantity');
  if (input.quantity > 10000)
    throw new Error('Enter no more than 10,000 copies per purchase.');
  if (input.gradeTenths !== null) {
    positive(input.gradeTenths, 'grade');
    if (input.gradeTenths > 100)
      throw new Error('Grade must be between 0.1 and 10.0.');
  }
  if (input.boxId !== null) positive(input.boxId, 'box');
  if (input.localSeriesId !== null) positive(input.localSeriesId, 'title');
  for (const value of [input.purchasePriceCents, input.manualValueCents])
    if (value !== null) positive(value, 'price', 0);
  parsePurchaseDate(input.purchaseDate);
  if (
    !['issue', 'annual'].includes(input.issueType) ||
    !['zap', 'manual', 'unknown'].includes(input.valueMode) ||
    !['ongoing', 'ended'].includes(input.titleStatus)
  )
    throw new Error('Choose a valid issue type and value setting.');
  if (input.valueMode === 'manual' && input.manualValueCents === null)
    throw new Error('Enter the current value per copy.');
  if (
    input.titleYear !== null &&
    (!Number.isSafeInteger(input.titleYear) ||
      input.titleYear < 1800 ||
      input.titleYear > 9999)
  )
    throw new Error('Enter a valid title year.');
  const inputJson = JSON.stringify({
    input,
    photoDigest: photo?.digest ?? null,
  });
  const replay = async () => {
    const previous = await db.get<{ inputJson: string; holdingId: number }>(
      'SELECT input_json AS inputJson,result_holding_id AS holdingId FROM intake_requests WHERE request_id=?',
      [input.requestId],
    );
    if (!previous) return undefined;
    if (previous.inputJson !== inputJson)
      throw new Error(
        'This save request was already used. Reload and try again.',
      );
    return result(previous.holdingId);
  };
  const result = async (holdingId: number): Promise<IntakeResult> => {
    const row = await db.get<{
      variantId: number;
      seriesId: number;
      warnings: string;
    }>(
      `SELECT h.variant_id AS variantId,i.series_id AS seriesId,r.warnings_json AS warnings FROM holdings h JOIN variants v ON v.id=h.variant_id JOIN issues i ON i.id=v.issue_id JOIN intake_requests r ON r.result_holding_id=h.id WHERE h.id=?`,
      [holdingId],
    );
    if (!row) throw new Error('Unable to load the saved purchase.');
    return { holdingId, ...row, warnings: JSON.parse(row.warnings) };
  };
  const prior = await replay();
  if (prior) return prior;
  if (
    input.boxId !== null &&
    !(await db.get('SELECT id FROM boxes WHERE id=?', [input.boxId]))
  )
    throw new Error('That box no longer exists.');
  const warnings: string[] = [];
  let lookup: IntakeLookup | undefined;
  let metadata: {
    variantName: string;
    storyTitle: string | null;
    firstAppearanceOf: string | null;
    details: string | null;
    coverPriceCents: number | null;
    publisherName: string | null;
    credits: { name: string; role: string | null }[];
  };
  let providerMetadata: unknown = null;
  let source: 'zap' | 'comic_vine' | 'manual' = 'manual';
  let seriesExternalId: string | null = null,
    variantExternalId: string | null = null,
    imageUrl: string | null = null;
  let titleName = input.titleName.trim(),
    titleYear = input.titleYear,
    number = issueNumber(input.number),
    localSeriesId = input.localSeriesId;
  if (input.lookupId) {
    lookup = await loadIntakeLookup(input.lookupId, db);
    const cover = lookup.covers.find(
      (cover) => cover.externalId === input.coverId,
    );
    if (!cover) throw new Error('Choose a cover from this lookup.');
    if (
      lookup.issueType !== input.issueType ||
      lookup.issueNumber.toLocaleLowerCase() !== number.toLocaleLowerCase() ||
      lookup.localSeriesId !== localSeriesId
    )
      throw new Error(
        'The selected cover belongs to a different lookup. Look up the issue again.',
      );
    await validateLocalTitle(lookup.title, localSeriesId, db);
    source = lookup.title.source;
    seriesExternalId = lookup.title.externalId;
    variantExternalId = cover.externalId;
    titleName = lookup.title.name;
    titleYear = input.titleYear ?? lookup.title.year;
    let details;
    if (source === 'zap') {
      try {
        details = await zapCoverMetadata(lookup, cover, dependencies.zap);
      } catch (cause) {
        if (!(cause instanceof IntakeMetadataUnavailable) || !cover.metadata)
          throw cause;
        details = cover.metadata;
        warnings.push(
          'Zap details were temporarily unavailable, so the saved cover details came from your earlier lookup.',
        );
      }
    } else details = cover.metadata;
    if (!details)
      throw new Error(
        'The selected cover has no metadata. Look up the issue again.',
      );
    providerMetadata = { issue: details.issue, cover: details.variant };
    number = details.issue.number.trim();
    imageUrl = source === 'zap' ? cover.imageUrl : details.variant.imageUrl;
    metadata = {
      variantName: details.variant.label,
      storyTitle: details.issue.storyTitle,
      firstAppearanceOf: details.issue.firstAppearanceOf,
      details: details.issue.description,
      coverPriceCents: details.variant.coverPriceCents,
      publisherName: details.publisher,
      credits: details.variant.creators.flatMap((credit) =>
        (credit.roles.length ? credit.roles : [null]).map((role) => ({
          name: credit.name,
          role,
        })),
      ),
    };
  } else {
    const manual = input.manualMetadata;
    if (!manual) throw new Error('Enter the manual comic details.');
    metadata = manual;
    if (input.valueMode === 'zap')
      throw new Error(
        'Choose a Zap cover to get a Zap valuation, or enter a manual value.',
      );
    if (
      localSeriesId !== null &&
      !(await db.get('SELECT id FROM series WHERE id=?', [localSeriesId]))
    )
      throw new Error('That title no longer exists.');
  }
  if (!titleName || titleName.length > 500)
    throw new Error('Enter a title name up to 500 characters.');
  for (const value of [
    metadata.variantName,
    metadata.storyTitle,
    metadata.firstAppearanceOf,
    metadata.details,
    metadata.publisherName,
  ])
    if (value !== null && (typeof value !== 'string' || value.length > 20000))
      throw new Error('The comic metadata is invalid or too long.');
  if (
    metadata.coverPriceCents !== null &&
    (!Number.isSafeInteger(metadata.coverPriceCents) ||
      metadata.coverPriceCents < 0)
  )
    throw new Error('Enter a valid cover price.');
  if (
    metadata.credits.length > 100 ||
    metadata.credits.some(
      (credit) =>
        typeof credit.name !== 'string' ||
        !credit.name.trim() ||
        credit.name.length > 500 ||
        (credit.role !== null &&
          (typeof credit.role !== 'string' || credit.role.length > 100)),
    )
  )
    throw new Error('Enter valid creator names and roles.');
  const credits = metadata.credits.filter(
    (credit, index, all) =>
      all.findIndex(
        (other) =>
          other.name.toLowerCase() === credit.name.toLowerCase() &&
          other.role?.toLowerCase() === credit.role?.toLowerCase(),
      ) === index,
  );
  const reference = async (
    entity: 'series' | 'variant',
    externalId: string,
  ) => {
    const refs = await db.all<{ id: number }>(
      'SELECT DISTINCT entity_id AS id FROM external_refs WHERE entity_type=? AND provider=? AND external_id=?',
      [entity, source, externalId],
    );
    if (refs.length > 1)
      throw new Error(
        'This cover already has several collection entries. Open the comic you own and choose Add another copy.',
      );
    return refs[0]?.id;
  };
  const existingSeries = seriesExternalId
    ? await reference('series', seriesExternalId)
    : undefined;
  if (
    existingSeries !== undefined &&
    localSeriesId !== null &&
    existingSeries !== localSeriesId
  )
    throw new Error(
      'The provider title is linked to a different collection title.',
    );
  if (localSeriesId === null && existingSeries !== undefined)
    localSeriesId = existingSeries;
  const existingVariantId = variantExternalId
    ? await reference('variant', variantExternalId)
    : undefined;
  if (existingVariantId !== undefined) {
    const identity = await db.get<{
      seriesId: number;
      number: string;
      type: string;
    }>(
      `SELECT i.series_id AS seriesId,i.number,i.type FROM variants v JOIN issues i ON i.id=v.issue_id WHERE v.id=?`,
      [existingVariantId],
    );
    if (
      !identity ||
      identity.seriesId !== localSeriesId ||
      identity.number.toLocaleLowerCase() !== number.toLocaleLowerCase() ||
      identity.type !== input.issueType
    )
      throw new Error(
        'The stored cover is linked to a different title or issue. Use its existing comic page or correct its mapping.',
      );
  }
  const peers =
    source === 'zap'
      ? await db.all<{ id: number; version: number; price: number | null }>(
          `SELECT h.id,h.edit_version AS version,h.current_value_cents AS price FROM holdings h WHERE h.grade_tenths IS ? AND h.quantity>0 AND EXISTS(SELECT 1 FROM external_refs er WHERE er.entity_type='variant' AND er.entity_id=h.variant_id AND er.provider='zap' AND er.external_id=?) AND (SELECT COUNT(DISTINCT er.external_id) FROM external_refs er WHERE er.entity_type='variant' AND er.entity_id=h.variant_id AND er.provider='zap')=1`,
          [input.gradeTenths, variantExternalId],
        )
      : [];
  if (input.valueMode === 'zap' && source !== 'zap')
    throw new Error(
      'Choose a Zap cover for automatic valuation, or enter a manual value.',
    );
  const quote: CopyValuation | undefined =
    input.valueMode === 'zap'
      ? await fetchCopyValuation(
          variantExternalId!,
          input.gradeTenths,
          dependencies.zap,
        )
      : undefined;
  const price =
    quote?.priceCents ??
    (input.valueMode === 'manual' ? input.manualValueCents : null);
  const now = new Date().toISOString();
  let cover = photo;
  const existingImage =
    existingVariantId !== undefined
      ? await db.get<{ key: string | null }>(
          'SELECT image_key AS key FROM variants WHERE id=?',
          [existingVariantId],
        )
      : undefined;
  if (photo && existingImage?.key) {
    cover = undefined;
    warnings.push(
      'Your purchase uses the stored cover image. Replace that image from Edit comic details.',
    );
  }
  if (!cover && !existingImage?.key && imageUrl) {
    try {
      cover = await (dependencies.download ?? downloadProviderCover)(imageUrl);
    } catch {
      warnings.push(
        'The purchase was saved, but the provider cover image could not be cached. Upload a replacement from Edit comic details.',
      );
    }
  }
  let imageKey: string | null = null;
  if (cover) {
    imageKey = `uploaded-${crypto.randomUUID()}.${cover.extension}`;
    try {
      await storage.put(imageKey, cover);
    } catch {
      if (photo)
        throw new Error(
          'Your cover photo could not be stored. Your collection has not changed. Choose the photo again and retry.',
        );
      imageKey = null;
      warnings.push(
        'The purchase was saved, but cover storage was unavailable. Upload the cover from Edit comic details.',
      );
    }
  }
  const ref = (entity: 'series' | 'variant', externalId: string): Fragment => ({
    sql: '(SELECT entity_id FROM external_refs WHERE entity_type=? AND provider=? AND external_id=? ORDER BY id LIMIT 1)',
    parameters: [entity, source, externalId],
  });
  const series: Fragment =
    localSeriesId !== null
      ? { sql: '?', parameters: [localSeriesId] }
      : seriesExternalId
        ? ref('series', seriesExternalId)
        : {
            sql: '(SELECT id FROM (SELECT id,name,start_year FROM series UNION ALL SELECT series_id AS id,name,start_year FROM series_aliases) WHERE name=? COLLATE NOCASE AND start_year IS ? ORDER BY id LIMIT 1)',
            parameters: [titleName, titleYear],
          };
  const issue: Fragment = {
    sql: `(SELECT id FROM issues WHERE series_id=${series.sql} AND number=? COLLATE NOCASE AND type=? ORDER BY id LIMIT 1)`,
    parameters: [...series.parameters, number, input.issueType],
  };
  const variant: Fragment = variantExternalId
    ? ref('variant', variantExternalId)
    : {
        sql: `(SELECT id FROM variants WHERE issue_id=${issue.sql} AND name=? COLLATE NOCASE ORDER BY id LIMIT 1)`,
        parameters: [...issue.parameters, metadata.variantName],
      };
  const holding: Fragment = {
    sql: '(SELECT id FROM holdings WHERE creation_request_id=?)',
    parameters: [input.requestId],
  };
  const seriesGuard: Fragment =
    seriesExternalId && localSeriesId !== null
      ? {
          sql: "CASE WHEN NOT EXISTS(SELECT 1 FROM external_refs WHERE entity_type='series' AND provider=? AND external_id=? AND entity_id<>?) THEN 1 ELSE NULL END",
          parameters: [source, seriesExternalId, localSeriesId],
        }
      : { sql: '1', parameters: [] };
  const coverGuard: Fragment = variantExternalId
    ? {
        sql: "CASE WHEN (SELECT COUNT(DISTINCT entity_id) FROM external_refs WHERE entity_type='variant' AND provider=? AND external_id=?) <= 1 THEN 1 ELSE NULL END",
        parameters: [source, variantExternalId],
      }
    : { sql: '1', parameters: [] };
  const statements: MutationStatement[] = [
    {
      sql: `INSERT INTO intake_requests(request_id,input_json,created_at,warnings_json,series_guard,cover_guard) VALUES (?,?,?,?,${seriesGuard.sql},${coverGuard.sql})`,
      parameters: [
        input.requestId,
        inputJson,
        now,
        JSON.stringify(warnings),
        ...seriesGuard.parameters,
        ...coverGuard.parameters,
      ],
    },
  ];
  if (localSeriesId === null)
    statements.push({
      sql: `INSERT INTO series(name,sort_name,start_year,status,created_at,updated_at,creation_request_id) SELECT ?,?,?,?,?,?,? WHERE ${series.sql} IS NULL`,
      parameters: [
        titleName,
        titleName,
        titleYear,
        input.titleStatus,
        now,
        now,
        input.requestId,
        ...series.parameters,
      ],
    });
  if (seriesExternalId)
    statements.push({
      sql:
        "INSERT OR IGNORE INTO external_refs(entity_type,entity_id,provider,external_id,metadata_json,created_at) SELECT 'series',id,?,?,?,? FROM series WHERE " +
        (localSeriesId !== null ? 'id=?' : 'creation_request_id=?'),
      parameters: [
        source,
        seriesExternalId,
        JSON.stringify({ titleSlug: lookup!.title.slug }),
        now,
        localSeriesId ?? input.requestId,
      ],
    });
  statements.push({
    sql: `INSERT INTO issues(series_id,number,type,created_at,updated_at) SELECT ${series.sql},?,?,?,? WHERE ${issue.sql} IS NULL`,
    parameters: [
      ...series.parameters,
      number,
      input.issueType,
      now,
      now,
      ...issue.parameters,
    ],
  });
  if (metadata.publisherName)
    statements.push({
      sql: `INSERT INTO publishers(name,created_at,updated_at) SELECT ?,?,? WHERE NOT EXISTS(SELECT 1 WHERE (${catalogIdentitySql('publisher')}) IS NOT NULL) AND ${variant.sql} IS NULL`,
      parameters: [
        metadata.publisherName,
        now,
        now,
        metadata.publisherName,
        ...variant.parameters,
      ],
    });
  statements.push({
    sql: `INSERT INTO variants(issue_id,publisher_id,name,story_title,first_appearance_of,details,cover_price_cents,image_key,created_at,updated_at,creation_request_id) SELECT ${issue.sql},(${catalogIdentitySql('publisher')}),?,?,?,?,?,?,?,?,? WHERE ${variant.sql} IS NULL`,
    parameters: [
      ...issue.parameters,
      metadata.publisherName,
      metadata.variantName,
      metadata.storyTitle,
      metadata.firstAppearanceOf,
      metadata.details,
      metadata.coverPriceCents,
      imageKey,
      now,
      now,
      input.requestId,
      ...variant.parameters,
    ],
  });
  if (variantExternalId)
    statements.push({
      sql: "INSERT OR IGNORE INTO external_refs(entity_type,entity_id,provider,external_id,metadata_json,created_at) SELECT 'variant',id,?,?,?,? FROM variants WHERE creation_request_id=?",
      parameters: [
        source,
        variantExternalId,
        JSON.stringify({
          titleSlug: lookup!.title.slug,
          providerMetadata,
          issueSlug: lookup!.covers.find(
            (cover) => cover.externalId === input.coverId,
          )!.slug,
        }),
        now,
        input.requestId,
      ],
    });
  for (const credit of credits)
    statements.push(
      {
        sql: `INSERT INTO creators(name,created_at,updated_at) SELECT ?,?,? WHERE NOT EXISTS(SELECT 1 WHERE (${catalogIdentitySql('creator')}) IS NOT NULL) AND EXISTS(SELECT 1 FROM variants WHERE creation_request_id=?)`,
        parameters: [credit.name, now, now, credit.name, input.requestId],
      },
      {
        sql: `INSERT INTO variant_credits(variant_id,creator_id,role,created_at,updated_at) SELECT v.id,(${catalogIdentitySql('creator')}),?,?,? FROM variants v WHERE v.creation_request_id=?`,
        parameters: [credit.name, credit.role, now, now, input.requestId],
      },
    );
  statements.push({
    sql: "DELETE FROM variant_credits WHERE variant_id=(SELECT id FROM variants WHERE creation_request_id=?) AND id NOT IN (SELECT MIN(vc.id) FROM variant_credits vc JOIN variants v ON v.id=vc.variant_id WHERE v.creation_request_id=? GROUP BY vc.creator_id,COALESCE(vc.role,''))",
    parameters: [input.requestId, input.requestId],
  });
  if (imageKey)
    statements.push({
      sql: `UPDATE variants SET image_key=?,edit_version=edit_version+1,updated_at=? WHERE id=${variant.sql} AND image_key IS NULL`,
      parameters: [imageKey, now, ...variant.parameters],
    });
  statements.push({
    sql: `INSERT INTO holdings(variant_id,grade_tenths,quantity,box_id,current_value_cents,purchase_price_cents,purchase_date,created_at,updated_at,creation_request_id) VALUES (${variant.sql},?,?,?,?,?,?,?,?,?)`,
    parameters: [
      ...variant.parameters,
      input.gradeTenths,
      input.quantity,
      input.boxId,
      price,
      input.purchasePriceCents,
      input.purchaseDate,
      now,
      now,
      input.requestId,
    ],
  });
  if (quote)
    statements.push({
      sql: `INSERT INTO current_valuations(holding_id,provider,provider_variant_id,grade_tenths,price_cents,source_price_cents,condition_percentage,observed_at,refreshed_at) VALUES (${holding.sql},'zap',?,?,?,?,?,?,?)`,
      parameters: [
        ...holding.parameters,
        quote.providerVariantId,
        quote.gradeTenths,
        quote.priceCents,
        quote.sourcePriceCents,
        quote.conditionPercentage,
        quote.observedAt,
        quote.refreshedAt,
      ],
    });
  else
    statements.push({
      sql: `INSERT INTO current_valuations(holding_id,provider,grade_tenths,price_cents,refreshed_at) VALUES (${holding.sql},?,?,?,?)`,
      parameters: [
        ...holding.parameters,
        input.valueMode === 'manual' ? 'manual' : 'pending',
        input.gradeTenths,
        price,
        now,
      ],
    });
  if (price !== null)
    statements.push({
      sql: `INSERT INTO price_snapshots(holding_id,provider,grade_tenths,price_cents,observed_at,valuation_epoch,variant_id) VALUES (${holding.sql},?,?,?,?,0,${variant.sql})`,
      parameters: [
        ...holding.parameters,
        quote ? 'zap' : 'manual',
        input.gradeTenths,
        price,
        quote?.observedAt ?? now,
        ...variant.parameters,
      ],
    });
  if (quote)
    for (const peer of peers)
      statements.push(
        ...liveValuationStatements(
          { ...quote, holdingId: peer.id, syncRunId: null },
          peer.version,
          peer.price !== quote.priceCents,
        ),
      );
  statements.push({
    sql: `UPDATE intake_requests SET result_holding_id=${holding.sql} WHERE request_id=?`,
    parameters: [...holding.parameters, input.requestId],
  });
  try {
    await db.batch(statements);
  } catch (cause) {
    if (imageKey) await storage.remove(imageKey).catch(() => {});
    const repeated = await replay();
    if (repeated) return repeated;
    if (
      cause instanceof Error &&
      /intake_requests\.(?:series_guard|cover_guard)/.test(cause.message)
    )
      throw new Error(
        'The selected title or cover changed while saving. Look up the issue again and retry.',
      );
    throw cause;
  }
  const saved = await db.get<{ id: number; imageKey: string | null }>(
    `SELECT h.id,v.image_key AS imageKey FROM holdings h JOIN variants v ON v.id=h.variant_id WHERE h.creation_request_id=?`,
    [input.requestId],
  );
  if (!saved) throw new Error('Unable to load the saved purchase.');
  if (imageKey && saved.imageKey !== imageKey)
    await storage.remove(imageKey).catch(() => {});
  return result(saved.id);
}
