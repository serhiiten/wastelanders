"""Build the rules wiki of «Пустельники» into a static site (plan docs/plans/2026-11-28-wiki-pages-plan.md, stage 3).

    python site/build.py [--out _site] [--no-search]

Reads the source in `wiki/` (format: wiki/README.md, reader: site/wikisrc.py) and writes
    <out>/rules/index.html               the rules' home: the menu (8 buttons), the groups and sections, the home text
    <out>/rules/<slug>/index.html        one page per wiki page
    <out>/rules/site.css, site.js, img/  shared look, theme, pictures
    <out>/rules/pagefind/                the search index (Pagefind, run unless --no-search)
    <out>/404.html                       GitHub Pages serves it for any missing address on the site
Nothing outside <out> is written; the source and the tools (`*.html`, `owlbear/`) are never touched.
The build stops with the file's name on a broken link, an unknown page in contents.yml and the like (`BuildError`).

Look: mockup А «Пульт Термінала» (author, 2026-11-28): the Terminal's header and tabs, a green screen with the
contents on the left, a paper sheet with the rule on the right. The header, tabs, screen and paper copy the Terminal's
own CSS (`pustelnyky_src/template.html`); tests/test_build.py compares the shared rules.
Needs: PyYAML, Markdown, Pillow (`pip install pyyaml markdown pillow`); Node for the search (`npx pagefind`).
"""
import argparse
import html
import io
import os
import re
import shutil
import subprocess
import sys

import markdown

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import wikisrc  # noqa: E402

PAGEFIND = "pagefind@1.3.0"            # pinned (plan §2.7)
SITE_URL = "https://serhiiten.github.io/wastelanders/"
EDIT_URL = "https://github.com/serhiiten/wastelanders/edit/main/wiki/pages/{}.md"
TOOL_TEXT = "▶ Відкрити в Терміналі"   # author, 2026-11-28
SHEET_TEXT = "▶ Відкрити аркуш"        # author, 2026-11-28 (character_generator.html, caravan_generator.html)
SHEETS = ("character_generator.html", "caravan_generator.html")
EDIT_TEXT = "Редагувати на GitHub"     # plan §2.4
ALERT_ICON = {"TIP": "☝", "WARNING": "⚠️", "NOTE": "☢"}   # a Notion emoji (no file) gets the section's ☢, as in the Terminal
LONG_PAGE = 1500                        # a page with a tool longer than this (characters) gets its button at the bottom too:
                                        # 1500 characters ≈ one screen of text at 1366×768; beyond it the top button
                                        # needs scrolling back (author, 2026-11-28)
TOOLS = {"all_generators.html": ("terminal", "Термінал Доглядача"),       # the tools that open in the wiki's frame
         "character_generator.html": ("character", "Аркуш персонажа"),   # (package B, author 2026-11-28); the names are
         "caravan_generator.html": ("caravan", "Аркуш каравану")}        # the tabs' texts
QUICK_GROUP = "ШВИДКИЙ СТАРТ"           # on the home page one full-width block right under «Де грати», the two rules
                                        # groups side by side under it, each whole (author, 2026-11-28, after D-B)
INTRO = ("home", "de-hraty.md")         # the intro «Де грати» on the home page (package B): not a wiki page
MORE_TEXT = "Докладніше"                 # mockup Г3 «Таблички», chosen by the author 2026-11-28
COPY_TEXT = "Копіювати"                  # index.html's copy button
DRIVE_RE = re.compile(r'<a href="https://drive\.google\.com/file/d/([\w-]+)/[^"]*">(.*?)</a>|https://drive\.google\.com/file/d/([\w-]+)/\S*?(?=<|\s|$)', re.S)
FILE_LINK_RE = re.compile(r'<p><a href="\.\./files/([^"]+)">([^<]+)</a></p>')
FILE_END_RE = re.compile(r'\s*<a href="\.\./files/([^"]+)">([^<]+)</a>(?=</p>|</li>)')  # «Ким можна грати» (after D-B)
BLOCK_END = re.compile(r"</p>|</li>|<ul>|<ol>|</h[1-6]>|</td>|</th>")
COVER_W = 1400                         # the cover is 2752 px / 2.1 MB in the source; 1400 px covers a 1366 px
                                       # screen (author, 2026-11-28)


class BuildError(Exception):
    pass


# ---------- small helpers ----------

def esc(s):
    return html.escape(s, quote=True)


def strip_tags(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s))


def heading_id(text):
    """A heading's anchor: its plain text transliterated like the page slugs."""
    return wikisrc.slugify(re.sub(r"[*_`]", "", text)) or "h"


# ---------- Markdown → HTML ----------

ALERT_HEAD = re.compile(r"^(\s*)> \[!(TIP|WARNING|NOTE|IMPORTANT|CAUTION)\]\s*$")
PH = "\x00ALERT{}\x00"
PH_RE = re.compile(r"(?:<p>)?\x00ALERT(\d+)\x00(?:</p>)?")


TABLE_SEP = re.compile(r"^\s*\|(?:\s*:?-{3,}:?\s*\|)+\s*$")


def join_table_heads(lines):
    """Notion exported some table headers over several lines («| **Результат⏎d10** | …»); join them with <br>."""
    out = []
    for line in lines:
        if TABLE_SEP.match(line):
            j = len(out) - 1
            while j >= 0 and out[j].strip() and not out[j].lstrip().startswith("|"):
                j -= 1
            if 0 <= j < len(out) - 1 and out[j].lstrip().startswith("|"):
                out[j:] = ["<br>".join(x.strip() if k else x.rstrip() for k, x in enumerate(out[j:]))]
        out.append(line)
    return out


def join_table_rows(md):
    """Notion writes a table cell of several lines (even with blank lines) as several Markdown lines, which breaks the
    table: a row starts with «|» and ends with «|», the lines between are joined into it with <br> (a blank line inside
    a cell: <br><br>). DEV's tools/wiki_sync/common.py word for word (author, 2026-11-15: «багато таблиць зламані»);
    the site lacked it until package C (13 pages). Then a bold cell over two lines («**Люди⏎Чоловіки**») gets a bold
    on each line: Markdown does not bold across <br>."""
    out, cur, gap = [], None, False
    for line in md.split("\n"):
        if cur is None:
            s = line.rstrip()
            if s.startswith("|") and not s.endswith("|"):
                cur = s
            else:
                out.append(line)
            continue
        s = line.strip()
        if not s:
            gap = True
            continue
        cur += ("<br><br>" if gap else "<br>") + s
        gap = False
        if cur.endswith("|"):
            out.append(cur)
            cur = None
    if cur is not None:
        out.append(cur)
    return "\n".join(BOLD_BR_RE.sub(lambda m: "**" + m.group(1).replace("<br>", "**<br>**") + "**", x)
                     if x.lstrip().startswith("|") and "<br>" in x else x for x in out)


# Notion's export sometimes closes a bold run after the link that starts inside it: «[**Назва](url):**» shows the stars and
# links them (author, 2026-11-28, package C, 4: 13 terms of the glossary, the home page's credits, «Створення каравану»).
# The same fix as DEV's tools/wiki_sync/build_rules.py (link_pass); the source keeps Notion's text.
BOLD_LINK_RE = re.compile(r"\[\*\*([^\]*]+)\]\(((?:[^()\s]|\([^()]*\))+)\)([:.,;]?)\*\*")

# a whole cell in bold over two lines: «| **Люди<br>Чоловіки** |» (the names tables), nothing else
BOLD_BR_RE = re.compile(r"(?<=\|\s)\*\*([^*|]*?<br>[^*|]*?)\*\*(?=\s*\|)")
# Notion's Markdown that shows stray marks, fixed by hand (package C, the author's «all the stars», 2026-11-28).
# The first is DEV's MD_FIXES (tools/wiki_sync/build_rules.py) word for word; the second takes only the stray quote
# mark of DEV's fix: DEV also turns «-1» into «−1», a text change the site does not make.
MD_FIXES = [("***Колишній** «**товар**» **хоче, щоб я здох***", "***Колишній «товар» хоче, щоб я здох***"),
            ("**>+2, +2, +1, -1, -1, 0, 0.**", "**+2, +2, +1, -1, -1, 0, 0.**")]


def md_to_html(body):
    """The page's Markdown as HTML: GitHub alerts become the Terminal's callouts."""
    blocks = []
    lines, out, i = join_table_heads(join_table_rows(body).split("\n")), [], 0
    while i < len(lines):
        m = ALERT_HEAD.match(lines[i])
        if not m:
            out.append(lines[i])
            i += 1
            continue
        ind, kind = m.group(1), m.group(2)
        inner = []
        i += 1
        while i < len(lines) and lines[i].startswith(ind + ">"):
            rest = lines[i][len(ind) + 1:]
            inner.append(rest[1:] if rest.startswith(" ") else rest)
            i += 1
        icon, k = ALERT_ICON.get(kind, "☢"), 0
        while k < len(inner) and not inner[k].strip():
            k += 1
        if k < len(inner):
            first = inner[k].strip()
            if wikisrc.EMOJI_KEEP_RE.fullmatch(first):
                inner = inner[k + 1:]                     # a Notion custom emoji: no file, use the section's icon
            elif len(first) <= 4 and not re.search(r"\w", first):
                icon, inner = first, inner[k + 1:]
        blocks.append(f'<aside class="call call-{kind.lower()}"><span class="call-ico" aria-hidden="true">{esc(icon)}</span>'
                      f'<div class="call-body">{md_to_html(chr(10).join(inner))}</div></aside>')
        out += ["", ind + PH.format(len(blocks) - 1), ""]
    text = "\n".join(out)
    text = wikisrc.EMOJI_KEEP_RE.sub("", text)
    text = BOLD_LINK_RE.sub(r"**[\1](\2)\3**", text)
    text = re.sub(r"(?<=\s)\*{4}", "", text)          # Notion's empty bold run «— ****текст» (DEV drops every «****»: that
    # breaks «здібностями**** чи» in «Бандити, дикуни, рейдери», which renders right as it is)
    for a, b in MD_FIXES:
        text = text.replace(a, b)
    res = markdown.markdown(text, extensions=["tables", "sane_lists"], output_format="html")
    return PH_RE.sub(lambda m: blocks[int(m.group(1))], res)


def add_heading_ids(htm, used=None):
    used = {} if used is None else used

    def one(m):
        n, attrs, inner = m.group(1), m.group(2), m.group(3)
        base = heading_id(strip_tags(inner))
        used[base] = used.get(base, 0) + 1
        hid = base if used[base] == 1 else f"{base}-{used[base]}"
        return f'<h{n}{attrs} id="{hid}">{inner}</h{n}>'
    return re.sub(r"<h([1-6])([^>]*)>(.*?)</h\1>", one, htm, flags=re.S)


# ---------- the site ----------

class Site:
    def __init__(self, repo=REPO):
        self.repo = repo
        self.wiki = wikisrc.Wiki(repo)
        probs = self.wiki.problems()
        if probs:
            raise BuildError("джерело вікі зламане:\n  " + "\n  ".join(probs))
        # pages kept out of the site (`site: false`, package D-A, author 2026-11-28): the site's sections list only the
        # shown pages; the source's contents.yml stays whole (the compendiums read it)
        self.hidden = {k for k, p in self.wiki.pages.items() if not p.site}
        self.moved = {k: self.wiki.pages[k].site_at for k in self.hidden if self.wiki.pages[k].site_at}
        self.sections = []
        for g, s in self.wiki.sections():
            shown = [p for p in s["pages"] if p not in self.hidden]
            if not shown:
                raise BuildError(f"contents.yml: у розділі «{s['title']}» не лишилось сторінок сайту")
            self.sections.append((g, dict(s, pages=shown)))
        self.groups = [dict(g, sections=[s for gt, s in self.sections if gt == g["title"]]) for g in self.wiki.contents["groups"]]
        self.secs = {s["slug"]: (g, s) for g, s in self.sections}
        self.order = [(g, s, p) for g, s in self.sections for p in s["pages"]]
        self.where = {p: (g, s, n) for n, (g, s, p) in enumerate(self.order)}
        clash = set(self.secs) & set(self.wiki.pages)
        if clash:
            raise BuildError("contents.yml: розділ і сторінка з однаковою адресою: " + ", ".join(sorted(clash)))
        self.downloads = self.wiki.downloads()
        self.by_drive = {d["drive"]: d for d in self.downloads if d.get("drive")}
        self.by_file = {d["file"]: d for d in self.downloads}
        self.ids = {}            # page slug → {heading text → id}
        self.para_ids = {}       # page slug → {bold paragraph name → id} (Notion anchors to a paragraph)
        self.anchor_fix = {}     # (page, text, target) → heading id
        self.anchors_used = set()

    # ----- links -----

    def rewrite_links(self, htm, rel, where, cur=None):
        """Source links → site links. `rel`: from this page to rules/ ('' for rules/, '../' for a page)."""
        def href(m):
            h = html.unescape(m.group(1))
            ext = ""
            if h.startswith(SITE_URL):
                h = rel + "../" + h[len(SITE_URL):]
            elif re.match(r"https?://", h):
                ext = ' target="_blank" rel="noopener"'
            elif h.startswith("../contents.yml#"):
                sec = h.split("#", 1)[1]
                if sec not in self.secs:
                    raise BuildError(f"{where}: посилання на неіснуючий розділ «{sec}»")
                h = f"{rel}#{sec}"
            elif h.startswith("../images/"):
                h = rel + "img/" + h[len("../images/"):]
            elif h.startswith("../files/"):
                h = rel + "files/" + h[len("../files/"):]
            elif h.startswith("#") or h.startswith("mailto:"):
                pass
            else:
                pm = re.fullmatch(r"([a-z0-9-]+)\.md(#.*)?", h)
                if not pm or pm.group(1) not in self.wiki.pages:
                    raise BuildError(f"{where}: бите посилання «{h}»")
                if pm.group(1) in self.moved:      # a page kept off the site: its button's new place (package D-A, 5)
                    to = self.moved[pm.group(1)]
                    if to == cur:                  # on that very page the link opens the tool, like the button under it
                        tool = self.wiki.pages[pm.group(1)].tool
                        return f'href="{esc(rel + "../" + tool)}" data-tool="{TOOLS[tool.split("#")[0]][0]}"'
                    h = f"{rel}{to}/#{pm.group(1)}" if to != self.wiki.contents["home"] else f"{rel}#{pm.group(1)}"
                    return f'href="{esc(h)}"{ext}'
                if pm.group(1) in self.hidden:
                    raise BuildError(f"{where}: посилання на сторінку поза сайтом «{h}» (site: false без site_at)")
                h = f"{rel}{pm.group(1)}/" + (pm.group(2) or "")
                if pm.group(1) == self.wiki.contents["home"]:
                    h = rel + (pm.group(2) or "")
            return f'href="{esc(h)}"{ext}'
        htm = re.sub(r'href="([^"]*)"', href, htm)
        return re.sub(r'src="\.\./images/([^"]+)"', lambda m: f'src="{rel}img/{m.group(1)}" loading="lazy"', htm)

    def apply_anchors(self, page):
        """Notion's links to a heading on another page (wiki/notion-anchors.yml) get the heading's anchor back."""
        body = page.body
        for a in self.wiki.anchors():
            if a["page"] != page.slug:
                continue
            hid = self.heading_ids(a["target"]).get(a["heading"])
            if not hid:
                raise BuildError(f"notion-anchors.yml: на «{a['target']}» немає заголовка «{a['heading']}»")
            pat = re.compile(r"\[(\**)" + re.escape(a["text"]) + r"(\**)\]\(" + re.escape(a["target"]) + r"\.md\)")
            body, n = pat.subn(lambda m: f"[{m.group(1)}{a['text']}{m.group(2)}]({a['target']}.md#{hid})", body, count=1)
            if not n:
                raise BuildError(f"notion-anchors.yml: на «{page.slug}» немає посилання «{a['text']}» → {a['target']}")
            self.anchors_used.add((a["page"], a["text"], a["target"]))
        return body

    def heading_ids(self, slug):
        """{heading plain text → id} of a page, as its HTML will have them. A Notion anchor may also point at a
        paragraph that starts with a bold name («**Кіборг:** …»): it gets an id of its own (`para_ids`)."""
        if slug not in self.ids:
            used = {heading_id(self.wiki.pages[slug].title): 1}
            htm = add_heading_ids(md_to_html(self.wiki.pages[slug].body), used)
            self.ids[slug], self.para_ids[slug] = {}, {}
            for m in re.finditer(r'<h[1-6][^>]* id="([^"]+)">(.*?)</h[1-6]>', htm, re.S):
                self.ids[slug].setdefault(strip_tags(m.group(2)).strip(), m.group(1))
            for a in self.wiki.anchors():
                t = a["heading"]
                if a["target"] != slug or t in self.ids[slug]:
                    continue
                if re.search(r"<(p|li)><strong>" + re.escape(html.escape(t, quote=False)) + r":?</strong>", htm):
                    base = heading_id(t)
                    used[base] = used.get(base, 0) + 1
                    self.ids[slug][t] = self.para_ids[slug][t] = base if used[base] == 1 else f"{base}-{used[base]}"
        return self.ids[slug]

    def add_para_ids(self, slug, htm):
        self.heading_ids(slug)
        for t, pid in self.para_ids[slug].items():
            htm, n = re.subn(r"<(p|li)>(<strong>" + re.escape(html.escape(t, quote=False)) + r":?</strong>)",
                             lambda m: f'<{m.group(1)} id="{pid}">{m.group(2)}', htm, count=1)
            if not n:
                raise BuildError(f"pages/{slug}.md: не знайдено абзацу «{t}» для якоря")
        return htm

    # ----- files to download (package D-B, author 2026-11-28) -----

    def dl_button(self, d, label=None):
        size = os.path.getsize(os.path.join(self.wiki.dir, "files", d["file"])) / 1e6
        kind = d["file"].rsplit(".", 1)[-1].upper()
        return (f'<a class="dlbtn" href="../files/{esc(d["file"])}" download="{esc(d["name"])}" data-pagefind-ignore>'
                f'<b>{esc(label or d["label"])}</b><small>{kind} · {f"{size:.1f}".replace(".", ",")} МБ</small></a>')

    def downloads_html(self, htm, where, buttons=True):
        """Every download is a button «Скачати …» served by the site, never a link to Google Drive (author, 2026-11-28,
        package D-B, 8). A paragraph or heading that is only a Drive link (or its bare address) becomes the button; a Drive
        link inside a sentence keeps its words as plain text and its button stands at the end of that paragraph or list
        item. `buttons=False` (the home page's «Історія змін»): the words only, no buttons. A site page's paragraph that is
        only a link to `../files/…` is that file's button with the link's words; such a link at the very end of a
        paragraph or list item is its button at that end (the ready-made characters, after package D-B)."""
        def known(fid):
            if fid not in self.by_drive:
                raise BuildError(f"{where}: файл Google Drive {fid} не описано у wiki/downloads.yml")
            return self.by_drive[fid]

        def file_btn(m):
            d = self.by_file.get(html.unescape(m.group(1)))
            if not d:
                raise BuildError(f"{where}: файл files/{m.group(1)} не описано у wiki/downloads.yml")
            return f'<div class="dls">{self.dl_button(d, html.unescape(m.group(2)))}</div>'
        htm = FILE_LINK_RE.sub(file_btn, htm)

        def end_btn(m):  # a link to `../files/…` that ends its paragraph or list item: its button stands at that end
            d = self.by_file.get(html.unescape(m.group(1)))
            if not d:
                raise BuildError(f"{where}: файл files/{m.group(1)} не описано у wiki/downloads.yml")
            return f'<span class="dls">{self.dl_button(d, html.unescape(m.group(2)))}</span>'
        htm = FILE_END_RE.sub(end_btn, htm)
        if '<a href="../files/' in htm:
            raise BuildError(f"{where}: посилання на файл files/ посеред тексту (кнопка стоїть окремим абзацом або в кінці абзацу чи пункту)")

        def whole(m):   # a block that holds one Drive link or address and nothing else
            ids = [x.group(1) or x.group(3) for x in DRIVE_RE.finditer(m.group(2))]
            rest = DRIVE_RE.sub("", m.group(2)).strip()
            if len(ids) != 1 or rest:
                return m.group(0)
            return f'<div class="dls">{self.dl_button(known(ids[0]))}</div>' if buttons else ""
        # a heading carries its id (heading_ids): without `[^>]*` the map's «## [Пустельники - Мапа …](drive)» stayed a
        # heading of the link's words above its button (author via the dispatcher, 2026-11-28, DC6)
        htm = re.sub(r"<(p|h[1-6])(?:\s[^>]*)?>(.*?)</\1>", lambda m: whole(m) if "drive.google.com" in m.group(2) else m.group(0), htm, flags=re.S)
        out, pos, pending = [], 0, []
        links = list(DRIVE_RE.finditer(htm))
        for k, m in enumerate(links):
            if m.group(3):
                raise BuildError(f"{where}: гола адреса Google Drive посеред тексту: {m.group(0)[:80]}")
            d = known(m.group(1))
            end = BLOCK_END.search(htm, m.end())
            if not end:
                raise BuildError(f"{where}: посилання на Google Drive поза абзацом")
            out.append(htm[pos:m.start()] + m.group(2))
            pos = m.end()
            if d not in pending:
                pending.append(d)
            # the buttons go in where the block ends, once its last Drive link is done
            if k + 1 == len(links) or links[k + 1].start() > end.start():
                if buttons:
                    out.append(htm[pos:end.start()] + '<span class="dls">' + "".join(self.dl_button(x) for x in pending) + "</span>")
                    pos = end.start()
                pending = []
        out.append(htm[pos:])
        return "".join(out)

    # ----- pieces of the layout -----

    def head(self, title, rel, extra="", canonical=None):
        canon = f'<link rel="canonical" href="{esc(SITE_URL + "rules/" + canonical)}">\n' if canonical is not None else ""
        return f"""<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)}</title>
{canon}<script>document.documentElement.classList.add('js');try{{ if(localStorage.getItem('pustelnyky-theme')==='dark') document.documentElement.dataset.theme='dark'; }}catch(e){{}}</script>
<link rel="icon" type="image/svg+xml" href="{rel}../favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Handjet:wght@700&family=Jura:wght@500;600;700&family=Oswald:wght@500;600;700&family=Roboto+Condensed:wght@400;700;800&family=Ubuntu+Mono:wght@400;700&family=Ubuntu:ital,wght@0,400;0,500;0,700;1,400&display=swap">
<link rel="stylesheet" href="{rel}site.css">
<link rel="stylesheet" href="{rel}pagefind/pagefind-ui.css">
{extra}</head>
"""

    def header(self, rel):
        return f"""<header class="rustbar top">
  <div class="brand">
    <a class="brand-home" href="{rel}" aria-label="Правила гри">{GEAR}<span><span class="brand-title">Пустельники</span><span class="brand-sub">Правила гри</span></span></a>
    <div class="hd-tools">
      <div class="search" id="search" data-pagefind-ignore></div>
      <button type="button" class="themebtn" id="theme-btn" aria-pressed="false" title="Увімкнути темну тему" aria-label="Увімкнути темну тему"><span class="th-moon">{ICON['moon']}</span><span class="th-sun">{ICON['sun']}</span></button>
    </div>
  </div>
</header>
"""

    def tabs(self, rel):
        return f"""<nav class="tabs" aria-label="Пустельники" data-pagefind-ignore>
  <a class="tab" aria-current="page" href="{rel}"><span class="ico">{ICON['file']}</span>Правила</a>
  <a class="tab" href="{rel}../all_generators.html" data-tool="terminal"><span class="ico">{ICON['radiation']}</span>Термінал Доглядача</a>
  <a class="tab" href="{rel}../character_generator.html" data-tool="character"><span class="ico">{ICON['person']}</span>Аркуш персонажа</a>
  <a class="tab" href="{rel}../caravan_generator.html" data-tool="caravan"><span class="ico">{ICON['truck']}</span>Аркуш каравану</a>
</nav>
"""

    def foot(self, rel):
        return f"""<script src="{rel}pagefind/pagefind-ui.js"></script>
<script src="{rel}site.js"></script>
</body>
</html>
"""

    def side(self, rel, cur_sec=None, cur_page=None):
        """The green screen: groups → sections; the current section's pages."""
        out = []
        for g in self.groups:
            out.append(f'<h2 class="side-g">{esc(g["title"])}</h2><ul>')
            for s in g["sections"]:
                on = s["slug"] == cur_sec
                # a section opens its first page (author, 2026-11-28, package A, 1)
                out.append(f'<li><a class="side-s{" on" if on else ""}" href="{rel}{s["pages"][0]}/">{esc(s["title"])}</a>')
                if on:
                    out.append("<ul>")
                    for p in s["pages"]:
                        cur = ' aria-current="page" class="side-p cur"' if p == cur_page else ' class="side-p"'
                        out.append(f'<li><a{cur} href="{rel}{p}/">{esc(self.wiki.pages[p].title)}</a></li>')
                    out.append("</ul>")
                out.append("</li>")
            out.append("</ul>")
        return "".join(out)

    def tool_button(self, page, rel, bid=None):
        if not page.tool:
            return ""
        text = SHEET_TEXT if page.tool.split("#")[0] in SHEETS else TOOL_TEXT
        idattr = f' id="{bid}"' if bid else ""
        return (f'<a class="toolbtn"{idattr} href="{rel}../{esc(page.tool)}" data-tool="{TOOLS[page.tool.split("#")[0]][0]}" '
                f'data-pagefind-ignore><b>{text}</b></a>')

    def place_moved_buttons(self, slug, htm, rel):
        """The tool buttons of the pages kept off the site that name this page in `site_at` stand right after the callout
        that mentions their generator (author, 2026-11-28, package D-A, 5). The build stops if there is no such callout."""
        for h, to in sorted(self.moved.items()):
            if to != slug:
                continue
            i = htm.find(f'href="{h}.md"')
            j = htm.find("</aside>", i) if i >= 0 else -1
            if j < 0 or htm.rfind("<aside", 0, i) < htm.rfind("</aside>", 0, i):
                raise BuildError(f"pages/{slug}.md: немає виноски з посиланням на {h}.md, де стала б кнопка (site_at у pages/{h}.md)")
            j += len("</aside>")
            htm = htm[:j] + f"<!--BTN:{h}-->" + htm[j:]   # the button goes in after rewrite_links (its href is final)
        return htm

    # ----- pages -----

    def page_html(self, slug):
        page = self.wiki.pages[slug]
        g, s, n = self.where[slug]
        rel = "../"
        where = f"pages/{slug}.md"
        body = self.apply_anchors(page)
        htm = md_to_html(body)
        htm = add_heading_ids(htm, {heading_id(page.title): 1})
        htm = self.add_para_ids(slug, htm)
        htm = drop_tool_links(htm, page.tool)
        htm = self.downloads_html(htm, where)
        htm = self.place_moved_buttons(slug, htm, rel)
        htm = self.rewrite_links(htm, rel, where, cur=slug)
        htm = re.sub(r"<!--BTN:([a-z0-9-]+)-->", lambda m: self.tool_button(self.wiki.pages[m.group(1)], rel, bid=m.group(1)), htm)
        pos = s["pages"].index(slug) + 1
        prev_ = self.order[n - 1][2] if n > 0 else None
        next_ = self.order[n + 1][2] if n + 1 < len(self.order) else None
        pn = '<nav class="pn" aria-label="Сторінки" data-pagefind-ignore>'
        pn += (f'<a class="pn-prev" href="{rel}{prev_}/"><small>← Попередня</small>{esc(self.wiki.pages[prev_].title)}</a>' if prev_ else "<span></span>")
        pn += (f'<a class="pn-next" href="{rel}{next_}/"><small>Наступна →</small>{esc(self.wiki.pages[next_].title)}</a>' if next_ else "<span></span>")
        pn += "</nav>"
        tool = self.tool_button(page, rel)
        return (self.head(f"{page.title} — Пустельники", rel, canonical=slug + "/")
                + f'<body class="pg-rule">\n{self.header(rel)}<main class="frame">\n{self.tabs(rel)}<div class="layout">\n'
                + f'<details class="side screen" open data-pagefind-ignore><summary>☰ Зміст розділу</summary><nav aria-label="Зміст">{self.side(rel, s["slug"], slug)}</nav></details>\n'
                + f'<article class="paper sheet">\n<header class="sheet-head" data-pagefind-ignore><span class="crumb"><a href="{rel}">{esc(g)}</a> › <a href="{rel}#{s["slug"]}">{esc(s["title"])}</a></span><span>{pos} / {len(s["pages"])}</span></header>\n'
                + f'<div class="text" data-pagefind-body>\n<h1 id="{heading_id(page.title)}">{esc(page.title)}</h1>\n{tool}\n{htm}\n{tool if len(page.body) > LONG_PAGE else ""}\n</div>\n'
                + f'{pn}\n<p class="edit" data-pagefind-ignore><a href="{EDIT_URL.format(slug)}" target="_blank" rel="noopener">{EDIT_TEXT}</a></p>\n</article>\n</div>\n</main>\n'
                + self.foot(rel))

    def home_html(self):
        home = self.wiki.home
        rel = ""
        body = self.apply_anchors(home)
        # the cover goes to the menu's background; the 8 picture buttons become the menu; the group callouts become cards
        body = re.sub(r"^!\[[^\]]*\]\(\.\./images/cover\.png\)\s*$", "", body, flags=re.M)
        for b in self.wiki.contents.get("buttons", []):
            body = re.sub(r"^!\[[^\]]*\]\(\.\./images/" + re.escape(b["image"]) + r"\)\s*$", "", body, flags=re.M)
        m = re.search(r"^> \[!NOTE\]\n(?:>.*\n)*?> ## \*\*ПРАВИЛА ГРАВЦІВ\*\*", body, re.M)
        m2 = re.search(r"^> \[!NOTE\]\n(?:>.*\n)*?> ## НАД ГРОЮ ПРАЦЮВАЛИ", body, re.M)
        if not m or not m2:
            raise BuildError(f"pages/{home.slug}.md: не знайдено блоків «ПРАВИЛА ГРАВЦІВ» / «НАД ГРОЮ ПРАЦЮВАЛИ»")
        intro, rest = body[:m.start()], body[m2.start():]
        # the sections the home page lists must be exactly contents.yml's (it is the menu's order)
        listed = re.findall(r"\(\.\./contents\.yml#([a-z0-9-]+)\)", body[m.start():m2.start()])
        if listed != [s["slug"] for _, s in self.wiki.compendium_sections()]:   # the site-only quick start is not on it
            raise BuildError(f"pages/{home.slug}.md: розділи на головній не збігаються з contents.yml")
        lead = self.rewrite_links(add_heading_ids(md_to_html(intro)), rel, f"pages/{home.slug}.md", cur=home.slug)
        # the Drive links of «Історія змін» (the old sheets, the tokens) keep their words only: a changelog is no place for
        # download buttons (package D-B)
        tail = self.rewrite_links(self.downloads_html(add_heading_ids(md_to_html(rest)), f"pages/{home.slug}.md", buttons=False),
                                  rel, f"pages/{home.slug}.md", cur=home.slug)
        tail = credits_columns(fold_history(tail, f"pages/{home.slug}.md"), f"pages/{home.slug}.md")
        intro, intro_ids = self.intro_html()
        menu = []
        for b in self.wiki.contents.get("buttons", []):
            if b.get("menu") is False:      # kept in the source, not in the site's menu (author, 2026-11-28)
                continue
            link = b["link"]
            ext = ""
            if link.startswith("#"):        # a plate of the intro «Де грати» (package B, author 2026-11-28)
                if link[1:] not in intro_ids:
                    raise BuildError(f"contents.yml, кнопка «{b['text']}»: у вступі {'/'.join(INTRO)} немає «{link}»")
                href = link
            elif link.endswith(".md"):
                href = link[:-3] + "/"
            elif re.match(r"https?://", link):
                href, ext = link, ' target="_blank" rel="noopener"'
            else:
                href = "../" + link
            mark = '<span class="mi-ext" aria-hidden="true">↗</span>' if ext else ""
            tool = TOOLS.get(link.split("#")[0])
            ext += f' data-tool="{tool[0]}"' if tool and not ext else ""
            menu.append(f'<li><a class="mi" href="{esc(href)}"{ext}><span class="lamp" aria-hidden="true"></span><span class="mi-t">{esc(b.get("label", b["text"]))}</span>{mark}</a></li>')
        cards = []
        if not self.groups or self.groups[0]["title"] != QUICK_GROUP:
            raise BuildError(f"contents.yml: перша група має бути «{QUICK_GROUP}» (на головній — блок на всю ширину під «Де грати»)")
        for g in self.groups:
            secs = []
            for s in g["sections"]:
                pages = "".join(f'<li><a href="{p}/">{esc(self.wiki.pages[p].title)}</a></li>' for p in s["pages"])
                secs.append(f'<section class="sec" id="{s["slug"]}"><h3>{esc(s["title"])}</h3><ul>{pages}</ul></section>')
            wide = " group-wide" if g["title"] == QUICK_GROUP else ""
            cards.append(f'<section class="group{wide}"><h2 class="group-h">{esc(g["title"])}</h2>{"".join(secs)}</section>')
        return (self.head("Пустельники — правила гри", rel, canonical="")
                + f'<body class="pg-home">\n{self.header(rel)}<main class="frame">\n{self.tabs(rel)}'
                + f'<div class="hero"><div class="hero-art"><div class="hero-lead screen-text" data-pagefind-body>{lead}</div></div>'
                + f'<div class="hero-side"><nav class="panel" aria-label="Швидкий старт" data-pagefind-ignore><ul>{"".join(menu)}</ul></nav></div></div>\n'
                + intro + "\n"
                + f'<div class="groups">{"".join(cards)}</div>\n'
                + f'<article class="paper sheet home-tail"><div class="text">{tail}</div>'
                + f'<p class="edit" data-pagefind-ignore><a href="{EDIT_URL.format(home.slug)}" target="_blank" rel="noopener">{EDIT_TEXT}</a></p></article>\n'
                + "</main>\n" + self.foot(rel))

    def intro_html(self):
        """The intro «Де грати» (wiki/home/de-hraty.md, the texts of the old index.html): a title and a lead, three plates
        (layout of mockup Г3 «Таблички» in the look of Г2 «Екран», author 2026-11-28) whose «Докладніше» opens a panel
        under them, and a closing block. Returns (html, the plates' ids)."""
        where = "/".join(INTRO)
        path = os.path.join(self.wiki.dir, *INTRO)
        if not os.path.exists(path):
            raise BuildError(f"{where}: немає файлу вступу")
        with open(path, encoding="utf-8") as fh:
            text = re.sub(r"\A\s*<!--.*?-->\s*", "", fh.read(), flags=re.S)
        m = re.match(r"# (.+)\n", text)
        if not m:
            raise BuildError(f"{where}: перший рядок — «# заголовок»")
        title, text = m.group(1).strip(), text[m.end():]
        parts = re.split(r"^## (.+?) \{#([a-z0-9-]+)\}[ \t]*$", text, flags=re.M)
        secs = [(parts[i].strip(), parts[i + 1], parts[i + 2].strip()) for i in range(1, len(parts), 3)]
        if len(secs) != 4 or re.search(r"^## ", parts[0], re.M):
            raise BuildError(f"{where}: має бути чотири розділи «## Назва {{#id}}» (три таблички й завершальний блок), є {len(secs)}")
        ids = [x[1] for x in secs]
        for need in ("owlbear", "foundry"):
            if need not in ids:
                raise BuildError(f"{where}: немає розділу з id «{need}» (на нього ведуть кнопки меню й старі адреси index.html#{need})")
        hid = wikisrc.slugify(title)
        clash = (set(ids) | {hid}) & (set(self.secs) | set(self.wiki.pages))
        if clash or len(set(ids)) != 4:
            raise BuildError(f"{where}: id розділів вступу збігаються з розділами вікі чи між собою: {', '.join(sorted(clash)) or ids}")

        def conv(md):
            return self.rewrite_links(intro_md(md, where), "", where)
        plates, panels = [], []
        for n, (name, pid, body) in enumerate(secs[:3], 1):
            cm = re.match(r"((?:`[^`]+`[ \t]*)+)\n", body)
            if not cm:
                raise BuildError(f"{where}, «{name}»: під заголовком — рядок цінників у `лапках`")
            chips = re.findall(r"`([^`]+)`", cm.group(1))
            first, _, rest = body[cm.end():].strip().partition("\n\n")
            chip_html = "".join(f'<span class="price {("free" if c == "Безкоштовно" else "paid") if i == 0 else "tag"}">{esc(c)}</span>'
                                for i, c in enumerate(chips))
            plates.append(f'<section class="plate screen n{n}" id="{pid}" aria-labelledby="{pid}-h"><h3 id="{pid}-h">{esc(name)}</h3>'
                          f'<p class="chips">{chip_html}</p><p class="plate-p">{conv(first)[3:-4]}</p>'
                          f'<button type="button" class="plate-more" aria-expanded="false" aria-controls="{pid}-more">{MORE_TEXT}</button></section>')
            panels.append(f'<div class="plate-panel n{n}" id="{pid}-more" role="region" aria-labelledby="{pid}-h">{conv(rest)}</div>')
        name, pid, body = secs[3]
        # «Одна Пустка на всіх» lives inside the fold «Де грати», at its end after the plates (author via the dispatcher,
        # 2026-11-28, package D-A, 1: not a fold of its own)
        eco = f'<div class="eco" id="{pid}"><h3>{esc(name)}</h3><div class="eco-body">{conv(body)}</div></div>'
        lead = conv(parts[0].strip())
        # «Де грати» (the lead and the three plates) is a fold, closed by default (package C, 1); its summary is a prominent
        # bar in the style of the groups' header «Правила гравців» (author, 2026-11-28, package D-A, 2)
        out = (f'<article class="intro" aria-labelledby="{hid}" data-pagefind-body>'
               f'<details class="intro-fold" id="{hid}-fold"><summary class="group-h"><h2 id="{hid}">{esc(title)}</h2></summary>'
               f'<div class="intro-in"><div class="intro-head">{lead}</div>'
               f'<div class="plates">{"".join(plates)}{"".join(panels)}</div>{eco}</div></details></article>')
        return out, ids[:3]

    def not_found_html(self):
        # Pages serves /404.html for every missing address, so its links are absolute
        rel = "/wastelanders/rules/"
        return (self.head("Сторінку не знайдено — Пустельники", rel, '<meta name="robots" content="noindex">\n')
                + f'<body class="pg-404">\n{self.header(rel)}<main class="frame">\n{self.tabs(rel)}<div class="layout">\n'
                + f'<details class="side screen" open data-pagefind-ignore><summary>☰ Зміст розділу</summary><nav aria-label="Зміст">{self.side(rel)}</nav></details>\n'
                + '<article class="paper sheet"><div class="text"><h1>404</h1><p>Можливо до Великої Війни тут щось і було, але згоріло в ядерному полум\'ї. Повернутися на <a href="/wastelanders/rules/">головну</a>?</p></div></article>\n'
                + "</div>\n</main>\n" + self.foot(rel))

    # ----- writing -----

    def build(self, out, search=True):
        rules = os.path.join(out, "rules")
        if os.path.isdir(out):
            shutil.rmtree(out)
        os.makedirs(os.path.join(rules, "img"))
        for slug in self.wiki.pages:
            if slug == self.wiki.contents["home"] or slug in self.hidden:
                continue
            d = os.path.join(rules, slug)
            os.makedirs(d)
            write(os.path.join(d, "index.html"), self.page_html(slug))
        write(os.path.join(rules, "index.html"), self.home_html())
        write(os.path.join(out, "404.html"), self.not_found_html())
        unused = {(a["page"], a["text"], a["target"]) for a in self.wiki.anchors()} - self.anchors_used
        if unused:
            raise BuildError("notion-anchors.yml: не застосовано " + ", ".join(f"{p}: «{t}»" for p, t, _ in sorted(unused)))
        write(os.path.join(rules, "site.css"), CSS)
        write(os.path.join(rules, "site.js"), JS)
        self.copy_images(os.path.join(rules, "img"))
        os.makedirs(os.path.join(rules, "files"))
        for d in self.downloads:
            shutil.copyfile(os.path.join(self.wiki.dir, "files", d["file"]), os.path.join(rules, "files", d["file"]))
        if search:
            run_pagefind(rules)
        else:   # empty stubs so the pages load without errors in tests
            os.makedirs(os.path.join(rules, "pagefind"))
            write(os.path.join(rules, "pagefind", "pagefind-ui.css"), "")
            write(os.path.join(rules, "pagefind", "pagefind-ui.js"), "")
        return rules

    def copy_images(self, dst):
        from PIL import Image
        src = os.path.join(self.wiki.dir, "images")
        used = set()
        for p in self.wiki.pages.values():
            used |= {m.group(2) for m in wikisrc.IMAGE_RE.finditer(p.body)}
        for name in sorted(used):
            if name == "cover.png" or name in {b["image"] for b in self.wiki.contents.get("buttons", [])}:
                continue
            shutil.copyfile(os.path.join(src, name), os.path.join(dst, name))
        im = Image.open(os.path.join(src, "cover.png")).convert("RGB")
        im = im.resize((COVER_W, round(COVER_W * im.size[1] / im.size[0])), Image.LANCZOS)
        im.save(os.path.join(dst, "cover.jpg"), "JPEG", quality=72, optimize=True, progressive=True)


def intro_md(md, where):
    """Markdown of the intro → HTML: «### Як встановити» → a nested fold; «#### Назва» + list → a grid of features;
    a list after «<!-- інструменти -->» → cards of the tools; a code span holding only an address → a copy box;
    a line break inside a list item is kept."""
    md, tools = (md.split("<!-- інструменти -->", 1) + [""])[:2]
    cards = []
    for line in tools.strip().splitlines():
        m = re.fullmatch(r"- \[([^\]]+)\]\(([^)]+)\): (.+)", line.strip())
        if not m:
            raise BuildError(f"{where}: рядок інструмента «{line.strip()[:60]}» не «- [Назва](адреса): опис»")
        tool = TOOLS.get(m.group(2).rsplit("/", 1)[-1].split("#")[0])
        cards.append(f'<li><a class="tool" href="{esc(m.group(2))}"' + (f' data-tool="{tool[0]}"' if tool else "")
                     + f'><span class="name">{esc(m.group(1))}</span><span class="desc">{esc(m.group(3))}</span></a></li>')
    parts = re.split(r"^### (.+)$", md, flags=re.M)

    def one(chunk):
        h = md_to_html(chunk.strip())
        h = re.sub(r"(<li>[^<]*?)\n\s+(?=[^\s<])", r"\1<br>", h)
        h = re.sub(r"\s*(?:<p>)?<code>(https?://[^<\s]+)</code>(?:</p>)?",
                   lambda m: f'<div class="copy"><span class="url">{m.group(1)}</span><button type="button" class="copy-btn">{COPY_TEXT}</button></div>', h)
        feats = re.findall(r"<h4>(?:(?!</h4>).)*</h4>\s*<ul>(?:(?!</ul>).)*</ul>", h, re.S)
        if feats:
            run = re.search(r"(?:\s*<h4>(?:(?!</h4>).)*</h4>\s*<ul>(?:(?!</ul>).)*</ul>){2,}", h, re.S)
            if run:
                grp = re.findall(r"<h4>(?:(?!</h4>).)*</h4>\s*<ul>(?:(?!</ul>).)*</ul>", run.group(0), re.S)
                h = h[:run.start()] + '<div class="feats">' + "".join(f"<div>{f}</div>" for f in grp) + "</div>" + h[run.end():]
        return h
    out = one(parts[0])
    if cards:
        out += '<ul class="toolcards">' + "".join(cards) + "</ul>"
    for i in range(1, len(parts), 2):
        name = parts[i].strip()
        # «Як встановити» opens together with its plate (author, 2026-11-28, package C, 5)
        cls = "sub install" if name == INSTALL else "sub"
        out += f'<details class="{cls}"><summary>{esc(name)}</summary>{one(parts[i + 1])}</details>'
    return out


def drop_tool_links(htm, tool):
    """A paragraph that is only the bare address of the page's own tool («https://…/all_generators.html#tables» under
    «▶ Відкрити в Терміналі») repeats the button: dropped from the site, the source unchanged (author, 2026-11-28,
    package D-A, 3). A link with its own words stays."""
    if not tool:
        return htm
    url = re.escape(SITE_URL + tool)
    return re.sub(r'\s*<p><a href="' + url + r'">' + url + r'</a></p>', "", htm)


HISTORY = "Історія змін"
INSTALL = "Як встановити"
OFFICIAL = "Офіційний текст"


def fold_history(htm, where):
    """«Історія змін» on the home page is a fold, closed by default (author, 2026-11-28, package A, 4).
    It is the page's last section: everything after its heading goes into the fold."""
    m = re.search(r'<h2 id="([^"]+)">' + HISTORY + r'</h2>', htm)
    if not m:
        raise BuildError(f"{where}: немає заголовка «{HISTORY}»")
    return (htm[:m.start()] + f'<details class="fold" id="{m.group(1)}"><summary><h2>{HISTORY}</h2></summary>'
            + htm[m.end():] + "</details>")


def credits_columns(htm, where):
    """«Над грою працювали» in two columns: the people on the left; «Офіційний текст» (the licences) and everything after
    it on the right; one under the other on a narrow screen (author, 2026-11-28, package C, 3). The block's heading
    (the callout «НАД ГРОЮ ПРАЦЮВАЛИ») stays above both."""
    head = re.match(r"\s*<aside .*?</aside>", htm, re.S)
    m = re.search(r'<h2 id="[^"]+">' + OFFICIAL + r'</h2>', htm)
    if not head or "НАД ГРОЮ ПРАЦЮВАЛИ" not in head.group(0) or not m or m.start() < head.end():
        raise BuildError(f"{where}: не знайдено «НАД ГРОЮ ПРАЦЮВАЛИ» і за ним «{OFFICIAL}»")
    return (head.group(0) + '<div class="credits"><div class="cr-people">' + htm[head.end():m.start()]
            + '</div><div class="cr-legal">' + htm[m.start():] + "</div></div>")


def write(path, text):
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)


def run_pagefind(rules):
    npx = shutil.which("npx") or shutil.which("npx.cmd")
    if not npx:
        raise BuildError("немає npx (Node) для пошуку Pagefind; або --no-search")
    r = subprocess.run([npx, "-y", PAGEFIND, "--site", rules, "--force-language", "uk"],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode:
        raise BuildError("Pagefind упав:\n" + r.stdout[-2000:] + r.stderr[-2000:])


# ---------- the Terminal's icons and gear (pustelnyky_src: icons.json, template.html) ----------

def _icon(paths):
    return ('<svg class="pi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" '
            f'stroke-linejoin="round" aria-hidden="true" focusable="false">{paths}</svg>')


ICON = {k: _icon(v) for k, v in {   # copied from pustelnyky_src/icons.json
    "moon": '<path d="M12 3c.13 0 .26 0 .39 0a7.5 7.5 0 0 0 7.92 12.45a9 9 0 1 1-8.31-12.45z"/>',
    "sun": '<circle cx="12" cy="12" r="4"/><path d="M3 12h1m8-9v1m8 8h1m-9 8v1M5.6 5.6l.7.7m12.1-.7l-.7.7m0 11.4l.7.7m-12.1-.7l-.7.7"/>',
    "file": '<path d="M6 3h8l4.5 4.5V21H6z"/><path d="M14 3v4.5h4.5"/><path d="M9 12.5h6M9 16h6"/>',
    "radiation": ('<path fill="currentColor" stroke="none" d="M10.40 9.23L7.25 3.77A9.5 9.5 0 0 1 16.75 3.77L13.60 9.23A3.2 3.2 0 0 0 10.40 9.23Z"/>'
                  '<path fill="currentColor" stroke="none" d="M15.20 12.00L21.50 12.00A9.5 9.5 0 0 1 16.75 20.23L13.60 14.77A3.2 3.2 0 0 0 15.20 12.00Z"/>'
                  '<path fill="currentColor" stroke="none" d="M10.40 14.77L7.25 20.23A9.5 9.5 0 0 1 2.50 12.00L8.80 12.00A3.2 3.2 0 0 0 10.40 14.77Z"/>'
                  '<circle fill="currentColor" stroke="none" cx="12" cy="12" r="2"/>'),
    "person": '<circle cx="12" cy="7.5" r="4"/><path d="M4 21c0-4.4 3.6-7.5 8-7.5s8 3.1 8 7.5"/>',
    "truck": '<path d="M2.5 6.5h11v10h-11z"/><path d="M13.5 10h4.5l3.5 3.5v3h-8z"/><circle cx="6.5" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
}.items()}
GEAR = ('<svg class="gear" viewBox="0 0 100 100" aria-hidden="true"><g fill="#6e3b22" stroke="#2a150c" stroke-width="3">'
        + "".join(f'<rect x="43" y="2" width="14" height="18" rx="2" transform="rotate({a} 50 50)"/>' for a in range(0, 360, 45))
        + '<circle cx="50" cy="50" r="34"/></g><circle cx="50" cy="50" r="25" fill="#2c302f" stroke="#1c1f1e" stroke-width="3"/>'
        '<g fill="#f4d11a"><circle cx="50" cy="50" r="4"/><path d="M50 50 L42 36 A16 16 0 0 1 58 36 Z"/>'
        '<path d="M50 50 L42 36 A16 16 0 0 1 58 36 Z" transform="rotate(120 50 50)"/><path d="M50 50 L42 36 A16 16 0 0 1 58 36 Z" transform="rotate(240 50 50)"/></g></svg>')


with open(os.path.join(HERE, "site.css"), encoding="utf-8") as _fh:
    CSS = _fh.read()
with open(os.path.join(HERE, "site.js"), encoding="utf-8") as _fh:
    JS = _fh.read()


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--out", default=os.path.join(REPO, "_site"))
    ap.add_argument("--no-search", action="store_true")
    a = ap.parse_args(argv)
    try:
        rules = Site().build(a.out, search=not a.no_search)
    except BuildError as e:
        print("ЗБІРКА ЗУПИНЕНА:", e, file=sys.stderr)
        return 1
    n = sum(1 for _ in os.scandir(rules) if _.is_dir() and _.name not in ("img", "pagefind"))
    print(f"ok: {n} сторінок + головна → {os.path.relpath(rules)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
