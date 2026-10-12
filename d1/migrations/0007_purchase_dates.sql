-- Actual purchase dates are optional; imported creation timestamps are not purchase dates.
ALTER TABLE holdings ADD COLUMN purchase_date TEXT;
