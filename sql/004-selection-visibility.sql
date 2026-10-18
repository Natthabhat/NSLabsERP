BEGIN;
ALTER TABLE erp_web.selection_options ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
CREATE OR REPLACE FUNCTION erp_web.set_selection_active(list_name text,stored_value text,enabled boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
 IF session_user NOT IN ('natthabhat','nslabs_erp_web') OR list_name NOT IN ('product_code','platform','filament_type','category') OR enabled IS NULL THEN RAISE EXCEPTION 'Invalid selection'; END IF;
 UPDATE erp_web.selection_options SET active=enabled WHERE list_key=list_name AND option_value=stored_value;
 IF NOT FOUND THEN RAISE EXCEPTION 'Selection not found'; END IF;
END $fn$;
REVOKE ALL ON FUNCTION erp_web.set_selection_active(text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erp_web.set_selection_active(text,text,boolean) TO nslabs_erp_web;
COMMIT;
