BEGIN;
CREATE TABLE IF NOT EXISTS erp_web.ebay_connection (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 client_id text NOT NULL,
 ru_name text NOT NULL,
 credentials text NOT NULL,
 tokens text,
 username text,
 marketplace text,
 connected_at timestamptz,
 checked_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS erp_web.ebay_orders (
 seller text NOT NULL,
 order_id text NOT NULL,
 status text CHECK(status IN ('To ship','Shipped','Complete')),
 payload jsonb NOT NULL,
 source_updated_at timestamptz,
 first_seen timestamptz NOT NULL DEFAULT now(),
 last_seen timestamptz NOT NULL,
 PRIMARY KEY(seller,order_id)
);
CREATE TABLE IF NOT EXISTS erp_web.ebay_payouts (
 seller text NOT NULL,
 payout_id text NOT NULL,
 status text NOT NULL,
 payout_date timestamptz,
 payload jsonb NOT NULL,
 last_seen timestamptz NOT NULL,
 PRIMARY KEY(seller,payout_id)
);
CREATE TABLE IF NOT EXISTS erp_web.ebay_sync_state (
 seller text PRIMARY KEY,
 import_status text NOT NULL DEFAULT 'pending' CHECK(import_status IN ('pending','running','complete','error')),
 next_offset integer NOT NULL DEFAULT 0,
 import_started_at timestamptz,
 last_sync_at timestamptz,
 error text,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ebay_orders_status_idx ON erp_web.ebay_orders(seller,status);
GRANT SELECT,INSERT,UPDATE ON erp_web.ebay_connection,erp_web.ebay_orders,erp_web.ebay_payouts,erp_web.ebay_sync_state TO nslabs_erp_web;
COMMIT;
