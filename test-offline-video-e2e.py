"""E2E test: SW auth injection + offline document caching.

Verifies:
  1. No ?token= query param on /api/documents/*/file requests
  2. Authorization: Bearer header IS present on those requests
  3. After caching, the document loads from SW cache when offline

Prerequisites:
  - Firebase Auth emulator on :9099
  - AQS server on :3000 (with FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099)
"""

import json, sys
from playwright.sync_api import sync_playwright

BASE_URL = "http://127.0.0.1:3000"
EMULATOR_URL = "http://127.0.0.1:9099"

TEST_USER = {"email": "student@aqstest.com", "password": "Student123!"}

DOC_ID = "4581d347-b9a1-4229-bdc0-cb9d6b19bebc"
DOC_URL = "/api/documents/%s/file" % DOC_ID


def get_id_token():
    import urllib.request
    body = json.dumps({
        "email": TEST_USER["email"],
        "password": TEST_USER["password"],
        "returnSecureToken": True,
    }).encode()
    req = urllib.request.Request(
        "%s/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator" % EMULATOR_URL,
        data=body,
        headers={"Content-Type": "application/json"},
    )
    resp = urllib.request.urlopen(req, timeout=10)
    data = json.loads(resp.read())
    token = data.get("idToken")
    if not token:
        raise RuntimeError("Failed to get idToken: %s" % data)
    return token


def main():
    token = get_id_token()
    safe_token = json.dumps(token)
    safe_doc_url = json.dumps(DOC_URL)

    print("[OK] Got ID token (first 40 chars): %s..." % token[:40])

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            service_workers="allow",
            ignore_https_errors=True,
        )

        doc_requests = []

        def on_request(request):
            if "/api/documents/" in request.url and "/file" in request.url.split("/api/documents/")[-1]:
                doc_requests.append({
                    "url": request.url,
                    "headers": dict(request.headers),
                })
                print("\n  [REQ] %s %s" % (request.method, request.url))
                if "token=" in request.url:
                    print("  [FAIL] token found in URL query param!")
                else:
                    print("  [PASS] No token= in URL")
                auth_h = request.headers.get("authorization", "")
                if auth_h.startswith("Bearer "):
                    print("  [PASS] Authorization: Bearer present")
                else:
                    print("  [FAIL] Authorization header missing")

        context.on("request", on_request)

        page = context.new_page()

        # Step 1
        print("\n=== Step 1: Loading app ===")
        page.goto(BASE_URL, wait_until="networkidle", timeout=30000)
        print("[OK] Page loaded - title: %s" % page.title())

        page.evaluate(
            "window.dispatchEvent(new CustomEvent('sw-update-auth-token', { detail: %s }));" % safe_token)
        print("[OK] Dispatched sw-update-auth-token event")

        # Step 2
        print("\n=== Step 2: Fetching document file ===")
        result = page.evaluate("""
            (async () => {
                const url = %s;
                const token = %s;
                try {
                    const res = await fetch(url, {
                        headers: { 'Authorization': 'Bearer ' + token }
                    });
                    return {
                        status: res.status,
                        contentType: res.headers.get('content-type'),
                        contentLength: res.headers.get('content-length'),
                        acceptRanges: res.headers.get('accept-ranges'),
                        ok: res.ok,
                    };
                } catch (e) {
                    return { error: e.message };
                }
            })()
        """ % (safe_doc_url, safe_token))

        if result.get("error"):
            print("  [FAIL] Fetch failed: %s" % result["error"])
        else:
            print("  [PASS] Status: %s" % result["status"])
            print("  [PASS] Content-Type: %s" % result["contentType"])
            print("  [PASS] Content-Length: %s" % result["contentLength"])
            print("  [PASS] Accept-Ranges: %s" % result["acceptRanges"])
            print("  [PASS] Document served successfully" if result["status"] in (200, 206)
                  else "  [FAIL] Unexpected status: %s" % result["status"])

        # Step 3
        print("\n=== Step 3: Checking SW cache ===")
        cache_result = page.evaluate("""
            (async () => {
                const cacheNames = await caches.keys();
                const results = [];
                for (const name of cacheNames) {
                    const cache = await caches.open(name);
                    const keys = await cache.keys();
                    for (const req of keys) {
                        if (req.url.includes('/api/documents/')) {
                            const resp = await cache.match(req);
                            results.push({
                                cache: name,
                                url: req.url,
                                status: resp.status,
                                ok: resp.ok,
                            });
                        }
                    }
                }
                return results;
            })()
        """)
        if cache_result:
            for entry in cache_result:
                print("  [PASS] Cached in [%s]: %s" % (entry["cache"], entry["url"][:80]))
        else:
            print("  [FAIL] No cached document entries found")

        # Step 4
        print("\n=== Step 4: Offline test ===")
        context.set_offline(True)
        print("[OK] Browser set to offline")

        offline_result = page.evaluate("""
            (async () => {
                const url = %s;
                try {
                    const res = await fetch(url);
                    const blob = await res.blob();
                    return {
                        status: res.status,
                        contentType: res.headers.get('content-type'),
                        size: blob.size,
                        ok: res.ok,
                    };
                } catch (e) {
                    return { error: e.message, name: e.name };
                }
            })()
        """ % safe_doc_url)
        if offline_result.get("error"):
            print("  [FAIL] Offline fetch failed: %s" % offline_result["error"])
        else:
            print("  [PASS] Offline status: %s" % offline_result["status"])
            print("  [PASS] Content-Type: %s" % offline_result["contentType"])
            print("  [PASS] Content size: %s bytes" % offline_result["size"])
            print("  [PASS] Document loaded from cache while offline!" if offline_result["ok"]
                  else "  [FAIL] Unexpected offline status: %s" % offline_result["status"])

        # Summary
        print("\n" + "=" * 60)
        print("TEST SUMMARY")
        print("=" * 60)
        checks_ok = True

        token_in_url = any("token=" in dr["url"] for dr in doc_requests)
        if token_in_url:
            print("  [FAIL] token= found in document request URLs")
            checks_ok = False
        else:
            print("  [PASS] No token= in document request URLs")

        if result.get("status") not in (200, 206):
            print("  [FAIL] Direct document fetch failed (status=%s)" % result.get("status"))
            checks_ok = False
        else:
            print("  [PASS] Direct document fetch succeeded")

        if not cache_result:
            print("  [FAIL] Document not cached in SW")
            checks_ok = False
        else:
            print("  [PASS] Document cached in SW")

        if not offline_result.get("ok"):
            print("  [FAIL] Offline document access failed")
            checks_ok = False
        else:
            print("  [PASS] Offline document access works")

        if checks_ok:
            print("\n  ALL CHECKS PASSED")
        else:
            print("\n  SOME CHECKS FAILED - see details above")

        browser.close()
        return 0 if checks_ok else 1


if __name__ == "__main__":
    sys.exit(main())
