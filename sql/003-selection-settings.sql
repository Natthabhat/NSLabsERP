BEGIN;
CREATE TABLE IF NOT EXISTS erp_web.selection_options (
 list_key text NOT NULL CHECK(list_key IN ('product_code','platform','filament_type','category')),
 option_value text NOT NULL CHECK(length(option_value) BETWEEN 1 AND 60),
 label text NOT NULL CHECK(length(label) BETWEEN 1 AND 60),
 position bigint GENERATED ALWAYS AS IDENTITY,
 PRIMARY KEY(list_key,option_value),UNIQUE(list_key,label)
);
INSERT INTO erp_web.selection_options(list_key,option_value,label) SELECT 'product_code','ST'||lpad(n::text,3,'0'),'ST'||lpad(n::text,3,'0') FROM generate_series(1,14)n ON CONFLICT DO NOTHING;
INSERT INTO erp_web.selection_options(list_key,option_value,label)
SELECT CASE a.attname WHEN 'filament_type' THEN 'filament_type' WHEN 'category' THEN 'category' ELSE 'platform' END,e.enumlabel,e.enumlabel
FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace ns ON ns.oid=c.relnamespace JOIN pg_enum e ON e.enumtypid=a.atttypid
WHERE ns.nspname='public' AND ((c.relname='filament_purchases' AND a.attname='filament_type') OR (c.relname='printing_expenses' AND a.attname='category') OR (c.relname='st_sales_log' AND a.attname='platform')) ORDER BY e.enumsortorder ON CONFLICT DO NOTHING;
GRANT SELECT ON erp_web.selection_options TO nslabs_erp_web;
CREATE OR REPLACE FUNCTION erp_web.save_selection(list_name text,stored_value text,display_label text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE target_table text; target_field text; enum_schema text; enum_name text;
BEGIN
 IF session_user NOT IN ('natthabhat','nslabs_erp_web') OR list_name NOT IN ('product_code','platform','filament_type','category') OR stored_value IS NULL OR display_label IS NULL OR length(trim(stored_value)) NOT BETWEEN 1 AND 60 OR length(trim(display_label)) NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION 'Invalid selection'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('erp-selections:'||list_name,0));
 IF EXISTS(SELECT 1 FROM erp_web.selection_options WHERE list_key=list_name AND option_value=stored_value) THEN
  UPDATE erp_web.selection_options SET label=trim(display_label) WHERE list_key=list_name AND option_value=stored_value;
 ELSE
  IF (SELECT count(*) FROM erp_web.selection_options WHERE list_key=list_name)>=200 THEN RAISE EXCEPTION 'Selection limit reached'; END IF;
  IF list_name<>'product_code' THEN
   target_table:=CASE list_name WHEN 'platform' THEN 'st_sales_log' WHEN 'filament_type' THEN 'filament_purchases' ELSE 'printing_expenses' END;target_field:=list_name;
   SELECT tn.nspname,t.typname INTO enum_schema,enum_name FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace ns ON ns.oid=c.relnamespace JOIN pg_type t ON t.oid=a.atttypid JOIN pg_namespace tn ON tn.oid=t.typnamespace WHERE ns.nspname='public' AND c.relname=target_table AND a.attname=target_field AND t.typtype='e';
   IF enum_name IS NULL THEN RAISE EXCEPTION 'Selection type not found'; END IF;
   EXECUTE format('ALTER TYPE %I.%I ADD VALUE IF NOT EXISTS %L',enum_schema,enum_name,stored_value);
  END IF;
  INSERT INTO erp_web.selection_options(list_key,option_value,label) VALUES(list_name,trim(stored_value),trim(display_label));
 END IF;
 RETURN stored_value;
END $fn$;
REVOKE ALL ON FUNCTION erp_web.save_selection(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erp_web.save_selection(text,text,text) TO nslabs_erp_web;
COMMIT;
