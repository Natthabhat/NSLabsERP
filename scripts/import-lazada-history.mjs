import {lazadaAccess,lazadaReader} from '../lib/lazada.mjs';
import {importLazadaHistory} from '../lib/lazada-history.mjs';
import {database} from '../lib/database.mjs';
try{const report=await importLazadaHistory(lazadaAccess,lazadaReader);console.log(JSON.stringify({status:report.importStatus,orders:report.storedCount}));}
catch{console.error('Lazada history import stopped. Progress is saved in the ERP database.');process.exitCode=1;}
finally{await database().end();}
