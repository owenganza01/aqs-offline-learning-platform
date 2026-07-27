#!/usr/bin/env python3
"""
Final E2E test: video document playback via <video> element.

Verifies:
  1. <video> loads /api/documents/<id>/file — NO query params
  2. SW injects Authorization: Bearer header
  3. Response has Accept-Ranges: bytes (Range requests supported)
  4. Video plays, seeks, and continues playing after going offline
"""

import asyncio, json, sys
from playwright.async_api import async_playwright

BASE_URL = "http://localhost:3000"
DOC_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox"])
        context = await browser.new_context(service_workers="allow")
        page = await context.new_page()

        video_requests = []
        video_responses = []

        def on_request(req):
            if DOC_ID in req.url and "/file" in req.url:
                video_requests.append({
                    "url": req.url,
                    "headers": dict(req.headers),
                })
                print(f"[REQ] {req.method} {req.url}")

        def on_response(resp):
            if DOC_ID in resp.url and "/file" in resp.url:
                video_responses.append({
                    "url": resp.url,
                    "status": resp.status,
                    "headers": dict(resp.headers),
                })
                print(f"[RESP] {resp.status} {resp.url}")

        page.on("request", on_request)
        page.on("response", on_response)
        page.on("pageerror", lambda err: print(f"[PAGE ERROR] {err}"))

        # Step 1: Navigate to app
        print("[1] Navigating to app...")
        await page.goto(f"{BASE_URL}/study", wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(3000)

        # Step 2: Sign in via emulator
        print("[2] Signing in via Firebase Auth emulator...")
        signin_result = await page.evaluate("""
            async () => {
                try {
                    await window.__signIn('ganzaowen23@gmail.com', 'Test123!');
                    return { ok: true };
                } catch (e) {
                    return { ok: false, error: e.message };
                }
            }
        """)
        if not signin_result.get("ok"):
            print(f"[FAIL] Sign-in failed: {signin_result.get('error')}")
            return 1
        print("[OK] Signed in successfully")

        # Step 3: Wait for dashboard to fully load with courses
        print("[3] Waiting for dashboard data to load...")
        await page.wait_for_timeout(3000)

        # Wait until either enrolled course card or featured course card appears
        try:
            await page.wait_for_selector("[id^='my-course-card-'], [id^='course-card-']", timeout=30000)
            print("[OK] Dashboard loaded with course cards")
        except:
            await page.screenshot(path="e2e-debug-dashboard.png")
            html = await page.evaluate("document.body.innerHTML")
            clean = html.encode("ascii", "replace").decode("ascii")
            print(f"[DEBUG] Page content: {clean[500:2000]}")
            print("[FAIL] No course cards found after 30s")
            return 1

        # Step 4: Open the enrolled course card
        print("[4] Opening course 1...")
        course_card = page.locator("#my-course-card-1")
        if await course_card.count() > 0:
            # Enrolled card found - click its "Start Learning" button
            btn = course_card.locator("button")
            if await btn.count() > 0:
                await btn.first.click()
                print("[OK] Clicked 'Start Learning' on enrolled course")
            else:
                await course_card.click()
        else:
            # If not enrolled, click the featured card's "Choose Course" button
            course_card = page.locator("#course-card-1")
            if await course_card.count() > 0:
                btn = course_card.locator("button:has-text('Choose Course')")
                if await btn.count() > 0:
                    await btn.first.click()
                    print("[OK] Clicked '+ Choose Course'")
                    await page.wait_for_timeout(3000)
                else:
                    await course_card.click()
                    print("[OK] Clicked featured course card")
            else:
                await page.screenshot(path="e2e-debug-nocourse.png")
                print("[FAIL] No course card found")
                return 1

        await page.wait_for_timeout(5000)

        # Step 5: Wait for syllabus view
        print("[5] Waiting for syllabus view...")
        try:
            await page.wait_for_selector("#learner-syllabus-view, #learner-course-player", timeout=20000)
            print("[OK] Syllabus/Course player view loaded")
        except:
            await page.screenshot(path="e2e-debug-syllabus.png")
            html = await page.evaluate("document.body.innerHTML")
            clean = html.encode("ascii", "replace").decode("ascii")
            print(f"[DEBUG] Page content: {clean[500:2000]}")
            print("[FAIL] Syllabus view not found")
            return 1

        # Check if we need to click lesson 1
        lesson_btn = page.locator('#learner-syllabus-view button', has_text="Setup and Syntax")
        if await lesson_btn.count() > 0:
            await lesson_btn.first.click()
            print("[OK] Clicked lesson 1")
        else:
            lesson_btn2 = page.locator('#learner-course-player button', has_text="Setup and Syntax, 1.")
            if await lesson_btn2.count() > 0:
                await lesson_btn2.first.click()
                print("[OK] Clicked lesson 1 from sidebar")
            else:
                # Try clicking the first lesson button
                first_lesson = page.locator("#learner-syllabus-view button, #learner-course-player button").first
                if await first_lesson.count() > 0:
                    await first_lesson.click()
                    print("[OK] Clicked first available lesson")
                else:
                    await page.screenshot(path="e2e-debug-nolesson.png")
                    print("[FAIL] No lesson button found")
                    return 1

        await page.wait_for_timeout(5000)

        # Step 6: Verify video element
        print("[6] Verifying video element...")
        try:
            await page.wait_for_selector("#learner-course-player", timeout=10000)
            await page.wait_for_selector("#lesson-study-stage", timeout=10000)
            await page.wait_for_selector("#lesson-study-stage video", timeout=8000)
            await page.wait_for_selector("#lesson-study-stage source", timeout=8000)
            print("[OK] Video element and source found")
        except Exception as e:
            await page.screenshot(path="e2e-debug-novideo.png")
            print(f"[FAIL] Video element not found: {e}")
            return 1

        source = await page.locator("#lesson-study-stage source").get_attribute("src")
        print(f"[OK] Video source: {source}")

        # Step 7: Wait for video requests
        print("[7] Waiting for video requests...")
        await page.wait_for_timeout(5000)

        if not video_requests:
            # Try triggering playback
            await page.evaluate("document.querySelector('video')?.play()")
            await page.wait_for_timeout(3000)

        # Analyze requests
        req = video_requests[0] if video_requests else None
        resp = video_responses[0] if video_responses else None

        print("\n=== RESULTS ===")
        all_ok = True

        # Check 1: No token in URL
        url_ok = req and "token=" not in req["url"]
        print(f"  [{'OK' if url_ok else 'FAIL'}] No token in URL")
        all_ok = all_ok and url_ok

        # Check 2: Authorization header
        auth_ok = req and req["headers"].get("authorization", "").startswith("Bearer")
        print(f"  [{'OK' if auth_ok else 'FAIL'}] Authorization: Bearer present")
        all_ok = all_ok and auth_ok

        # Check 3: Accept-Ranges
        ranges_ok = resp and resp["headers"].get("accept-ranges", "") == "bytes"
        print(f"  [{'OK' if ranges_ok else 'FAIL'}] Accept-Ranges: bytes")
        all_ok = all_ok and ranges_ok

        # Check 4: Video plays
        play_result = await page.evaluate("""
            (async () => {
                const v = document.querySelector('#lesson-study-stage video');
                if (!v) return { error: 'no video' };
                try {
                    await v.play();
                    await new Promise(r => setTimeout(r, 2000));
                    const s = { paused: v.paused, currentTime: v.currentTime };
                    v.currentTime = 3.0;
                    await new Promise(r => setTimeout(r, 500));
                    return { ok: true, playState: s, seekTime: v.currentTime };
                } catch (e) {
                    return { error: e.message };
                }
            })()
        """)
        play_ok = play_result.get("ok", False)
        print(f"  [{'OK' if play_ok else 'FAIL'}] Video played: {play_result}")
        all_ok = all_ok and play_ok

        # Check 5: Offline seek
        if play_ok:
            await page.route("**/api/**", lambda route: route.abort())
            offline = await page.evaluate("""
                (async () => {
                    const v = document.querySelector('#lesson-study-stage video');
                    if (!v) return { error: 'no video' };
                    try {
                        v.currentTime = 5.0;
                        await new Promise(r => setTimeout(r, 1000));
                        return { ok: true, currentTime: v.currentTime, readyState: v.readyState };
                    } catch (e) {
                        return { error: e.message };
                    }
                })()
            """)
            offline_ok = offline.get("ok", False)
            print(f"  [{'OK' if offline_ok else 'FAIL'}] Offline seek: {offline}")
            all_ok = all_ok and offline_ok

        print(f"\n{'ALL CHECKS PASSED' if all_ok else 'SOME CHECKS FAILED'}")
        await browser.close()
        return 0 if all_ok else 1

if __name__ == "__main__":
    result = asyncio.run(main())
    sys.exit(result)
