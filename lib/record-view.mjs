export function recordView(rows, headers, types=[], view={}) {
  const sort=view.sort==null?types.indexOf('date'):Number(view.sort);
  const direction=view.direction==='asc'?1:-1;
  const filters=view.filters||{};
  const result=rows.filter(row=>Object.entries(filters).every(([i,value])=>String(row.values[i]??'').toLowerCase().includes(String(value).toLowerCase())));
  result.sort((a,b)=>{
    const av=a.values[sort],bv=b.values[sort];
    if(av==null||av==='')return bv==null||bv===''?b.row-a.row:1;
    if(bv==null||bv==='')return -1;
    const cmp=types[sort]==='number'?Number(String(av).replace(/[^0-9.-]/g,''))-Number(String(bv).replace(/[^0-9.-]/g,'')):String(av).localeCompare(String(bv),undefined,{numeric:true,sensitivity:'base'});
    return direction*cmp||b.row-a.row;
  });
  return {rows:result,sort,fields:headers.map((_,i)=>({type:types[i]||'text'}))};
}
