"""One-off: the Notion export (`wiki/` of the workspace, 2026-11-13, kept in sync with Notion until 2026-11-28)
→ the wiki source of this repository (`wiki/`: contents.yml, pages/<slug>.md, images/, notion-anchors.yml).

    python site/convert_notion.py <Notion export folder> <Notion snapshot folder> [--out wiki]

<Notion snapshot folder>: the read-only crawl of the live Notion of 2026-11-28 (`blocks.json`, `collections.json`), from
which the home page buttons' links and the anchors of links (both lost by the export) are taken.

What changes against the export (nothing else; tests/test_convert.py proves it):
  * the H1 title → the YAML header (`title`, `notion` = the Notion page id, `tool` on the pages of a tool);
  * file names → Latin slugs (`robymo-perevirky.md`), links between pages → `[text](slug.md)`, links to a section
    (the home page's databases) → `[text](../contents.yml#<section slug>)`, pictures → `../images/<name>`;
  * Notion's navigation (the arrows, «НА ГОЛОВНУ», «Попередній / Наступний розділ», «До розділу …») is dropped;
  * a callout `<aside>` → a GitHub alert (`> [!TIP]` for ☝, `> [!WARNING]` for ⚠️, `> [!NOTE]` for the rest) with the
    icon kept as its first line; a Notion custom emoji → `<!-- notion-emoji: <id> <width> -->` (invisible, reversible).
"""
import json
import os
import re
import shutil
import sys
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wikisrc import ALERT, EMOJI_RE, notion_name, slugify  # noqa: E402

NAV_IMG = re.compile(r"^(fouparrow|fodownarrow|fodone)\.png$|^НА_ГОЛОВНУ( \d+)?\.png$")
NAV_TEXT = re.compile(r"^\s*(?:(?:Попередній|Наступний)\s+розділ|На головну|До розділу.*)\s*$", re.I)
LOCAL_IMG_LINE = re.compile(r"^\s*!\[([^\]]*)\]\(((?![a-z]+:)[^)]+)\)\s*$")
LINK = re.compile(r"\]\(((?![a-z]+:)(?:[^()\s]|\([^()]*\))+)\)")
# the pages of a tool (plan 2.3: approved by the author on stage 3; kept in the header so the site can show the button)
TOOLS = {"Автоматичний генератор битв": "all_generators.html#battle",
         "Автоматичний генератор подорожей": "all_generators.html#travel",
         "Автоматичний генератор справ": "all_generators.html#case",
         "Генератори натхнення": "all_generators.html#tables",
         "Зони у битвах": "all_generators.html#tracker",
         "Електронний аркуш персонажа": "character_generator.html",
         "ПОКРОКОВА ІНСТРУКЦІЯ": "character_generator.html",
         "Електронний аркуш каравану": "caravan_generator.html",
         "Створення каравану": "caravan_generator.html"}
# the home page's pictures: export name → name in images/
HOME_IMAGES = {"wastelanders_cover_render-fonts_v2.png": "cover.png", "image.png": "cc-by-nc-sa.png"}


def dash(i):
    i = i.replace("-", "")
    return f"{i[:8]}-{i[8:12]}-{i[12:16]}-{i[16:20]}-{i[20:]}"


def read_export(src):
    pages = {}          # notion id → (title, file text)
    for f in os.listdir(src):
        m = re.match(r"(.+) ([0-9a-f]{32})\.md$", f)
        if m:
            with open(os.path.join(src, f), encoding="utf-8", newline="") as fh:
                text = fh.read()
            title = re.match(r"\A# (.+)\n", text).group(1)
            assert notion_name(title) == m.group(1), f
            pages[m.group(2)] = (title, text)
    return pages


def convert_body(body, slug_of_page, slug_of_section, images):
    lines, out, i = body.split("\n"), [], 0
    while i < len(lines):
        line = lines[i]
        im = LOCAL_IMG_LINE.match(line)
        if im and NAV_IMG.match(urllib.parse.unquote(im.group(2))):
            i += 1
            continue
        if NAV_TEXT.match(line):
            i += 1
            continue
        if line.strip() == "<aside>":
            ind = line[:len(line) - len(line.lstrip())]
            j = i + 1
            inner = []
            while lines[j].strip() != "</aside>":
                assert "<aside>" not in lines[j]
                inner.append(lines[j])
                j += 1
            assert lines[j] == ind + "</aside>", repr(lines[j])
            assert j + 1 >= len(lines) or not lines[j + 1].startswith(ind + ">"), "a quote right after an aside"
            icon = next((x.strip() for x in inner if x.strip()), "")
            out.append(f"{ind}> [!{ALERT.get(icon, 'NOTE')}]")
            for x in inner:
                assert x.startswith(ind) or not x.strip(), repr(x)
                rest = x[len(ind):] if x.startswith(ind) else ""
                out.append(ind + (">" if not rest else "> " + rest))
            i = j + 1
            continue
        out.append(line)
        i += 1
    text = "\n".join(out)
    text = EMOJI_RE.sub(lambda m: f"<!-- notion-emoji: {m.group(1)} {m.group(2)} -->", text)

    def link(m):
        href = urllib.parse.unquote(m.group(1))
        mm = re.search(r"([0-9a-f]{32})\.md(#.*)?$", href)
        if mm and mm.group(1) in slug_of_section and not mm.group(2):    # a link to a database written as a page
            return f"](../contents.yml#{slug_of_section[mm.group(1)]})"
        if mm:
            return f"]({slug_of_page[mm.group(1)]}.md{mm.group(2) or ''})"
        mm = re.search(r"([0-9a-f]{32})\.csv$", href)
        if mm:
            return f"](../contents.yml#{slug_of_section[mm.group(1)]})"
        if href in images:
            return f"](../images/{images[href]})"
        raise SystemExit(f"unknown local link: {href}")
    text = LINK.sub(link, text)
    return re.sub(r"\s+\Z", "\n", text)


def main(src, snap, out):
    pages = read_export(src)
    with open(os.path.join(snap, "blocks.json"), encoding="utf-8") as fh:
        blocks = json.load(fh)
    with open(os.path.join(snap, "collections.json"), encoding="utf-8") as fh:
        cols = json.load(fh)
    home_id = next(k for k, (t, _) in pages.items() if t == "ПУСТЕЛЬНИКИ")
    slug_of_page = {k: ("pustelnyky" if k == home_id else slugify(t)) for k, (t, _) in pages.items()}
    assert len(set(slug_of_page.values())) == len(slug_of_page), "two pages with one slug"

    # sections: the home page's database links, in its order, under its «## …» group headings
    home_text = pages[home_id][1]
    groups, cur = [], None
    for line in home_text.split("\n"):
        h = re.match(r"^## \**(.+?)\**\s*$", line)
        if h:
            t = h.group(1).strip()
            cur = None
            if t.upper().startswith("ПРАВИЛА"):
                cur = {"title": t, "sections": []}
                groups.append(cur)
            continue
        m = re.match(r"^\[([^\]]+)\]\(([^)]+\.csv)\)\s*$", line)
        if m and cur is not None:
            dbid = re.search(r"([0-9a-f]{32})\.csv$", urllib.parse.unquote(m.group(2))).group(1)
            cur["sections"].append({"title": m.group(1).replace("**", "").strip(), "notion": dbid})
    slug_of_section = {}
    title_slug = {t: slug_of_page[k] for k, (t, _) in pages.items()}
    for g in groups:
        for s in g["sections"]:
            s["slug"] = slugify(s["title"])
            slug_of_section[s["notion"]] = s["slug"]
            import csv
            path = os.path.join(src, f"{notion_name(s['title'])} {s['notion']}.csv")
            with open(path, encoding="utf-8-sig", newline="") as fh:
                names = [r[0] for r in list(csv.reader(fh))[1:] if r and r[0].strip()]
            s["pages"] = [title_slug[n] for n in names]
            # the live Notion's order (crawl) must be the export's
            view = cols["rows"][dash(s["notion"])]["rows"]
            live = ["".join(x[0] for x in blocks[r]["properties"]["title"]) for r in view]
            assert live == names, (s["title"], live, names)
    assert len(set(slug_of_section.values())) == len(slug_of_section)

    # pictures: the home page's own; its buttons (and their links, from the live Notion)
    images, buttons = dict(HOME_IMAGES), []
    hb = blocks[dash(home_id)]

    def walk(bid):
        b = blocks.get(bid, {})
        yield b
        for c in b.get("content", []) or []:
            cb = blocks.get(c, {})
            if cb.get("type") != "page":
                yield from walk(c)
    for b in walk(dash(home_id)):
        link = (b.get("format") or {}).get("image_hyperlink") if b.get("type") == "image" else None
        if not link:
            continue
        name = "".join(x[0] for x in b["properties"]["title"])          # «ПОЧАТИ ГРУ.png»
        exp = (b["format"]["display_source"].split(":", 2)[2])          # «ПОЧАТИ_ГРУ.png»
        img = {"тг": "telegram"}.get(name[:-4], slugify(name[:-4])) + ".png"
        images[exp] = img
        m = re.match(r"^/([0-9a-f]{32})", link)
        target = f"{slug_of_page[m.group(1)]}.md" if m else link.replace("https://serhiiten.github.io/wastelanders/", "")
        buttons.append({"text": name[:-4], "image": img, "link": target})
    assert hb and len(buttons) == 8, len(buttons)

    # write
    shutil.rmtree(os.path.join(out, "pages"), ignore_errors=True)
    os.makedirs(os.path.join(out, "pages"))
    os.makedirs(os.path.join(out, "images"), exist_ok=True)
    for exp, img in images.items():
        shutil.copyfile(os.path.join(src, exp), os.path.join(out, "images", img))
    for k, (title, text) in pages.items():
        body = text[len(f"# {title}\n"):]
        meta = [f"title: {yaml_str(title)}", f"notion: \"{k}\""]
        if title in TOOLS:
            meta.append(f"tool: {TOOLS[title]}")
        with open(os.path.join(out, "pages", slug_of_page[k] + ".md"), "w", encoding="utf-8", newline="") as fh:
            fh.write("---\n" + "\n".join(meta) + "\n---\n" + convert_body(body, slug_of_page, slug_of_section, images))

    with open(os.path.join(out, "contents.yml"), "w", encoding="utf-8", newline="") as fh:
        fh.write(CONTENTS_HEAD)
        fh.write(f"home: pustelnyky\n\ngroups:\n")
        for g in groups:
            fh.write(f"  - title: {yaml_str(g['title'])}\n    sections:\n")
            for s in g["sections"]:
                fh.write(f"      - slug: {s['slug']}\n        title: {yaml_str(s['title'])}\n        notion: \"{s['notion']}\"\n        pages:\n")
                for p in s["pages"]:
                    fh.write(f"          - {p}\n")
        fh.write("\n# the home page's picture buttons (Notion lost their links in the export; taken from the live Notion 2026-11-28)\nbuttons:\n")
        for b in buttons:
            fh.write(f"  - text: {yaml_str(b['text'])}\n    image: {b['image']}\n    link: {b['link']}\n")

    anchors = anchors_of(blocks, slug_of_page)
    with open(os.path.join(out, "notion-anchors.yml"), "w", encoding="utf-8", newline="") as fh:
        fh.write(ANCHORS_HEAD)
        for a in anchors:
            fh.write(f"- page: {a['page']}\n  text: {yaml_str(a['text'])}\n  target: {a['target']}\n"
                     f"  heading: {yaml_str(a['heading'])}\n  notion_block: \"{a['block']}\"\n")
    print(f"pages {len(pages)}, sections {len(slug_of_section)}, images {len(images)}, buttons {len(buttons)}, anchors {len(anchors)}")


def anchors_of(blocks, slug_of_page):
    t = lambda r: "".join(s[0] for s in (r or []))

    def page_of(bid):
        b = blocks.get(bid)
        while b and b.get("type") != "page":
            b = blocks.get(b.get("parent_id"))
        return b
    res = []
    for k, b in blocks.items():
        for v in (b.get("properties") or {}).values():
            if not isinstance(v, list):
                continue
            for seg in v:
                for a in (seg[1] if len(seg) > 1 and isinstance(seg[1], list) else []):
                    if not (isinstance(a, list) and a and a[0] == "a" and "#" in a[1]):
                        continue
                    m = re.search(r"([0-9a-f]{32}).*#([0-9a-f]{32})", a[1])
                    if not m:
                        continue
                    tgt = blocks.get(dash(m.group(2)), {})
                    head = t(tgt.get("properties", {}).get("title"))
                    if tgt.get("type") == "text":
                        head = head.split(":")[0]          # a bold label paragraph («Синт: …») — its label
                    src = page_of(k)
                    res.append({"page": slug_of_page[src["id"].replace("-", "")], "text": seg[0].strip(),
                                "target": slug_of_page[m.group(1)], "heading": head.strip(), "block": m.group(2)})
    return sorted(res, key=lambda a: (a["page"], a["target"], a["text"]))


def yaml_str(s):
    return json.dumps(s, ensure_ascii=False)


CONTENTS_HEAD = """# The wiki's order: groups → sections → pages (one place; the site's menu and the Foundry compendiums follow it).
# A page is its file name in pages/ without «.md». `notion`: the Notion id (old links, the compendiums' database ids).
# Format: wiki/README.md.

"""
ANCHORS_HEAD = """# Links that pointed at a place inside a page in Notion (its export kept only the page). To restore on the site
# (plan stage 3): on `page`, the link with `text` goes to `heading` on `target`. `notion_block`: Notion's block id.

"""

if __name__ == "__main__":
    a = sys.argv[1:]
    out = a[a.index("--out") + 1] if "--out" in a else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "wiki")
    main(a[0], a[1], out)
