"""Screenshots for package D-B (author, 2026-11-28): the reminders, the quick start, the download buttons; each at
1366×768 and 375×812, light and dark.

    F:/Claude/pustelnyky-venv/Scripts/python.exe site/tests/shots_e.py <out folder> [http://localhost:8800]

Writes e<request>-<what>-<width>-<theme>.png.
"""
import os
import sys

os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "F:/Claude/pustelnyky-venv/browsers")
from playwright.sync_api import sync_playwright  # noqa: E402

OUT = sys.argv[1]
BASE = (sys.argv[2] if len(sys.argv) > 2 else "http://localhost:8800").rstrip("/") + "/wastelanders/rules/"
SHOTS = [   # (name, page, element to scroll to)
    ("e7-pamiatka-hravtsia-top", "pamiatka-hravtsia/", None),
    ("e7-pamiatka-hravtsia-table", "pamiatka-hravtsia/", ".text table"),
    ("e7-pamiatka-hravtsia-bottom", "pamiatka-hravtsia/", ".text > .dls:last-child"),
    ("e7-pamiatka-dohliadacha-bottom", "pamiatka-dohliadacha/", ".text > .dls:last-child"),
    ("e8-ihrovyi-protses-buttons", "ihrovyi-protses/", ".text .dls"),
    ("e8-mapa", "mapa-zakhidnoho-uzberezhzhia-ssha-2277/", None),
    ("e8-henerator-callout", "henerator-pustelnykiv-ruchnyi/", ".call .dls"),
    ("e9-home-group", "", "section.group"),
    ("e9-start-first-page", "shvydkyi-start-avtory-ta-litsenziia/", None),
    ("e9-start-enemies", "shvydkyi-start-lehka-bytva-papa-detonator/", "#suprotyvnyky"),
    ("e9-start-ketrin", "shvydkyi-start-vazhka-bytva-zahin-ketrin/", "#suprotyvnyky"),
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
