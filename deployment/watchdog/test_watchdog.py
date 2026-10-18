import pathlib,tempfile,unittest
from watchdog import Watchdog

REV='a'*40
OLD='b'*40
class Fake(Watchdog):
    def __init__(self,root):
        super().__init__(root,'git@example.invalid:repo.git')
        self.commands=[];self.deployments=[];self.build_fails=False;self.health_fails=False
    def revision(self): return REV
    def release(self,revision): return self.root/'fixture'
    def run(self,args,timeout=60):
        self.commands.append(args)
        if args[:2]==['docker','build'] and self.build_fails: raise RuntimeError('fixture build failure')
        return 'sha256:old-image' if args[:2]==['docker','inspect'] else ''
    def compose(self,image,revision): self.deployments.append((image,revision))
    def healthy(self):
        if self.health_fails:
            self.health_fails=False
            raise RuntimeError('fixture unhealthy image')

class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.directory=tempfile.TemporaryDirectory();self.addCleanup(self.directory.cleanup)
        self.watcher=Fake(self.directory.name)
    def test_unchanged_revision_does_not_rebuild_or_restart(self):
        self.watcher.store({'deployed_revision':REV})
        self.assertFalse(self.watcher.tick());self.assertEqual(self.watcher.commands,[]);self.assertEqual(self.watcher.deployments,[])
    def test_build_failure_preserves_running_revision_and_retries_later(self):
        self.watcher.store({'deployed_revision':OLD});self.watcher.build_fails=True
        with self.assertRaisesRegex(RuntimeError,'build failure'): self.watcher.tick()
        self.assertEqual(self.watcher.load()['deployed_revision'],OLD);self.assertEqual(self.watcher.deployments,[])
        self.assertFalse(self.watcher.tick())
    def test_unhealthy_update_restores_previous_image(self):
        self.watcher.store({'deployed_revision':OLD});self.watcher.health_fails=True
        with self.assertRaisesRegex(RuntimeError,'unhealthy'): self.watcher.tick()
        self.assertEqual(self.watcher.load()['status'],'rolled_back');self.assertEqual(self.watcher.load()['deployed_revision'],OLD)
        self.assertEqual(self.watcher.deployments[-1],('nslabs-erp:watchdog-rollback',OLD))
    def test_success_records_new_revision_after_health_check(self):
        self.watcher.store({'deployed_revision':OLD})
        self.assertTrue(self.watcher.tick());self.assertEqual(self.watcher.load()['deployed_revision'],REV)
        self.assertEqual(self.watcher.load()['previous_revision'],OLD)
        self.assertIn(['docker','tag','nslabs-erp:'+REV,'nslabs-erp:local'],self.watcher.commands)

if __name__=='__main__': unittest.main()
