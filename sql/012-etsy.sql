BEGIN;
CREATE TABLE IF NOT EXISTS erp_web.etsy_connection (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 keystring text NOT NULL,
 credentials text NOT NULL,
 tokens text,
 user_id text,
 shop_id text,
 shop_name text,
 currency text,
 connected_at timestamptz,
 checked_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS erp_web.etsy_orders (
 shop_id text NOT NULL,
 receipt_id text NOT NULL,
 status text CHECK(status IN ('To ship','Shipped','Complete')),
 payload jsonb NOT NULL,
 source_updated_at timestamptz,
 first_seen timestamptz NOT NULL DEFAULT now(),
 last_seen timestamptz NOT NULL,
 PRIMARY KEY(shop_id,receipt_id)
);
CREATE TABLE IF NOT EXISTS erp_web.etsy_sync_state (
 shop_id text PRIMARY KEY,
 import_status text NOT NULL DEFAULT 'pending' CHECK(import_status IN ('pending','running','complete','error')),
 next_offset integer NOT NULL DEFAULT 0,
 import_started_at timestamptz,
 last_sync_at timestamptz,
 error text,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS etsy_orders_status_idx ON erp_web.etsy_orders(shop_id,status);
GRANT SELECT,INSERT,UPDATE ON erp_web.etsy_connection,erp_web.etsy_orders,erp_web.etsy_sync_state TO nslabs_erp_web;
COMMIT;
