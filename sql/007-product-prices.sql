BEGIN;
ALTER TABLE erp_web.products ADD COLUMN IF NOT EXISTS price_cents integer CHECK(price_cents BETWEEN 0 AND 1000000000);
ALTER TABLE erp_web.product_variants ADD COLUMN IF NOT EXISTS price_cents integer CHECK(price_cents BETWEEN 0 AND 1000000000);
COMMIT;
