BEGIN;
CREATE TABLE IF NOT EXISTS erp_web.products (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 160),
 sku text NOT NULL UNIQUE CHECK(length(sku) BETWEEN 1 AND 80),
 description text NOT NULL DEFAULT '' CHECK(length(description)<=4000),
 quantity integer NOT NULL DEFAULT 0 CHECK(quantity BETWEEN 0 AND 1000000000),
 picture bytea,
 picture_type text CHECK(picture_type IN ('image/png','image/jpeg','image/webp')),
 version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(picture IS NULL OR octet_length(picture)<=2097152)
);
CREATE TABLE IF NOT EXISTS erp_web.product_variants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 product_id uuid NOT NULL REFERENCES erp_web.products(id) ON DELETE CASCADE,
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 160),
 sku text NOT NULL UNIQUE CHECK(length(sku) BETWEEN 1 AND 80),
 quantity integer NOT NULL DEFAULT 0 CHECK(quantity BETWEEN 0 AND 1000000000),
 position integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS product_variants_product_idx ON erp_web.product_variants(product_id);
GRANT SELECT, INSERT, UPDATE ON erp_web.products TO nslabs_erp_web;
GRANT SELECT, INSERT, UPDATE, DELETE ON erp_web.product_variants TO nslabs_erp_web;
COMMIT;
