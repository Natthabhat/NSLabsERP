import {pgModule} from './postgres-model.mjs';

export function nextPayoutCode(platform,previous) {
  const match=typeof previous==='string'?/^(.*?)(\d+)\s*$/.exec(previous.trim()):null;
  if(!match)return `${platform} 1`;
  const value=(BigInt(match[2])+1n).toString().padStart(match[2].length,'0');
  const code=match[1]+value;
  return code.length<=255?code:'';
}
export async function readPayoutDefaults(pool,tab) {
  const config=pgModule(tab);
  if(config.table!=='platform_payouts')return {};
  // Scan the complete marketplace, independent of visible filters, dates and pages.
  const pattern=`^[[:space:]]*${config.platform}[[:space:]_-]*[0-9]+[[:space:]]*$`;
  const result=await pool.query(`SELECT payout_code FROM public.platform_payouts WHERE platform::text=$1 AND payout_code ~* $2 ORDER BY ((regexp_match(payout_code,'([0-9]+)[[:space:]]*$'))[1])::numeric DESC,id DESC LIMIT 1`,[config.platform,pattern]);
  return {payout_code:nextPayoutCode(config.platform,result.rows[0]?.payout_code)};
}
