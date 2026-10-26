BEGIN;
CREATE TABLE IF NOT EXISTS erp_web.shopee_orders (
 order_id text PRIMARY KEY,
 status text NOT NULL CHECK(status IN ('To ship','Shipped','Complete')),
 payload jsonb NOT NULL,
 first_seen timestamptz NOT NULL,
 last_seen timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS erp_web.shopee_status_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 order_id text NOT NULL REFERENCES erp_web.shopee_orders(order_id),
 from_status text,
 to_status text NOT NULL CHECK(to_status IN ('To ship','Shipped','Complete')),
 observed_at timestamptz NOT NULL,
 UNIQUE(order_id,observed_at)
);
CREATE TABLE IF NOT EXISTS erp_web.shopee_imports (
 collected_at timestamptz PRIMARY KEY,
 imported_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shopee_events_order_idx ON erp_web.shopee_status_events(order_id,observed_at);
CREATE INDEX IF NOT EXISTS shopee_orders_status_idx ON erp_web.shopee_orders(status,last_seen DESC);
GRANT SELECT,INSERT,UPDATE ON erp_web.shopee_orders TO nslabs_erp_web;
GRANT SELECT,INSERT ON erp_web.shopee_status_events,erp_web.shopee_imports TO nslabs_erp_web;
GRANT USAGE ON SEQUENCE erp_web.shopee_status_events_id_seq TO nslabs_erp_web;
COMMIT;
