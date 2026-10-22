BEGIN;
CREATE TABLE IF NOT EXISTS erp_web.pages (
 id bigint GENERATED ALWAYS AS IDENTITY (START WITH 3000000000 MAXVALUE 9000000000000) PRIMARY KEY,
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 60),
 group_name text NOT NULL CHECK(group_name IN ('Workshop','Pricing','Marketplaces')),
 table_key text UNIQUE NOT NULL CHECK(table_key ~ '^erp_page_[0-9]+$'),
 operation_id text UNIQUE NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(group_name,title)
);
GRANT SELECT ON erp_web.pages TO nslabs_erp_web;
ALTER TABLE erp_web.custom_columns DROP CONSTRAINT IF EXISTS custom_columns_table_name_check;
ALTER TABLE erp_web.custom_columns ADD CONSTRAINT custom_columns_table_name_check CHECK(table_name IN ('printing_expenses','filament_purchases','st_sales_log','platform_payouts') OR table_name ~ '^erp_page_[0-9]+$');
CREATE OR REPLACE FUNCTION erp_web.create_page(page_title text,page_group text,request_id text) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE page_id bigint; new_table text;
BEGIN
 IF session_user NOT IN ('natthabhat','nslabs_erp_web') OR page_title IS NULL OR length(trim(page_title)) NOT BETWEEN 1 AND 60 OR page_group NOT IN ('Workshop','Pricing','Marketplaces') OR request_id IS NULL OR request_id !~ '^[-a-zA-Z0-9]{16,80}$' THEN RAISE EXCEPTION 'Invalid page'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('erp-page-create',0));
 SELECT id INTO page_id FROM erp_web.pages WHERE operation_id=request_id;
 IF page_id IS NOT NULL THEN RETURN page_id; END IF;
 IF (SELECT count(*) FROM erp_web.pages)>=50 THEN RAISE EXCEPTION 'Maximum 50 custom pages'; END IF;
 page_id:=nextval(pg_get_serial_sequence('erp_web.pages','id'));new_table:='erp_page_'||page_id;
 INSERT INTO erp_web.pages(id,title,group_name,table_key,operation_id) OVERRIDING SYSTEM VALUE VALUES(page_id,trim(page_title),page_group,new_table,request_id);
 EXECUTE format('CREATE TABLE public.%I (id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 255),entry_date date,amount numeric(18,2),notes text,created_at timestamptz DEFAULT now())',new_table);
 EXECUTE format('GRANT SELECT,INSERT ON public.%I TO nslabs_erp_web',new_table);
 EXECUTE format('GRANT UPDATE(name,entry_date,amount,notes) ON public.%I TO nslabs_erp_web',new_table);
 EXECUTE format('GRANT USAGE ON SEQUENCE public.%I TO nslabs_erp_web',new_table||'_id_seq');
 RETURN page_id;
END $fn$;
CREATE OR REPLACE FUNCTION erp_web.add_page_column(target_table text,column_label text,column_type text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE new_key text;sql_type text;
BEGIN
 IF session_user NOT IN ('natthabhat','nslabs_erp_web') OR NOT EXISTS(SELECT 1 FROM erp_web.pages WHERE table_key=target_table) OR column_type NOT IN ('text','number','date','boolean') OR column_label IS NULL OR length(trim(column_label)) NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION 'Invalid page column'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('erp-columns:'||target_table,0));
 IF (SELECT count(*) FROM erp_web.custom_columns WHERE table_name=target_table)>=30 THEN RAISE EXCEPTION 'Maximum 30 additional columns'; END IF;
 IF lower(trim(column_label)) IN ('name','date','amount','notes','id','created_at') OR EXISTS(SELECT 1 FROM erp_web.custom_columns WHERE table_name=target_table AND lower(label)=lower(trim(column_label))) THEN RAISE EXCEPTION 'Column already exists'; END IF;
 new_key:='custom_'||substr(replace(gen_random_uuid()::text,'-',''),1,24);sql_type:=CASE column_type WHEN 'number' THEN 'numeric' WHEN 'date' THEN 'date' WHEN 'boolean' THEN 'boolean' ELSE 'text' END;
 EXECUTE format('ALTER TABLE public.%I ADD COLUMN %I %s',target_table,new_key,sql_type);
 INSERT INTO erp_web.custom_columns(table_name,column_key,label,field_type) VALUES(target_table,new_key,trim(column_label),column_type);
 EXECUTE format('GRANT UPDATE(%I) ON public.%I TO nslabs_erp_web',new_key,target_table);RETURN new_key;
END $fn$;
REVOKE ALL ON FUNCTION erp_web.create_page(text,text,text),erp_web.add_page_column(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erp_web.create_page(text,text,text),erp_web.add_page_column(text,text,text) TO nslabs_erp_web;
COMMIT;
