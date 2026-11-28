"""Every built page in a real browser (plan 2026-11-28, rows 3.2, 3.6, 3.8): nothing runs off sideways, text ≥ 12 px,
click targets ≥ 24×24 (links inside running text excepted, as in WCAG 2.5.8; both limits: docs/ui-rules.md, V6, author 2026-11-21), a visible keyboard focus, Tab reaches the
tabs, the search and the contents; no console errors. Package B (plan §6): the tools in the wiki's frame and the shell
(`frame_scenarios`, `open_each`), `?embed=1` in each tool (`embed_checks`); `PUST_ONLY_FRAME=1` runs only these.

    python site/build.py && python site/serve.py &        (or the `wiki-site` launch configuration)
    F:/Claude/pustelnyky-venv/Scripts/python.exe site/tests/check_pages.py [http://localhost:8800]

Needs Playwright (the workspace venv has it). Not part of the fast tests: it needs the server and a browser.
"""
import os
import sys

os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "F:/Claude/pustelnyky-venv/browsers")   # the workspace venv keeps its browsers here
from playwright.sync_api import sync_playwright  # noqa: E402

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8800").rstrip("/") + "/wastelanders/rules/"
HERE = os.path.dirname(os.path.abspath(__file__))
RULES = os.path.join(HERE, "..", "..", "_site", "rules")
SIZES = [(1366, 768), (375, 812)]
sys.path.insert(0, os.path.join(HERE, ".."))
import wikisrc  # noqa: E402
DOWNLOADS = wikisrc.Wiki(os.path.join(HERE, "..", "..")).downloads()   # wiki/downloads.yml (DC6: file names)
# the pages kept off the site (package D-A): package_d asks for them and expects 404
GONE = ("avtomatychnyi-henerator-bytv/", "avtomatychnyi-henerator-sprav/", "avtomatychnyi-henerator-podorozhei/", "arkushi-personazhiv-ta-karavanu/")

MEASURE = r"""() => {
  const out = {overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, small: [], tiny: [], cramped: []};
  // D4 (package D-A): a text table scrolls sideways only when the whole sheet is too narrow for it
  for (const t of document.querySelectorAll('.text > table')) {
    const sheet = t.closest('.sheet'), text = t.parentElement, cs = getComputedStyle(text);
    const room = sheet.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    if (t.scrollWidth > t.clientWidth + 1 && t.clientWidth < room - 2)
      out.cramped.push(Math.round(t.clientWidth) + ' of ' + Math.round(room) + ' px «' + t.innerText.trim().slice(0, 30) + '»');
  }
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


# «**Назва» / «Назва:**» left in the text (package C, 4); «****» (an empty bold of Notion's, another defect) is not this
re_stars = __import__("re").compile(r"(?<!\*)\*\*[^\s*]|[^\s*]\*\*(?!\*)")


def scenarios(page, fails):
    """Real clicks: the tool buttons (3.3), the home menu (3.12, A7), the left menu's sections (A1), the history fold (A4),
    the search (3.4), the theme (3.10), the anchors (3.11)."""
    import yaml
    sys.path.insert(0, os.path.join(HERE, ".."))
    import wikisrc
    wiki = wikisrc.Wiki(os.path.join(HERE, "..", ".."))
    n = 0
    site_root = BASE[:-len("rules/")]

    def settle():
        page.wait_for_load_state("networkidle")

    # 3.3 + Б.2: every tool button opens its tool in the frame of this page; «Назад» returns to the rule
    names = {"all_generators.html": ("terminal", "Термінал Доглядача"), "character_generator.html": ("character", "Аркуш персонажа"),
             "caravan_generator.html": ("caravan", "Аркуш каравану")}
    for slug, p in sorted(wiki.pages.items()):
        if not p.tool or not p.site:
            continue
        page.goto(BASE + slug + "/"); settle()
        page.click(".toolbtn")
        tool, title = names[p.tool.split("#")[0]]
        page.wait_for_selector(f"iframe.tool-frame.on[data-tool={tool}]", state="visible")
        n += 4
        if page.url != BASE + slug + "/?tool=" + tool:
            fails.append(f"Б.2 {slug}: кнопка дала адресу {page.url}")
        if len(page.context.pages) != 1:
            fails.append(f"Б.2 {slug}: інструмент відкрився не в цій самій вкладці")
        got = page.evaluate("""() => [document.querySelector('.brand-sub').textContent, document.title,
            getComputedStyle(document.querySelector('main')).visibility, document.querySelector('iframe.on').getAttribute('src'),
            document.activeElement && document.activeElement.tagName]""")
        want_src = site_root + p.tool.split("#")[0] + "?embed=1" + ("#" + p.tool.split("#")[1] if "#" in p.tool else "")
        if got[0] != title or not got[1].startswith(title) or got[2] != "hidden" or got[3] != want_src or got[4] != "IFRAME":
            fails.append(f"Б.2 {slug}: підпис / заголовок / тіло / адреса рамки / фокус: {got}")
        page.go_back(); settle()
        if page.url != BASE + slug + "/" or page.evaluate("document.documentElement.classList.contains('tool-open')"):
            fails.append(f"3.3 {slug}: «Назад» привів на {page.url} і не закрив рамку")
    # 3.12 + package A, 7: the 7 menu buttons («Генератори натхнення» hidden, author 2026-11-28)
    btns = [b for b in wiki.contents["buttons"] if b.get("menu") is not False]
    page.goto(BASE); settle()
    n += 1
    if page.locator("a.mi").count() != len(btns):
        fails.append(f"A7 у меню {page.locator('a.mi').count()} кнопок, а не {len(btns)}")
    for i, b in enumerate(btns):
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
        if b["link"].endswith(".md"):
            want = BASE + b["link"][:-3] + "/"
        elif b["link"].startswith("#"):
            want = BASE + b["link"]
        else:
            want = BASE + "?tool=" + names[b["link"]][0]
        n += 1
        if page.url != want:
            fails.append(f"3.12 «{b['text']}»: відкрилось {page.url}, а не {want}")
        if b["link"].startswith("#"):   # Б.1: Owlbear / Foundry VTT open their plate's panel, the plate at the top of the window
            n += 1
            r = page.evaluate("""(() => { const e = document.getElementById(location.hash.slice(1)), p = document.getElementById(location.hash.slice(1) + '-more');
                return e ? [e.getBoundingClientRect().top, getComputedStyle(p).display !== 'none', e.querySelector('.plate-more').getAttribute('aria-expanded')] : null; })()""")
            if not r or not (-5 <= r[0] <= 200) or not r[1] or r[2] != "true":   # ≤ 200 px: the same rule as the anchors (3.11)
                fails.append(f"Б.1 «{b.get('label', b['text'])}»: табличка {b['link']} не вгорі вікна чи не розгорнута ({r})")
        else:
            page.goto(BASE); settle()
    # Б.5: the site root and the old addresses lead to the wiki
    for old, want in (("", BASE), ("index.html", BASE), ("index.html#owlbear", BASE + "#owlbear"), ("index.html#foundry", BASE + "#foundry")):
        page.goto(site_root + old); page.wait_for_url(want); settle()
        n += 1
        if old.endswith(("owlbear", "foundry")) and page.evaluate(f"getComputedStyle(document.getElementById('{want.split('#')[1]}-more')).display") == "none":
            fails.append(f"Б.5 {old}: табличка не розгорнута")
    # Б.1: plates closed; «Докладніше» opens one panel at a time; «Копіювати» copies the address
    page.goto(BASE); settle()
    page.context.grant_permissions(["clipboard-read", "clipboard-write"])
    n += 3
    if page.locator(".plate-panel.on").count():
        fails.append("Б.1 панель таблички відкрита на старті")
    page.click("#de-hraty-fold > summary")      # «Де грати» is a closed fold since package C
    page.click("#browser .plate-more"); page.click("#owlbear .plate-more")
    if page.locator(".plate-panel.on").count() != 1 or not page.locator("#owlbear-more").is_visible():
        fails.append("Б.1 «Докладніше» не відкрило рівно одну панель")
    page.click("#owlbear-more .copy-btn")       # «Як встановити» opened with the plate (package C, 5)
    if page.evaluate("navigator.clipboard.readText()") != "https://serhiiten.github.io/wastelanders/owlbear/manifest.json":
        fails.append("Б.1 «Копіювати» не скопіювало адресу доповнення")
    # package A, 1: a section in the left menu opens its first page
    page.goto(BASE + "robymo-perevirky/"); settle()
    for _, s in [(g, dict(s, pages=[x for x in s["pages"] if wiki.pages[x].site])) for g, s in wiki.sections()][::4]:
        page.goto(BASE + "robymo-perevirky/"); settle()
        page.locator("a.side-s", has_text=s["title"]).first.click(); settle()
        n += 1
        if page.url != BASE + s["pages"][0] + "/":
            fails.append(f"A1 розділ «{s['title']}» у меню відкрив {page.url}, а не першу сторінку {s['pages'][0]}")
    # package A, 4: «Історія змін» is closed until clicked
    page.goto(BASE); settle()
    fold = page.locator("#istoriia-zmin")
    n += 3
    if fold.count() != 1 or fold.get_attribute("open") is not None:
        fails.append("A4 «Історія змін» не згорнута на старті")
    elif page.locator("#istoriia-zmin li").first.is_visible():
        fails.append("A4 зміст «Історії змін» видно в згорнутій згортці")
    else:
        page.locator("#istoriia-zmin > summary").click()
        if not page.locator("#istoriia-zmin li").first.is_visible():
            fails.append("A4 клік не розгорнув «Історію змін»")
    # 3.4: the search
    page.goto(BASE + "robymo-perevirky/"); settle()
    # «Доглядач» ≥ 10 results: the search sees the whole wiki, not a few pages (author, 2026-11-28)
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
    n += frame_scenarios(page, fails, site_root)
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
        if link.evaluate("e => !!e.closest('details.fold:not([open])')"):   # inside a closed fold (A4, C1): open it first, as a reader does
            link.evaluate("e => e.closest('details.fold').querySelector(':scope > summary').click()")
        link.click(); settle()
        n += 2
        if f"/{a['target']}/#" not in page.url:
            fails.append(f"3.11 «{a['text']}» привів на {page.url}")
            continue
        top = page.evaluate("(() => { const e = document.getElementById(decodeURIComponent(location.hash.slice(1))); return e ? e.getBoundingClientRect().top : null; })()")
        # ≤ 200 px from the top: the heading is seen at once, not hidden under the header (author, 2026-11-28)
        if top is None or not (-5 <= top <= 200):
            fails.append(f"3.11 «{a['text']}»: «{a['heading']}» не вгорі вікна (top {top})")
    return n


def package_c(page, fails, w):
    """Package C (author, 2026-11-28), real clicks at both widths: «Де грати» is a closed fold (1); its text and «Одна
    Пустка на всіх» take the whole width (2); «Над грою працювали» in two columns, one under the other at 375 px (3);
    no Markdown stars left where Notion closed the bold after a link (4); the menu buttons and «Докладніше» open the fold
    and «Як встановити» (5); every fold has the ▸ arrow, turned when open (6)."""
    n = 0

    def home():
        page.goto(BASE); page.wait_for_load_state("networkidle")
    home()
    n += 2
    if page.evaluate("document.getElementById('de-hraty-fold').open") or page.locator("#owlbear").is_visible():
        fails.append(f"C1 {w}px: «Де грати» не згорнута на старті")
    page.click("#de-hraty-fold > summary")
    if not page.locator("#owlbear .plate-more").is_visible():
        fails.append(f"C1 {w}px: клік не розгорнув «Де грати»")
    # 2: the text fills its block: the lead paragraph and «Одна Пустка на всіх» as wide as their box (± 2 px)
    r = page.evaluate("""() => [...document.querySelectorAll('.intro-head p, .intro .eco-body p')].map(p => {
        const b = p.parentElement, cs = getComputedStyle(b);
        return [p.getBoundingClientRect().width, b.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)]; })""")
    n += 1
    if len(r) < 2 or any(a < b - 2 for a, b in r):
        fails.append(f"C2 {w}px: текст вступу не на всю ширину (абзац, місце): {r}")
    # 3: two columns side by side at 1366, one under the other at 375
    c = page.evaluate("""() => { const a = document.querySelector('.cr-people').getBoundingClientRect(), b = document.querySelector('.cr-legal').getBoundingClientRect();
        return [a.left, a.right, a.top, a.bottom, b.left, b.top, document.querySelector('.cr-legal h2').textContent]; }""")
    n += 2
    side = c[4] >= c[1] and abs(c[5] - c[2]) < 2
    if (w >= 1366) != side or (w < 760 and c[5] < c[3]):
        fails.append(f"C3 {w}px: колонки «Над грою працювали» не так: {c}")
    if c[6] != "Офіційний текст":
        fails.append(f"C3 {w}px: друга колонка починається з «{c[6]}»")
    # 4: no stars from a bold closed after a link
    for slug in ("", "hlosarii-ihrovykh-terminiv/", "stvorennia-karavanu/"):
        page.goto(BASE + slug); page.wait_for_load_state("networkidle")
        txt = page.evaluate("document.querySelector('main').innerText")
        n += 1
        if re_stars.search(txt):
            fails.append(f"C4 {w}px {slug or 'головна'}: зірочки Markdown біля посилання: «{re_stars.search(txt).group(0)}»")
    home()
    n += 1
    if page.locator("a", has_text="**").count():
        fails.append(f"C4 {w}px: посилання з зірочками на головній")
    # 5: the menu buttons and «Докладніше» open the fold, the plate and its «Як встановити»
    state = """id => [document.getElementById('de-hraty-fold').open, document.querySelector('#' + id + ' .plate-more').getAttribute('aria-expanded'),
        document.querySelector('#' + id + '-more details.install').open, document.querySelector('#' + id + '-more details.install summary').textContent,
        [...document.querySelectorAll('#' + id + '-more details.sub:not(.install)')].some(d => d.open)]"""
    for label, pid in (("Owlbear", "owlbear"), ("Foundry", "foundry")):
        home()
        page.locator("a.mi", has_text=label).click(); page.wait_for_timeout(200)
        got = page.evaluate(state, pid)
        n += 1
        if got[:4] != [True, "true", True, "Як встановити"] or got[4]:
            fails.append(f"C5 {w}px: кнопка меню «{label}»: згортка / табличка / «Як встановити» / інші згортки: {got}")
        home()
        page.click("#de-hraty-fold > summary")
        page.click(f"#{pid} .plate-more"); page.wait_for_timeout(100)
        got = page.evaluate(state, pid)
        n += 1
        if got[:4] != [True, "true", True, "Як встановити"] or got[4]:
            fails.append(f"C5 {w}px: «Докладніше» на «{label}»: {got}")
    # 6: every fold that a reader can see has the ▸ arrow; it turns when the fold is open
    for slug in ("", "robymo-perevirky/"):
        page.goto(BASE + slug); page.wait_for_load_state("networkidle")
        page.evaluate("document.querySelectorAll('details').forEach(d => d.open = true); "
                      "const m = document.querySelector('#foundry .plate-more'); if (m) m.click()")   # its panel: two folds
        bad = page.evaluate("""() => [...document.querySelectorAll('details > summary')].filter(s => s.offsetParent).map(s => {
            const b = getComputedStyle(s, '::before'); return [s.textContent.trim().slice(0, 20), b.content, b.transform]; })
            .filter(x => x[1] !== '"▸"' || x[2] === 'none')""")
        cnt = page.evaluate("[...document.querySelectorAll('details > summary')].filter(s => s.offsetParent).length")
        n += 1
        if bad or cnt < (4 if not slug else 0) or (slug and w < 900 and cnt < 1):
            fails.append(f"C6 {w}px {slug or 'головна'}: згортки без стрілки чи стрілка не повернута ({cnt} згорток): {bad}")
    return n


def package_d(page, fails, w):
    """Package D-A (author, 2026-11-28), real clicks at both widths: «Одна Пустка на всіх» is a closed fold (1); «Де грати»
    is a bar like the groups' header, a click opens it (2); no bare tool address under the button (3); tables are checked
    on every page in the main loop (4); the three generator pages are gone, their links lead to the button after the
    callout, which opens the tool, and so does the callout's link (5); the sheets page is off «Додаткові матеріали» (6)."""
    n = 0

    def go(path):
        page.goto(BASE + path); page.wait_for_load_state("networkidle")
    go("")
    n += 2
    if page.locator("#eco").is_visible():
        fails.append(f"D1 {w}px: «Одна Пустка на всіх» видно при згорнутій «Де грати»")
    page.click("#de-hraty-fold > summary")
    last = page.evaluate("""() => { const e = document.getElementById('eco'), r = e.getBoundingClientRect(),
        others = [...document.querySelectorAll('#de-hraty-fold .plate, #de-hraty-fold .plate-panel.on')].map(x => x.getBoundingClientRect().bottom);
        return [r.height > 0, Math.max(...others) <= r.top + 1, !!e.closest('#de-hraty-fold'), !e.closest('details.fold.eco')]; }""")
    if last != [True, True, True, True]:
        fails.append(f"D1 {w}px: «Одна Пустка на всіх» не наприкінці розгорнутої «Де грати» (видно, нижче табличок, у згортці, не своя згортка): {last}")
    # dark theme: the intro card is not .paper, so its text needs its own light colour (found on the d1 shots, 2026-11-28)
    page.evaluate("localStorage.setItem('pustelnyky-theme','dark')"); go("")
    page.click("#de-hraty-fold > summary")
    lum = page.evaluate("""() => [...document.querySelectorAll('.intro-head p, #eco .eco-body p, #eco h3')].map(p =>
        getComputedStyle(p).color.match(/\\d+/g).slice(0, 3).reduce((a, b) => a + +b, 0))""")
    page.evaluate("localStorage.setItem('pustelnyky-theme','light')")
    n += 1
    if not lum or min(lum) < 400:
        fails.append(f"D1 {w}px: у темній темі текст вступу темний (сума RGB): {lum}")
    go("")
    page.click("#de-hraty-fold > summary")
    page.click("#foundry .plate-more"); page.wait_for_timeout(100)
    if page.evaluate("document.getElementById('foundry-more').getBoundingClientRect().bottom > document.getElementById('eco').getBoundingClientRect().top + 1"):
        fails.append(f"D1 {w}px: відкрита панель Foundry стоїть нижче «Одної Пустки на всіх»")
    go("")
    # 2: the bar wears the groups' header look (background, colour, case) and opens on a click
    look = page.evaluate("""() => { const a = getComputedStyle(document.querySelector('#de-hraty-fold > summary')),
        b = getComputedStyle(document.querySelector('.group .group-h'));
        return [a.backgroundImage === b.backgroundImage, a.backgroundColor === b.backgroundColor, a.color === b.color,
                a.textTransform, document.querySelector('#de-hraty-fold > summary').getBoundingClientRect().height]; }""")
    n += 2
    if look[:4] != [True, True, True, "uppercase"] or look[4] < 44:
        fails.append(f"D2 {w}px: «Де грати» не схожа на шапку «Правила гравців» (тло, колір, регістр, висота): {look}")
    page.click("#de-hraty-fold > summary")
    if not page.locator("#owlbear .plate-more").is_visible():
        fails.append(f"D2 {w}px: клік на смугу не розгорнув «Де грати»")
    # 3: the tool pages show the button and no bare address
    for slug in ("heneratory-natkhnennia/", "elektronnyi-arkush-personazha/", "elektronnyi-arkush-karavanu/"):
        go(slug)
        n += 1
        if "serhiiten.github.io" in page.evaluate("document.querySelector('.text').innerText") or page.locator(".text .toolbtn").count() != 1:
            fails.append(f"D3 {w}px {slug}: голе посилання лишилось чи кнопки не одна")
    # 5: gone; the home page's history link → the page, the button near the top; the button and the callout's link open it
    for gone, to, tool in (("avtomatychnyi-henerator-bytv", "skladnist-bytv", "battle"),
                           ("avtomatychnyi-henerator-sprav", "struktura-sesii-stvorennia-sprav", "case"),
                           ("avtomatychnyi-henerator-podorozhei", "podorozhi-ta-vypadkovi-podii", "travel"),
                           ("arkushi-personazhiv-ta-karavanu", None, None)):
        resp = page.goto(BASE + gone + "/")
        n += 1
        if resp.status != 404:
            fails.append(f"D5 {w}px: {gone}/ віддає {resp.status}, не 404")
        if not to:
            continue
        go("")
        page.click("#istoriia-zmin > summary")
        page.locator(f'#istoriia-zmin a[href="{to}/#{gone}"]').click()
        page.wait_for_load_state("networkidle"); page.wait_for_timeout(200)
        top = page.evaluate(f"(e => e && e.getBoundingClientRect().top)(document.getElementById('{gone}'))")
        n += 2
        if page.url != BASE + to + "/#" + gone or top is None or not (-5 <= top <= 200):
            fails.append(f"D5 {w}px: посилання з «Історії змін» привело на {page.url}, кнопка на {top} px")
        page.click(f"#{gone}")
        page.wait_for_selector("iframe.tool-frame.on[data-tool=terminal]", state="visible")
        src = page.evaluate("document.querySelector('iframe.tool-frame.on').getAttribute('src')")
        if not src.endswith("all_generators.html?embed=1#" + tool):
            fails.append(f"D5 {w}px: кнопка на {to} відкрила {src}")
        go(to + "/")
        # DC8 (2026-11-28): the callout keeps its words without the link; the button under it is the one way in
        n += 1
        if page.locator(f'.call a[href$="#{tool}"]').count():
            fails.append(f"D5/DC8 {w}px: виноска на {to} і далі веде на генератор, хоч кнопка стоїть під нею")
    # 6: «Додаткові матеріали» from the left menu opens its first page, which is not the sheets page
    go("robymo-perevirky/")
    if w < 900:
        page.click("details.side > summary")
    page.locator("a.side-s", has_text="Додаткові матеріали").first.click(); page.wait_for_load_state("networkidle")
    n += 1
    if "arkushi" in page.url or page.locator("a.side-p", has_text="Аркуші персонажів та каравану").count():
        fails.append(f"D6 {w}px: «Додаткові матеріали» досі мають сторінку аркушів ({page.url})")
    return n


def package_db(page, fails, w):
    """Package D-B (author, 2026-11-28): every «Скачати …» button gives its file (status 200, the file's type and size),
    stands inside the text and is at least 44 px high; a real click downloads under the Drive name (no Drive anywhere);
    the reminders and the quick start are pages of the site, the quick start a group of its own."""
    n = 0
    files = os.path.join(REPO, "wiki", "files")
    kinds = {"pdf": ("application/pdf",), "png": ("image/png",),
             # the dispatcher's server may predate serve.py's .zip type (Windows says x-zip-compressed); Pages sends zip
             "zip": ("application/zip", "application/x-zip-compressed")}
    pages_with = ["ihrovyi-protses", "pokrokova-instruktsiia", "henerator-pustelnykiv-ruchnyi", "pokrashchennia-karavanu",
                  "stvorennia-karavanu", "stvorennia-kampanii", "mapa-zakhidnoho-uzberezhzhia-ssha-2277",
                  "fishky-personazhiv-ta-nipiv", "pamiatka-hravtsia", "pamiatka-dohliadacha", "shvydkyi-start-avtory-ta-litsenziia",
                  "shvydkyi-start-kym-mozhna-hraty"]   # DC2: the ready-made characters' six sheets
    seen = {}
    for slug in pages_with:
        page.goto(BASE + slug + "/"); page.wait_for_load_state("networkidle")
        info = page.evaluate("""() => { const t = document.querySelector('.text').getBoundingClientRect();
            return [...document.querySelectorAll('a.dlbtn')].map(a => { const r = a.getBoundingClientRect();
              return {href: a.href, dl: a.getAttribute('download'), text: a.querySelector('b').textContent, h: r.height,
                      inside: r.left >= t.left - 1 && r.right <= t.right + 1, vw: r.right <= innerWidth}; }); }""")
        n += 1
        if not info:
            fails.append(f"DB8 {w}px {slug}: немає кнопки «Скачати»")
        for b in info:
            n += 1
            if not b["text"].startswith("Скачати "):
                fails.append(f"DB8 {w}px {slug}: напис кнопки «{b['text']}»")
            if b["h"] < 44 or not b["inside"] or not b["vw"]:
                fails.append(f"DB8 {w}px {slug}: кнопка «{b['text']}» {b['h']:.0f} px заввишки, у тексті {b['inside']}, у вікні {b['vw']}")
            if b["href"] in seen:
                continue
            r = page.request.head(b["href"])
            name = b["href"].rsplit("/", 1)[1]
            ctype = r.headers.get("content-type", "").split(";")[0]
            seen[b["href"]] = (r.status, ctype)
            size = int(r.headers.get("content-length", "-1"))
            if r.status != 200 or ctype not in kinds[name.rsplit(".", 1)[1]] or size != os.path.getsize(os.path.join(files, name)):
                fails.append(f"DB8 {w}px {slug}: {name} → {r.status} {ctype} {size} байт")
        if "drive.google.com" in page.content():
            fails.append(f"DB8 {w}px {slug}: на сторінці лишилось посилання на Google Drive")
        # DC6 (author via the dispatcher, 2026-11-28): no heading or paragraph left that only repeats a file's name (the
        # map's «Пустельники - Мапа Західного узбережжя США 2277» above its button): its words = the Drive name's words
        left = page.evaluate("""names => { const w = s => [...new Set(s.toLowerCase().match(/[\\p{L}\\p{N}']+/gu) || [])].sort().join(' ');
            const want = new Set(names.map(n => w(n.replace(/\\.[a-z0-9]+$/i, ''))));
            return [...document.querySelectorAll('.text :is(h2,h3,h4,h5,h6,p,li)')].filter(e => !e.closest('.dlbtn'))
              .map(e => { const c = e.cloneNode(true); c.querySelectorAll('.dls').forEach(x => x.remove()); return c.textContent.trim(); })
              .filter(t => t && want.has(w(t))); }""", [d["name"] for d in DOWNLOADS])
        n += 1
        if left:
            fails.append(f"DC6 {w}px {slug}: рядок лише повторює назву файлу: {left[:2]}")
        heads = page.evaluate("document.querySelectorAll('.text :is(h1,h2,h3,h4,h5,h6) .dls').length")
        n += 1
        if heads:
            fails.append(f"DC6 {w}px {slug}: кнопка «Скачати» всередині заголовка")
    # a real click downloads the file under the name it had on Drive (map: small; the player's reminder: a PDF)
    for slug, f in (("mapa-zakhidnoho-uzberezhzhia-ssha-2277", "Мапа Західного узбережжя США 2277 - Пустельники.png"),
                    ("pamiatka-hravtsia", "Пам'ятка гравця - Пустельники.pdf")):
        page.goto(BASE + slug + "/"); page.wait_for_load_state("networkidle")
        with page.expect_download() as d:
            page.locator("a.dlbtn").first.click()
        n += 1
        dl = d.value
        if dl.suggested_filename != f:
            fails.append(f"DB8 {w}px {slug}: збережено як «{dl.suggested_filename}», а не «{f}»")
        dl.cancel()
    # the quick start: its own group first on the home page, three sections; «Скачати PDF» first on its first page
    page.goto(BASE); page.wait_for_load_state("networkidle")
    g = page.evaluate("""() => [...document.querySelectorAll('.group')].map(x => [x.querySelector('.group-h').textContent,
        x.querySelectorAll('.sec').length])""")
    n += 1
    if not g or g[0] != ["ШВИДКИЙ СТАРТ", 3]:
        fails.append(f"DB9 {w}px: перша група на головній не «Швидкий старт» із трьома розділами: {g[:1]}")
    page.goto(BASE + "shvydkyi-start-avtory-ta-litsenziia/"); page.wait_for_load_state("networkidle")
    first = page.evaluate("document.querySelector('.text h1').nextElementSibling.textContent")
    n += 1
    if "Скачати PDF" not in first:
        fails.append(f"DB9 {w}px: перше після назви на першій сторінці — не «Скачати PDF»: «{first[:40]}»")
    return n


def package_dc(page, fails, w):
    """After package D-B (author, 2026-11-28). DC3: on the home page «Швидкий старт» is one block the groups' whole width
    right under «Де грати»; under it «Правила гравців» and «Правила Доглядача» side by side (one under the other on a
    narrow screen), each a single whole block. DC4: every page reserves the scrollbar's room (`scrollbar-gutter: stable`),
    so the content stands at the same place on a page that scrolls and one that does not; a tool in the frame gets the
    whole width (no empty strip beside its own scrollbar). Headless Chromium may draw no classic scrollbar: then the
    places match anyway, and the CSS check is what guards it here (the live check is in the browser pane)."""
    n = 0
    page.goto(BASE); page.wait_for_load_state("networkidle")
    g = page.evaluate("""() => { const box = e => { const r = e.getBoundingClientRect(); return [r.left, r.right, r.top + scrollY, r.bottom + scrollY]; };
        return {intro: box(document.querySelector('.intro')), groups: box(document.querySelector('.groups')),
                cards: [...document.querySelectorAll('.groups > .group')].map(x => [x.querySelector('.group-h').textContent, ...box(x)])}; }""")
    n += 4
    c = g["cards"]
    if len(c) != 3 or c[0][0] != "ШВИДКИЙ СТАРТ":
        fails.append(f"DC3 {w}px: групи на головній: {[x[0] for x in c]}")
        return n
    if abs(c[0][1] - g["groups"][0]) > 1 or abs(c[0][2] - g["groups"][1]) > 1:
        fails.append(f"DC3 {w}px: «Швидкий старт» не на всю ширину: {c[0][1:3]} / {g['groups'][:2]}")
    if not (g["intro"][3] <= c[0][3] <= g["intro"][3] + 40):
        fails.append(f"DC3 {w}px: «Швидкий старт» не одразу під «Де грати»: {c[0][3]} / {g['intro'][3]}")
    if not all(x[3] >= c[0][4] for x in c[1:]):
        fails.append(f"DC3 {w}px: правила не під «Швидким стартом»")
    side = abs(c[1][3] - c[2][3]) < 1 and c[1][2] <= c[2][1]
    under = c[2][3] >= c[1][4] and abs(c[1][1] - c[2][1]) < 1
    if (w > 900 and not side) or (w <= 900 and not under):
        fails.append(f"DC3 {w}px: «{c[1][0]}» і «{c[2][0]}» не {'поруч' if w > 900 else 'одна під одною'}: {c[1][1:]} / {c[2][1:]}")
    # DC7: «Швидкий старт» a fold, closed by default; open: «Гравцям» + «Доглядачу» | the adventure (one under another
    # at ≤ 900 px); an address of its section opens it
    qs = page.evaluate("""() => { const f = document.querySelector('details.qs-fold'); if (!f) return null; const was = f.open; f.open = true;
        const c = [...f.querySelectorAll('.qs-cols > div')].map(d => { const r = d.getBoundingClientRect();
          return [r.left, r.top, r.bottom, [...d.querySelectorAll('h3')].map(h => h.textContent)]; });
        f.open = was; return {was, c}; }""")
    n += 2
    if not qs or qs["was"] or len(qs["c"]) != 2 or len(qs["c"][0][3]) != 2 or len(qs["c"][1][3]) != 1:
        fails.append(f"DC7 {w}px: «Швидкий старт» не згортка, згорнута типово, з колонками 2 | 1 розділ: {qs}")
    elif (w > 900 and not (qs["c"][1][0] > qs["c"][0][0] and abs(qs["c"][1][1] - qs["c"][0][1]) < 2)) or (w <= 900 and qs["c"][1][1] < qs["c"][0][2] - 1):
        fails.append(f"DC7 {w}px: колонки «Швидкого старту» не {'поруч' if w > 900 else 'одна під одною'}: {qs['c']}")
    page.goto(BASE + "#startova-pryhoda"); page.wait_for_load_state("networkidle")
    n += 1
    if not page.evaluate("document.querySelector('details.qs-fold').open"):
        fails.append(f"DC7 {w}px: адреса #startova-pryhoda не розгортає «Швидкий старт»")
    page.goto(BASE); page.wait_for_load_state("networkidle")
    # DC5 (variant В, author via the dispatcher, 2026-11-28): the cover whole: its natural proportions are the shown ones,
    # nothing cut by `object-fit` or an `overflow` box around it; the menu beside it (under it at ≤ 900 px), the lead the
    # whole width under both
    cv = page.evaluate("""() => { const i = document.querySelector('.hero .cover'); if (!i) return null;
        const r = i.getBoundingClientRect(), box = e => e.getBoundingClientRect();
        let cut = false; for (let e = i.parentElement; e && e !== document.body; e = e.parentElement) {
          const b = box(e), o = getComputedStyle(e).overflow;
          if (o !== 'visible' && (r.left < b.left - 1 || r.right > b.right + 1 || r.top < b.top - 1 || r.bottom > b.bottom + 1)) cut = true; }
        const s = box(document.querySelector('.hero-side')), f = box(document.querySelector('.hero-foot'));
        return {nat: i.naturalWidth / i.naturalHeight, shown: r.width / r.height, fit: getComputedStyle(i).objectFit, cut,
                beside: Math.abs(s.top - r.top) < 2 && s.left >= r.right - 1, under: s.top >= r.bottom - 1,
                foot: f.top >= Math.max(r.bottom, s.bottom) - 1 && f.width >= r.width + (s.top < r.bottom ? s.width : 0) - 2}; }""")
    n += 2
    if not cv or abs(cv["nat"] - cv["shown"]) > 0.01 * cv["nat"] or cv["fit"] not in ("fill", "contain") or cv["cut"]:
        fails.append(f"DC5 {w}px: обкладинку видно не повністю: {cv}")
    elif not ((cv["beside"] if w > 900 else cv["under"]) and cv["foot"]):
        fails.append(f"DC5 {w}px: меню чи вступ не там (поруч / під обкладинкою, вступ під обома): {cv}")
    # DC4: the CSS, then a long page in the usual window (it scrolls) and a short one in a window so tall that it does not
    gut = page.evaluate("getComputedStyle(document.documentElement).scrollbarGutter")
    n += 1
    if gut != "stable":
        fails.append(f"DC4 {w}px: scrollbar-gutter на html — «{gut}», не stable")
    size = page.viewport_size
    at = {}
    for slug, tall in (("shvydkyi-start-avtory-ta-litsenziia", True), ("ihrovyi-protses", False)):
        page.set_viewport_size({"width": w, "height": 2600} if tall else size)
        page.goto(BASE + slug + "/"); page.wait_for_load_state("networkidle")
        at[slug] = page.evaluate("""() => { const d = document.documentElement, r = document.querySelector('.paper.sheet').getBoundingClientRect();
            return [d.scrollHeight > d.clientHeight, d.clientWidth, Math.round(r.left), Math.round(r.width)]; }""")
    page.set_viewport_size(size)
    n += 1
    (s_, l_) = at.values()
    if s_[0] or not l_[0]:
        fails.append(f"DC4 {w}px: коротка сторінка мала б не прокручуватися, довга — прокручуватися: {at}")
    if s_[1:] != l_[1:]:
        fails.append(f"DC4 {w}px: ширина чи місце контенту різні на короткій і довгій сторінці: {at}")
    # a tool in the frame: the whole width, the reserved room off
    page.goto(BASE); page.wait_for_load_state("networkidle")
    page.locator('.tabs a[data-tool="terminal"]').click()
    page.wait_for_selector("iframe.on", state="attached"); page.wait_for_timeout(600)
    fr = page.evaluate("""() => { const f = document.querySelector('iframe.on').getBoundingClientRect(), d = document.documentElement;
        return [getComputedStyle(d).scrollbarGutter, Math.round(f.width), innerWidth, d.scrollWidth - d.clientWidth]; }""")
    n += 1
    if fr[0] != "auto" or fr[1] != fr[2] or fr[3] > 0:
        fails.append(f"DC4 {w}px: Термінал у рамці не на всю ширину (gutter, рамка, вікно, зайве): {fr}")
    return n


def frame_scenarios(page, fails, site_root):
    """Package B: the tools in the wiki's frame (rows Б.2, Б.3, Б.4, Б.6, Б.10)."""
    n = 0

    def settle():
        page.wait_for_load_state("networkidle")

    def frame(tool):
        return page.frame_locator(f"iframe[data-tool={tool}]")

    def wait_tool(tool):
        page.wait_for_selector(f"iframe.tool-frame.on[data-tool={tool}]", state="visible")
        page.wait_for_function(f"() => {{ const f = document.querySelector('iframe[data-tool={tool}]'); return f && f.contentDocument && f.contentDocument.readyState === 'complete' && f.contentDocument.querySelector('#emb-rules, #rules-btn, #btnRules'); }}", timeout=60000)

    page.context.clear_cookies()
    page.goto(BASE); settle()
    page.evaluate("localStorage.clear()")
    # Б.3: nothing of a tool is loaded before its click
    reqs = []
    page.on("request", lambda r: reqs.append(r.url))
    page.goto(BASE + "robymo-perevirky/"); settle()
    n += 1
    if any(x in u for u in reqs for x in ("all_generators.html", "character_generator.html", "caravan_generator.html")) or page.locator("iframe").count():
        fails.append("Б.3 інструмент вантажиться до кліку")
    # Б.2: Ctrl+click opens the standalone tool in a new tab
    with page.context.expect_page() as pop:
        page.click("a.tab[data-tool=caravan]", modifiers=["Control"])
    other = pop.value; other.wait_for_load_state()
    n += 1
    if other.url != site_root + "caravan_generator.html" or page.locator("iframe").count():
        fails.append(f"Б.2 Ctrl+клік: {other.url}, рамок на сторінці {page.locator('iframe').count()}")
    other.close()
    # Б.4: a battle, a filled sheet and the tracker live through «Правила» → other pages → the tool again
    page.click("a.tab[data-tool=terminal]"); wait_tool("terminal")
    t = frame("terminal")
    t.locator("#t-battle").click()
    t.get_by_role("button", name="Згенерувати битву").first.click()
    page.wait_for_timeout(400)
    battle = t.locator("#tab-battle").inner_text()
    page.evaluate("document.querySelector('iframe[data-tool=terminal]').contentWindow.__boot = 1")
    t.locator("#emb-rules").click(); page.wait_for_url(BASE + "robymo-perevirky/")
    page.click("a.tab[data-tool=character]"); wait_tool("character")
    frame("character").locator("#f-name").first.fill("Тест Рамки")
    frame("character").locator("#rules-btn").click(); page.wait_for_url(BASE + "robymo-perevirky/")
    page.click("a.pn-next"); page.wait_for_url(BASE + "standartni-dii/")
    page.fill(".pagefind-ui__search-input", "Наслідки")
    page.wait_for_selector(".pagefind-ui__result-link", timeout=10000); page.wait_for_timeout(500)
    page.locator(".pagefind-ui__result-link").first.click(); page.wait_for_url("**/naslidky/**")
    page.locator("a.side-p", has_text="Робимо перевірки").first.click() if page.locator("a.side-p", has_text="Робимо перевірки").count() else page.click("a.pn-prev")
    settle()
    page.click("a.tab[data-tool=terminal]"); wait_tool("terminal")
    n += 3
    again = frame("terminal").locator("#tab-battle").inner_text()
    if again != battle or page.evaluate("document.querySelector('iframe[data-tool=terminal]').contentWindow.__boot") != 1:
        fails.append("Б.4 після «Правила» і трьох сторінок битва не та або Термінал перезавантажився")
    if page.locator("iframe").count() != 2:
        fails.append(f"Б.3 рамок {page.locator('iframe').count()}, а не 2 (Термінал і аркуш)")
    name = frame("character").locator("#f-name").first.input_value()
    if name != "Тест Рамки":
        fails.append(f"Б.4 аркуш персонажа втратив ім'я: «{name}»")
    # Б.4 history: tool → «Правила» → 2 pages → tool (via «▶ Відкрити…» with another Terminal tab) → «Назад» ×4
    frame("terminal").locator("#emb-rules").click(); page.wait_for_function("() => !location.search")
    start = page.url
    page.goto(BASE + "pravyla-bytv/"); settle()                     # a real load: the history of this test starts here
    steps = [page.url]
    page.click("a.tab[data-tool=terminal]"); wait_tool("terminal"); steps.append(page.url)
    frame("terminal").locator("#emb-rules").click(); page.wait_for_url(steps[0])
    for _ in range(2):
        prev = page.url
        page.click("a.pn-next"); page.wait_for_function("u => location.href !== u", arg=prev); steps.append(page.url)
    btn = page.locator(".toolbtn")
    if btn.count():
        btn.first.click()
    else:
        page.click("a.tab[data-tool=terminal]")
    wait_tool("terminal"); steps.append(page.url)
    page.wait_for_timeout(300)
    back = []
    for _ in range(4):
        page.go_back(); page.wait_for_timeout(700); back.append(page.url)
    n += 1
    want = [steps[3], steps[2], steps[0], start]
    if back != want:
        fails.append(f"Б.4 «Назад» ×4: {back}, а мали бути {want}")
    page.goto(BASE + "pravyla-bytv/"); settle()
    # Б.6: the theme of the shared header reaches the shown and the hidden tool; a tool's own change reaches the wiki
    page.click("a.tab[data-tool=terminal]"); wait_tool("terminal")
    frame("terminal").locator("#emb-rules").click(); page.wait_for_url(BASE + "pravyla-bytv/")
    page.click("a.tab[data-tool=character]"); wait_tool("character")
    page.click("#theme-btn"); page.wait_for_timeout(400)
    th = page.evaluate("""() => [document.documentElement.dataset.theme || 'light'].concat([...document.querySelectorAll('iframe')].map(f => f.contentDocument.documentElement.dataset.theme || 'light'))""")
    n += 2
    if len(set(th)) != 1 or th[0] != "dark":
        fails.append(f"Б.6 тема з шапки: вікі й рамки {th}")
    other = page.context.new_page()               # the theme switched in a standalone tool (another tab) reaches the wiki and both frames
    other.goto(site_root + "all_generators.html"); other.wait_for_load_state("load")
    other.click("#theme-btn"); other.close()
    page.wait_for_timeout(400)
    th = page.evaluate("""() => [document.documentElement.dataset.theme || 'light'].concat([...document.querySelectorAll('iframe')].map(f => f.contentDocument.documentElement.dataset.theme || 'light'))""")
    if len(set(th)) != 1 or th[0] != "light":
        fails.append(f"Б.6 тема з інструмента: вікі й рамки {th}")
    # Б.4: reload with ?tool= opens the frame again; the sheet comes back from its storage
    page.reload(); wait_tool("character")
    n += 1
    if frame("character").locator("#f-name").first.input_value() != "Тест Рамки":
        fails.append("Б.4 після оновлення сторінки аркуш не відновився")
    # Б.10: after the shell's swap main, title, body class and every href equal a direct load
    SNAP = """() => { const m = document.querySelector('main'); return [m.outerHTML.replace(/ inert=""| tabindex="-1"/g, '').replace(/ class="fade-in"| fade-in/g, '').replace(/<details class="side screen"( open)?/, '<details class="side screen"'), document.title, document.body.className,
        [...document.querySelectorAll('header a[href], main a[href]')].map(a => a.getAttribute('href')).join(' ')]; }"""
    for target in ("", "naslidky/", "robymo-perevirky/#" + "", "no-such-page/"):
        page.goto(BASE + "pravyla-bytv/"); settle()
        page.click("a.tab[data-tool=caravan]"); wait_tool("caravan")
        frame("caravan").locator("#btnRules").click(); settle()
        page.evaluate(f"(() => {{ const a = document.createElement('a'); a.href = '{BASE + target}'; a.textContent = 'x'; document.querySelector('main .text, main').appendChild(a); a.click(); }})()")
        page.wait_for_timeout(1200); settle()
        n += 1
        if target == "no-such-page/":
            if page.locator("iframe").count():
                fails.append("Б.10 неіснуюча адреса: мав бути звичайний перехід (рамки лишилися)")
            continue
        swapped = page.evaluate(SNAP)
        focus = page.evaluate("document.activeElement.tagName")
        if page.locator("iframe").count() != 1:
            fails.append(f"Б.10 {target or 'головна'}: оболонка не втримала рамку")
        page.goto(BASE + target); settle()
        direct = page.evaluate(SNAP)
        if swapped != direct:
            diff = [i for i in range(4) if swapped[i] != direct[i]]
            if 0 in diff:
                import difflib
                d = [x for x in difflib.unified_diff(direct[0].split("><"), swapped[0].split("><"), lineterm="", n=0) if x[:1] in "+-"][:6]
                diff.append(d)
            fails.append(f"Б.10 {target or 'головна'}: після підміни не так, як при прямому завантаженні (поля {diff})")
        if focus not in ("H1", "H2"):
            fails.append(f"Б.10 {target or 'головна'}: фокус на {focus}, а не на заголовку")
    page.evaluate("localStorage.clear()")
    return n


def open_each(page, fails, w):
    """Б.2 at every width: a click on each tool tab shows it in the frame under the header, the frame fills the window below it."""
    n = 0
    page.goto(BASE + "robymo-perevirky/"); page.wait_for_load_state("networkidle")
    for tool in ("terminal", "character", "caravan"):
        page.click(f"a.tab[data-tool={tool}]")
        page.wait_for_selector(f"iframe.tool-frame.on[data-tool={tool}]", state="visible")
        r = page.evaluate("""() => { const f = document.querySelector('iframe.on').getBoundingClientRect(), h = document.querySelector('header.rustbar.top').getBoundingClientRect();
            return [Math.round(f.top - h.bottom), Math.round(innerHeight - f.bottom), Math.round(f.width - innerWidth), document.documentElement.scrollWidth - innerWidth]; }""")
        n += 1
        if any(abs(x) > 1 for x in r):
            fails.append(f"Б.2 {w}px {tool}: рамка не під шапкою на всю решту вікна (зазор угорі, внизу, ширина, вилазить) {r}")
        if os.environ.get("PUST_SHOTS"):
            page.wait_for_timeout(1500)
            page.screenshot(path=os.path.join(os.environ["PUST_SHOTS"], f"b2-{tool}-{w}.png"))
        page.go_back(); page.wait_for_function("() => !document.documentElement.classList.contains('tool-open')")
    return n


def embed_checks(page, fails, w):
    """Б.7 / Б.8: ?embed=1 in a frame hides the header, footer and theme; «Правила» in place; without a frame nothing changes."""
    site_root = BASE[:-len("rules/")]
    n = 0
    for file, hidden, rules, first in (("all_generators.html", ["header.rustbar.top", "footer.rustbar.bottom"], "#emb-rules", ".emb-strip > :first-child"),
                                       ("character_generator.html", ["header.top .logo", "#theme-btn", ".credit"], "#rules-btn", "header.top .tools > :first-child"),
                                       ("caravan_generator.html", [".topbar .brand", "#themeBtn", "p.foot"], "#btnRules", ".topbar .actions > :first-child")):
        page.goto(BASE); page.wait_for_load_state("networkidle")
        page.evaluate(f"(() => {{ const f = document.createElement('iframe'); f.id = 'tst'; f.src = '{site_root}{file}?embed=1'; f.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:99;border:0'; document.body.appendChild(f); }})()")
        page.wait_for_function(f"() => {{ const d = document.getElementById('tst').contentDocument; return d && d.readyState === 'complete' && d.querySelector('{rules}'); }}", timeout=60000)
        fr = page.frame_locator("#tst")
        # the sheets' header buttons sit in a fold «Аркуш», closed at ≤ 560 px (2026-11-28): open it as a user would
        page.evaluate("() => { const f = document.getElementById('tst').contentDocument.querySelector('#tb-fold, #tbFold'); if (f) f.open = true; }")
        r = page.evaluate(f"""() => {{ const d = document.getElementById('tst').contentDocument, v = s => {{ const e = d.querySelector(s); return !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden'; }};
            const b = d.querySelector('{rules}').getBoundingClientRect();
            return [{', '.join(f"v('{h}')" for h in hidden)}].concat([d.querySelector('{first}') === d.querySelector('{rules}'), b.width >= 24 && b.height >= 24,
                     d.documentElement.scrollWidth - d.documentElement.clientWidth]); }}""")
        n += 3
        if any(r[:len(hidden)]):
            fails.append(f"Б.7 {w}px {file}: видно сховане {[h for h, x in zip(hidden, r) if x]}")
        if not r[len(hidden)] or not r[len(hidden) + 1]:
            fails.append(f"Б.7 {w}px {file}: «Правила» не першим у ряді або менше 24×24")
        if r[-1] > 0:
            fails.append(f"Б.7 {w}px {file}: ширше за вікно на {r[-1]} px")
        if file == "all_generators.html":      # the moved header buttons work from the strip
            fr.locator("#hd-file").click()
            n += 1
            if not fr.locator("#hd-filemenu").is_visible():
                fails.append(f"Б.7 {w}px: «Зберегти / завантажити гру» не відкрило меню")
            fr.locator("#hd-moves").click()
            if not fr.locator("#gm-moves").is_visible():
                fails.append(f"Б.7 {w}px: «Ходи» не відкрили картку")
            if os.environ.get("PUST_SHOTS"):
                fr.locator("#hd-file").click()
                page.screenshot(path=os.path.join(os.environ["PUST_SHOTS"], f"b7-terminal-menu-{w}.png"))
        if file == "caravan_generator.html":
            fr.locator("#helpBtn").click()
            n += 1
            if not fr.locator("#guide").is_visible():
                fails.append(f"Б.7 {w}px: «?» каравану не відкрив довідку з нового місця")
        # Б.8: the same address outside a frame stays the standalone page
        page.goto(site_root + file + "?embed=1"); page.wait_for_load_state("load")
        n += 1
        if page.evaluate(f"document.documentElement.classList.contains('embed') || !!document.querySelector('{rules}')"):
            fails.append(f"Б.8 {file}?embed=1 без рамки увімкнув режим вбудовування")
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
            page.on("response", lambda r: errors.append(f"{r.status} {r.url}") if r.status >= 400 and "no-such-page" not in r.url and not any(g in r.url for g in GONE) else None)
            page.on("pageerror", lambda e: errors.append(str(e)))
            quick = os.environ.get("PUST_ONLY_FRAME")     # debugging only the frame: python check_pages.py with PUST_ONLY_FRAME=1
            if quick:
                checks += (frame_scenarios(page, fails, BASE[:-len("rules/")]) if w == 1366 else 0) + embed_checks(page, fails, w) + open_each(page, fails, w)
                ctx.close()
                continue
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
                checks += 1
                if r["cramped"]:
                    fails.append(f"D4 {where}: таблиця прокручується, хоч на аркуші є місце: " + "; ".join(r["cramped"][:3]))
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
            checks += package_c(page, fails, w)
            checks += package_d(page, fails, w)
            checks += package_db(page, fails, w)
            checks += package_dc(page, fails, w)
            checks += embed_checks(page, fails, w) + open_each(page, fails, w)
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
