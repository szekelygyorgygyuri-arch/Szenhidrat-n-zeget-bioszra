#!/usr/bin/env python3
"""Egyetlen, önálló HTML-fájl készítése (adatok és szkriptek beágyazva).

    python3 build_single.py KIMENET.html [--fragment] [--three URL]

--fragment  csak az oldal tartalma (doctype/html/head/body nélkül),
            pl. Claude Artifact-hoz
--three     a Three.js modulok alap-URL-je (alapértelmezés: jsDelivr)
"""
import argparse
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.normpath(os.path.join(HERE, ".."))


def read(name):
    with open(os.path.join(SITE, name), encoding="utf-8") as f:
        return f.read()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--fragment", action="store_true")
    ap.add_argument("--three", default="https://cdn.jsdelivr.net/npm/three@0.160.0/")
    a = ap.parse_args()

    html = read("index.html")
    data = read("data.js").replace("</", "<\\/")
    def module_scope(name):
        # Helyi ES-modul beágyazása saját hatókörbe; az exportált nevek
        # a közös modul-hatókörbe kerülnek.
        src = read(name)
        src = re.sub(r'^import \{[^}]*\} from "\./[a-z]+\.js";\n', "", src, flags=re.M)
        names = re.findall(r'^export (?:const|function) ([A-Za-z_$][\w$]*)', src, flags=re.M)
        src = re.sub(r'^export (const|function) ', r'\1 ', src, flags=re.M)
        return "const { %s } = (() => {\n%s\nreturn { %s };\n})();\n" % (
            ", ".join(names), src, ", ".join(names))

    app = re.sub(r'^import \{[^}]*\} from "\./[a-z]+\.js";\n', "", read("app.js"), flags=re.M)
    module = "<script type=\"module\">\n" + module_scope("kinematics.js") + module_scope("paper.js") \
        + app + "\n</script>"

    html = html.replace('<script src="data.js"></script>', "<script>\n" + data + "</script>")
    html = html.replace('<script type="module" src="app.js"></script>', lambda_safe(module))
    base = a.three.rstrip("/") + "/"
    html = html.replace("https://cdn.jsdelivr.net/npm/three@0.160.0/", base)
    if a.fragment:
        s = html.index("<!-- ARTIFACT-START -->")
        e = html.index("<!-- ARTIFACT-END -->")
        head_end = html.index("</head>")
        body_start = html.index("<body>")
        frag = html[s + len("<!-- ARTIFACT-START -->"):head_end] + html[body_start + len("<body>"):e]
        html = frag.strip() + "\n"
    with open(a.out, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"{a.out}: {len(html) / 1024:.0f} KB")


def lambda_safe(s):
    return s


if __name__ == "__main__":
    main()
