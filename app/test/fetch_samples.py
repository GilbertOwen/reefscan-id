"""Fetch the first few Coralscapes validation photos with their original bytes, without downloading the 405 MB file.

The validation parquet has 2 row groups (100 + 66 rows); image.bytes is dictionary encoded, one dictionary page per
row group. The dictionary page is read as a stream (HTTP range requests) and snappy-decoded only up to the photos we
want. The data page indices are decoded to confirm which dictionary entry belongs to which row.

usage: python -I -X utf8 fetch_samples.py OUT_DIR PER_GROUP
"""
import hashlib, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pyarrow.parquet as pq
from rangefile import RangeFile

URL = "https://huggingface.co/datasets/EPFL-ECEO/coralscapes/resolve/main/data/validation-00000-of-00001.parquet"
out_dir, per_group = sys.argv[1], int(sys.argv[2])
MAX_DOWNLOAD = 60 * 1024 * 1024  # hard stop well above what 10 photos need


def read_varint(buf, pos):
    shift = result = 0
    while True:
        b = buf[pos]; pos += 1
        result |= (b & 0x7F) << shift
        if not b & 0x80:
            return result, pos
        shift += 7


def zigzag(n):
    return (n >> 1) ^ -(n & 1)


def read_value(buf, pos, t):
    if t == 1: return True, pos
    if t == 2: return False, pos
    if t == 3: return buf[pos], pos + 1
    if t in (4, 5, 6):
        v, pos = read_varint(buf, pos); return zigzag(v), pos
    if t == 7: return bytes(buf[pos:pos + 8]), pos + 8
    if t == 8:
        n, pos = read_varint(buf, pos); return bytes(buf[pos:pos + n]), pos + n
    if t in (9, 10):
        b = buf[pos]; pos += 1
        size, et = b >> 4, b & 0x0F
        if size == 15: size, pos = read_varint(buf, pos)
        items = []
        for _ in range(size):
            v, pos = read_value(buf, pos, et); items.append(v)
        return items, pos
    if t == 12: return read_struct(buf, pos)
    raise ValueError("thrift type {}".format(t))


def read_struct(buf, pos):
    fields, last = {}, 0
    while True:
        byte = buf[pos]; pos += 1
        if byte == 0:
            return fields, pos
        delta, ftype = byte >> 4, byte & 0x0F
        if delta == 0:
            raw, pos = read_varint(buf, pos); fid = zigzag(raw)
        else:
            fid = last + delta
        last = fid
        fields[fid], pos = read_value(buf, pos, ftype)


class Snappy:
    """Raw snappy decoder that pulls compressed bytes on demand."""
    def __init__(self, fetch):
        self.fetch, self.inbuf, self.ipos, self.out = fetch, bytearray(), 0, bytearray()
        self.need(10)
        self.total, self.ipos = read_varint(self.inbuf, 0)

    def need(self, n):
        while len(self.inbuf) - self.ipos < n:
            chunk = self.fetch(1 << 20)
            if not chunk: raise EOFError
            if self.ipos > (8 << 20):
                del self.inbuf[:self.ipos]; self.ipos = 0
            self.inbuf += chunk

    def take(self, n):
        self.need(n); v = self.inbuf[self.ipos:self.ipos + n]; self.ipos += n; return v

    def decode_until(self, n_out):
        out = self.out
        while len(out) < n_out and len(out) < self.total:
            tag = self.take(1)[0]
            kind = tag & 3
            if kind == 0:
                ln = tag >> 2
                if ln < 60: ln += 1
                else: ln = int.from_bytes(self.take(ln - 59), "little") + 1
                out += self.take(ln); continue
            if kind == 1:
                ln = ((tag >> 2) & 7) + 4; off = ((tag >> 5) << 8) | self.take(1)[0]
            elif kind == 2:
                ln = (tag >> 2) + 1; off = int.from_bytes(self.take(2), "little")
            else:
                ln = (tag >> 2) + 1; off = int.from_bytes(self.take(4), "little")
            start = len(out) - off
            if off >= ln: out += out[start:start + ln]
            else:
                for i in range(ln): out.append(out[start + i])


def stream_from(f, offset, limit):
    state = {"pos": offset, "end": offset + limit}
    def fetch(n):
        n = min(n, state["end"] - state["pos"])
        if n <= 0: return b""
        if f.downloaded + n > MAX_DOWNLOAD: raise RuntimeError("download limit reached")
        f.seek(state["pos"]); data = f.read(n); state["pos"] += len(data); return data
    return fetch


def page_header(f, offset):
    f.seek(offset); buf = f.read(512)
    header, length = read_struct(buf, 0)
    return header, offset + length


def rle_hybrid(buf, pos, bit_width, count):
    out = []
    while len(out) < count:
        header, pos = read_varint(buf, pos)
        if header & 1:
            groups = header >> 1; nbytes = groups * bit_width
            bits = int.from_bytes(buf[pos:pos + nbytes], "little"); pos += nbytes
            mask = (1 << bit_width) - 1
            out.extend((bits >> (i * bit_width)) & mask for i in range(groups * 8))
        else:
            width = (bit_width + 7) // 8
            v = int.from_bytes(buf[pos:pos + width], "little"); pos += width
            out.extend([v] * (header >> 1))
    return out[:count], pos


def dictionary_indices(f, column, max_def):
    header, start = page_header(f, column.data_page_offset)
    assert header[1] == 0, "expected DATA_PAGE v1"
    dph = header[5]; num_values = dph[1]
    raw = Snappy(stream_from(f, start, header[3])); raw.decode_until(raw.total); buf = raw.out
    def_len = int.from_bytes(buf[0:4], "little")
    levels, _ = rle_hybrid(buf, 4, max(1, max_def.bit_length()), num_values)
    pos = 4 + def_len
    bit_width = buf[pos]; pos += 1
    non_null = sum(1 for d in levels if d == max_def)
    idx, _ = rle_hybrid(buf, pos, bit_width, non_null) if bit_width else ([0] * non_null, pos)
    return levels, idx


def dictionary_entries(f, column, count):
    header, start = page_header(f, column.dictionary_page_offset)
    assert header[1] == 2, "expected DICTIONARY_PAGE"
    snap = Snappy(stream_from(f, start, header[3]))
    entries, pos = [], 0
    while len(entries) < count:
        snap.decode_until(pos + 4)
        n = int.from_bytes(snap.out[pos:pos + 4], "little")
        snap.decode_until(pos + 4 + n)
        entries.append(bytes(snap.out[pos + 4:pos + 4 + n])); pos += 4 + n
    return entries


os.makedirs(out_dir, exist_ok=True)
f = RangeFile(URL)
meta = pq.ParquetFile(f).metadata
manifest = []
row_offset = 0
for gi in range(meta.num_row_groups):
    group = meta.row_group(gi)
    cols = {group.column(ci).path_in_schema: group.column(ci) for ci in range(group.num_columns)}
    _, image_idx = dictionary_indices(f, cols["image.bytes"], 2)
    _, path_idx = dictionary_indices(f, cols["image.path"], 2)
    assert len(image_idx) == group.num_rows and len(path_idx) == group.num_rows
    paths = dictionary_entries(f, cols["image.path"], max(path_idx) + 1)
    wanted_rows = list(range(per_group))
    need = max(image_idx[r] for r in wanted_rows) + 1
    images = dictionary_entries(f, cols["image.bytes"], need)
    for r in wanted_rows:
        data = images[image_idx[r]]
        original = paths[path_idx[r]].decode("utf-8")
        ext = ".png" if data[:8] == b"\x89PNG\r\n\x1a\n" else (".jpg" if data[:2] == b"\xff\xd8" else ".bin")
        row = row_offset + r
        name = "coralscapes_val_{:03d}{}".format(row, ext)
        with open(os.path.join(out_dir, name), "wb") as handle:
            handle.write(data)
        manifest.append({"file": name, "validation_index": row, "original_name": original, "bytes": len(data),
                         "sha256": hashlib.sha256(data).hexdigest()})
        print(name, original, len(data))
    print("group {}: image dictionary indices start {}".format(gi, image_idx[:8]))
    row_offset += group.num_rows

with open(os.path.join(out_dir, "manifest.json"), "w", encoding="utf-8") as handle:
    json.dump({"source": "EPFL-ECEO/coralscapes on Hugging Face, validation split, original bytes", "license": "Apache-2.0",
               "url": URL, "photos": manifest}, handle, indent=2)
print("downloaded {:.1f} MB in total".format(f.downloaded / 1e6))
