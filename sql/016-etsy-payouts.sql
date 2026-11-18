BEGIN;
-- Etsy payouts (bank disbursements) read from the shop's payment account ledger.
CREATE TABLE IF NOT EXISTS erp_web.etsy_payouts (
 shop_id text NOT NULL,
 entry_id text NOT NULL,
 payout_date timestamptz,
 payload jsonb NOT NULL,
 last_seen timestamptz NOT NULL,
 PRIMARY KEY(shop_id,entry_id)
);
GRANT SELECT,INSERT,UPDATE ON erp_web.etsy_payouts TO nslabs_erp_web;
COMMIT;
