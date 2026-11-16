"""Hosted entrypoint checks; they make no paid API requests."""
import contextlib,io,os,subprocess,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from worker.chromium_launcher import launch_spec,UNSAFE_FLAGS
from worker.start import main


class HostingTest(unittest.TestCase):
    def test_browser_gets_no_worker_keys_or_sandbox_disabling_flags(self):
        original={'PATH':'/usr/bin','HOME':'/home/quest','LANG':'C.UTF-8','OPENAI_API_KEY':'secret-openai-test','Q_RESEARCH_WORKER_SECRET':'secret-worker-test','GH_TOKEN':'secret-github-test','SUPABASE_SERVICE_ROLE_KEY':'secret-supabase-test'}
        command,env=launch_spec(['--headless=new','--no-sandbox','--disable-setuid-sandbox','--disable-gpu-sandbox','--ignore-certificate-errors','--disable-web-security','--remote-debugging-port=12345'],original)
        self.assertEqual(command[0],'/usr/bin/chromium');self.assertIn('--site-per-process',command)
        self.assertFalse(set(arg.split('=',1)[0] for arg in command)&UNSAFE_FLAGS)
        self.assertEqual(set(env),{'PATH','HOME','LANG'});self.assertNotIn('secret-',str(env))

    def test_start_checks_browser_before_accepting_requests(self):
        with tempfile.TemporaryDirectory() as temp,patch.dict(os.environ,{'Q_RESEARCH_DATA':temp,'OPENAI_API_KEY':'test-only-not-real','Q_RESEARCH_WORKER_SECRET':'test-worker-secret-at-least-thirty-two-characters','PORT':'8080'}),patch('worker.start.subprocess.run') as run,patch('uvicorn.run') as serve:
            run.return_value=subprocess.CompletedProcess([],0,b'<html><head></head><body></body></html>',b'')
            self.assertEqual(main(),0);run.assert_called_once();serve.assert_called_once()
            self.assertNotIn('--no-sandbox',run.call_args.args[0]);self.assertEqual(run.call_args.kwargs['timeout'],20)
            self.assertEqual(serve.call_args.kwargs['workers'],1);self.assertEqual(serve.call_args.kwargs['port'],8080)
            self.assertFalse(list(Path(temp).glob('preflight-*')))

    def test_failed_browser_or_missing_key_never_starts_api(self):
        for missing_key in [False,True]:
            with tempfile.TemporaryDirectory() as temp,patch.dict(os.environ,{'Q_RESEARCH_DATA':temp,'OPENAI_API_KEY':'' if missing_key else 'secret-test-key','Q_RESEARCH_WORKER_SECRET':'test-worker-secret-at-least-thirty-two-characters'}),patch('worker.start.subprocess.run') as run,patch('uvicorn.run') as serve,contextlib.redirect_stderr(io.StringIO()) as output:
                run.return_value=subprocess.CompletedProcess([],1,b'',b'private upstream error secret-test-key')
                self.assertEqual(main(),1);serve.assert_not_called();self.assertNotIn('secret-test-key',output.getvalue())
                if missing_key:run.assert_not_called()


if __name__=='__main__':unittest.main(verbosity=2)
