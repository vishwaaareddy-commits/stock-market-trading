"""Resolve the real client address without ever trusting a client-supplied value.

Threat model: anyone can send `X-Forwarded-For: <anything>`. Each *trusted* proxy APPENDS the
address of the peer it saw to the right-hand end of that header, so entries on the left are
client-controlled and only the entries added by our own proxies are reliable.

Therefore, with N trusted proxies in front of the app (TRUSTED_PROXY_HOPS=N) the client is the
N-th entry counted FROM THE RIGHT. Forging extra entries on the left cannot change that value.

Fail closed: with hops=0 (default), or whenever the header cannot be validated, forwarding
headers are ignored and only the direct TCP peer is used. If that peer is a private/loopback
address it is almost certainly a proxy, not a client, so no per-IP throttling bucket is used
(per-account throttling still applies). That avoids one attacker locking every user out of a
shared "proxy IP" bucket.

Residual risk, documented in the README: if the app can also be reached directly (bypassing the
proxy that overwrites X-Forwarded-For), an attacker can craft a header with exactly N entries.
Use TRUSTED_PROXY_SECRET and/or TRUSTED_PROXY_CIDRS to require proof that the request came
through the trusted proxy.
"""

import hmac
import ipaddress
from dataclasses import dataclass
from typing import Literal

from app.core.config import Settings


@dataclass(frozen=True)
class ClientIdentity:
    address: str | None  # best-known address, used for audit/session records
    throttle_key: str | None  # None => per-IP throttling is NOT applied (identity unreliable)
    source: Literal["peer", "forwarded", "unverified"]


def _parse(value: str) -> ipaddress.IPv4Address | ipaddress.IPv6Address | None:
    try:
        return ipaddress.ip_address(value.strip())
    except ValueError:
        return None


def _proxy_proof_ok(peer: str | None, secret_header: str | None, settings: Settings) -> bool:
    if settings.trusted_proxy_cidrs:
        ip = _parse(peer or "")
        if ip is None:
            return False
        try:
            nets = [ipaddress.ip_network(c, strict=False) for c in settings.trusted_proxy_cidrs]
        except ValueError:
            return False  # misconfigured CIDR: fail closed
        if not any(ip in n for n in nets):
            return False
    if settings.trusted_proxy_secret:
        if not secret_header or not hmac.compare_digest(secret_header, settings.trusted_proxy_secret):
            return False
    return True


def _from_peer(peer: str | None) -> ClientIdentity:
    if not peer:
        return ClientIdentity(None, None, "unverified")
    ip = _parse(peer)
    if ip is None:  # opaque transport address (e.g. test clients, unix sockets)
        return ClientIdentity(peer[:64], peer[:64], "peer")
    if ip.is_global:  # directly internet-facing: the peer IS the client
        return ClientIdentity(str(ip), str(ip), "peer")
    # private / loopback / link-local / CGNAT: most likely a proxy, not the end user
    return ClientIdentity(str(ip), None, "unverified")


def parse_forwarded(header: str | None) -> list[str] | None:
    """Split X-Forwarded-For into validated IP strings, or None if any entry is not an IP."""
    if not header:
        return []
    out: list[str] = []
    for part in header.split(","):
        ip = _parse(part)
        if ip is None:
            return None
        out.append(str(ip))
    return out


def resolve_client(
    peer: str | None, forwarded_for: str | None, secret_header: str | None, settings: Settings
) -> ClientIdentity:
    hops = settings.trusted_proxy_hops
    if hops <= 0:
        return _from_peer(peer)  # headers are never read
    entries = parse_forwarded(forwarded_for)
    if (
        entries is None  # malformed entry anywhere -> reject the whole header
        or len(entries) < hops  # fewer entries than trusted proxies -> chain not as configured
        or not _proxy_proof_ok(peer, secret_header, settings)
    ):
        return _from_peer(peer)
    client = entries[-hops]
    return ClientIdentity(client, client, "forwarded")
