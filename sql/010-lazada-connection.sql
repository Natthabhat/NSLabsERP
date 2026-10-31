BEGIN;
CREATE TABLE IF NOT EXISTS erp_web.lazada_connection (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 app_key text NOT NULL,
 credentials text NOT NULL,
 tokens text,
 country text,
 seller_id text,
 connected_at timestamptz,
 checked_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE ON erp_web.lazada_connection TO nslabs_erp_web;
COMMIT;
