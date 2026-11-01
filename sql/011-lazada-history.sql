BEGIN;
CREATE TABLE IF NOT EXISTS erp_web.lazada_orders (
 seller_id text NOT NULL,
 order_id text NOT NULL,
 status text CHECK(status IN ('To ship','Shipped','Complete')),
 payload jsonb NOT NULL,
 source_updated_at timestamptz,
 first_seen timestamptz NOT NULL DEFAULT now(),
 last_seen timestamptz NOT NULL,
 PRIMARY KEY(seller_id,order_id)
);
CREATE TABLE IF NOT EXISTS erp_web.lazada_status_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 seller_id text NOT NULL,
 order_id text NOT NULL,
 from_statuses jsonb,
 to_statuses jsonb NOT NULL,
 observed_at timestamptz NOT NULL,
 FOREIGN KEY(seller_id,order_id) REFERENCES erp_web.lazada_orders(seller_id,order_id),
 UNIQUE(seller_id,order_id,observed_at)
);
CREATE TABLE IF NOT EXISTS erp_web.lazada_sync_state (
 seller_id text PRIMARY KEY,
 import_status text NOT NULL DEFAULT 'pending' CHECK(import_status IN ('pending','running','complete','error')),
 cursor jsonb,
 import_after timestamptz,
 import_before timestamptz,
 expected_count integer,
 last_sync_at timestamptz,
 error text,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lazada_orders_status_idx ON erp_web.lazada_orders(seller_id,status);
GRANT SELECT,INSERT,UPDATE ON erp_web.lazada_orders,erp_web.lazada_sync_state TO nslabs_erp_web;
GRANT SELECT,INSERT ON erp_web.lazada_status_events TO nslabs_erp_web;
GRANT USAGE ON SEQUENCE erp_web.lazada_status_events_id_seq TO nslabs_erp_web;
COMMIT;
