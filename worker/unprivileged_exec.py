"""Set irreversible process restrictions before starting the API or renderer."""
import ctypes
import os
import resource
import sys


def main():
    if os.getuid() not in (10001,10002) or not sys.argv[1:]:
        raise SystemExit('Research processes require their dedicated system account.')
    libc=ctypes.CDLL(None,use_errno=True)
    if libc.prctl(38,1,0,0,0)!=0:  # PR_SET_NO_NEW_PRIVS
        raise SystemExit('Research process restrictions could not be applied.')
    resource.setrlimit(resource.RLIMIT_CORE,(0,0))
    os.umask(0o077)
    os.execvpe(sys.argv[1],sys.argv[1:],os.environ)


if __name__=='__main__':main()
