INSERT INTO publishers (id, name) VALUES
  (1, 'DC Comics'),
  (2, 'Image Comics');

INSERT INTO series (id, name, sort_name, start_year, status, created_at, updated_at) VALUES
  (1, 'Alpha Adventures', 'Alpha Adventures', 2024, 'ongoing', '2024-01-01 00:00:00', '2024-01-01 00:00:00'),
  (2, 'Weird Tales', 'Weird Tales', 1999, 'ended', '2020-01-01 00:00:00', '2020-01-01 00:00:00'),
  (3, 'Empty Series', 'Empty Series', 2010, 'ended', '2020-01-01 00:00:00', '2020-01-01 00:00:00');

INSERT INTO issues (id, series_id, number, type, created_at, updated_at) VALUES
  (1, 1, '1', 'issue', '2024-01-01 00:00:00', '2024-01-01 00:00:00'),
  (2, 1, '1/2', 'issue', '2024-01-01 00:00:00', '2024-01-01 00:00:00'),
  (3, 1, '12.1', 'issue', '2024-01-01 00:00:00', '2024-01-01 00:00:00'),
  (4, 2, '5', 'issue', '2020-01-01 00:00:00', '2020-01-01 00:00:00'),
  (5, 3, '1', 'annual', '2020-01-01 00:00:00', '2020-01-01 00:00:00');

INSERT INTO variants (
  id,
  issue_id,
  publisher_id,
  name,
  story_title,
  first_appearance_of,
  details,
  cover_price_cents,
  image_key,
  created_at,
  updated_at
) VALUES
  (1, 1, 1, 'Regular Cover', 'The Beginning', 'Test Hero', 'Primary fixture variant.', 399, '1.jpg', '2020-01-01 00:00:00', '2020-01-01 00:00:00'),
  (2, 2, 1, 'Foil Cover', NULL, NULL, NULL, 599, '2.jpg', '2020-01-01 00:00:00', '2020-01-01 00:00:00'),
  (3, 3, 1, 'Variant A', NULL, NULL, NULL, 499, '3.jpg', '2020-01-01 00:00:00', '2020-01-01 00:00:00'),
  (4, 4, 2, 'Cover A', NULL, NULL, NULL, 299, '4.jpg', '2020-01-01 00:00:00', '2020-01-01 00:00:00'),
  (5, 4, 2, 'Cover B', NULL, NULL, NULL, 399, '5.jpg', '2020-01-01 00:00:00', '2020-01-01 00:00:00'),
  (6, 5, 2, '', NULL, NULL, NULL, 399, NULL, '2020-01-01 00:00:00', '2020-01-01 00:00:00');

INSERT INTO boxes (id, type, label, created_at, updated_at) VALUES
  (1, 'short', 'Short A', '2020-01-01 00:00:00', '2020-01-01 00:00:00'),
  (3, 'long', 'Long C', '2020-01-01 00:00:00', '2020-01-01 00:00:00');

INSERT INTO holdings (
  id,
  variant_id,
  grade_tenths,
  quantity,
  box_id,
  current_value_cents,
  purchase_price_cents,
  created_at,
  updated_at
) VALUES
  (1, 1, 94, 2, 1, 1000, 400, '2020-01-01 00:00:00', '2020-01-01 00:00:00'),
  (2, 2, 94, 1, NULL, NULL, 600, '2020-01-01 00:00:00', '2020-01-01 00:00:00'),
  (3, 3, 80, 1, 3, 0, 500, '2020-01-01 00:00:00', '2020-01-01 00:00:00'),
  (4, 4, 94, 1, 1, 2500, 300, '2020-01-01 00:00:00', '2020-01-01 00:00:00'),
  (5, 5, 94, 1, 3, 3000, 400, '2020-01-01 00:00:00', '2020-01-01 00:00:00');

INSERT INTO creators (id, name, first_name, last_name) VALUES
  (1, 'Jane Writer', 'Jane', 'Writer'),
  (2, 'Alex Artist', 'Alex', 'Artist'),
  (3, 'Casey Cover', 'Casey', 'Cover');

INSERT INTO variant_credits (id, variant_id, creator_id, role, created_at, updated_at) VALUES
  (1, 1, 1, 'writer', '2020-01-01 00:00:00', '2020-01-01 00:00:00'),
  (2, 1, 2, 'artist', '2020-01-01 00:00:00', '2020-01-01 00:00:00'),
  (3, 5, 3, 'cover_artist', '2020-01-01 00:00:00', '2020-01-01 00:00:00');

INSERT INTO external_refs (entity_type, entity_id, provider, external_id, created_at) VALUES
  ('series', 1, 'zap', 'series-101', '2020-01-01 00:00:00'),
  ('variant', 1, 'zap', '101', '2020-01-01 00:00:00'),
  ('variant', 1, 'comic_vine', '4000-9001-0', '2020-01-01 00:00:00'),
  ('variant', 5, 'zap', '205', '2020-01-01 00:00:00');

INSERT INTO price_snapshots (
  holding_id,
  provider,
  grade_tenths,
  price_cents,
  observed_at,
  source_event_id
) VALUES
  (1, 'zap', 94, 500, '2021-01-01 10:00:00', 1),
  (1, 'zap', 94, 1000, '2022-01-01 10:00:00', 2),
  (4, 'zap', 94, 1000, '2021-06-01 10:00:00', 3),
  (4, 'zap', 94, 2500, '2022-06-01 10:00:00', 4);

INSERT INTO current_valuations (
  holding_id,
  provider,
  provider_variant_id,
  grade_tenths,
  price_cents,
  source_price_cents,
  condition_percentage,
  observed_at,
  refreshed_at
) VALUES
  (1, 'legacy', '101', 94, 1000, 1000, 1.0, '2022-01-01 10:00:00', '2020-01-01 00:00:00'),
  (2, 'legacy', NULL, 94, NULL, NULL, 1.0, '2020-01-01 00:00:00', '2020-01-01 00:00:00'),
  (3, 'legacy', NULL, 80, 0, 0, 1.0, '2020-01-01 00:00:00', '2020-01-01 00:00:00'),
  (4, 'legacy', NULL, 94, 2500, 2500, 1.0, '2022-06-01 10:00:00', '2020-01-01 00:00:00'),
  (5, 'legacy', '205', 94, 3000, 3000, 1.0, '2020-01-01 00:00:00', '2020-01-01 00:00:00');
