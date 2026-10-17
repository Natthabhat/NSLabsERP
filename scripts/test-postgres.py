"""Create an isolated fixture database, run integration tests, then remove it."""
import pathlib,subprocess,urllib.parse,os
os.umask(0o077)
root=pathlib.Path(__file__).resolve().parent.parent
config=dict(line.split('=',1) for line in (root/'.env.production').read_text().splitlines() if '=' in line and not line.startswith('#'))
base=['docker','exec','postgresql']
def run(args,**kw): return subprocess.run(args,check=True,**kw)
def query(statement,database='postgres'):
 return subprocess.check_output(base+['psql','-U','natthabhat','-d',database,'-Atc',statement],text=True).strip()
if query("SELECT 1 FROM pg_database WHERE datname='nslabs_erp_test'"): raise RuntimeError('Fixture database already exists; refusing to overwrite it.')
schema=subprocess.check_output(base+['pg_dump','-U','natthabhat','-d','ns labs','--schema-only','-n','public','-n','erp_web'])
run(base+['createdb','-U','natthabhat','--owner=natthabhat','nslabs_erp_test'])
try:
 run(['docker','exec','-i','postgresql','psql','-U','natthabhat','-d','nslabs_erp_test','-v','ON_ERROR_STOP=1'],input=schema.replace(b'CREATE SCHEMA public;',b''),stdout=subprocess.DEVNULL)
 query("INSERT INTO public.printing_expenses(item_order,unit,price,order_date,category) VALUES('fixture expense',2,10,'2026-10-17','Machine'); INSERT INTO public.platform_payouts(payout_code,platform,payout_date,amount_thb,is_confirmed) VALUES('fixture payout','Ebay','2026-10-17',20,false);",'nslabs_erp_test')
 url=urllib.parse.urlsplit(config['DATABASE_URL'])
 fixture_url=urllib.parse.urlunsplit(url._replace(path='/nslabs_erp_test'))
 env_path=root/'.env.integration'
 env_path.write_text('TEST_DATABASE_URL='+fixture_url+'\n')
 env_path.chmod(0o600)
 run(['docker','run','--rm','--network','nslabs-db-admin','--env-file',str(env_path),'nslabs-erp:postgres-tests','node','--test','tests/postgres.integration.test.mjs'])
finally:
 run(base+['dropdb','-U','natthabhat','--if-exists','nslabs_erp_test'])
 (root/'.env.integration').unlink(missing_ok=True)
