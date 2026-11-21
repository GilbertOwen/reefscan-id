import io, urllib.request

class RangeFile(io.RawIOBase):
    """Read-only file over HTTP range requests; counts the bytes it downloads."""
    def __init__(self, url):
        self.url = url
        self.pos = 0
        self.downloaded = 0
        req = urllib.request.Request(url, method="HEAD")
        with urllib.request.urlopen(req) as r:
            self.size = int(r.headers["Content-Length"])
            self.url = r.url  # follow the redirect once
    def readable(self): return True
    def seekable(self): return True
    def tell(self): return self.pos
    def seek(self, offset, whence=0):
        self.pos = offset if whence == 0 else (self.pos + offset if whence == 1 else self.size + offset)
        return self.pos
    def read(self, n=-1):
        if n is None or n < 0: n = self.size - self.pos
        n = min(n, self.size - self.pos)
        if n <= 0: return b""
        req = urllib.request.Request(self.url, headers={"Range": "bytes={}-{}".format(self.pos, self.pos + n - 1)})
        with urllib.request.urlopen(req) as r:
            data = r.read()
        self.pos += len(data)
        self.downloaded += len(data)
        return data
    def readinto(self, b):
        data = self.read(len(b))
        b[:len(data)] = data
        return len(data)
