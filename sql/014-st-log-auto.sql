BEGIN;
-- Automatic ST sales log rows from imported platform orders. One row per unit of an ST-model order line.
CREATE TABLE IF NOT EXISTS erp_web.st_log_auto (
 platform text NOT NULL,
 order_id text NOT NULL,
 line_key text NOT NULL,
 unit integer NOT NULL CHECK(unit >= 1),
 log_id integer NOT NULL,
 price_basis text NOT NULL CHECK(price_basis IN ('after_fees','buyer_payment')),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(platform,order_id,line_key,unit)
);
CREATE TABLE IF NOT EXISTS erp_web.st_log_auto_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 enabled boolean NOT NULL DEFAULT false,
 since date NOT NULL DEFAULT '2026-01-01',
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO erp_web.st_log_auto_settings(id) VALUES(true) ON CONFLICT DO NOTHING;
GRANT SELECT,INSERT ON erp_web.st_log_auto TO nslabs_erp_web;
GRANT SELECT ON erp_web.st_log_auto_settings TO nslabs_erp_web;
-- The web role may add ST log rows (it still cannot delete them).
GRANT INSERT ON public.st_sales_log TO nslabs_erp_web;
GRANT USAGE ON SEQUENCE public.st_sales_log_id_seq TO nslabs_erp_web;
COMMIT;
