"""Public HTTPS validation and a DNS-pinning CONNECT proxy for Chromium's requests.

Browser Use domain rules govern navigation. This separate transport also covers
subresources and redirects, rejecting private/metadata addresses at connect time.
"""
from __future__ import annotations
import asyncio
import ipaddress
import socket
from urllib.parse import urlsplit, urlunsplit


def public_ip(value):
    try:
        ip = ipaddress.ip_address(value)
        if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped: ip = ip.ipv4_mapped
        return ip.is_global and not ip.is_multicast
    except ValueError: return False


def public_url(value):
    if not isinstance(value, str) or len(value) > 1500 or any(ord(c) < 33 for c in value): raise ValueError('invalid_sources')
    try:
        u = urlsplit(value)
        host = u.hostname
        if u.scheme != 'https' or not host or u.username or u.password or u.port not in (None, 443): raise ValueError()
        if host.endswith('.') or '.' not in host or host.endswith(('.local', '.internal', '.localhost', '.test', '.invalid')): raise ValueError()
        # Disallow literal IP sources; the connection proxy still checks all resolved IPs.
        try: ipaddress.ip_address(host)
        except ValueError: pass
        else: raise ValueError()
        return urlunsplit(('https', u.netloc.lower(), u.path or '/', u.query, ''))
    except (ValueError, UnicodeError): raise ValueError('invalid_sources') from None


async def resolve_public(host, port=443):
    try:
        addresses = await asyncio.wait_for(asyncio.get_running_loop().getaddrinfo(host, port, type=socket.SOCK_STREAM), 5)
    except (OSError, asyncio.TimeoutError): raise ValueError('invalid_sources') from None
    ips = list(dict.fromkeys(item[4][0] for item in addresses))
    if not ips or any(not public_ip(ip) for ip in ips): raise ValueError('invalid_sources')
    return ips


async def public_sources(values):
    if not isinstance(values, list) or not 1 <= len(values) <= 3: raise ValueError('invalid_sources')
    urls = list(dict.fromkeys(public_url(value) for value in values))
    await asyncio.gather(*(resolve_public(urlsplit(url).hostname) for url in urls))
    return urls


class PublicProxy:
    """No DIRECT fallback. Numeric connect pins DNS, including on redirected requests."""
    def __init__(self, resolver=resolve_public, dial=asyncio.open_connection):
        self.resolver=resolver; self.dial=dial; self.server=None; self.tasks=set(); self.writers=set()

    async def __aenter__(self):
        self.server = await asyncio.start_server(self.handle, '127.0.0.1', 0, limit=8192)
        self.url = 'http://127.0.0.1:' + str(self.server.sockets[0].getsockname()[1])
        return self

    async def __aexit__(self, *args):
        self.server.close(); await self.server.wait_closed()
        for writer in list(self.writers): writer.close()
        for task in list(self.tasks): task.cancel()
        await asyncio.gather(*list(self.tasks), return_exceptions=True)

    async def handle(self, reader, writer):
        task=asyncio.current_task(); self.tasks.add(task); self.writers.add(writer); upstream=None
        try:
            head = (await asyncio.wait_for(reader.readuntil(b'\r\n\r\n'), 8)).decode('ascii')
            first=head.split('\r\n', 1)[0].split(' ')
            if len(first)!=3 or first[0]!='CONNECT' or first[2] not in ('HTTP/1.1', 'HTTP/1.0'): raise ValueError()
            host, port=first[1].rsplit(':', 1)
            if port!='443' or not host or any(c in host for c in '/@[]%\\'): raise ValueError()
            ips=await self.resolver(host)
            if not ips or any(not public_ip(ip) for ip in ips): raise ValueError()
            remote, upstream=await asyncio.wait_for(self.dial(ips[0], 443), 8)
            self.writers.add(upstream)
            writer.write(b'HTTP/1.1 200 Connection Established\r\n\r\n'); await writer.drain()
            async def pipe(source, destination):
                total=0
                while True:
                    block=await asyncio.wait_for(source.read(65536), 45)
                    if not block: break
                    total+=len(block)
                    if total>32*1024*1024: break
                    destination.write(block); await destination.drain()
            pipes=[asyncio.create_task(pipe(reader, upstream)), asyncio.create_task(pipe(remote, writer))]
            try: await asyncio.wait(pipes, return_when=asyncio.FIRST_COMPLETED)
            finally:
                for item in pipes: item.cancel()
                await asyncio.gather(*pipes, return_exceptions=True)
        except (ValueError, OSError, UnicodeError, asyncio.TimeoutError, asyncio.IncompleteReadError, asyncio.LimitOverrunError):
            try: writer.write(b'HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n'); await writer.drain()
            except (OSError, ConnectionError): pass
        finally:
            if upstream: upstream.close(); self.writers.discard(upstream)
            writer.close(); self.writers.discard(writer); self.tasks.discard(task)
