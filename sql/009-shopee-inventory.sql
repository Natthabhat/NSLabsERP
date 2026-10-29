BEGIN;
CREATE TABLE IF NOT EXISTS erp_web.shopee_inventory_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 enabled_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO erp_web.shopee_inventory_settings(id) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS erp_web.shopee_inventory_lines (
 order_id text NOT NULL,
 line_key text NOT NULL,
 product_id uuid,
 target_sku text,
 applied_quantity integer NOT NULL DEFAULT 0 CHECK(applied_quantity>=0),
 desired_quantity integer NOT NULL CHECK(desired_quantity>=0),
 issue text,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(order_id,line_key)
);
CREATE TABLE IF NOT EXISTS erp_web.shopee_stock_movements (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 order_id text NOT NULL,
 line_key text NOT NULL,
 product_id uuid NOT NULL,
 sku text NOT NULL,
 quantity_change integer NOT NULL CHECK(quantity_change<>0),
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON erp_web.shopee_inventory_settings TO nslabs_erp_web;
GRANT SELECT,INSERT,UPDATE ON erp_web.shopee_inventory_lines TO nslabs_erp_web;
GRANT SELECT,INSERT ON erp_web.shopee_stock_movements TO nslabs_erp_web;
GRANT USAGE ON SEQUENCE erp_web.shopee_stock_movements_id_seq TO nslabs_erp_web;
COMMIT;
