import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox"])
        page = await browser.new_page()
        
        errors = []
        all_logs = []
        api_responses = []
        page.on("console", lambda msg: all_logs.append(f"[{msg.type}] {msg.text}"))
        page.on("pageerror", lambda err: errors.append(f"[PAGE_ERROR] {err}"))
        async def on_response(resp):
            if "/api/" in resp.url:
                body = await resp.text()
                api_responses.append({
                    "url": resp.url,
                    "status": resp.status,
                    "body": body[:3000],
                })
        page.on("response", on_response)
        
        await page.goto("http://localhost:3000/study", wait_until="load", timeout=30000)
        await page.wait_for_timeout(3000)
        
        print("[1] Signing in...")
        await page.evaluate('window.__signIn("ganzaowen23@gmail.com", "Test123!")')
        await page.wait_for_timeout(15000)
        
        print("[2] Checking page state...")
        html = await page.evaluate("document.body.innerHTML")
        clean = html.encode("ascii", "replace").decode("ascii")
        
        # Check for specific states
        states = []
        if "Verifying account" in clean:
            states.append("Verifying account (authLoading)")
        if "Compiling Study Schedule" in clean:
            states.append("Compiling Study Schedule (appLoading)")
        if "SIGN IN WITH GOOGLE" in clean:
            states.append("Login screen (not signed in)")
        if "Python Programming" in clean:
            states.append("Course: Python Programming for Beginners")
        if "Start Learning" in clean:
            states.append("Start Learning button present")
        if "Setup and Syntax" in clean:
            states.append("Lesson: Setup and Syntax found")
        if "learner-syllabus-view" in clean:
            states.append("Syllabus view present")
        if "my-course-card-" in clean:
            states.append("Enrolled course cards present")
        if "course-card-" in clean:
            states.append("Featured course cards present")
        if "learner-dashboard" in clean or "LearnerDashboard" in clean:
            states.append("Dashboard component present")
            
        # Find all card IDs
        card_ids = await page.evaluate("""
            () => {
                const cards = document.querySelectorAll('[id^=\"my-course-card-\"], [id^=\"course-card-\"]');
                return Array.from(cards).map(c => c.id);
            }
        """)
        if card_ids:
            states.append(f"Card IDs: {card_ids}")
            
        print(f"[STATE] {' | '.join(states) if states else 'Unknown state'}")
        # Find and print the course cards section
        idx = clean.find('Featured')
        if idx > 0:
            print(f"\n[HTML course cards section]: ...{clean[idx-100:idx+1500]}...")
        print(f"\n[HTML end 300]: {clean[-300:]}")
        # Print the FULL first courses API response
        print("\n[Full courses API response body]:")
        for r in api_responses:
            if '/api/courses' in r['url']:
                # Count how many course IDs appear
                id_count = r['body'].count('"id":')
                print(f"  Found {id_count} course objects, first 1500 chars:")
                print(f"  {r['body'][:1500]}")
                break
        print("\n[API responses summary]:")
        for r in api_responses:
            status = f"[{r['status']}]"
            url_short = r['url'].replace('http://localhost:3000', '')
            if '/api/enrollments' in r['url']:
                try:
                    import json
                    enroll_data = json.loads(r['body'])
                    print(f"  {status} {url_short} -> {enroll_data}")
                except:
                    print(f"  {status} {url_short}")
            elif '/api/courses' in r['url']:
                print(f"  {status} {url_short} -> {id_count} courses")
            else:
                print(f"  {status} {url_short}")

        # Check SW status
        print("\n[SW status]:")
        sw_status = await page.evaluate("""() => {
            if (!navigator.serviceWorker) return 'NO_SW_SUPPORT';
            return navigator.serviceWorker.getRegistration().then(reg => {
                if (!reg) return 'NO_REGISTRATION';
                return JSON.stringify({
                    scope: reg.scope,
                    active: !!reg.active,
                    state: reg.active?.state || 'none',
                    scriptURL: reg.active?.scriptURL || 'none',
                });
            });
        }""")
        print(f"  {sw_status}")

        # Direct React fiber inspection to get actual courses prop and states
        print("\n[React fiber inspection]:")
        fiber_debug = await page.evaluate("""() => {
            // Find the root fiber
            const rootEl = document.getElementById('learner-dashboard');
            if (!rootEl) return 'NO_LEARNER_DASHBOARD';
            
            // Get React fiber key
            const fiberKey = Object.keys(rootEl).find(k => k.startsWith('__reactFiber$'));
            if (!fiberKey) return 'NO_REACT_FIBER';
            
            // Walk up the fiber tree to find the LearnerDashboard component
            let fiber = rootEl[fiberKey];
            let attempts = 0;
            while (fiber && attempts < 50) {
                // Look for memoizedState that contains useState hooks
                if (fiber.memoizedState) {
                    // We're looking for the enrolledCourseIds state (useState<number[]>([]))
                    // The hooks are stored as a linked list: memoizedState -> next
                    let hook = fiber.memoizedState;
                    let hookIndex = 0;
                    while (hook && hookIndex < 15) {
                        if (hook.memoizedState && Array.isArray(hook.memoizedState) && hook.memoizedState.length <= 5) {
                            // Found an array state - could be enrolledCourseIds or other
                            // Let's log it
                        }
                        hook = hook.next;
                        hookIndex++;
                    }
                    
                    // Check if this fiber has the courses from props
                    if (fiber.memoizedProps && fiber.memoizedProps.courses) {
                        const courses = fiber.memoizedProps.courses;
                        return JSON.stringify({
                            componentType: fiber.type?.name || fiber.type?.displayName || 'unknown',
                            coursesCount: courses.length,
                            courseIds: courses.map(c => c.id),
                            coursesTitleSample: courses.slice(0,3).map(c => c.title?.substring(0,30)),
                        });
                    }
                    
                    // Also check pendingProps
                    if (fiber.pendingProps && fiber.pendingProps.courses) {
                        const courses = fiber.pendingProps.courses;
                        return JSON.stringify({
                            componentType: fiber.type?.name || 'unknown',
                            fromPending: true,
                            coursesCount: courses.length,
                            courseIds: courses.map(c => c.id),
                        });
                    }
                }
                fiber = fiber.return;
                attempts++;
            }
            return 'NOT_FOUND';
        }""")
        print(f"  {fiber_debug}")
        print("\n[ALL console logs]:")
        for e in all_logs:
            if '[setCourses]' in e or '[loadAppData]' in e or '[PouchDB' in e or '[LearnerDashboard' in e or '[error]' in e.lower() or 'warn' in e.lower():
                print(f"  {e}")
        print(f"\n[Total log entries]: {len(all_logs)}")
        
        await page.screenshot(path="e2e-debug-state.png")
        print("\n[Screenshot saved]")
        await browser.close()

asyncio.run(main())
