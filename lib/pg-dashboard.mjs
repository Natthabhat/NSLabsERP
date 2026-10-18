export async function readDashboard(pool) {
 const result=await pool.query(`SELECT json_build_object(
 'costs',(SELECT coalesce(sum(total),0) FROM printing_expenses),
 'filament',(SELECT coalesce(sum(total),0) FROM filament_purchases),
 'sales',(SELECT coalesce(sum(price),0) FROM st_sales_log),
 'shipping',(SELECT coalesce(sum(shipping),0) FROM st_sales_log),
 'saleCount',(SELECT count(*) FROM st_sales_log),
 'payouts',(SELECT coalesce(sum(amount_thb),0) FROM platform_payouts WHERE is_confirmed),
 'pending',(SELECT coalesce(sum(amount_thb),0) FROM platform_payouts WHERE NOT is_confirmed),
 'categories',(SELECT coalesce(json_agg(r),'[]'::json) FROM (SELECT category::text AS name,sum(total) AS amount FROM printing_expenses GROUP BY category ORDER BY sum(total) DESC) r),
 'materials',(SELECT coalesce(json_agg(r),'[]'::json) FROM (SELECT filament_type::text AS name,sum(total) AS amount,sum(unit) AS units FROM filament_purchases GROUP BY filament_type ORDER BY sum(total) DESC) r),
 'platforms',(SELECT coalesce(json_agg(r),'[]'::json) FROM (SELECT platform::text AS name,sum(price) AS amount,count(*) AS count FROM st_sales_log GROUP BY platform ORDER BY sum(price) DESC) r),
 'monthly',(SELECT coalesce(json_agg(r ORDER BY month),'[]'::json) FROM (
 SELECT month,sum(sales) AS sales,sum(spending) AS spending FROM (
 SELECT to_char(sale_date,'YYYY-MM') AS month,sum(price) AS sales,0::numeric AS spending FROM st_sales_log GROUP BY 1
 UNION ALL SELECT to_char(order_date,'YYYY-MM'),0,sum(total) FROM printing_expenses GROUP BY 1
 UNION ALL SELECT to_char(order_date,'YYYY-MM'),0,sum(total) FROM filament_purchases GROUP BY 1
 ) months GROUP BY month ORDER BY month DESC LIMIT 12) r)
 ) AS dashboard`);
 return {...result.rows[0].dashboard,updatedAt:new Date().toISOString()};
}
