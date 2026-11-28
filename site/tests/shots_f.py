"""Screenshots for the fixes after package D-B (author, 2026-11-28; «DC»): «Сімона», the ready-made characters' buttons,
the home page's «Швидкий старт» block, the scrollbar's reserved room; each at 1366×768 and 375×812, light and dark.

    F:/Claude/pustelnyky-venv/Scripts/python.exe site/tests/shots_f.py <out folder> [http://localhost:8800]

Writes f<request>-<what>-<width>-<theme>.png. Headless Chromium draws no classic scrollbar, so the reserved room
(request 4) is measured live in the browser pane (check_pages.py measures the CSS), not seen in these shots.
"""
import os
import sys

os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "F:/Claude/pustelnyky-venv/browsers")
from playwright.sync_api import sync_playwright  # noqa: E402

OUT = sys.argv[1]
BASE = (sys.argv[2] if len(sys.argv) > 2 else "http://localhost:8800").rstrip("/") + "/wastelanders/rules/"
SHOTS = [   # (name, page, element to scroll to)
    ("f1-ketrin-simona", "shvydkyi-start-vazhka-bytva-zahin-ketrin/", "#suprotyvnyky"),
    ("f2-kym-mozhna-hraty", "shvydkyi-start-kym-mozhna-hraty/", None),
    ("f2-kym-mozhna-hraty-list", "shvydkyi-start-kym-mozhna-hraty/", ".text ul"),
    ("f3-home-quick-start", "", "section.group-wide"),
    ("f3-home-rules-columns", "", "section.group-wide + section.group"),
    ("f4-short-page", "shvydkyi-start-hravtsiam/", None),
    ("f4-long-page", "ihrovyi-protses/", None),
]


def main():
    os.makedirs(OUT, exist_ok=True)
    with sync_playwright() as p:
        br = p.chromium.launch()
        for theme in ("light", "dark"):
            for w, h in ((1366, 768), (375, 812)):
                ctx = br.new_context(viewport={"width": w, "height": h}, device_scale_factor=1)
                ctx.add_init_script(f"try{{localStorage.setItem('pustelnyky-theme','{theme}')}}catch(e){{}}")
                page = ctx.new_page()
                for name, path, at in SHOTS:
                    page.goto(BASE + path)
                    page.wait_for_load_state("networkidle")
                    if w < 900:   # the narrow screen's contents fold stays closed in the shots
                        page.evaluate("document.querySelector('details.side')?.removeAttribute('open')")
                    if at:
                        page.evaluate(f"(e => {{ e.scrollIntoView(); scrollBy(0, -12); }})(document.querySelector('{at}'))")
                    page.wait_for_timeout(300)
                    page.screenshot(path=os.path.join(OUT, f"{name}-{w}-{theme}.png"))
                ctx.close()
        br.close()


if __name__ == "__main__":
    main()
