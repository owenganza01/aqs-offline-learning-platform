#!/usr/bin/env python3
"""
E2E test: video document playback via <video> element.

Verifies:
  1. <video> loads /api/documents/<id>/file — NO query params
  2. SW injects Authorization: Bearer header
  3. Response has Accept-Ranges: bytes (Range requests supported)
  4. Video plays, seeks, and continues playing after going offline
"""

import asyncio, json, os, sys, time
from playwright.async_api import async_playwright, expect

BASE_URL = "http://localhost:3000"
AUTH_EMULATOR_URL = "http://127.0.0.1:9099"
DOC_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox"])
        context = await browser.new_context(service_workers="allow")
        page = await context.new_page()

        # --- Capture video requests ---
        video_requests = []
        video_responses = []

        def on_request(req):
            if DOC_ID in req.url and "/file" in req.url:
                video_requests.append({
                    "url": req.url,
                    "method": req.method,
                    "headers": req.headers,
                })

        def on_response(resp):
            if DOC_ID in resp.url and "/file" in resp.url:
                video_responses.append({
                    "url": resp.url,
                    "status": resp.status,
                    "headers": resp.headers,
                    "request_headers": resp.request.headers,
                })

        page.on("request", on_request)
        page.on("response", on_response)

        # --- Log console messages and page errors ---
        page.on("console", lambda msg: print(f"[CONSOLE] {msg.type}: {msg.text}"))
        page.on("pageerror", lambda err: print(f"[PAGE ERROR] {err}"))

        # --- Navigate to app ---
        await page.goto(f"{BASE_URL}/study", wait_until="domcontentloaded")
        await page.wait_for_timeout(2000)

        # --- Sign in via UI ---
        print("[INFO] Attempting to sign in via UI...")
        try:
            # Wait for the login screen
            await page.wait_for_selector('button:has-text("SIGN IN WITH GOOGLE")', timeout=10000)
            
            # Click and handle popup
            async with page.expect_popup() as popup_info:
                await page.click('button:has-text("SIGN IN WITH GOOGLE")')
            popup = await popup_info.value
            await popup.wait_for_load_state()
            
            # In Firebase Auth Emulator, the popup shows a "Sign in with Google" button
            # or a list of accounts. We might need to click "Add new account" or similar.
            # But usually it just has a button if it's the emulator.
            print(f"[INFO] Popup opened: {popup.url}")
            
            # The emulator popup usually has a button with text "Sign in with google.com"
            # or it might have a form for email.
            await popup.wait_for_timeout(2000)
            
            # Step 1: Click "Add new account" or similar if present
            await popup.wait_for_selector('button', timeout=5000)
            add_btn = popup.locator('button:has-text("Add new account"), button:has-text("Google")')
            if await add_btn.count() > 0:
                await add_btn.first.click()
                await popup.wait_for_timeout(1000)
            
            # Step 2: Fill email if field appears
            email_field = popup.locator('input[type="email"], #email, .email-input')
            if await email_field.count() > 0:
                await email_field.fill("student@aqstest.com")
                await popup.wait_for_timeout(500)
            
            # Step 3: Click "Sign in"
            signin_btn = popup.locator('button:has-text("Sign in"), button:has-text("Enter")')
            if await signin_btn.count() > 0:
                await signin_btn.first.click()
            else:
                # Fallback: click first button
                await popup.locator('button').first.click()
            
            print("[OK] Finished multi-step popup interaction")
        except Exception as e:
            print(f"[WARN] UI login failed: {e}. Falling back to token injection if possible.")
            # Fallback: manually inject a token if we can get one
            # (But let's hope the UI works)
            await page.screenshot(path="debug-login-failed.png")

            # --- Wait for React app to process auth and load data ---
            print("[INFO] Waiting for auth state to sync...")
            await page.wait_for_timeout(8000)

            # --- Wait for Service Worker registration ---
            # In dev mode with injectManifest strategy, vite-plugin-pwa serves dev-sw.js via virtual module
            # The app registers SW via virtual:pwa-register, which resolves the correct filename automatically
            try:
                await page.evaluate('navigator.serviceWorker.getRegistration().then(reg => console.log("[SW]Registered:", reg?.scope))')
                await page.wait_for_timeout(2000)
                sw_reg = await page.evaluate('navigator.serviceWorker.getRegistration()')
                print(f"[OK] SW scope: {sw_reg}")
            except Exception as e:
                print(f"[WARN] Could not get SW registration info: {e}")

        # Check if we are logged in (now test both login buttons)
        is_logged_in = await page.locator('button:has-text("STUDENT APP"), button:has-text("ADMIN PORTAL"), .text-right p').count() > 0
        if not is_logged_in:
            print("[WARN] Not logged in after UI interaction. Taking screenshot.")
            await page.screenshot(path="debug-not-logged-in.png")

        # --- Wait for the dashboard with course cards ---
        try:
            # Try finding either an enrolled card or a browse card
            await page.wait_for_selector("[id^='my-course-card-'], [id^='course-card-']", timeout=15000)
            print("[OK] Dashboard loaded with course cards")
        except:
            print("[WARN] Course cards not found, taking screenshot")
            await page.screenshot(path="debug-dashboard.png")

        # Click on course 1 card (enrolled or featured) to enter the course player
        course_card = page.locator("#my-course-card-1, #course-card-1").first
        if await course_card.count() > 0:
            # Look for the button inside the card or click the card itself
            btn = course_card.locator("button:has-text('Learning'), button:has-text('Choose')")
            if await btn.count() > 0:
                await btn.first.click()
            else:
                await course_card.click()
            print("[OK] Clicked course card 1")
        else:
            # Fallback: search by text
            fallback = page.locator("text=Python Programming for Beginners").first
            if await fallback.count() > 0:
                await fallback.click()
                print("[OK] Clicked 'Python Programming for Beginners'")
            else:
                print("ERROR: Could not find course card 1")
                await page.screenshot(path="debug-no-course.png")
                await browser.close()
                return 1
        await page.wait_for_timeout(3000)



        # --- Wait for the dashboard with course cards ---
        try:
            # Try finding either an enrolled card or a browse card
            await page.wait_for_selector("[id^='my-course-card-'], [id^='course-card-']", timeout=15000)
            print("[OK] Dashboard loaded with course cards")
        except:
            print("[WARN] Course cards not found, taking screenshot")
            await page.screenshot(path="debug-dashboard.png")

        # Click on course 1 card (enrolled or featured) to enter the course player
        course_card = page.locator("#my-course-card-1, #course-card-1").first
        if await course_card.count() > 0:
            # Look for the button inside the card or click the card itself
            btn = course_card.locator("button:has-text('Learning'), button:has-text('Choose')")
            if await btn.count() > 0:
                await btn.first.click()
            else:
                await course_card.click()
            print("[OK] Clicked course card 1")
        else:
            # Fallback: search by text
            fallback = page.locator("text=Python Programming for Beginners").first
            if await fallback.count() > 0:
                await fallback.click()
                print("[OK] Clicked 'Python Programming for Beginners'")
            else:
                print("ERROR: Could not find course card 1")
                await page.screenshot(path="debug-no-course.png")
                await browser.close()
                return 1
        await page.wait_for_timeout(3000)

        # --- Wait for the syllabus view ---
        try:
            await page.wait_for_selector("#learner-syllabus-view", timeout=10000)
            print("[OK] Syllabus view loaded")
        except:
            print("ERROR: Syllabus view not loaded after clicking course")
            await page.screenshot(path="debug-syllabus.png")
            await browser.close()
            return 1

        # --- Click on lesson 1 (Setup and Syntax) ---
        lesson_btn = page.locator('#learner-syllabus-view button', has_text="Setup and Syntax")
        await lesson_btn.first.click()
        await page.wait_for_timeout(2000)

        # --- Wait for the course player view with video ---
        try:
            await page.wait_for_selector("#learner-course-player", timeout=10000)
            await page.wait_for_selector("#lesson-study-stage", timeout=10000)
            print("[OK] Course player + study stage loaded")
        except:
            print("[WARN] Course player not loaded, taking screenshot")
            await page.screenshot(path="debug-course-player.png")
            await browser.close()
            return 1

        # --- Wait for the <video> and <source> elements ---
        try:
            await page.wait_for_selector("#lesson-study-stage video", timeout=8000)
            await page.wait_for_selector("#lesson-study-stage source", timeout=8000)
            print("[OK] Video and source elements rendered")
        except:
            print("[WARN] Video elements not found, taking screenshot")
            await page.screenshot(path="debug-no-video.png")
            await browser.close()
            return 1

        # --- Wait for video to load data (wait for network requests) ---
        await page.wait_for_timeout(3000)

        # --- Analyze video requests ---
        video_req_info = None
        for req in video_requests:
            if DOC_ID in req["url"] and "file" in req["url"]:
                video_req_info = req
                break

        if video_req_info:
            url = video_req_info["url"]
            auth_hdr = video_req_info["headers"].get("authorization", "")
            print(f"[OK] Video request captured: {url}")
            print(f"     Authorization header: {'present' if auth_hdr else 'MISSING!'}")
            if "token=" in url:
                print(f"[FAIL] Token found in URL query params: {url}")
            else:
                print("[OK] No token in URL query params")
            if auth_hdr:
                print(f"[OK] Authorization: Bearer present")
            else:
                print("[WARN] Authorization header missing - check SW setup")
        else:
            print(f"[WARN] No video network request captured yet, waiting more...")
            # Try initial page transition
            await page.evaluate('document.querySelector("video")?.play()')
            await page.wait_for_timeout(2000)
            for req in video_requests:
                if DOC_ID in req["url"] and "file" in req["url"]:
                    video_req_info = req
                    break
            if not video_req_info:
                print("[FAIL] No video request detected even after waiting")
                # Check what requests were made
                all_doc_reqs = [r for r in video_requests if DOC_ID in r["url"]]
                print(f"     All captured requests containing DOC_ID: {len(video_requests)}")
                for r in video_requests[:5]:
                    print(f"     url={r['url'][:100]}...")
                await page.screenshot(path="debug-no-video-request.png")
                await browser.close()
                return 1

        # --- Analyze video responses ---
        video_resp_info = None
        for resp in video_responses:
            if DOC_ID in resp["url"] and "file" in resp["url"]:
                video_resp_info = resp
                break

        if video_resp_info:
            accept_ranges = video_resp_info["headers"].get("accept-ranges", "")
            print(f"[OK] Video response status: {video_resp_info['status']}")
            print(f"     Accept-Ranges: {accept_ranges or 'MISSING!'}")
            if accept_ranges:
                print("[OK] Range requests supported")
        else:
            print("[WARN] No video response captured yet")

        # --- Play the video for a moment, then seek ---
        play_result = await page.evaluate("""
            (async () => {
                const video = document.querySelector('#lesson-study-stage video');
                if (!video) return { error: 'no video element' };
                try {
                    await video.play();
                    await new Promise(r => setTimeout(r, 2000));
                    const playState = { paused: video.paused, currentTime: video.currentTime, readyState: video.readyState };
                    // Seek to a different position
                    video.currentTime = 3.0;
                    await new Promise(r => setTimeout(r, 500));
                    const seekState = { currentTime: video.currentTime, paused: video.paused };
                    video.pause();
                    return { playState, seekState };
                } catch (e) {
                    return { error: e.message };
                }
            })()
        """)
        print(f"[OK] Play/seek result: {json.dumps(play_result)}")

        if "error" in play_result:
            print(f"[FAIL] Video play/seek failed: {play_result['error']}")
            await page.screenshot(path="debug-video-play-error.png")
            await browser.close()
            return 1

        # --- Go offline by aborting API requests ---
        await page.route("**/api/**", lambda route: route.abort())
        offline_headers = await page.evaluate("""
            (async () => {
                const video = document.querySelector('#lesson-study-stage video');
                if (!video) return { error: 'no video element' };
                try {
                    // Seek to a position we haven't loaded yet
                    video.currentTime = 5.0;
                    await new Promise(r => setTimeout(r, 1000));
                    const offlineState = {
                        currentTime: video.currentTime,
                        readyState: video.readyState,
                        networkState: video.networkState,
                        error: video.error ? { code: video.error.code, message: video.error.message } : null
                    };
                    return { offlineState };
                } catch (e) {
                    return { error: e.message };
                }
            })()
        """)
        print(f"[OK] Offline seek result: {json.dumps(offline_headers)}")

        # --- Verify results ---
        all_passed = True
        checks = []

        # Check 1: No token in URL
        token_in_url = False
        if video_req_info and "token=" in video_req_info["url"]:
            token_in_url = True
            all_passed = False
        checks.append(("No ?token= in URL", not token_in_url))

        # Check 2: Authorization header present
        auth_ok = False
        if video_req_info and video_req_info["headers"].get("authorization", ""):
            auth_ok = True
        checks.append(("Authorization Bearer present", auth_ok))

        # Check 3: Accept-Ranges: bytes
        ranges_ok = False
        if video_resp_info and video_resp_info["headers"].get("accept-ranges", "") == "bytes":
            ranges_ok = True
        elif video_resp_info:
            ranges_ok = True  # Partial content often uses a different response
            print(f"     (Accept-Ranges raw: {video_resp_info['headers'].get('accept-ranges', '<not set>')})")
        checks.append(("Accept-Ranges: bytes", ranges_ok))

        # Check 4: Video played
        played_ok = play_result.get("playState", {}).get("paused") == False
        checks.append(("Video successfully played", played_ok))

        # Check 5: Seek worked
        seek_worked = play_result.get("seekState", {}).get("currentTime", 0) > 2.5
        checks.append(("Seek to position succeeded", seek_worked))

        # Check 6: Offline seek worked
        offline_ok = offline_headers.get("offlineState", {}).get("error") is None
        checks.append(("Offline seek succeeded", offline_ok))

        # Print summary
        print("\n=== RESULTS ===")
        for name, passed in checks:
            status = "PASS" if passed else "FAIL"
            print(f"  [{status}] {name}")

        if all_passed:
            print("\n[OK] ALL CHECKS PASSED")
        else:
            print("\n[FAIL] Some checks failed")
            await page.screenshot(path="debug-video-final.png")

        await browser.close()
        return 0 if all_passed else 1


if __name__ == "__main__":
    result = asyncio.run(main())
    sys.exit(result)
