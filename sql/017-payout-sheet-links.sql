BEGIN;
-- Links eBay and Etsy API payouts to rows of the payouts sheet (public.platform_payouts).
-- basis: 'auto' = row added from the payout; 'matched' = existing hand-entered row that records it.
CREATE TABLE IF NOT EXISTS erp_web.payout_sheet_links (
 platform text NOT NULL CHECK(platform IN ('Ebay','Etsy')),
 payout_id text NOT NULL,
 sheet_id integer NOT NULL,
 basis text NOT NULL CHECK(basis IN ('auto','matched')),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(platform,payout_id)
);
CREATE TABLE IF NOT EXISTS erp_web.payout_sheet_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 enabled boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO erp_web.payout_sheet_settings(id) VALUES(true) ON CONFLICT DO NOTHING;
GRANT SELECT,INSERT ON erp_web.payout_sheet_links TO nslabs_erp_web;
GRANT SELECT ON erp_web.payout_sheet_settings TO nslabs_erp_web;
GRANT INSERT ON public.platform_payouts TO nslabs_erp_web;
GRANT USAGE ON SEQUENCE public.platform_payouts_id_seq TO nslabs_erp_web;
COMMIT;
