import os,re,sys,urllib.parse,urllib.request,ssl
from html.parser import HTMLParser

base=sys.argv[1].rstrip("/")
outdir=sys.argv[2]
os.makedirs(outdir, exist_ok=True)

ssl_ctx=ssl.create_default_context()
def fetch(url):
    with urllib.request.urlopen(url, context=ssl_ctx, timeout=30) as r:
        return r.read()

class LinkGrab(HTMLParser):
    def __init__(self): super().__init__(); self.links=set()
    def handle_starttag(self, tag, attrs):
        for k,v in attrs:
            if k in ("src","href") and v:
                self.links.add(v)

# 1) baja index
index_bytes=fetch(base+"/")
index=index_bytes.decode("utf-8","ignore")

# 2) reescribe rutas absolutas a relativas, y absolutas del mismo host
def repl_url(m):
    url=m.group(2)
    if url.startswith("//"): return f'{m.group(1)}https:{url}{m.group(3) or ""}'
    u=urllib.parse.urljoin(base+"/", url)
    # si es mismo host, dejar ruta relativa
    pu=urllib.parse.urlparse(u)
    pb=urllib.parse.urlparse(base)
    if pu.netloc==pb.netloc:
        path=pu.path.lstrip("/")
        if not path: path="index.html"
        return f'{m.group(1)}./{path}{m.group(3) or ""}'
    return f'{m.group(1)}{u}{m.group(3) or ""}'

index_rewritten=re.sub(r'(?:src|href)=["\']([^"\']+)["\']', lambda m: repl_url(m), index)

# 3) parsear links para descargar assets locales
lg=LinkGrab(); lg.feed(index_rewritten)
asset_ext=(".css",".js",".png",".jpg",".jpeg",".svg",".webp",".ico",".woff",".woff2",".ttf",".otf",".gif")
todo=set()
for href in lg.links:
    if href.startswith("./"):
        p=href[2:]
        if p and os.path.splitext(p)[1].lower() in asset_ext:
            todo.add(p)

# 4) bajar cada asset respetando subcarpetas
for p in sorted(todo):
    url=urllib.parse.urljoin(base+"/", p)
    dest=os.path.join(outdir, p)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    try:
        data=fetch(url)
        with open(dest,"wb") as f: f.write(data)
        print("ok", p)
    except Exception as e:
        print("skip", p, e)

# 5) guardar index reescrito en public/
with open(os.path.join(outdir,"index.html"),"w",encoding="utf-8") as f:
    f.write(index_rewritten)
print("DONE")
