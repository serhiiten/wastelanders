"""Screenshots for the plan's evidence (stage 3): the rules' home, a rule page, a tool page, the 404, light and dark,
1366×768 and 375×812.

    F:/Claude/pustelnyky-venv/Scripts/python.exe site/tests/shots.py <out folder> [http://localhost:8800]
"""
import os
import sys

os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "F:/Claude/pustelnyky-venv/browsers")
from playwright.sync_api import sync_playwright  # noqa: E402

OUT = sys.argv[1]
BASE = (sys.argv[2] if len(sys.argv) > 2 else "http://localhost:8800").rstrip("/") + "/wastelanders/rules/"
SHOTS = [("home", ""), ("rule", "robymo-perevirky/"), ("tool", "heneratory-natkhnennia/"),
         ("callouts", "aspekty-personazhiv-hravtsiv/"), ("anchor", "vydovi-osoblyvosti/#kiborh"), ("404", "no-such-page/")]


def main():
    os.makedirs(OUT, exist_ok=True)
    with sync_playwright() as p:
        br = p.chromium.launch()
        for theme in ("light", "dark"):
            for w, h in ((1366, 768), (375, 812)):
                ctx = br.new_context(viewport={"width": w, "height": h}, device_scale_factor=1)
                ctx.add_init_script(f"try{{localStorage.setItem('pustelnyky-theme','{theme}')}}catch(e){{}}")
                page = ctx.new_page()
                for name, path in SHOTS:
                    if theme == "dark" and name not in ("home", "rule"):
                        continue
                    page.goto(BASE + path)
                    page.wait_for_load_state("networkidle")
                    page.wait_for_timeout(300)
                    page.screenshot(path=os.path.join(OUT, f"{name}-{w}-{theme}.png"))
                if theme == "light":
                    page.goto(BASE + "robymo-perevirky/")
                    page.wait_for_load_state("networkidle")
                    page.fill(".pagefind-ui__search-input", "перевір")
                    page.wait_for_selector(".pagefind-ui__result-link")
                    page.wait_for_timeout(600)
                    page.screenshot(path=os.path.join(OUT, f"search-{w}-light.png"))
                    page.goto(BASE)
                    page.wait_for_load_state("networkidle")
                    page.keyboard.press("Tab")
                    for _ in range(40):
                        if page.evaluate("document.activeElement.classList.contains('mi')"):
                            break
                        page.keyboard.press("Tab")
                    page.locator("a.mi").nth(2).hover()
                    page.screenshot(path=os.path.join(OUT, f"menu-focus-hover-{w}-light.png"))
                ctx.close()
        br.close()
    print("ok:", len(os.listdir(OUT)), "shots in", OUT)


if __name__ == "__main__":
    main()
