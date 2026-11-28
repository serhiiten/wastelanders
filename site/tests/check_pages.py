"""Every built page in a real browser (plan 2026-11-28, rows 3.2, 3.6, 3.8): nothing runs off sideways, text ≥ 12 px,
click targets ≥ 24×24 (links inside running text excepted, as in WCAG 2.5.8), a visible keyboard focus, Tab reaches the
tabs, the search and the contents; no console errors.

    python site/build.py && python site/serve.py &        (or the `wiki-site` launch configuration)
    F:/Claude/pustelnyky-venv/Scripts/python.exe site/tests/check_pages.py [http://localhost:8800]

Needs Playwright (the workspace venv has it). Not part of the fast tests: it needs the server and a browser.
"""
import os
import sys

os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "F:/Claude/pustelnyky-venv/browsers")   # the workspace venv keeps its browsers here
from playwright.sync_api import sync_playwright  # noqa: E402

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8800").rstrip("/") + "/wastelanders/rules/"
HERE = os.path.dirname(os.path.abspath(__file__))
RULES = os.path.join(HERE, "..", "..", "_site", "rules")
SIZES = [(1366, 768), (375, 812)]

MEASURE = r"""() => {
  const out = {overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, small: [], tiny: []};
  const vis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.closest('[hidden]') &&
           !(el.closest('details:not([open])') && !el.closest('summary')); };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = walker.nextNode());) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement; if (!vis(el)) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 12) out.small.push(el.tagName + '.' + el.className + ' ' + fs + 'px «' + n.textContent.trim().slice(0, 30) + '»');
  }
  for (const el of document.querySelectorAll('a[href], button, input, summary')) {
    if (!vis(el)) continue;
    if (el.closest('.text p, .text li, .text td, .text th, .call-body, .hero-lead, .crumb, .pagefind-ui__result-excerpt')) continue;  // inline links
    const r = el.getBoundingClientRect();
    if (r.width < 24 || r.height < 24) out.tiny.push(el.tagName + '.' + el.className + ' ' + Math.round(r.width) + '×' + Math.round(r.height) + ' «' + (el.textContent || el.value || '').trim().slice(0, 30) + '»');
  }
  return out;
}"""


def scenarios(page, fails):
    """Real clicks: the tool buttons (3.3), the home menu (3.12), the search (3.4), the theme (3.10), the anchors (3.11)."""
    import yaml
    sys.path.insert(0, os.path.join(HERE, ".."))
    import wikisrc
    wiki = wikisrc.Wiki(os.path.join(HERE, "..", ".."))
    n = 0
    site_root = BASE[:-len("rules/")]

    def settle():
        page.wait_for_load_state("networkidle")

    # 3.3: every tool button opens its tool in this tab; «Назад» returns to the rule
    for slug, p in sorted(wiki.pages.items()):
        if not p.tool:
            continue
        page.goto(BASE + slug + "/"); settle()
        page.click(".toolbtn")
        settle()
        n += 3
        if page.url != site_root + p.tool:
            fails.append(f"3.3 {slug}: кнопка відкрила {page.url}, а не {p.tool}")
        if len(page.context.pages) != 1:
            fails.append(f"3.3 {slug}: інструмент відкрився не в цій самій вкладці")
        page.go_back(); settle()
        if page.url != BASE + slug + "/":
            fails.append(f"3.3 {slug}: «Назад» привів на {page.url}")
    # 3.12: the 8 menu buttons
    for i, b in enumerate(wiki.contents["buttons"]):
        page.goto(BASE); settle()
        a = page.locator("a.mi").nth(i)
        shown = a.locator(".mi-t").inner_text().strip()
        n += 1
        if shown != b.get("label", b["text"]).upper():
            fails.append(f"3.12 кнопка {i + 1}: «{shown}» замість «{b.get('label', b['text'])}»")
        if b["link"].startswith("http"):
            n += 1
            if a.get_attribute("target") != "_blank":
                fails.append(f"3.12 «{b['text']}»: зовнішнє посилання не в новій вкладці")
            continue
        a.click(); settle()
        want = BASE + b["link"][:-3] + "/" if b["link"].endswith(".md") else site_root + b["link"]
        n += 1
        if page.url != want:
            fails.append(f"3.12 «{b['text']}»: відкрилось {page.url}, а не {want}")
    # 3.4: the search
    page.goto(BASE + "robymo-perevirky/"); settle()
    for q, want_first, at_least in (("перевір", "Робимо перевірки", 1), ("Доглядач", None, 10)):
        page.fill(".pagefind-ui__search-input", q)
        page.wait_for_selector(".pagefind-ui__result-link", timeout=10000)
        page.wait_for_timeout(600)
        titles = page.eval_on_selector_all(".pagefind-ui__results > li > .pagefind-ui__result-inner > .pagefind-ui__result-title a", "els => els.map(e => e.textContent.trim())")
        msg = page.inner_text(".pagefind-ui__message")
        n += 3
        if want_first and (not titles or titles[0] != want_first):
            fails.append(f"3.4 «{q}»: перший результат {titles[:3]}")
        import re
        total = int((re.search(r"\d+", msg) or [0])[0])
        if total < at_least:
            fails.append(f"3.4 «{q}»: лише {total} результатів («{msg}»)")
        if "результат" not in msg:
            fails.append(f"3.4 інтерфейс пошуку не український: «{msg}»")
    n += 1
    if page.get_attribute(".pagefind-ui__search-input", "placeholder") != "Пошук":
        fails.append("3.4 поле пошуку без «Пошук»")
    # 3.10: the Terminal's theme button changes the wiki and back
    for want in ("dark", "light"):
        page.goto(site_root + "all_generators.html"); settle()
        cur = page.evaluate("document.documentElement.dataset.theme || 'light'")
        if cur != want:
            page.click("#theme-btn")
        page.goto(BASE + "naslidky/"); settle()
        got = page.evaluate("document.documentElement.dataset.theme || 'light'")
        n += 1
        if got != want:
            fails.append(f"3.10 тема в Терміналі {want}, у вікі {got}")
        page.click("#theme-btn")
        page.goto(site_root + "character_generator.html"); settle()
        sheet = page.evaluate("document.documentElement.dataset.theme || 'light'")
        n += 1
        if sheet == want:
            fails.append(f"3.10 кнопка теми у вікі не змінила тему аркуша ({sheet})")
    page.evaluate("localStorage.removeItem('pustelnyky-theme')")
    # 3.11: three Notion anchors scroll to their heading
    anchors = wiki.anchors()
    for a in (anchors[0], anchors[len(anchors) // 2], anchors[-1]):
        src = "" if a["page"] == wiki.contents["home"] else a["page"] + "/"
        page.goto(BASE + src); settle()
        link = page.locator(f'a[href*="{a["target"]}/#"]', has_text=a["text"]).first
        link.click(); settle()
        n += 2
        if f"/{a['target']}/#" not in page.url:
            fails.append(f"3.11 «{a['text']}» привів на {page.url}")
            continue
        top = page.evaluate("(() => { const e = document.getElementById(decodeURIComponent(location.hash.slice(1))); return e ? e.getBoundingClientRect().top : null; })()")
        if top is None or not (-5 <= top <= 200):
            fails.append(f"3.11 «{a['text']}»: «{a['heading']}» не вгорі вікна (top {top})")
    return n


def main():
    slugs = [""] + sorted(d for d in os.listdir(RULES) if os.path.isfile(os.path.join(RULES, d, "index.html")))
    fails, checks = [], 0
    with sync_playwright() as p:
        br = p.chromium.launch()
        for w, h in SIZES:
            ctx = br.new_context(viewport={"width": w, "height": h})
            page = ctx.new_page()
            errors = []
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "status of 404" not in m.text else None)
            page.on("response", lambda r: errors.append(f"{r.status} {r.url}") if r.status >= 400 and "no-such-page" not in r.url else None)
            page.on("pageerror", lambda e: errors.append(str(e)))
            for slug in slugs + ["no-such-page/"]:
                url = BASE + (slug + "/" if slug and not slug.endswith("/") else slug)
                resp = page.goto(url)
                page.wait_for_load_state("networkidle")
                r = page.evaluate(MEASURE)
                where = f"{w}px {slug or 'головна'}"
                checks += 3
                if r["overflow"] > 0:
                    fails.append(f"{where}: сторінка ширша за вікно на {r['overflow']} px")
                if r["small"]:
                    fails.append(f"{where}: текст < 12 px: " + "; ".join(r["small"][:3]))
                if r["tiny"]:
                    fails.append(f"{where}: ціль < 24×24: " + "; ".join(r["tiny"][:3]))
                if slug == "no-such-page/":
                    checks += 2
                    if resp.status != 404:
                        fails.append(f"{where}: статус {resp.status}, не 404")
                    if not page.query_selector(".tabs") or not page.query_selector(".side"):
                        fails.append(f"{where}: 404 без меню")
            # keyboard: Tab from the top reaches the home link, search, theme, the four tabs, the contents
            page.goto(BASE + "robymo-perevirky/")
            page.wait_for_load_state("networkidle")
            seen, ring = [], True
            for _ in range(12):
                page.keyboard.press("Tab")
                info = page.evaluate("""() => { const e = document.activeElement, s = getComputedStyle(e);
                    return [e.className || e.tagName, (e.textContent || e.placeholder || '').trim().slice(0, 24),
                            s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 || s.boxShadow !== 'none']; }""")
                seen.append(info[1] or info[0])
                ring = ring and info[2]
            checks += 2
            want = ["Пошук", "Правила", "Термінал Доглядача", "Аркуш персонажа", "Аркуш каравану", "Зміст розділу" if w < 900 else "Вступ"]
            missing = [x for x in want if not any(x.lower() in s.lower() for s in seen)]
            if missing:
                fails.append(f"{w}px: Tab не дійшов до: {', '.join(missing)} (бачив: {seen})")
            if not ring:
                fails.append(f"{w}px: у фокусі без видимої рамки: {seen}")
            if w == 1366:
                checks += scenarios(page, fails)
            checks += 1
            if errors:
                fails.append(f"{w}px: помилки консолі: " + "; ".join(sorted(set(errors))[:5]))
            ctx.close()
        br.close()
    for f in fails:
        print("FAIL", f)
    print(("FAIL" if fails else "OK") + f" ({checks} checks, {len(slugs)} pages × {len(SIZES)} widths)")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
