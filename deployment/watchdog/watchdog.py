"""Poll one private Git repository and deploy the ERP with health-based rollback."""
import datetime, fcntl, io, json, os, pathlib, re, subprocess, sys, tarfile, time


def log(message):
    print(datetime.datetime.now(datetime.timezone.utc).isoformat() + ' ' + message, flush=True)


class Watchdog:
    def __init__(self, root, repo, branch='main'):
        self.root = pathlib.Path(root).resolve()
        self.state_dir = self.root / '.watchdog'
        self.state_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
        self.repo_dir = self.state_dir / 'repo.git'
        self.state_file = self.state_dir / 'status.json'
        self.repo, self.branch = repo, branch
        self.override = self.state_dir / 'image.json'
        self.log_file = None

    def run(self, args, timeout=60):
        try:
            result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
        except subprocess.TimeoutExpired as error:
            raise RuntimeError(args[0] + ' timed out') from error
        if self.log_file:
            with self.log_file.open('a') as stream:
                stream.write(result.stdout + result.stderr)
        if result.returncode:
            raise RuntimeError(args[0] + ' failed (exit ' + str(result.returncode) + ')')
        return result.stdout.strip()

    def load(self):
        return json.loads(self.state_file.read_text()) if self.state_file.exists() else {}

    def store(self, state):
        temporary = self.state_file.with_suffix('.tmp')
        temporary.write_text(json.dumps(state, indent=2) + '\n')
        temporary.chmod(0o600)
        temporary.replace(self.state_file)

    def revision(self):
        if not self.repo_dir.exists():
            self.run(['git', 'init', '--bare', str(self.repo_dir)])
            self.run(['git', '-C', str(self.repo_dir), 'remote', 'add', 'origin', self.repo])
        self.run(['git', '-C', str(self.repo_dir), 'fetch', '--no-tags', 'origin', '+refs/heads/' + self.branch + ':refs/remotes/origin/' + self.branch], timeout=90)
        revision = self.run(['git', '-C', str(self.repo_dir), 'rev-parse', 'refs/remotes/origin/' + self.branch])
        if not re.fullmatch('[a-f0-9]{40,64}', revision):
            raise RuntimeError('Invalid Git revision')
        return revision

    def release(self, revision):
        path = self.state_dir / 'releases' / revision
        if not (path / '.complete').exists():
            path.mkdir(parents=True, exist_ok=True)
            archive = subprocess.run(['git', '-C', str(self.repo_dir), 'archive', revision], capture_output=True, check=True).stdout
            with tarfile.open(fileobj=io.BytesIO(archive)) as content:
                content.extractall(path, filter='data')
            (path / '.complete').touch()
        return path

    def compose(self, image, revision):
        # Keep the server-owned ports, secrets and network configuration stable.
        self.override.write_text(json.dumps({'services': {'erp': {'image': image, 'labels': {'org.opencontainers.image.revision': revision, 'com.centurylinklabs.watchtower.enable': 'false'}}}}))
        self.override.chmod(0o600)
        self.run(['docker', 'compose', '-p', 'nslabs-erp', '--project-directory', str(self.root), '-f', str(self.root / 'compose.yaml'), '-f', str(self.override), 'up', '-d', '--no-build', '--pull', 'never', 'erp'], timeout=120)

    def healthy(self):
        for _ in range(45):
            status = self.run(['docker', 'inspect', '--format', '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}', 'nslabs-erp-erp-1'])
            if status == 'healthy':
                return
            if status in ('unhealthy', 'exited', 'dead'):
                break
            time.sleep(2)
        raise RuntimeError('ERP health check failed')

    def tick(self):
        state = self.load()
        revision = self.revision()
        state.update(latest_revision=revision, last_check=time.time())
        self.store(state)
        if revision == state.get('deployed_revision'):
            return False
        if revision == state.get('failed_revision') and time.time() - state.get('failed_at', 0) < 300:
            return False
        log('New main revision ' + revision[:12] + ': building ERP')
        logs = self.state_dir / 'logs'
        logs.mkdir(exist_ok=True)
        self.log_file = logs / (revision + '.log')
        deployment_attempted = False
        old_image = None
        try:
            source = self.release(revision)
            image = 'nslabs-erp:' + revision
            # The repository Dockerfile runs its tests and production build.
            self.run(['docker', 'build', '--label', 'org.opencontainers.image.revision=' + revision, '-t', image, str(source)], timeout=1200)
            old_image = self.run(['docker', 'inspect', '--format', '{{.Image}}', 'nslabs-erp-erp-1'])
            self.run(['docker', 'tag', old_image, 'nslabs-erp:watchdog-rollback'])
            deployment_attempted = True
            self.compose(image, revision)
            self.healthy()
            self.run(['docker', 'tag', image, 'nslabs-erp:local'])
            state.update(previous_revision=state.get('deployed_revision'), deployed_revision=revision, deployed_at=time.time(), status='healthy')
            state.pop('failed_revision', None)
            state.pop('last_error', None)
            self.store(state)
            log('Deployed ' + revision[:12] + ': ERP healthy')
            return True
        except Exception as error:
            rolled_back = False
            if deployment_attempted and old_image:
                try:
                    self.compose('nslabs-erp:watchdog-rollback', state.get('deployed_revision', 'previous'))
                    self.healthy()
                    rolled_back = True
                    log('Previous ERP image restored')
                except Exception:
                    log('Rollback needs operator attention')
            state.update(failed_revision=revision, failed_at=time.time(), last_error=str(error), status='rolled_back' if rolled_back else 'failed')
            self.store(state)
            raise
        finally:
            self.log_file = None


def main():
    os.umask(0o077)
    watcher = Watchdog(os.environ['DEPLOY_ROOT'], os.environ['REPO_URL'], os.environ.get('REPO_BRANCH', 'main'))
    interval = max(30, int(os.environ.get('POLL_SECONDS', '60')))
    with (watcher.state_dir / 'lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        log('NS Labs Git watcher started: main, interval ' + str(interval) + ' seconds')
        while True:
            try:
                watcher.tick()
            except Exception as error:
                log('Update check failed: ' + str(error))
            if '--once' in sys.argv:
                break
            time.sleep(interval)


if __name__ == '__main__':
    main()
