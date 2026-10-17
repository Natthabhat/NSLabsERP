BEGIN;
CREATE SCHEMA IF NOT EXISTS erp_web AUTHORIZATION natthabhat;
CREATE TABLE IF NOT EXISTS erp_web.edits (
 actor text NOT NULL,
 operation_id text NOT NULL,
 digest text NOT NULL,
 table_name text NOT NULL,
 record_id integer NOT NULL,
 column_name text NOT NULL,
 old_value jsonb,
 new_value jsonb,
 result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(actor,operation_id)
);
GRANT CONNECT ON DATABASE "ns labs" TO nslabs_erp_web;
GRANT USAGE ON SCHEMA public,erp_web TO nslabs_erp_web;
GRANT SELECT ON public.printing_expenses,public.filament_purchases,public.st_sales_log,public.platform_payouts TO nslabs_erp_web;
GRANT UPDATE(item_order,unit,price,order_date,category) ON public.printing_expenses TO nslabs_erp_web;
GRANT UPDATE(item_order,unit,price,order_date,filament_type) ON public.filament_purchases TO nslabs_erp_web;
GRANT UPDATE(product_code,platform,sale_date,price,shipping,buyer) ON public.st_sales_log TO nslabs_erp_web;
GRANT UPDATE(payout_code,payout_date,amount_thb,is_confirmed) ON public.platform_payouts TO nslabs_erp_web;
GRANT SELECT,INSERT ON erp_web.edits TO nslabs_erp_web;
COMMIT;
