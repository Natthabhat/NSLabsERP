BEGIN;
-- 'manual': an order unit already recorded by a hand-entered ST log row that automatic matching cannot pair
-- (different product code or date); the unit is never added automatically.
ALTER TABLE erp_web.st_log_auto DROP CONSTRAINT IF EXISTS st_log_auto_price_basis_check;
ALTER TABLE erp_web.st_log_auto ADD CONSTRAINT st_log_auto_price_basis_check CHECK(price_basis IN ('after_fees','buyer_payment','manual'));
COMMIT;
