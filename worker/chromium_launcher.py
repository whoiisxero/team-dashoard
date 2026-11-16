#!/usr/bin/env python3
"""Launch Chromium without worker secrets or the SDK's automatic no-sandbox flags."""
import os
import sys

SAFE_ENV={'PATH','HOME','LANG','LANGUAGE','LC_ALL','LC_CTYPE','TZ','TMPDIR','XDG_CACHE_HOME','XDG_CONFIG_HOME','XDG_RUNTIME_DIR','DISPLAY','WAYLAND_DISPLAY'}
UNSAFE_FLAGS={'--no-sandbox','--disable-setuid-sandbox','--disable-gpu-sandbox','--no-zygote','--single-process','--disable-web-security','--ignore-certificate-errors','--allow-running-insecure-content','--disable-site-isolation-trials'}


def launch_spec(arguments,environ):
    args=[arg for arg in arguments if arg.split('=',1)[0] not in UNSAFE_FLAGS]
    return ['/usr/bin/chromium',*args,'--site-per-process'],{key:value for key,value in environ.items() if key in SAFE_ENV}


if __name__=='__main__':
    argv,env=launch_spec(sys.argv[1:],os.environ)
    os.execve(argv[0],argv,env)
