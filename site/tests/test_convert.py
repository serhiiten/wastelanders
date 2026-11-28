"""The wiki source against the Notion export it was converted from (plan 2026-11-28, rows 2.1, 2.2, 2.6, 2.7).

    python site/tests/test_convert.py [<Notion export folder>]

The export: the workspace's `wiki/` (default: `../wiki` next to this repository). Without it the comparison with the
export is skipped (prints SKIP) and only the source's own checks run.
"""
import os
import re
import sys
import tempfile
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, os.path.join(REPO, "site"))
import wikisrc  # noqa: E402
from convert_notion import LOCAL_IMG_LINE, NAV_IMG, NAV_TEXT  # noqa: E402

checks, fails = 0, []


def ok(cond, msg):
    global checks
    checks += 1
    if not cond:
        fails.append(msg)


wiki = wikisrc.Wiki(REPO)

# ---------- the source on its own ----------
ok(wiki.problems() == [], "source problems: " + "; ".join(wiki.problems()[:10]))
ok(len(wiki.pages) == 92, f"92 pages (got {len(wiki.pages)})")
ok(len(wiki.sections()) == 18, f"18 sections (got {len(wiki.sections())})")
ok([g["title"] for g in wiki.contents["groups"]] == ["ПРАВИЛА ГРАВЦІВ", "ПРАВИЛА ДОГЛЯДАЧА (ВЕДУЧОГО)"], "two groups")
for p in wiki.pages.values():
    ok(re.fullmatch(r"[0-9a-f]{32}", p.notion or "") is not None, f"{p.slug}: notion id")
    plain = wikisrc.EMOJI_KEEP_RE.sub("", p.body)
    for bad in ("notion://", "%D0", "%D1", ".csv", "<aside>", "fouparrow", "fodownarrow", "НА_ГОЛОВНУ"):
        ok(bad not in plain, f"{p.slug}: «{bad}» left in the text")
    for line in p.body.split("\n"):
        ok(not NAV_TEXT.match(line), f"{p.slug}: navigation line «{line.strip()}»")
# the home page's buttons (row 2.6): as the live Notion had them on 2026-11-28; three links changed by the author
# the same day (package A, 7); Owlbear / Foundry VTT lead to their plate of the intro since package B (author 2026-11-28)
BUTTONS = [("ПОЧАТИ ГРУ", "pro-hru.md"), ("тг", "https://t.me/wastelanderstrpg"),
           ("СТВОРИТИ ПЕРСОНАЖА", "character_generator.html"), ("СТВОРИТИ КАРАВАН", "caravan_generator.html"),
           ("СТВОРИТИ СПРАВУ", "all_generators.html"), ("ПОЧАТИ ПОДОРОЖ", "#owlbear"),
           ("СТВОРИТИ БИТВУ", "#foundry"), ("генератори натхнення", "all_generators.html#tables")]
ok([(b["text"], b["link"]) for b in wiki.contents["buttons"]] == BUTTONS, "home buttons and their links")
# the anchors (row 2.7): 35, each heading found on its target page (wiki.problems() checks the latter)
ok(len(wiki.anchors()) == 35, f"35 Notion anchors kept (got {len(wiki.anchors())})")

# ---------- slugs and alerts ----------
for t, s in [("Робимо перевірки", "robymo-perevirky"), ("Згода", "zghoda"), ("Юрій Яцкевич", "yurii-yatskevych"),
             ("Їжак і Єнот", "yizhak-i-yenot"), ("Очки здоров’я, наслідки, смерть", "ochky-zdorovia-naslidky-smert"),
             ("Супротивники: Ши", "suprotyvnyky-shy"), ("Доповнення: Guns. Lots of guns", "dopovnennia-guns-lots-of-guns")]:
    ok(wikisrc.slugify(t) == s, f"slug «{t}» → {wikisrc.slugify(t)}, expected {s}")
ok(wikisrc.unalert("a\n    > [!TIP]\n    > ☝\n    >\n    > text\nb") == "a\n    <aside>\n    ☝\n    \n    text\n    </aside>\nb",
   "an indented alert back into an aside")

# ---------- a broken source is caught ----------
with tempfile.TemporaryDirectory() as tmp:
    import shutil
    shutil.copytree(wiki.dir, os.path.join(tmp, "wiki"))
    p = os.path.join(tmp, "wiki", "pages", "robymo-perevirky.md")
    with open(p, encoding="utf-8", newline="") as fh:
        text = fh.read()
    with open(p, "w", encoding="utf-8", newline="") as fh:
        fh.write(text + "\n[битве](nema-takoi.md)\n")
    probs = wikisrc.Wiki(tmp).problems()
    ok(any("nema-takoi" in x and "robymo-perevirky" in x for x in probs), f"a broken link is named with its file: {probs}")

# ---------- against the Notion export (rows 2.1, 2.2) ----------
export = sys.argv[1] if len(sys.argv) > 1 else os.path.join(REPO, "..", "wiki")


def canon(text):
    """The Notion text without what the conversion is allowed to change: navigation, picture addresses, link
    addresses (only the target's id counts), trailing spaces and blank lines at the end."""
    out = []
    for line in text.split("\n"):
        im = LOCAL_IMG_LINE.match(line)
        if im and NAV_IMG.match(urllib.parse.unquote(im.group(2))):
            continue
        if NAV_TEXT.match(line):
            continue
        out.append(line.rstrip())
    text = "\n".join(out).rstrip() + "\n"
    text = re.sub(r"!\[([^\]]*)\]\((?![a-z]+:)[^)]*\)", r"![\1]()", text)

    def link(m):
        ids = re.findall(r"[0-9a-f]{32}", urllib.parse.unquote(m.group(1)))
        return f"]({ids[-1]})" if ids else m.group(0)
    return re.sub(r"\]\(((?![a-z]+:)(?:[^()\s]|\([^()]*\))+)\)", link, text)


if not os.path.isdir(export):
    print(f"SKIP: no Notion export at {export}: the source is not compared with it")
else:
    exp = {}
    for f in os.listdir(export):
        m = re.match(r"(.+) ([0-9a-f]{32})\.md$", f)
        if m:
            with open(os.path.join(export, f), encoding="utf-8", newline="") as fh:
                exp[m.group(2)] = fh.read()
    ok(len(exp) == 92, f"92 pages in the export (got {len(exp)})")
    by_id = {p.notion: p for p in wiki.pages.values()}
    ok(set(by_id) == set(exp), "the same Notion ids: " + ", ".join(sorted(set(by_id) ^ set(exp))))
    same = 0
    for nid, text in exp.items():
        p = by_id.get(nid)
        if not p:
            continue
        ok(text.startswith(f"# {p.title}\n"), f"{p.slug}: title «{p.title}»")
        a, b = canon(text), canon(wiki.to_notion_md(p))
        if a == b:
            same += 1
        else:
            import difflib
            d = [l for l in difflib.unified_diff(a.split("\n"), b.split("\n"), lineterm="", n=0) if l[:1] in "+-" and l[:3] not in ("---", "+++")]
            ok(False, f"{p.slug}: text differs from the export: {d[:4]}")
        # absolute links to the site stay absolute (foundry_notes.py looks for them)
        ok(text.count("serhiiten.github.io/wastelanders/") == p.body.count("serhiiten.github.io/wastelanders/"),
           f"{p.slug}: absolute site links")
    ok(same == 92, f"every page's text is the export's (same: {same})")
    # sections: the export's order files
    import csv
    for _, s in wiki.sections():
        f = next(x for x in os.listdir(export) if x.endswith(f"{s['notion']}.csv"))
        with open(os.path.join(export, f), encoding="utf-8-sig", newline="") as fh:
            names = [r[0] for r in list(csv.reader(fh))[1:] if r and r[0].strip()]
        ok([wiki.pages[x].title for x in s["pages"]] == names, f"section «{s['title']}»: the export's order")
        ok(f == wiki.notion_file(s, ".csv"), f"section «{s['title']}»: Notion file name {f}")
    for p in wiki.pages.values():
        ok(os.path.exists(os.path.join(export, wiki.notion_file(p, ".md"))), f"{p.slug}: Notion file name")
    # the layout tools/wiki_sync reads: every .csv (ordered and _all) parses to the export's rows
    with tempfile.TemporaryDirectory() as tmp:
        wiki.to_notion_layout(tmp)
        rows = lambda d, f: [r for r in csv.reader(open(os.path.join(d, f), encoding="utf-8-sig", newline=""))]
        made = sorted(f for f in os.listdir(tmp) if f.endswith(".csv"))
        ok(made == sorted(f for f in os.listdir(export) if f.endswith(".csv")), "the same .csv files as the export")
        for f in made:
            if f.endswith("_all.csv"):
                ok(sorted(map(tuple, rows(tmp, f))) == sorted(tuple(r[:1]) for r in rows(export, f)), f"{f}: the export's rows")
            else:
                ok(rows(tmp, f) == [r[:1] for r in rows(export, f)], f"{f}: the export's rows in order")
        ok(sorted(f for f in os.listdir(tmp) if f.endswith(".md")) == sorted(f for f in os.listdir(export) if f.endswith(".md")),
           "the same .md files as the export")

if fails:
    print("\n".join("FAIL " + f for f in fails[:40]))
    print(f"test_convert: {len(fails)} of {checks} failed")
    sys.exit(1)
print(f"test_convert: OK ({checks} checks)")
