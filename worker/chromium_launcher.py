#!/usr/bin/env python3
"""Request the dedicated container browser; direct local launches keep native sandbox flags."""
import os
import sys
import socket
import json
import base64

SAFE_ENV={'PATH','HOME','LANG','LANGUAGE','LC_ALL','LC_CTYPE','TZ','TMPDIR','XDG_CACHE_HOME','XDG_CONFIG_HOME','XDG_RUNTIME_DIR','DISPLAY','WAYLAND_DISPLAY'}
UNSAFE_FLAGS={'--no-sandbox','--disable-setuid-sandbox','--disable-gpu-sandbox','--no-zygote','--single-process','--disable-web-security','--ignore-certificate-errors','--allow-running-insecure-content','--disable-site-isolation-trials'}


def launch_spec(arguments,environ):
    args=[arg for arg in arguments if arg.split('=',1)[0] not in UNSAFE_FLAGS]
    return ['/usr/bin/chromium',*args,'--site-per-process'],{key:value for key,value in environ.items() if key in SAFE_ENV}


if __name__=='__main__':
    path=os.getenv('Q_RESEARCH_BROWSER_SOCKET')
    if path:
        if os.getuid()!=10001:raise SystemExit('The browser launcher requires the API account.')
        with socket.socket(socket.AF_UNIX) as connection:
            connection.connect(path);connection.sendall(json.dumps({'args':sys.argv[1:]}).encode()+b'\n')
            with connection.makefile('rb') as messages:
                for raw in messages:
                    item=json.loads(raw)
                    if 'exit' in item:raise SystemExit(item['exit'] if item['exit']>=0 else 1)
                    if 'error' in item:raise SystemExit('The isolated browser could not start.')
                    target=sys.stdout.buffer if item['stream']=='stdout' else sys.stderr.buffer
                    target.write(base64.b64decode(item['data'],validate=True));target.flush()
        raise SystemExit(1)
    else:
        argv,env=launch_spec(sys.argv[1:],os.environ)
        os.execve(argv[0],argv,env)
