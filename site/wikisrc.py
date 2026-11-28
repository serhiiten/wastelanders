"""The wiki source of «Пустельники»: read it, check it, and lay it out as the old Notion export.

The format (the contract) is described in `wiki/README.md`. In short:
  wiki/contents.yml          the order: groups → sections → page slugs; the home page; the home page's buttons
  wiki/pages/<slug>.md       one page: a YAML header (title, notion, optional tool) and its Markdown text
  wiki/images/<name>         the pictures the pages show
  wiki/notion-anchors.yml    links that pointed at a place inside a page in Notion (to be restored on the site)

Readers:
  * the site build (stage 3) reads the source directly;
  * tools/wiki_sync (the Foundry compendiums) reads the old Notion layout: `to_notion_layout()` writes it into a
    folder, so the sync scripts stay as they are and their output can be compared byte for byte;
  * the DEV system's tests read the pages by title (tests/wiki-source.mjs, a Node twin of `load()`).

Needs PyYAML (`pip install pyyaml`).
"""
import csv
import os
import re
import subprocess
import urllib.parse

import yaml

ALERT = {"☝": "TIP", "⚠️": "WARNING"}            # an aside's icon → the GitHub alert type; any other icon: NOTE
ALERT_RE = re.compile(r"^(\s*)> \[!(TIP|WARNING|NOTE|IMPORTANT|CAUTION)\]\s*$")
EMOJI_RE = re.compile(r'<img src="notion://custom_emoji/([^"]+)" alt="notion://custom_emoji/\1" width="([^"]+)" />')
EMOJI_KEEP_RE = re.compile(r"<!-- notion-emoji: (\S+) (\S+) -->")
PAGE_LINK_RE = re.compile(r"\]\(([a-z0-9-]+)\.md(#[^)]*)?\)")
SECTION_LINK_RE = re.compile(r"\]\(\.\./contents\.yml#([a-z0-9-]+)\)")
IMAGE_RE = re.compile(r"!\[([^\]]*)\]\(\.\./images/([^)]+)\)")
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
# Notion's file names: «:» and «.» dropped, spaces squeezed, cut to 50 characters
QUOTE_SAFE = "()',-_~!*"

# ---------- slugs: Ukrainian → Latin (the transliteration of the Cabinet of Ministers, resolution № 55, 2010) ----------
_TR = {"а": "a", "б": "b", "в": "v", "г": "h", "ґ": "g", "д": "d", "е": "e", "є": "ie", "ж": "zh", "з": "z",
       "и": "y", "і": "i", "ї": "i", "й": "i", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o", "п": "p",
       "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f", "х": "kh", "ц": "ts", "ч": "ch", "ш": "sh",
       "щ": "shch", "ь": "", "ю": "iu", "я": "ia", "’": "", "'": "", "ʼ": "", "ё": "e", "ы": "y", "э": "e"}
_TR_FIRST = {"є": "ye", "ї": "yi", "й": "y", "ю": "yu", "я": "ya"}


def slugify(title):
    s, out, prev = title.lower(), [], ""
    for i, ch in enumerate(s):
        first = not prev.isalpha()
        if ch == "г" and prev == "з":
            out.append("gh")
        elif ch in _TR:
            out.append(_TR_FIRST[ch] if first and ch in _TR_FIRST else _TR[ch])
        elif ch.isascii() and ch.isalnum():
            out.append(ch)
        else:
            out.append("-")
        if ch not in "’'ʼ":
            prev = ch
    return re.sub(r"-+", "-", "".join(out)).strip("-")


def notion_name(title):
    """The title as Notion's export names its file (without the id)."""
    return re.sub(r"\s+", " ", re.sub(r"[:.]", "", title)).strip()[:50].strip()


# ---------- reading ----------

class Page:
    def __init__(self, slug, meta, body):
        self.slug, self.meta, self.body = slug, meta, body
        self.title = meta["title"]
        self.notion = meta.get("notion", "")
        self.tool = meta.get("tool")
        # site-only fields (package D-A, author 2026-11-28): `site: false` keeps a page out of the site (the compendiums
        # still get it: to_notion_layout ignores the header); `site_at: <slug>` names the page that shows its tool button
        self.site = meta.get("site", True) is not False
        self.site_at = meta.get("site_at")


def split_front(text):
    m = re.match(r"\A---\n(.*?)\n---\n", text, re.S)
    if not m:
        raise ValueError("no YAML header (--- … ---)")
    return yaml.safe_load(m.group(1)) or {}, text[m.end():]


class Wiki:
    def __init__(self, root):
        """`root`: the site repository (the folder holding `wiki/`) or the `wiki/` folder itself."""
        self.dir = root if os.path.isfile(os.path.join(root, "contents.yml")) else os.path.join(root, "wiki")
        with open(os.path.join(self.dir, "contents.yml"), encoding="utf-8") as fh:
            self.contents = yaml.safe_load(fh)
        self.pages = {}
        pdir = os.path.join(self.dir, "pages")
        for f in sorted(os.listdir(pdir)):
            if not f.endswith(".md"):
                continue
            with open(os.path.join(pdir, f), encoding="utf-8", newline="") as fh:
                meta, body = split_front(fh.read().replace("\r\n", "\n"))
            self.pages[f[:-3]] = Page(f[:-3], meta, body)
        self.home = self.pages[self.contents["home"]]

    def sections(self):
        """[(group title, section)] in order; a section: {slug, title, notion, pages}."""
        return [(g["title"], s) for g in self.contents["groups"] for s in g["sections"]]

    def by_title(self, title):
        return next((p for p in self.pages.values() if p.title == title), None)

    def anchors(self):
        path = os.path.join(self.dir, "notion-anchors.yml")
        if not os.path.exists(path):
            return []
        with open(path, encoding="utf-8") as fh:
            return yaml.safe_load(fh) or []

    # ---------- checks ----------

    def problems(self):
        """Everything that is wrong with the source, as readable lines (empty = fine)."""
        out = []
        secs = {s["slug"]: s for _, s in self.sections()}
        listed = [p for _, s in self.sections() for p in s["pages"]]
        for slug in listed:
            if slug not in self.pages:
                out.append(f"contents.yml: немає сторінки «{slug}» (pages/{slug}.md)")
        for slug in self.pages:
            if slug != self.contents["home"] and slug not in listed:
                out.append(f"pages/{slug}.md: її немає в жодному розділі contents.yml")
            if not SLUG_RE.match(slug):
                out.append(f"pages/{slug}.md: ім'я файлу не латиницею з дефісами")
        if len(set(listed)) != len(listed):
            out.append("contents.yml: сторінка в кількох розділах: " + ", ".join(sorted({s for s in listed if listed.count(s) > 1})))
        titles = [p.title for p in self.pages.values()]
        for t in sorted({t for t in titles if titles.count(t) > 1}):
            out.append(f"дві сторінки з назвою «{t}»")
        for p in self.pages.values():
            where = f"pages/{p.slug}.md"
            for m in PAGE_LINK_RE.finditer(p.body):
                if m.group(1) not in self.pages:
                    out.append(f"{where}: посилання на неіснуючу сторінку «{m.group(1)}.md»")
            for m in SECTION_LINK_RE.finditer(p.body):
                if m.group(1) not in secs:
                    out.append(f"{where}: посилання на неіснуючий розділ «{m.group(1)}»")
            for m in IMAGE_RE.finditer(p.body):
                if not os.path.exists(os.path.join(self.dir, "images", m.group(2))):
                    out.append(f"{where}: немає картинки images/{m.group(2)}")
            for bad, why in (("notion://", "посилання Notion"), ("%D0", "адреса Notion у %-кодуванні"),
                             ("%D1", "адреса Notion у %-кодуванні"), (".csv", "посилання на .csv")):
                if bad in EMOJI_KEEP_RE.sub("", p.body):
                    out.append(f"{where}: {why} («{bad}»)")
            for m in re.finditer(r"\]\(((?![a-z]+:)(?!#)[^)\s]+)\)", p.body):
                href = m.group(1)
                if not (PAGE_LINK_RE.match("](" + href + ")") or href.startswith("../contents.yml#") or href.startswith("../images/")):
                    out.append(f"{where}: невідоме посилання «{href}»")
        for b in self.contents.get("buttons", []):
            if b["link"].endswith(".md") and b["link"][:-3] not in self.pages:
                out.append(f"contents.yml, кнопка «{b['text']}»: немає сторінки {b['link']}")
            if not os.path.exists(os.path.join(self.dir, "images", b["image"])):
                out.append(f"contents.yml, кнопка «{b['text']}»: немає картинки images/{b['image']}")
        for p in self.pages.values():
            if p.site_at and (p.site or p.site_at not in self.pages or not p.tool):
                out.append(f"pages/{p.slug}.md: site_at лише разом із site: false і tool, на наявну сторінку")
        for a in self.anchors():
            for k in ("page", "target"):
                if a[k] not in self.pages:
                    out.append(f"notion-anchors.yml: немає сторінки «{a[k]}»")
            if a["target"] in self.pages and a["heading"] not in self.pages[a["target"]].body:
                out.append(f"notion-anchors.yml: на «{a['target']}» немає «{a['heading']}»")
        return out

    # ---------- the old Notion layout (for tools/wiki_sync) ----------

    def notion_file(self, page_or_section, ext):
        return f"{notion_name(page_or_section['title'] if isinstance(page_or_section, dict) else page_or_section.title)} {page_or_section['notion'] if isinstance(page_or_section, dict) else page_or_section.notion}{ext}"

    def to_notion_md(self, page):
        secs = {s["slug"]: s for _, s in self.sections()}
        body = unalert(page.body)
        body = EMOJI_KEEP_RE.sub(lambda m: f'<img src="notion://custom_emoji/{m.group(1)}" alt="notion://custom_emoji/{m.group(1)}" width="{m.group(2)}" />', body)
        body = PAGE_LINK_RE.sub(lambda m: "](" + urllib.parse.quote(self.notion_file(self.pages[m.group(1)], ".md"), safe=QUOTE_SAFE) + (m.group(2) or "") + ")", body)
        body = SECTION_LINK_RE.sub(lambda m: "](" + urllib.parse.quote(self.notion_file(secs[m.group(1)], ".csv"), safe=QUOTE_SAFE) + ")", body)
        body = IMAGE_RE.sub(lambda m: f"![{m.group(1)}]({urllib.parse.quote(m.group(2), safe=QUOTE_SAFE)})", body)
        return f"# {page.title}\n" + body

    def to_notion_layout(self, dst):
        """Write the wiki as the Notion export laid it out (`<Title> <id>.md`, `<Section> <id>.csv` / `_all.csv`)."""
        os.makedirs(dst, exist_ok=True)
        for p in self.pages.values():
            with open(os.path.join(dst, self.notion_file(p, ".md")), "w", encoding="utf-8", newline="") as fh:
                fh.write(self.to_notion_md(p))
        for _, s in self.sections():
            for ext in (".csv", "_all.csv"):
                with open(os.path.join(dst, self.notion_file(s, ext)), "w", encoding="utf-8-sig", newline="") as fh:
                    out = csv.writer(fh, lineterminator="\r\n")
                    out.writerow(["Name"])
                    out.writerows([self.pages[x].title] for x in s["pages"])
        return dst


def unalert(body):
    """GitHub alerts (`> [!TIP]` …) back into Notion's `<aside>` … `</aside>`."""
    lines, out, i = body.split("\n"), [], 0
    while i < len(lines):
        m = ALERT_RE.match(lines[i])
        if not m:
            out.append(lines[i])
            i += 1
            continue
        ind = m.group(1)
        out.append(ind + "<aside>")
        i += 1
        while i < len(lines) and lines[i].startswith(ind + ">"):
            rest = lines[i][len(ind) + 1:]
            out.append(ind + (rest[1:] if rest.startswith(" ") else rest))
            i += 1
        out.append(ind + "</aside>")
    return "\n".join(out)


# ---------- the site clone's state (wiki_sync reads only what is on main) ----------

def git(root, *args):
    return subprocess.run(["git", "-C", root, *args], capture_output=True, text=True, encoding="utf-8").stdout.strip()


def repo_state(root):
    """(branch, HEAD sha, origin/main sha, dirty wiki files) of the site clone."""
    return (git(root, "branch", "--show-current"), git(root, "rev-parse", "HEAD"),
            git(root, "rev-parse", "origin/main"), git(root, "status", "--porcelain", "--", "wiki"))


def wiki_commit(root):
    """The last commit that changed `wiki/`."""
    return git(root, "log", "-1", "--format=%H", "--", "wiki")
