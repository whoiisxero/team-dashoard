"""Fail deployment before readiness if credentials, storage or sandboxed Chrome are missing."""
import os
import subprocess
import sys
import tempfile
from .settings import Settings,privacy_environment


def main():
    settings=Settings.from_env();privacy_environment(settings.data)
    if not settings.api_key or len(settings.secret)<32:
        print('Q Research setup needs OPENAI_API_KEY and a private worker secret of at least 32 characters.',file=sys.stderr);return 1
    try:
        settings.data.mkdir(parents=True,exist_ok=True);settings.data.chmod(0o700)
        with tempfile.TemporaryDirectory(prefix='preflight-',dir=settings.data) as profile:
            binary=os.getenv('QUEST_BROWSER_EXECUTABLE','/app/worker/chromium_launcher.py')
            result=subprocess.run([binary,'--headless=new','--disable-dev-shm-usage','--disable-background-networking','--no-first-run',f'--user-data-dir={profile}','--dump-dom','about:blank'],capture_output=True,timeout=20)
            if result.returncode!=0 or b'<html' not in result.stdout:raise RuntimeError('browser_startup')
    except (OSError,subprocess.TimeoutExpired,RuntimeError):
        print('Q Research could not start sandboxed Chromium or write its private data volume. Check the host supports Chromium user namespaces and that /data belongs to UID 10001. Research has not been enabled.',file=sys.stderr);return 1
    import uvicorn
    uvicorn.run('worker.app:app',host='0.0.0.0',port=int(os.getenv('PORT','8080')),workers=1,access_log=False)
    return 0


if __name__=='__main__':sys.exit(main())
