"""Run on the Ubuntu deployment as its owner. Does not print credentials."""
import pathlib, secrets, subprocess, urllib.parse, os
os.umask(0o077)
root = pathlib.Path(__file__).resolve().parent.parent
env_path = root / '.env.production'
config = dict(line.split('=',1) for line in env_path.read_text().splitlines() if '=' in line and not line.startswith('#'))
def sql(statement):
    result = subprocess.run(['docker','exec','-i','postgresql','psql','-U','natthabhat','-d','ns labs','-v','ON_ERROR_STOP=1','-At'],input=statement,text=True,capture_output=True)
    if result.returncode: raise RuntimeError('Database provisioning failed; credentials were not logged.')
    return result.stdout.strip()
exists = sql("SELECT 1 FROM pg_roles WHERE rolname='nslabs_erp_web';")
if exists:
    if not config.get('DATABASE_URL'): raise RuntimeError('ERP role already exists; supply its existing DATABASE_URL before proceeding.')
else:
    password = secrets.token_hex(32)
    sql("CREATE ROLE nslabs_erp_web LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '" + password + "';")
    config['DATABASE_URL']='postgresql://nslabs_erp_web:'+password+'@postgresql:5432/ns%20labs'
sql((root/'sql/001-postgres-access.sql').read_text())
config.update(DATA_BACKEND='postgres',POSTGRES_LOGIN_USER='natthabhat')
config.setdefault('SESSION_SECRET',secrets.token_hex(32))
env_path.write_text('\n'.join(k+'='+v for k,v in config.items())+'\n')
env_path.chmod(0o600)
print('Restricted ERP role and audit schema configured. Runtime credentials saved on the server only.')
