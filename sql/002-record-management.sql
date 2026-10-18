BEGIN;
CREATE TABLE IF NOT EXISTS erp_web.custom_columns (
 table_name text NOT NULL CHECK(table_name IN ('printing_expenses','filament_purchases','st_sales_log','platform_payouts')),
 column_key text NOT NULL CHECK(column_key ~ '^custom_[a-f0-9]{24}$'),
 label text NOT NULL CHECK(length(label) BETWEEN 1 AND 60),
 field_type text NOT NULL CHECK(field_type IN ('text','number','date','boolean')),
 position bigint GENERATED ALWAYS AS IDENTITY,
 PRIMARY KEY(table_name,column_key),UNIQUE(table_name,label)
);
GRANT SELECT ON erp_web.custom_columns TO nslabs_erp_web;
CREATE OR REPLACE FUNCTION erp_web.add_column(target_table text,column_label text,column_type text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE new_key text; sql_type text;
BEGIN
 IF session_user NOT IN ('natthabhat','nslabs_erp_web') THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF target_table NOT IN ('printing_expenses','filament_purchases','st_sales_log','platform_payouts') OR column_type NOT IN ('text','number','date','boolean') OR column_label IS NULL OR length(trim(column_label)) NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION 'Invalid column'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('erp-columns:'||target_table,0));
 IF (SELECT count(*) FROM erp_web.custom_columns WHERE table_name=target_table)>=30 THEN RAISE EXCEPTION 'Maximum 30 additional columns per table'; END IF;
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=target_table AND lower(column_name)=lower(trim(column_label))) OR EXISTS(SELECT 1 FROM erp_web.custom_columns WHERE table_name=target_table AND lower(label)=lower(trim(column_label))) THEN RAISE EXCEPTION 'Column already exists'; END IF;
 new_key:='custom_'||substr(replace(gen_random_uuid()::text,'-',''),1,24);
 sql_type:=CASE column_type WHEN 'number' THEN 'numeric' WHEN 'date' THEN 'date' WHEN 'boolean' THEN 'boolean' ELSE 'text' END;
 EXECUTE format('ALTER TABLE public.%I ADD COLUMN %I %s',target_table,new_key,sql_type);
 INSERT INTO erp_web.custom_columns(table_name,column_key,label,field_type) VALUES(target_table,new_key,trim(column_label),column_type);
 EXECUTE format('GRANT UPDATE (%I) ON public.%I TO nslabs_erp_web',new_key,target_table);
 RETURN new_key;
END $fn$;
REVOKE ALL ON FUNCTION erp_web.add_column(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erp_web.add_column(text,text,text) TO nslabs_erp_web;
GRANT INSERT ON public.printing_expenses,public.filament_purchases,public.st_sales_log,public.platform_payouts TO nslabs_erp_web;
GRANT USAGE ON SEQUENCE public.printing_expenses_id_seq,public.filament_purchases_id_seq,public.st_sales_log_id_seq,public.platform_payouts_id_seq TO nslabs_erp_web;
COMMIT;
