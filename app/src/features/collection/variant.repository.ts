import { database } from '@/db';

import type {
  ExternalReference,
  HoldingListItem,
  VariantCredit,
  VariantDetail,
} from './types';

const db = database();

export async function getVariant(
  id: number,
): Promise<VariantDetail | undefined> {
  return db.get<VariantDetail>(
    `
      SELECT
        v.id,
        s.id AS seriesId,
        s.name AS seriesName,
        i.number AS issueNumber,
        i.type AS issueType,
        v.name AS variantName,
        v.story_title AS storyTitle,
        v.first_appearance_of AS firstAppearanceOf,
        v.details,
        p.name AS publisherName,
        v.cover_price_cents AS coverPriceCents,
        v.image_key AS imageKey
      FROM variants v
      JOIN issues i ON i.id = v.issue_id
      JOIN series s ON s.id = i.series_id
      LEFT JOIN publishers p ON p.id = v.publisher_id
      WHERE v.id = ?
    `,
    [id],
  );
}

export async function listVariantHoldings(
  variantId: number,
): Promise<HoldingListItem[]> {
  return db.all<HoldingListItem>(
    `
      SELECT
        h.id AS holdingId,
        v.id AS variantId,
        i.number AS issueNumber,
        i.type AS issueType,
        v.name AS variantName,
        h.grade_tenths AS gradeTenths,
        h.quantity,
        h.box_id AS boxId,
        h.current_value_cents AS valueCents,
        v.image_key AS imageKey,
        v.first_appearance_of AS firstAppearanceOf
      FROM holdings h
      JOIN variants v ON v.id = h.variant_id
      JOIN issues i ON i.id = v.issue_id
      WHERE v.id = ?
      ORDER BY h.grade_tenths DESC, h.id
    `,
    [variantId],
  );
}

export async function listVariantCredits(
  variantId: number,
): Promise<VariantCredit[]> {
  return db.all<VariantCredit>(
    `
      SELECT c.name, vc.role
      FROM variant_credits vc
      JOIN creators c ON c.id = vc.creator_id
      WHERE vc.variant_id = ?
      ORDER BY COALESCE(vc.role, ''), c.name COLLATE NOCASE
    `,
    [variantId],
  );
}

export async function listVariantExternalReferences(
  variantId: number,
): Promise<ExternalReference[]> {
  return db.all<ExternalReference>(
    `
      SELECT provider, external_id AS externalId
      FROM external_refs
      WHERE entity_type = 'variant' AND entity_id = ?
      ORDER BY provider, external_id
    `,
    [variantId],
  );
}
