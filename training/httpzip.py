"""Arquivo "seekable" sobre HTTP (Range requests) para ler membros de ZIPs
remotos do TSE sem baixar o zip inteiro para o disco.

Leituras sequenciais reaproveitam a mesma conexão (streaming); um seek para
fora da posição atual reabre a conexão com novo Range.
"""
import io
import time
import urllib.request


class HttpFile(io.RawIOBase):
    def __init__(self, url, timeout=120):
        self.url = url
        self.timeout = timeout
        req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "quem-ganha/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            self.size = int(r.headers["Content-Length"])
        self.pos = 0
        self._resp = None
        self._resp_pos = None
        self.bytes_read = 0

    def readable(self):
        return True

    def seekable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, off, whence=0):
        if whence == 0:
            self.pos = off
        elif whence == 1:
            self.pos += off
        else:
            self.pos = self.size + off
        return self.pos

    def _open(self):
        if self._resp is not None:
            try:
                self._resp.close()
            except Exception:
                pass
        for attempt in range(6):
            try:
                req = urllib.request.Request(
                    self.url, headers={"Range": f"bytes={self.pos}-", "User-Agent": "quem-ganha/1.0"}
                )
                self._resp = urllib.request.urlopen(req, timeout=self.timeout)
                self._resp_pos = self.pos
                return
            except Exception:
                time.sleep(2 * (attempt + 1))
        raise IOError("falha ao abrir " + self.url)

    def read(self, n=-1):
        if self.pos >= self.size:
            return b""
        if n is None or n < 0:
            n = self.size - self.pos
        n = min(n, self.size - self.pos)
        out = bytearray()
        tries = 0
        while len(out) < n:
            if self._resp is None or self._resp_pos != self.pos:
                self._open()
            try:
                b = self._resp.read(n - len(out))
            except Exception:
                b = b""
            if not b:
                tries += 1
                if tries > 6:
                    raise IOError("leitura falhou " + self.url)
                self._resp = None
                time.sleep(1)
                continue
            out += b
            self.pos += len(b)
            self._resp_pos = self.pos
            self.bytes_read += len(b)
        return bytes(out)

    def readinto(self, b):
        d = self.read(len(b))
        b[: len(d)] = d
        return len(d)

    def close(self):
        if self._resp is not None:
            try:
                self._resp.close()
            except Exception:
                pass
        super().close()


def open_remote_zip(url):
    import zipfile

    f = io.BufferedReader(HttpFile(url), buffer_size=4 << 20)
    return zipfile.ZipFile(f)
