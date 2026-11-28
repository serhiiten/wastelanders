"""The site build (plan 2026-11-28, stage 3, rows 3.1–3.14, the parts a script can check).

    python site/tests/test_build.py [--no-search]

Builds into a temporary folder (never into the repository) and checks the HTML. The live half (widths, focus, the
search box, 404 from the server) is `site/tests/check_pages.py`. Without Node the search index is skipped (SKIP).
"""
import html
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, os.path.join(REPO, "site"))
import build  # noqa: E402
import wikisrc  # noqa: E402

checks, fails = 0, []


def ok(cond, msg):
    global checks
    checks += 1
    if not cond:
        fails.append(msg)


warns = []


def warn(cond, msg):
    """A soft limit (author, 2026-11-28): printed as WARN, the test still passes."""
    if not cond:
        warns.append(msg)


def read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def git_state():
    st = subprocess.run(["git", "-C", REPO, "status", "--porcelain", "--untracked-files=all"], capture_output=True, text=True, encoding="utf-8").stdout
    return sorted(line for line in st.splitlines() if not line[3:].startswith("_site/"))


def tool_hashes():
    import hashlib
    out = {}
    for name in sorted(os.listdir(REPO)):
        p = os.path.join(REPO, name)
        if name.endswith(".html") or name in ("favicon.svg", "apple-touch-icon.png", "LICENSE"):
            with open(p, "rb") as fh:
                out[name] = hashlib.sha256(fh.read()).hexdigest()
    return out


search = "--no-search" not in sys.argv and bool(shutil.which("npx") or shutil.which("npx.cmd"))
before_git, before_tools = git_state(), tool_hashes()
tmp = tempfile.mkdtemp(prefix="wiki-site-")
out = os.path.join(tmp, "_site")
site = build.Site(REPO)
rules = site.build(out, search=search)
wiki = site.wiki
home_slug = wiki.contents["home"]
pages = {s: read(os.path.join(rules, s, "index.html")) for s in wiki.pages if s != home_slug}
home = read(os.path.join(rules, "index.html"))
everything = dict(pages, **{"index": home, "404": read(os.path.join(out, "404.html"))})

# ---------- 3.14: only rules/ and 404.html; the source and the tools untouched ----------
ok(sorted(os.listdir(out)) == ["404.html", "rules"], f"3.14 _site holds only rules/ and 404.html: {os.listdir(out)}")
ok(git_state() == before_git, "3.14 the build changed files in the repository: " + "; ".join(sorted(set(git_state()) ^ set(before_git))[:5]))
ok(tool_hashes() == before_tools, "3.14 the build changed a tool file")
ok(set(os.listdir(rules)) == set(pages) | {"index.html", "site.css", "site.js", "img", "pagefind"}, "3.14 rules/: pages, index, css, js, img, pagefind only")

# ---------- 3.1: the home lists the groups and sections in the wiki's order ----------
groups = re.findall(r'<h2 class="group-h">(.*?)</h2>', home)
ok(groups == [html.escape(g["title"]) for g in wiki.contents["groups"]], f"3.1 groups on the home page: {groups}")
secs = re.findall(r'<section class="sec" id="([a-z0-9-]+)"><h3>', home)
ok(secs == [s["slug"] for _, s in wiki.sections()], "3.1 sections on the home page in contents.yml's order")
for _, s in wiki.sections():
    block = re.search(r'<section class="sec" id="' + s["slug"] + r'">(.*?)</section>', home, re.S).group(1)
    ok(re.findall(r'<a href="([a-z0-9-]+)/">', block) == s["pages"], f"3.1 pages of «{s['title']}» in order")

# ---------- 3.2: menu, text, callouts, tables, previous / next ----------
order = [p for _, s in wiki.sections() for p in s["pages"]]
for i, slug in enumerate(order):
    h = pages[slug]
    ok('<details class="side screen"' in h and 'aria-current="page" class="side-p cur" href="../' + slug + '/"' in h, f"3.2 {slug}: contents with the page marked")
    ok(f"<h1 id=\"{build.heading_id(wiki.pages[slug].title)}\">{html.escape(wiki.pages[slug].title)}</h1>" in h, f"3.2 {slug}: title")
    ok(("pn-prev" in h) == (i > 0) and ("pn-next" in h) == (i < len(order) - 1), f"3.2 {slug}: previous / next")
    if i > 0:
        ok(f'class="pn-prev" href="../{order[i - 1]}/"' in h, f"3.2 {slug}: previous is {order[i - 1]}")
    body = wiki.pages[slug].body
    ok(h.count("<table") == len(re.findall(r"^\s*\|[-: |]+\|\s*$", body, re.M)), f"3.2 {slug}: every table rendered")
ok(sum(h.count("<table") for h in pages.values()) > 50, "3.2 tables exist")

# ---------- 3.3: tool buttons on the 9 pages, same tab, to an existing tool ----------
tools = {s: p.tool for s, p in wiki.pages.items() if p.tool}
ok(len(tools) == 9, f"3.3 nine pages with a tool (got {len(tools)})")
for slug, page in wiki.pages.items():
    btns = re.findall(r'<a class="toolbtn" href="([^"]+)"([^>]*)><b>([^<]+)</b></a>', pages.get(slug, ""))
    for _, attrs, _ in btns:
        ok(f'data-tool="{build.TOOLS[page.tool.split("#")[0]][0]}"' in attrs, f"Б.2 {slug}: the tool button opens in the frame")
    if not page.tool:
        ok(not btns, f"3.3 {slug}: no tool button")
        continue
    want = build.SHEET_TEXT if page.tool.split("#")[0] in build.SHEETS else build.TOOL_TEXT
    want_n = 2 if len(page.body) > build.LONG_PAGE else 1
    ok(len(btns) == want_n, f"3.3 {slug}: {want_n} tool button(s), top{' and bottom' if want_n == 2 else ''} (got {len(btns)})")
    for href, attrs, text in btns:
        ok(href == "../../" + page.tool, f"3.3 {slug}: button goes to {page.tool} (got {href})")
        ok("_blank" not in attrs, f"3.3 {slug}: tool opens in the same tab")
        ok(text == want, f"3.3 {slug}: button text «{text}»")
        ok(os.path.exists(os.path.join(REPO, page.tool.split("#")[0])), f"3.3 {slug}: {page.tool} exists on the site")

# ---------- 3.4: the search index (Ukrainian) ----------
if search:
    pf = os.path.join(rules, "pagefind")
    entry = json.loads(read(os.path.join(pf, "pagefind-entry.json")))
    ok(list(entry.get("languages", {})) == ["uk"], f"3.4 search index language uk: {entry.get('languages')}")
    ok(entry["languages"]["uk"]["page_count"] >= 92, f"3.4 every page indexed: {entry['languages']['uk']['page_count']}")
    ok(all('<script src="' in h and 'pagefind/pagefind-ui.js"' in h for h in everything.values()), "3.4 every page loads the search")
else:
    print("SKIP 3.4 search index (no Node or --no-search)")

# ---------- 3.5: a broken source stops the build and names the file ----------
def broken(edit):
    t = tempfile.mkdtemp(prefix="wiki-broken-")
    shutil.copytree(os.path.join(REPO, "wiki"), os.path.join(t, "wiki"))
    edit(os.path.join(t, "wiki"))
    try:
        build.Site(t).build(os.path.join(t, "_site"), search=False)
        return ""
    except build.BuildError as e:
        return str(e)
    finally:
        shutil.rmtree(t, ignore_errors=True)


def bad_link(w):
    p = os.path.join(w, "pages", "naslidky.md")
    with open(p, "a", encoding="utf-8", newline="") as fh:
        fh.write("\n[тест](no-such-page.md)\n")


def bad_slug(w):
    p = os.path.join(w, "contents.yml")
    s = read(p).replace("          - naslidky\n", "          - naslidky\n          - no-such-slug\n", 1)
    with open(p, "w", encoding="utf-8", newline="") as fh:
        fh.write(s)


e = broken(bad_link)
ok("pages/naslidky.md" in e and "no-such-page" in e, f"3.5 broken link names the file: «{e[:200]}»")
e = broken(bad_slug)
ok("contents.yml" in e and "no-such-slug" in e, f"3.5 unknown slug in contents.yml named: «{e[:200]}»")

# ---------- 3.6: a visible focus ring and no text under 12 px in the CSS ----------
css = read(os.path.join(rules, "site.css"))
ok(":focus-visible{outline:2px solid var(--focus-in)" in css, "3.6 one focus ring for the site")
sizes = [float(x) for x in re.findall(r"font(?:-size)?:[^;{}]*?(\d+(?:\.\d+)?)px", css)]
ok(min(sizes) >= 12, f"3.6 no font size under 12 px in site.css (min {min(sizes)})")

# ---------- 3.7: page weight and the cover ----------
# Author, 2026-11-28: the rule text is never limited (no per-page limit). The numbers below are warnings, not limits:
# they catch accidental bloat (the raw cover weighed 2.1 MB) and sit about 1.5–2.5× above today's size.
for name, h in everything.items():
    size = len(h.encode("utf-8"))
    m = re.search(r'<div class="text" data-pagefind-body>(.*?)</div>\n<nav class="pn"', h, re.S)
    shell = size - (len(m.group(1).encode("utf-8")) if m else 0)
    # 12 KB: everything around the rule text (header, tabs, contents, footer) is ≈ 9 KB today
    warn(not m or shell <= 12 * 1024, f"3.7 {name}: everything around the text {shell // 1024} KB > 12 KB")
# 40 KB: site.css is ≈ 23 KB today
warn(len(css.encode("utf-8")) <= 40 * 1024, f"3.7 site.css {len(css.encode('utf-8')) // 1024} KB > 40 KB")
cover = os.path.getsize(os.path.join(rules, "img", "cover.jpg"))
# 400 KB: the compressed cover is ≈ 160 KB today (the source is 2.1 MB)
warn(cover <= 400 * 1024, f"3.7 cover {cover // 1024} KB > 400 KB")
ok(not os.path.exists(os.path.join(rules, "img", "cover.png")), "3.7 the 2 MB cover.png is not published")

# ---------- 3.8: the 404 page has the site's menu ----------
nf = everything["404"]
ok('class="tabs"' in nf and 'class="side screen"' in nf and 'href="/wastelanders/rules/' in nf, "3.8 404 with tabs and contents, absolute links")

# ---------- 3.9: «Редагувати на GitHub» opens this page's file ----------
for slug, h in dict(pages, **{home_slug: home}).items():
    m = re.findall(r'<p class="edit"[^>]*><a href="([^"]+)"', h)
    ok(m == [build.EDIT_URL.format(slug)], f"3.9 {slug}: edit link {m}")
    ok(os.path.exists(os.path.join(REPO, "wiki", "pages", slug + ".md")), f"3.9 {slug}: the edited file exists")

# ---------- 3.10: the theme comes from the Terminal's key ----------
for name, h in everything.items():
    ok("localStorage.getItem('pustelnyky-theme')==='dark'" in h.split("</head>")[0], f"3.10 {name}: theme read before paint")
ok("localStorage.setItem('pustelnyky-theme'" in read(os.path.join(rules, "site.js")), "3.10 the theme button writes the same key")

# ---------- 3.11: Notion's 35 links to a heading ----------
anchors = wiki.anchors()
ok(len(anchors) == 35, f"3.11 35 anchors (got {len(anchors)})")
for a in anchors:
    h = home if a["page"] == home_slug else pages[a["page"]]
    t = pages[a["target"]]
    hid = site.heading_ids(a["target"])[a["heading"]]
    rel = "" if a["page"] == home_slug else "../"
    ok(f'href="{rel}{a["target"]}/#{hid}"' in h, f"3.11 {a['page']}: «{a['text']}» → {a['target']}#{hid}")
    ok(f' id="{hid}"' in t, f"3.11 {a['target']}: has #{hid} («{a['heading']}»)")

# ---------- 3.12: the buttons of the Notion home page (package A, 7: three relabelled, one hidden, author 2026-11-28) ----------
menu = re.findall(r'<a class="mi" href="([^"]+)"([^>]*)><span class="lamp" aria-hidden="true"></span><span class="mi-t">([^<]+)</span>', home)
btns = [b for b in wiki.contents["buttons"] if b.get("menu") is not False]
ok(len(menu) == len(btns) == 7, f"3.12 seven menu buttons (got {len(menu)})")
ok([b.get("label", b["text"]) for b in btns][4:] == ["Термінал Доглядача", "Доповнення Owlbear", "Модуль Foundry VTT"],
   "A7 the last three buttons: Термінал Доглядача, Доповнення Owlbear, Модуль Foundry VTT")
ok("ГЕНЕРАТОРИ НАТХНЕННЯ" not in home.split('<nav class="panel"')[1].split("</nav>")[0].upper(), "A7 «Генератори натхнення» is not in the menu")
ok([b["link"] for b in btns][4:] == ["all_generators.html", "#owlbear", "#foundry"], "A7 + Б.1 the buttons' links: Owlbear / Foundry VTT → their plate")
ok("index.html#" not in home.split('<nav class="panel"')[1].split("</nav>")[0], "Б.1 no menu button leads to index.html#")
for (href, attrs, text), b in zip(menu, btns):
    ok(html.unescape(text) == b.get("label", b["text"]), f"3.12 button text «{text}» = «{b.get('label', b['text'])}»")
    link = b["link"]
    if link.startswith("#"):
        ok(href == link and re.search(r'<section class="plate screen n\d" id="' + link[1:] + '"', home), f"Б.1 «{b['text']}» → its plate {href}")
    elif link.endswith(".md"):
        ok(href == link[:-3] + "/", f"3.12 «{b['text']}» → {href}")
    elif link.startswith("http"):
        ok(href == link and "_blank" in attrs, f"3.12 «{b['text']}» → {href}, new tab")
    else:
        ok(href == "../" + link and "_blank" not in attrs, f"3.12 «{b['text']}» → {href}, same tab")
        ok(f'data-tool="{build.TOOLS[link.split("#")[0]][0]}"' in attrs, f"Б.2 «{b['text']}» opens in the wiki's frame")
        ok(os.path.exists(os.path.join(REPO, link.split("#")[0])), f"3.12 {link} exists")
# ---------- package A, 1: a section in the left menu opens its first page ----------
for slug, h in pages.items():
    for sec, first in ((s["slug"], s["pages"][0]) for _, s in wiki.sections()):
        title = html.escape(next(s["title"] for _, s in wiki.sections() if s["slug"] == sec))
        ok(re.search(r'<a class="side-s(?: on)?" href="\.\./' + first + r'/">' + re.escape(title) + "</a>", h) is not None,
           f"A1 {slug}: section «{sec}» in the menu → {first}/")
    break   # one page is enough: the menu is the same on all of them
ok(not re.search(r'class="side-s[^"]*" href="[^"]*#', "".join(pages.values())), "A1 no section link in the menu goes to the home page")
# ---------- package A, 4: «Історія змін» is a fold, closed ----------
ok(re.search(r'<details class="fold" id="istoriia-zmin"><summary><h2>Історія змін</h2></summary>', home) is not None,
   "A4 «Історія змін» is a closed fold")
ok(home.rstrip().count("</details>") >= 1 and "Версія 2.0" in home.split('id="istoriia-zmin"')[1].split("</details>")[0],
   "A4 the history is inside the fold")
ok(not re.search(r"images/(pochaty|stvoryty|telegram|heneratory)", home), "3.12 the picture buttons are not on the page")

# ---------- package B ----------
# Б.1: the intro «Де грати» between the cover with the menu and the rules' groups; plates closed; texts = the old index.html
hero_end, intro_at, groups_at = home.index('<div class="hero">'), home.find('<article class="paper sheet intro"'), home.index('<div class="groups">')
ok(hero_end < intro_at < groups_at, "Б.1 the intro sits between the cover with the menu and the groups")
intro = home[intro_at:groups_at]
ok(re.findall(r'<section class="plate screen n\d" id="([a-z]+)"', intro) == ["browser", "owlbear", "foundry"], "Б.1 three plates: У браузері, Owlbear Rodeo, Foundry VTT")
ok(intro.count('aria-expanded="false"') == 3 and ' on"' not in intro and "class=\"plate-panel n" in intro, "Б.1 the plates' panels are closed")
ok("data-pagefind-body" in intro.split(">")[0], "Б.1 the intro is in the search")
ok(intro.count('<button type="button" class="copy-btn">Копіювати</button>') == 2, "Б.1 two addresses to copy")
for t in ("Owlbear", "Foundry"):
    ok(f"<summary>Як встановити</summary>" in intro, f"Б.1 «Як встановити» is a fold ({t})")
ok("Інструменти для гравців і Доглядача" not in home, "Б.1 the paragraph «Інструменти для гравців і Доглядача…» is gone (author)")
FIX = os.path.join(HERE, "fixtures", "index-2026-11-28.html")    # the old index.html, before it became the redirect


def plain(h):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", h))).strip()


old = read(FIX)
old_play = old[old.index('<section class="play"'):old.index("</section>", old.index('<section class="play"'))]
old_tools = old[old.index('<ul>\n    <li><a class="tool"'):old.index("</ul>", old.index('<ul>\n    <li><a class="tool"'))]
new_text = plain(intro)
pieces = [x for blk in (old_play, old_tools) for x in re.split(r"<[^>]+>", blk)]
pieces = [plain(x) for x in pieces if plain(x) and plain(x) not in ("Скопійовано",)]
missing = [x for x in pieces if x not in new_text]
ok(not missing, f"Б.1 every text of the old index.html is in the intro word for word, missing: {missing[:3]}")
# Б.5: the site root leads to the wiki, the old index.html#owlbear / #foundry to their plate
root = read(os.path.join(REPO, "index.html"))
ok("location.replace('rules/' + location.hash)" in root and '<meta http-equiv="refresh" content="0; url=rules/">' in root
   and '<a href="rules/">' in root, "Б.5 index.html redirects to rules/ (with the hash; without JS too)")
ok(f'<link rel="canonical" href="{build.SITE_URL}rules/">' in root, "Б.5 the redirect names rules/ as canonical")
ok(f'<link rel="canonical" href="{build.SITE_URL}rules/">' in home and all(f'<link rel="canonical" href="{build.SITE_URL}rules/{s}/">' in h for s, h in pages.items()),
   "Б.10 every page names its own address as canonical (also with ?tool=)")
# Б.2: the tabs open the tools in the frame
ok(all(h.count(' data-tool="') >= 3 for h in pages.values()), "Б.2 the three tool tabs carry data-tool")


def no_foundry(w):
    p = os.path.join(w, "home", "de-hraty.md")
    t = read(p).replace("{#foundry}", "{#vtt}")
    with open(p, "w", encoding="utf-8", newline="") as fh:
        fh.write(t)


def three_secs(w):
    p = os.path.join(w, "home", "de-hraty.md")
    t = read(p)
    t = t[:t.index("## Одна Пустка на всіх")]
    with open(p, "w", encoding="utf-8", newline="") as fh:
        fh.write(t)


e = broken(no_foundry)
ok("home/de-hraty.md" in e and "foundry" in e, f"Б.1 an intro without #foundry stops the build: «{e[:160]}»")
e = broken(three_secs)
ok("home/de-hraty.md" in e and "чотири" in e, f"Б.1 an intro without four parts stops the build: «{e[:160]}»")

# ---------- 3.13: callouts with their icon; nothing of Notion's left ----------
for slug, p in wiki.pages.items():
    h = home if slug == home_slug else pages[slug]
    want = len(wikisrc.ALERT_RE.findall(p.body)) if hasattr(wikisrc.ALERT_RE, "findall") else 0
    want = sum(1 for line in p.body.split("\n") if wikisrc.ALERT_RE.match(line))
    if slug == home_slug:
        want -= 2      # the two group callouts became the groups' cards
    ok(h.count('<aside class="call') == want, f"3.13 {slug}: {h.count('<aside class=' + chr(34) + 'call')} callouts, source {want}")
    custom = len(wikisrc.EMOJI_KEEP_RE.findall(p.body))
    if custom and slug != home_slug:
        ok(h.count('<span class="call-ico" aria-hidden="true">☢</span>') >= custom, f"3.13 {slug}: Notion's own emoji → ☢")
for name, h in everything.items():
    ok("notion://" not in h and "notion-emoji" not in h and "custom_emoji" not in h, f"3.13 {name}: no Notion emoji left")
    ok("> [!" not in h and "[!TIP]" not in h and "[!NOTE]" not in h, f"3.13 {name}: no raw alert markup")

# ---------- links: every internal link points at a built page and an existing anchor ----------
ids = {s: set(re.findall(r' id="([^"]+)"', h)) for s, h in pages.items()}
ids[""] = set(re.findall(r' id="([^"]+)"', home))
for name, h in pages.items():
    for href in re.findall(r'href="(\.\./[^"]*)"', h):
        m = re.fullmatch(r"\.\./(?:([a-z0-9-]+)/)?(?:#(.+))?", href)
        if not m:
            ok(os.path.exists(os.path.join(REPO, href[6:].split("#")[0])) or href.startswith("../site.") or href.startswith("../img/") or href.startswith("../pagefind/") or href.startswith("../../favicon"), f"link {name}: {href}")
            continue
        tgt, frag = m.group(1) or "", m.group(2)
        ok(tgt == "" or tgt in pages, f"link {name}: page {tgt}")
        if frag:
            ok(frag in ids.get(tgt, set()), f"link {name}: #{frag} on {tgt or 'home'}")
for href in re.findall(r'(?:href|src)="(img/[^"]+)"', home) + [m for h in pages.values() for m in re.findall(r'src="\.\./(img/[^"]+)"', h)]:
    ok(os.path.exists(os.path.join(rules, href)), f"image {href}")
ok(not any('<a href="' + build.SITE_URL in h or re.search(r'<a [^>]*href="' + re.escape(build.SITE_URL), h) for h in everything.values()), "links to the tools are relative (same tab)")

# ---------- the Terminal's shared look (header, tabs, paper) stays the same as in the Terminal ----------
TPL = os.path.join(REPO, "..", "pustelnyky_src (1)", "pustelnyky_src", "template.html")
if os.path.exists(TPL):
    tpl = read(TPL)
    for sel in (".rustbar{", ".rustbar.top{", ".rustbar.top::after{", ".brand-title{", ".themebtn{", ".frame{", ".paper{",
                "html[data-theme=\"dark\"] .rustbar{", "html[data-theme=\"dark\"] .paper{", "html[data-theme=\"dark\"] .frame{"):
        m = re.search(re.escape("\n" + sel) + r"(.*?)\}", tpl, re.S)
        mine = re.search(re.escape("\n" + sel) + r"(.*?)\}", css, re.S)
        norm = lambda s: re.sub(r"/\*.*?\*/|\s+", "", s)  # noqa: E731
        ok(m and mine and norm(m.group(1)) == norm(mine.group(1)), f"Terminal look: «{sel}» differs from template.html")
else:
    print("SKIP the Terminal look comparison (no pustelnyky_src next to the repository)")

shutil.rmtree(tmp, ignore_errors=True)
for w in warns:
    print("WARN", w)
for f in fails:
    print("FAIL", f)
print(("FAIL" if fails else "OK") + f" ({checks} checks)")
sys.exit(1 if fails else 0)
