#!/usr/bin/env python3
"""Baixa arquivos do portal de dados abertos do TSE (CKAN).

Uso:
  python download_tse.py list <package_id> [regex]
  python download_tse.py get <package_id> <regex> [--out DIR] [--workers N]

Exemplos:
  python download_tse.py get resultados-2022-boletim-de-urna 'bweb_2t_.*\\.zip$'
  python download_tse.py get resultados-2022 'votacao_candidato_munzona_2022\\.zip$'
"""
import argparse
import concurrent.futures as cf
import json
import os
import re
import sys
import time
import urllib.request

CKAN = "https://dadosabertos.tse.jus.br/api/3/action/package_show?id="
RAW = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "raw")


def resources(pkg):
    with urllib.request.urlopen(CKAN + pkg, timeout=60) as r:
        d = json.load(r)
    return [(x["name"], x["url"]) for x in d["result"]["resources"]]


def download(url, outdir, retries=5):
    fn = os.path.join(outdir, url.rsplit("/", 1)[1])
    tmp = fn + ".part"
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "quem-ganha/1.0"})
            with urllib.request.urlopen(req, timeout=120) as r:
                total = int(r.headers.get("Content-Length") or 0)
                if os.path.exists(fn) and total and os.path.getsize(fn) == total:
                    return fn, total, "cached"
                with open(tmp, "wb") as f:
                    while True:
                        b = r.read(1 << 20)
                        if not b:
                            break
                        f.write(b)
            if total and os.path.getsize(tmp) != total:
                raise IOError(f"tamanho incompleto {os.path.getsize(tmp)} != {total}")
            os.replace(tmp, fn)
            return fn, os.path.getsize(fn), "ok"
        except Exception as e:  # noqa
            print(f"[retry {attempt}] {url}: {e}", file=sys.stderr, flush=True)
            time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"falhou: {url}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["list", "get"])
    ap.add_argument("pkg")
    ap.add_argument("regex", nargs="?", default=".")
    ap.add_argument("--out", default=None)
    ap.add_argument("--workers", type=int, default=6)
    a = ap.parse_args()
    rx = re.compile(a.regex)
    res = [(n, u) for n, u in resources(a.pkg) if rx.search(u)]
    if a.cmd == "list":
        for n, u in res:
            print(n, "|", u)
        return
    outdir = a.out or os.path.join(RAW, a.pkg)
    os.makedirs(outdir, exist_ok=True)
    urls = sorted({u for _, u in res})
    print(f"{len(urls)} arquivos -> {outdir}", flush=True)
    with cf.ThreadPoolExecutor(a.workers) as ex:
        futs = {ex.submit(download, u, outdir): u for u in urls}
        for f in cf.as_completed(futs):
            try:
                fn, sz, st = f.result()
                print(f"{st} {sz/1e6:8.1f} MB {os.path.basename(fn)}", flush=True)
            except Exception as e:
                print("ERRO", e, flush=True)


if __name__ == "__main__":
    main()
