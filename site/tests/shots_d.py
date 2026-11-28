"""Screenshots for package D-A (author, 2026-11-28): each request at 1366×768 and 375×812, light and dark.

    F:/Claude/pustelnyky-venv/Scripts/python.exe site/tests/shots_d.py <out folder> [http://localhost:8800]

Writes d<request>-<what>-<width>-<theme>.png.
"""
import os
import sys

os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "F:/Claude/pustelnyky-venv/browsers")
from playwright.sync_api import sync_playwright  # noqa: E402

OUT = sys.argv[1]
BASE = (sys.argv[2] if len(sys.argv) > 2 else "http://localhost:8800").rstrip("/") + "/wastelanders/rules/"


def main():
    os.makedirs(OUT, exist_ok=True)
    with sync_playwright() as p:
        br = p.chromium.launch()
        for theme in ("light", "dark"):
            for w, h in ((1366, 768), (375, 812)):
                ctx = br.new_context(viewport={"width": w, "height": h}, device_scale_factor=1)
                ctx.add_init_script(f"try{{localStorage.setItem('pustelnyky-theme','{theme}')}}catch(e){{}}")
                page = ctx.new_page()

                def go(path, at=None, click=()):
                    page.goto(BASE + path)
                    page.wait_for_load_state("networkidle")
                    for c in click:
                        page.click(c)
                        page.wait_for_timeout(150)
                    if at:
                        page.evaluate(f"(e => {{ e.scrollIntoView(); scrollBy(0, -12); }})(document.querySelector('{at}'))")
                    page.wait_for_timeout(300)

                def shot(name):
                    page.screenshot(path=os.path.join(OUT, f"{name}-{w}-{theme}.png"))
                go("", ".intro")
                shot("d1d2-home-closed")
                go("", "#eco", ("#de-hraty-fold > summary", "#foundry .plate-more"))
                shot("d1-eco-in-de-hraty")
                go("", ".intro", ("#de-hraty-fold > summary",))
                shot("d2-de-hraty-open")
                go("")
                page.locator("a.mi", has_text="Foundry").click()
                page.wait_for_timeout(400)
                shot("d2-menu-foundry")
                go("heneratory-natkhnennia/")
                shot("d3-heneratory-natkhnennia")
                go("tablytsi-natkhnennia/", ".text > table")
                shot("d4-tablytsi-vantazhi")
                go("skladnist-bytv/#avtomatychnyi-henerator-bytv", "#avtomatychnyi-henerator-bytv")
                page.evaluate("scrollBy(0, -160)")
                shot("d5-skladnist-bytv")
                go("struktura-sesii-stvorennia-sprav/", "#avtomatychnyi-henerator-sprav")
                page.evaluate("scrollBy(0, -160)")
                shot("d5-struktura-sesii")
                go("podorozhi-ta-vypadkovi-podii/", "#avtomatychnyi-henerator-podorozhei")
                page.evaluate("scrollBy(0, -160)")
                shot("d5-podorozhi")
                go("", "#dodatkovi-materialy")
                shot("d6-home-dodatkovi")
                ctx.close()
        br.close()
    print("ok:", len([f for f in os.listdir(OUT) if f.startswith("d")]), "d-shots in", OUT)


if __name__ == "__main__":
    main()
