import os
import pathlib

from playwright.sync_api import sync_playwright

SKIP_HEADERS = {"cookie"}
API_HOSTS = ("api.mercari.jp", "api.mercari-shops.jp")
JS_MARKERS = ("_next/static/chunks/",)

def on_request(request):
    if any(marker in request.url for marker in JS_MARKERS):
        print("JS", request.url)
    if not any(host in request.url for host in API_HOSTS):
        return
    print("\n== REQUEST ==")
    print("METHOD", request.method)
    print("URL", request.url)
    for key, value in request.headers.items():
        if value:
            shown = "<redacted>" if key.lower() in SKIP_HEADERS else value[:600]
            print(f"H {key}: {shown}")
    try:
        payload = request.post_data
        print("BODY", payload[:4000] if payload else None)
    except Exception as exc:
        print("BODY_ERROR", repr(exc))

def on_response(response):
    request_url = response.url
    if any(marker in request_url for marker in JS_MARKERS):
        save_dir = os.environ.get("MERCARI_SAVE_JS")
        if save_dir:
            pathlib.Path(save_dir).mkdir(parents=True, exist_ok=True)
            name = request_url.rsplit("/", 1)[-1].split("?", 1)[0]
            (pathlib.Path(save_dir) / name).write_bytes(response.body())
    if not any(host in request_url for host in API_HOSTS):
        return
    content_type = response.headers.get("content-type", "")
    print("\n== RESPONSE ==")
    print("STATUS", response.status)
    print("URL", request_url)
    if "json" not in content_type:
        return
    try:
        body = response.json()
        text = str(body)
        print("JSON", text[:10000])
    except Exception as exc:
        print("JSON_ERROR", repr(exc))

target_url = os.environ.get("MERCARI_PROBE_URL", "https://jp.mercari.com/search?keyword=iPhone")
print("== TARGET ==")
print(target_url)

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, channel="chrome")
    context = browser.new_context(
        locale="ja-JP",
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
        viewport={"width": 1366, "height": 900},
    )
    page = context.new_page()
    page.on("request", on_request)
    page.on("response", on_response)
    page.goto(target_url, wait_until="domcontentloaded")
    try:
        page.wait_for_load_state("networkidle", timeout=15000)
    except Exception as exc:
        print("WAIT_ERROR", repr(exc))
    context.close()
    browser.close()
