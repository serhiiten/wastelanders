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
pages = {s: read(os.path.join(rules, s, "index.html")) for s in wiki.pages if s != home_slug and wiki.pages[s].site}
home = read(os.path.join(rules, "index.html"))
everything = dict(pages, **{"index": home, "404": read(os.path.join(out, "404.html"))})

# ---------- 3.14: only rules/ and 404.html; the source and the tools untouched ----------
ok(sorted(os.listdir(out)) == ["404.html", "rules"], f"3.14 _site holds only rules/ and 404.html: {os.listdir(out)}")
ok(git_state() == before_git, "3.14 the build changed files in the repository: " + "; ".join(sorted(set(git_state()) ^ set(before_git))[:5]))
ok(tool_hashes() == before_tools, "3.14 the build changed a tool file")
ok(set(os.listdir(rules)) == set(pages) | {"index.html", "site.css", "site.js", "img", "pagefind", "files"}, "3.14 rules/: pages, index, css, js, img, pagefind, files only")

# ---------- 3.1: the home lists the groups and sections in the wiki's order ----------
# a group is a <section> with an <h2 class="group-h">, or (the quick start, DC7) a fold whose summary is the header bar
groups = re.findall(r'<h2 class="group-h">(.*?)</h2>|<details class="group[^"]*"><summary class="group-h"><h2>(.*?)</h2>', home)
groups = [a or b for a, b in groups]
ok(groups == [html.escape(g["title"]) for g in wiki.contents["groups"]], f"3.1 groups on the home page: {groups}")
secs = re.findall(r'<section class="sec" id="([a-z0-9-]+)"><h3>', home)
ok(secs == [s["slug"] for _, s in site.sections], "3.1 sections on the home page in contents.yml's order")
for _, s in site.sections:
    block = re.search(r'<section class="sec" id="' + s["slug"] + r'">(.*?)</section>', home, re.S).group(1)
    ok(re.findall(r'<a href="([a-z0-9-]+)/">', block) == s["pages"], f"3.1 pages of «{s['title']}» in order")

# ---------- 3.2: menu, text, callouts, tables, previous / next ----------
order = [p for _, s in site.sections for p in s["pages"]]
for i, slug in enumerate(order):
    h = pages[slug]
    ok('<details class="side screen"' in h and 'aria-current="page" class="side-p cur" href="../' + slug + '/"' in h, f"3.2 {slug}: contents with the page marked")
    ok(f"<h1 id=\"{build.heading_id(wiki.pages[slug].title)}\">{html.escape(wiki.pages[slug].title)}</h1>" in h, f"3.2 {slug}: title")
    ok(("pn-prev" in h) == (i > 0) and ("pn-next" in h) == (i < len(order) - 1), f"3.2 {slug}: previous / next")
    if i > 0:
        ok(f'class="pn-prev" href="../{order[i - 1]}/"' in h, f"3.2 {slug}: previous is {order[i - 1]}")
    body = wiki.pages[slug].body
    ok(h.count("<table") == len(re.findall(r"^\s*\|[-: |]+\|\s*$", body, re.M)) + body.count("<table"), f"3.2 {slug}: every table rendered")
ok(sum(h.count("<table") for h in pages.values()) > 50, "3.2 tables exist")

# ---------- 3.3: tool buttons on the 9 pages, same tab, to an existing tool ----------
tools = {s: p.tool for s, p in wiki.pages.items() if p.tool}
ok(len(tools) == 9, f"3.3 nine pages with a tool (got {len(tools)})")
for slug, page in wiki.pages.items():
    if slug not in pages:          # kept off the site (package D-A): its button is checked under D5
        continue
    btns = re.findall(r'<a class="toolbtn" href="([^"]+)"([^>]*)><b>([^<]+)</b></a>', pages.get(slug, ""))
    for _, attrs, _ in btns:
        ok(f'data-tool="{build.TOOLS[page.tool.split("#")[0]][0]}"' in attrs, f"Б.2 {slug}: the tool button opens in the frame")
    if not page.tool:
        ok(not btns, f"3.3 {slug}: no tool button")
        continue
    want = build.SHEET_TEXT if page.tool.split("#")[0] in build.SHEETS else build.TOOL_TEXT
    # one button, at the top (DC8, 2026-11-28: the long pages' second button at the bottom is gone)
    ok(len(btns) == 1, f"3.3 / DC8 {slug}: one tool button, at the top (got {len(btns)})")
    # DC8: no other link in the text to the page's own tool (its words stay as text)
    txt = pages[slug].split('<div class="text" data-pagefind-body>', 1)[1].split('<nav class="pn"', 1)[0]
    others = [m.group(0)[:80] for m in build.TOOL_LINK_RE.finditer(txt)
              if m.group("key") == page.tool and 'class="toolbtn"' not in m.group("attrs") + m.group("rest")]
    ok(not others, f"DC8 {slug}: a link in the text repeats the button «{page.tool}»: {others[:2]}")
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
    ok(entry["languages"]["uk"]["page_count"] >= len(pages) + 1, f"3.4 every page indexed: {entry['languages']['uk']['page_count']}")
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
    for sec, first in ((s["slug"], s["pages"][0]) for _, s in site.sections):
        title = html.escape(next(s["title"] for _, s in site.sections if s["slug"] == sec))
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
hero_end, intro_at, groups_at = home.index('<div class="hero">'), home.find('<article class="intro"'), home.index('<div class="groups">')
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
# the old tool cards (old_tools) are off the site since DC9 (author via the dispatcher, 2026-11-28): they repeated the menu
ok('class="tool"' not in intro and "toolcards" not in intro, "DC9 no tool cards inside «Де грати»")
pieces = [x for blk in (old_play,) for x in re.split(r"<[^>]+>", blk)]
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
# the home page has no tabs row, its red-lamp menu leads to the tools; every other page keeps it (author, 2026-11-28)
ok('class="tabs"' not in home, "home page without the tabs row")
ok(all('<nav class="tabs"' in h for h in pages.values()), "every other page keeps the tabs row")
# narrow screens (≤ 760 px): the four tabs fit the width, no side scrolling; the label wraps under the icon.
# An exception to the Terminal's look, wiki only: the Terminal's own tabs (6 + 2) wrap into 3 columns on a phone
# and are not touched (author, 2026-11-28). The live check measures scrollWidth <= clientWidth at 320–414 px.
narrow = re.search(r"@media \(max-width:760px\)\{(.*?)\n\}", css, re.S)
ok(narrow and ".tabs{grid-template-columns:repeat(4,minmax(0,1fr))" in narrow.group(1) and "overflow-x" not in narrow.group(1),
   "narrow tabs: four columns that fit, no side scrolling (author, 2026-11-28)")


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

# ---------- package C (author, 2026-11-28) ----------
# C1: «Де грати» (the lead and the plates) is a fold, closed; «Одна Пустка на всіх» stays outside it
fold_at = intro.find('<details class="intro-fold" id="de-hraty-fold"><summary class="group-h"><h2 id="de-hraty">Де грати</h2></summary>')
ok(fold_at >= 0 and "id=\"de-hraty-fold\" open" not in intro, "C1 «Де грати» is a closed fold; D2 its summary is a .group-h bar")
ok(fold_at < intro.find('id="browser"') < intro.find('id="foundry-more"') < intro.find('<div class="eco" id="eco">'),
   "C1 the lead and the plates are inside the fold, «Одна Пустка на всіх» after them")
ok(intro.index('<div class="eco"') < intro.rindex("</details>") and intro.rstrip().endswith("</div></div></details></article>"),
   "D1 «Одна Пустка на всіх» stands inside the fold, at its end")
# C5: «Як встановити» is marked so that the plate's button opens it; only that fold of the panel
ok(intro.count('<details class="sub install"><summary>Як встановити</summary>') == 2
   and intro.count('<details class="sub">') == 1, "C5 the two «Як встановити» folds carry .install, the other fold not")
# C3: «Над грою працювали» in two columns: the people | «Офіційний текст» and everything after it (history too)
tail = home[home.index('<article class="paper sheet home-tail">'):]
ok(re.search(r'</aside><div class="credits"><div class="cr-people">\s*<p><strong>Автор текстів', tail) is not None
   and '</div><div class="cr-legal"><h2 id="ofitsiinyi-tekst">Офіційний текст</h2>' in tail
   and tail.index('class="cr-legal"') < tail.index('id="istoriia-zmin"'), "C3 the credits in two columns")
ok("НАД ГРОЮ ПРАЦЮВАЛИ" in tail[:tail.index('class="credits"')], "C3 the block's heading stays above both columns")


def no_official(w):
    p = os.path.join(w, "pages", "pustelnyky.md")
    t = read(p).replace("## Офіційний текст", "## Офіційне")
    with open(p, "w", encoding="utf-8", newline="") as fh:
        fh.write(t)


e = broken(no_official)
ok("pustelnyky.md" in e and "Офіційний текст" in e, f"C3 a home page without «Офіційний текст» stops the build: «{e[:160]}»")
# C4: «[**Назва](url):**» of Notion's export → a bold label with its link, no stars (13 glossary terms, the credits, the caravan)
GLOSS = pages["hlosarii-ihrovykh-terminiv"]
ok('<strong><a href="https://foundryvtt.com/packages/wastelanders" target="_blank" rel="noopener">Модуль Foundry VTT</a>:</strong> '
   '<a href="https://github.com/GMonlineua"' in home, "C4 «Модуль Foundry VTT:» bold, the name a link")
ok(GLOSS.count("<li><strong><a href=") == 13 and '<strong><a href="../arkhetypy/">Архетип</a>:</strong>' in GLOSS, "C4 the glossary's 13 terms")
ok('<strong><a href="../kistka-doli-ta-udacha-partii/#udacha-partii">Удачу партії</a></strong>' in pages["stvorennia-karavanu"], "C4 «Удачу партії»")
STARS = re.compile(r"(?<!\*)\*\*[^\s*]|[^\s*]\*\*(?!\*)")
for name, h in (("home", home), ("glossary", GLOSS), ("karavan", pages["stvorennia-karavanu"])):
    ok(not STARS.search(re.sub(r"<[^>]+>", "", h)), f"C4 {name}: no Markdown stars around a link: {STARS.findall(re.sub(r'<[^>]+>', '', h))[:3]}")
ok(build.BOLD_LINK_RE.sub(r"**[\1](\2)\3**", "[**A](b.md):** x [**B](https://c/d_(e)).**") == "**[A](b.md):** x **[B](https://c/d_(e)).**",
   "C4 the fix keeps the link and the mark, also a link with brackets")
# C4+ (author, 2026-11-28, «all the stars»): no Markdown mark is ever meant as text. «**» / «__» and a «|» of a table
# row are Notion's export showing through (a bold closed after a link, an empty bold «****», a bold across <br>, a table
# cell over several lines); a single «*» stays allowed: the rules use it as a footnote mark («Навичка 3*» … «⚠️*…»).


def visible(h):
    h = re.sub(r"<(script|style)[\s\S]*?</\1>|<head[\s\S]*?</head>", "", h)
    return html.unescape(re.sub(r"<[^>]+>", " ", h))


for name, h in [("home", home)] + sorted(pages.items()):
    v = visible(h)
    bad = re.findall(r".{0,30}(?:\*\*|__|\|).{0,30}", v)
    ok(not bad, f"C4 {name}: Markdown marks in the visible text: {bad[:2]}")
ok("<td><strong>Люди</strong><br><strong>Чоловіки</strong></td>" in pages["tablytsia-imen"], "C4 a bold cell over two lines")
ok("<strong><em>Колишній «товар» хоче, щоб я здох</em></strong>" in pages["arkhetypy"], "C4 «Колишній товар» (DEV's MD_FIXES)")
ok("<strong>+2, +2, +1, -1, -1, 0, 0.</strong>" in pages["atrybuty"], "C4 the stray «>» before «+2» (the text keeps «-1»)")
ok("здібностями" in visible(pages["suprotyvnyky-bandyty-dykuny-reidery"]) and "<em>небезпечний мутант із дивними здібностями</em>" in pages["suprotyvnyky-bandyty-dykuny-reidery"],
   "C4 «здібностями**** чи» is not an empty bold: kept as Markdown renders it")
# C6: every fold's arrow is in the CSS (the live check measures it)
for sel in (".fold > summary::before{content:\"▸\"", "details.sub > summary::before{content:\"▸\"", ".side > summary::before{content:\"▸\""):
    ok(sel in css, f"C6 «{sel}» in site.css")

# ---------- 3.13: callouts with their icon; nothing of Notion's left ----------
for slug, p in wiki.pages.items():
    if slug != home_slug and slug not in pages:
        continue
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
            ok(os.path.exists(os.path.join(REPO, href[6:].split("#")[0])) or href.startswith("../site.") or href.startswith("../img/") or href.startswith("../pagefind/") or href.startswith("../../favicon")
               or os.path.isfile(os.path.join(rules, href[3:])) and href.startswith("../files/"), f"link {name}: {href}")
            continue
        tgt, frag = m.group(1) or "", m.group(2)
        ok(tgt == "" or tgt in pages, f"link {name}: page {tgt}")
        if frag:
            ok(frag in ids.get(tgt, set()), f"link {name}: #{frag} on {tgt or 'home'}")
for href in re.findall(r'(?:href|src)="(img/[^"]+)"', home) + [m for h in pages.values() for m in re.findall(r'src="\.\./(img/[^"]+)"', h)]:
    ok(os.path.exists(os.path.join(rules, href)), f"image {href}")
ok(not any('<a href="' + build.SITE_URL in h or re.search(r'<a [^>]*href="' + re.escape(build.SITE_URL), h) for h in everything.values()), "links to the tools are relative (same tab)")

# ---------- package D-A (author, 2026-11-28) ----------
# D1: «Одна Пустка на всіх» is a fold, closed by default
# D1 (corrected by the dispatcher, 2026-11-28): not a fold of its own but the last block inside «Де грати», after the plates' panels
ok(re.search(r'</div><div class="eco" id="eco"><h3>Одна Пустка на всіх</h3><div class="eco-body">', intro) is not None
   and 'class="fold eco"' not in intro, "D1 «Одна Пустка на всіх» is the end of the fold «Де грати», not a fold")
# D2: the «Де грати» bar looks like the groups' header: the same CSS class, and it is not a plain .fold
ok('<details class="intro-fold"' in intro and 'class="fold intro-fold"' not in intro, "D2 «Де грати» is the .group-h bar, not a plain fold")
# D3: no page keeps a bare address of its own tool under the button
for slug, h in pages.items():
    t = wiki.pages[slug].tool
    if t:
        ok(build.SITE_URL + t + "</a>" not in h and ">" + build.SITE_URL + t + "<" not in h, f"D3 {slug}: the bare address of {t} is gone")
ok(build.drop_tool_links('<p><a href="https://x/">слова</a></p>', "x") == '<p><a href="https://x/">слова</a></p>', "D3 a link with its own words stays")
# D4: a text table may take the whole sheet; the CSS makes the sheet a container and the table as wide as it
ok(".paper.sheet{container-type:inline-size}" in css and ".text > table{width:max-content;max-width:calc(100cqw - 80px)}" in css,
   "D4 tables take the sheet's width, not the text's 84ch")
# D5: the three «Автоматичний генератор …» pages are off the site; their buttons stand after the callout that names them;
#     every link to them leads there (on that very page: to the tool); D6: the sheets page of «Додаткові матеріали» is gone
MOVED = {"avtomatychnyi-henerator-sprav": ("struktura-sesii-stvorennia-sprav", "all_generators.html#case"),
         "avtomatychnyi-henerator-bytv": ("skladnist-bytv", "all_generators.html#battle"),
         "avtomatychnyi-henerator-podorozhei": ("podorozhi-ta-vypadkovi-podii", "all_generators.html#travel")}
ok(site.moved == {k: v[0] for k, v in MOVED.items()}, f"D5 moved pages: {site.moved}")
ok(site.hidden == set(MOVED) | {"arkushi-personazhiv-ta-karavanu", "pamiatky-hravtsia-ta-dohliadacha"}, f"D5/D6 pages off the site: {sorted(site.hidden)}")
for gone in site.hidden:
    ok(not os.path.exists(os.path.join(rules, gone)), f"D5/D6 {gone}: no page on the site")
    ok(all(f'href="../{gone}/' not in h and f'href="{gone}/' not in h for h in everything.values()), f"D5/D6 no link to {gone}")
for gone, (to, tool) in MOVED.items():
    h = pages[to]
    btn = f'</aside><a class="toolbtn" id="{gone}" href="../../{tool}" data-tool="terminal" data-pagefind-ignore><b>{build.TOOL_TEXT}</b></a>'
    ok(h.count(btn) == 1, f"D5 {to}: the button of {gone} right after its callout")
    # DC8 (2026-11-28): the callout keeps its words, the button right under it is the page's one link to the generator
    ok(re.search(r'<aside[^>]*>(?:(?!</aside>).)*href="\.\./\.\./' + re.escape(tool) + r'"', h, re.S) is None,
       f"D5/DC8 {to}: the callout no longer links the generator (its button is right after it)")
    ok(f'href="{to}/#{gone}"' in home, f"D5 the home page's history links {gone} → {to}/#{gone}")
dod = next(s for _, s in site.sections if s["slug"] == "dodatkovi-materialy")
ok("arkushi-personazhiv-ta-karavanu" not in dod["pages"] and dod["pages"], "D6 «Додаткові матеріали» without the sheets page")
ok(">Аркуші персонажів та каравану<" not in home, "D6 the home page does not list the sheets page")
# the source keeps them (the compendiums read it): contents.yml whole, the Notion layout has every page
ok(len(wiki.pages) == 92 + 23 and all(p in [x for _, s in wiki.sections() for x in s["pages"]] for p in site.hidden),
   "D5/D6 the source keeps the pages and contents.yml lists them")
_lay = tempfile.mkdtemp(prefix="wiki-notion-")
ok(len([f for f in os.listdir(wiki.to_notion_layout(_lay)) if f.endswith(".md")]) == 92, "D5/D6 the Notion layout still has all 92 pages")
shutil.rmtree(_lay, ignore_errors=True)


def moved_no_callout(w):
    p = os.path.join(w, "pages", "skladnist-bytv.md")
    t = read(p).replace("(avtomatychnyi-henerator-bytv.md)", "(pravyla-bytv.md)")
    with open(p, "w", encoding="utf-8", newline="") as fh:
        fh.write(t)


e = broken(moved_no_callout)
ok("skladnist-bytv.md" in e and "avtomatychnyi-henerator-bytv" in e, f"D5 a moved button without its callout stops the build: «{e[:160]}»")

# ---------- package D-B (author, 2026-11-28): the reminders and the quick start (site only), files to download ----------
SITE_ONLY = sorted(s for s, p in wiki.pages.items() if not p.compendium)
QS = [p for g in wiki.contents["groups"] if g["title"] == "ШВИДКИЙ СТАРТ" for s in g["sections"] for p in s["pages"]]
ok(len(QS) == 21 and set(QS) | {"pamiatka-hravtsia", "pamiatka-dohliadacha"} == set(SITE_ONLY),
   f"DB7/9 the site-only pages: the two reminders and the 21 pages of the quick start ({len(SITE_ONLY)})")
for slug in SITE_ONLY:
    ok(slug in pages, f"DB7/9 {slug}: a page of the site")
ok(groups and groups[0] == "ШВИДКИЙ СТАРТ", f"DB9 «Швидкий старт» is the first group on the home page: {groups[:1]}")
ok("pamiatky-hravtsia-ta-dohliadacha" not in pages, "DB7 the old page of Drive links is off the site")
dm = [s for _, s in site.sections if s["slug"] == "dodatkovi-materialy"][0]["pages"]
ok(dm[:2] == ["pamiatka-hravtsia", "pamiatka-dohliadacha"], f"DB7 the reminders in «Додаткові матеріали»: {dm}")

# the compendiums never see a site-only page: the Notion layout (what tools/wiki_sync reads) leaves them out
lay = tempfile.mkdtemp(prefix="wiki-layout-")
wiki.to_notion_layout(lay)
names = os.listdir(lay)
ok(len([n for n in names if n.endswith(".md")]) == len(wiki.pages) - len(SITE_ONLY), f"DB the layout holds only the compendium pages ({len(names)} files)")
csv_rows = {row for n in names if n.endswith(".csv") for row in open(os.path.join(lay, n), encoding="utf-8-sig").read().splitlines()}
for slug in SITE_ONLY:
    t = wiki.pages[slug].title
    ok(not any(n.startswith(wikisrc.notion_name(t) + " ") and n.endswith(".md") for n in names) and t not in csv_rows,
       f"DB the layout has no file or section row for «{t}»")
ok(not any("ШВИДКИЙ" in n or n.startswith("Гравцям ") or n.startswith("Доглядачу ") for n in names), "DB no section CSV of the quick start")
shutil.rmtree(lay, ignore_errors=True)

# downloads: buttons «Скачати …», served by the site, never Drive
DL = {d["file"]: d for d in wiki.downloads()}
ok(len(DL) == 15, f"DB8 fifteen files to download: D-B's nine and the six ready-made characters of DC2 ({len(DL)})")
ok(sorted(os.listdir(os.path.join(rules, "files"))) == sorted(DL), "DB8 rules/files/ holds exactly the files of downloads.yml")
for f, d in DL.items():
    size = os.path.getsize(os.path.join(REPO, "wiki", "files", f))
    ok(size < 50_000_000, f"DB8 {f}: under 50 MB (the author's limit for the repository, 2026-11-28): {size}")
for name, h in everything.items():
    ok("drive.google.com" not in h, f"DB8 {name}: a link to Google Drive is left")
BTN = re.compile(r'<a class="dlbtn" href="\.\./files/([^"]+)" download="([^"]+)" data-pagefind-ignore><b>([^<]+)</b><small>(\w+) · [\d,]+ МБ</small></a>')
want = {"ihrovyi-protses": 6, "pokrokova-instruktsiia": 1, "henerator-pustelnykiv-ruchnyi": 2, "pokrashchennia-karavanu": 1,
        "stvorennia-karavanu": 1, "stvorennia-kampanii": 1, "mapa-zakhidnoho-uzberezhzhia-ssha-2277": 1,
        "fishky-personazhiv-ta-nipiv": 1, "pamiatka-hravtsia": 1, "pamiatka-dohliadacha": 1, "shvydkyi-start-avtory-ta-litsenziia": 1,
        "shvydkyi-start-kym-mozhna-hraty": 6}
for slug, h in pages.items():
    btns = BTN.findall(h)
    ok(len(btns) == h.count('class="dlbtn"') == want.get(slug, 0), f"DB8 {slug}: {want.get(slug, 0)} download buttons (got {len(btns)})")
    for f, dname, text, kind in btns:
        ok(f in DL and html.unescape(dname) == DL[f]["name"], f"DB8 {slug}: button to {f} saves as its Drive name")
        ok(html.unescape(text).startswith("Скачати "), f"DB8 {slug}: button text «{text}»")
        ok(kind == f.rsplit(".", 1)[1].upper(), f"DB8 {slug}: the button says the file's kind")
ok(re.search(r'<div class="text" data-pagefind-body>\s*<h1[^>]*>[^<]*</h1>\s*<div class="dls"><a class="dlbtn" href="\.\./files/shvydkyi-start\.pdf"[^>]*><b>Скачати PDF</b>',
             pages["shvydkyi-start-avtory-ta-litsenziia"]), "DB9 «Скачати PDF» at the top of the quick start's first page")
for slug, f in (("pamiatka-hravtsia", "pamiatka-hravtsia.pdf"), ("pamiatka-dohliadacha", "pamiatka-dohliadacha.pdf")):
    txt = pages[slug].split('<div class="text"', 1)[1].split('<nav class="pn"', 1)[0]
    ok(re.search(r'<div class="dls"><a class="dlbtn" href="\.\./files/' + f + r'"[^>]*>.*?</a></div>\s*</div>\s*$', txt, re.S),
       f"DB7 {slug}: the printable PDF's button at the bottom of the page")
ok("dlbtn" not in home, "DB8 «Історія змін» keeps the words of its Drive links, no buttons")
# DC10 (author via the dispatcher, 2026-11-28): the war callout in the flag's colours, no 🇺🇦 icon, the donate line a button
ua = re.search(r'<aside class="call call-ua"><div class="call-body">(.*?)</div></aside>', home, re.S)
ok(ua and "🇺🇦" not in ua.group(1) and f'<a class="ua-btn" href="{build.DONATE_URL}" target="_blank" rel="noopener">{html.escape(build.DONATE_TEXT, quote=True)}</a>' in ua.group(1)
   and ">https://savelife" not in ua.group(1), "DC10 the war callout: no icon, the fund's button, no bare address")
ok(".call.call-ua,html[data-theme=\"dark\"] .call.call-ua{" in css, "DC10 the callout keeps the flag's colours in the dark theme too")
hist = home.split('id="istoriia-zmin"')[1]
ok("Вікі з правилами перенесено з Notion на сайт" in hist and "Додано доповнення для Owlbear Rodeo." in hist, "DC10 the two new lines of «Версія 2.0»")
ok("Оновлено дизайн листа персонажа та листа каравану" in visible(home).replace("  ", " "), "DB8 the changelog's link words stay as text")
ok("Аркуші персонажів та каравану." in re.sub(r"\s+", " ", visible(pages["ihrovyi-protses"])), "DB8 a link inside a sentence keeps its words")
ok(re.search(r"Аркуші персонажів та каравану\.<span class=\"dls\">(?:<a class=\"dlbtn\"[^>]*>.*?</a>){2}</span><ul>", pages["ihrovyi-protses"]),
   "DB8 the two sheets' buttons stand after the item's text, before its nested list")


# DC8 (author via the dispatcher, 2026-11-28): on every page a tool (with its Terminal tab) or a file is linked once:
# its button, else one link in the text; cards, tabs and the home menu are not counted
for slug, h in list(pages.items()) + [("(home)", home)]:
    body = h.split('<div class="text" data-pagefind-body>', 1)[1].split('<nav class="pn"', 1)[0] if slug != "(home)" else h.split("<main", 1)[1]
    keys = [m.group("key") for m in build.TOOL_LINK_RE.finditer(body) if 'class="' not in m.group("attrs") + m.group("rest") or 'class="toolbtn"' in m.group("attrs") + m.group("rest")]
    keys += re.findall(r'<a class="dlbtn" href="([^"]+)"', body)
    dup = sorted({k for k in keys if keys.count(k) > 1})
    ok(not dup, f"DC8 {slug}: linked more than once: {dup}")


def drive_unknown(w):
    p = os.path.join(w, "pages", "naslidky.md")
    with open(p, "a", encoding="utf-8", newline="") as fh:
        fh.write("\n[тест](https://drive.google.com/file/d/NOPE000000/view)\n")


def links_site_only(w):
    p = os.path.join(w, "pages", "naslidky.md")
    with open(p, "a", encoding="utf-8", newline="") as fh:
        fh.write("\n[тест](pamiatka-hravtsia.md)\n")


def file_mid_sentence(w):
    p = os.path.join(w, "pages", "shvydkyi-start-kym-mozhna-hraty.md")
    t = open(p, encoding="utf-8").read().replace("Стать і зовнішність", "[Скачати Волті](../files/hotovyi-personazh-volti.pdf) Стать і зовнішність", 1)
    with open(p, "w", encoding="utf-8", newline="") as fh:
        fh.write(t)


def file_unlisted(w):
    with open(os.path.join(w, "files", "zayvyi.pdf"), "wb") as fh:
        fh.write(b"%PDF-")


e = broken(drive_unknown)
ok("NOPE000000" in e and "downloads.yml" in e, f"DB8 a Drive file not in downloads.yml stops the build: «{e[:120]}»")
e = broken(links_site_only)
ok("naslidky.md" in e and "pamiatka-hravtsia" in e, f"DB a compendium page linking to a site-only page stops the build: «{e[:120]}»")
e = broken(file_mid_sentence)
ok("посеред тексту" in e, f"DC2 a link to files/ inside a sentence stops the build: «{e[:120]}»")
e = broken(file_unlisted)
ok("zayvyi.pdf" in e, f"DB8 a file in files/ outside downloads.yml stops the build: «{e[:120]}»")

# DC2 (after package D-B, author 2026-11-28): the ready-made characters' sheets, a button at the end of each one's
# list item on «Ким можна грати» (its label the name as the item writes it), the caravan's at the end of the first paragraph
kym = pages.get("shvydkyi-start-kym-mozhna-hraty", "")
for name, f in [("Волті", "volti"), ("Банджо", "bandzho"), ("Доктор Шредер", "shreder"), ("Бабай", "babai"), ("Лихе Око", "lykhe-oko")]:
    ok(re.search(r'<li><strong>' + name + r'</strong>[^<]*<span class="dls"><a class="dlbtn" href="\.\./files/hotovyi-personazh-' + f
                 + r'\.pdf" download="Аркуш персонажа - ' + name + r' \([^"]+\)\.pdf" data-pagefind-ignore><b>Скачати ' + name + r'</b>', kym),
       f"DC2 «{name}»: the button «Скачати {name}» at the end of the item")
ok(re.search(r'на власний розсуд\.<span class="dls"><a class="dlbtn" href="\.\./files/hotovyi-karavan-ostannii-shans\.pdf"[^>]*><b>Скачати караван «Останній Шанс»</b>', kym),
   "DC2 the caravan's button at the end of the first paragraph")

# the imported text is Foundry's (reminders) / the Owlbear version's without its hints, plus the PDF's enemy blocks
# (quick start), word for word: the page's visible text equals the import's HTML (until the page is edited by hand)
DEV = os.path.join(REPO, "..", "wastelandersrpg_foundry_dev")
OWL = os.path.join(REPO, "..", "pustelnyky-owlbear")
node = shutil.which("node") or shutil.which("node.exe")
if node and os.path.isdir(DEV) and os.path.isdir(OWL):
    r = subprocess.run([node, os.path.join(REPO, "site", "import_foundry.mjs"), "--expected"], capture_output=True, text=True, encoding="utf-8")
    ok(r.returncode == 0, f"DB import_foundry.mjs --expected failed: {r.stderr[-300:]}")
    exp = json.loads(r.stdout or "{}")
    ok(sorted(exp) == SITE_ONLY, "DB the import makes exactly the site-only pages")

    def words(h):
        h = re.sub(r'<div class="dls">.*?</div>|<span class="dls">.*?</span>|<p><a href="\.\./files/[^"]+">[^<]*</a></p>|<span class="call-ico"[^>]*>.*?</span>', " ", h, flags=re.S)
        return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", h)).replace(" ", " ")).strip()
    import hashlib
    # the author's edits of the imported text, made on the site's pages after the import (slug: [(import's, site's)]);
    # the page still counts as the import when undoing them gives its import_sha, and its text is then compared with
    # the import plus these edits. «Сімона» as in Foundry, not the PDF's «Симона» (author, 2026-11-28, after D-B).
    SITE_EDITS = {
        "shvydkyi-start-vazhka-bytva-zahin-ketrin": [("Писарі Братства Сталі (2): Симона і Чедвік",
                                                       "Писарі Братства Сталі (2): Сімона і Чедвік")],
    }
    for slug, edits in SITE_EDITS.items():
        for a, b in edits:
            ok(b in wiki.pages[slug].body, f"DC1 {slug}: the site's edit «{b}» is not on the page")
            ok(a not in wiki.pages[slug].body, f"DC1 {slug}: the import's «{a}» is still on the page")
            ok(a in exp.get(slug, ""), f"DC1 {slug}: the import no longer has «{a}»: drop the edit from SITE_EDITS")
    ok("Симона" not in "".join(pages.values()), "DC1 «Симона» (the PDF's) is still on the site: Foundry's is «Сімона»")
    for slug in SITE_ONLY:
        page = wiki.pages[slug]
        body = page.body
        for a, b in SITE_EDITS.get(slug, []):
            body = body.replace(b, a)
            exp[slug] = exp.get(slug, "").replace(a, b)
        body = re.sub(r" \[Скачати [^\]]+\]\(\.\./files/[^)]+\)(?=\n)", "", body)  # DC2's buttons: not the import's text
        if hashlib.sha1(body.encode("utf-8")).hexdigest()[:12] != page.meta.get("import_sha"):
            print(f"SKIP DB verbatim {slug}: edited since the import")
            continue
        txt = pages[slug].split('<div class="text" data-pagefind-body>', 1)[1].split('<nav class="pn"', 1)[0]
        txt = re.sub(r"<h1[^>]*>.*?</h1>", "", txt, flags=re.S)
        ok(words(txt) == words(exp.get(slug, "")), f"DB {slug}: the site's text differs from the import's: "
           + next((f"…{a[max(0, i - 40):i + 40]}… / …{b[max(0, i - 40):i + 40]}…" for a, b in [(words(txt), words(exp.get(slug, "")))]
                   for i in [next((k for k in range(min(len(a), len(b))) if a[k] != b[k]), min(len(a), len(b)))]), ""))
else:
    print("SKIP DB verbatim (no node, DEV clone or pustelnyky-owlbear next to the repository)")


# terms (CLAUDE.md of the workspace; DEV's tests/terms.test.mjs does not read the site): the site-only pages too
TERMS_BAD = re.compile(r"ГМ|кубик|папк|псі|псіон|псиоників", re.I)
for slug in SITE_ONLY:
    bad = TERMS_BAD.findall(wiki.pages[slug].body)
    ok(not bad, f"DB terms {slug}: {bad[:3]}")

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
