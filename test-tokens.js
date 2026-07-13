const puppeteer = require('puppeteer');
const fs = require('fs');

async function getTokens() {
  const browser = await puppeteer.launch({ 
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0', timeout: 30000 });
  
  // Take screenshot to see current state
  await page.screenshot({ path: 'test-screenshot-1.png' });
  
  // Check if login page is shown
  const pageContent = await page.content();
  const hasLoginButton = pageContent.includes('SIGN IN WITH GOOGLE');
  
  console.log('Page has login button:', hasLoginButton);
  console.log('Current URL:', page.url());
  
  // If there's a login button, click it
  if (hasLoginButton) {
    // Wait for popup
    const [popup] = await Promise.all([
      new Promise(resolve => page.once('popup', resolve)),
      page.click('button:has-text("SIGN IN WITH GOOGLE")')
    ]).catch(async () => {
      // Try clicking with evaluate
      await page.evaluate(() => {
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
          if (btn.textContent.includes('SIGN IN WITH GOOGLE')) {
            btn.click();
            break;
          }
        }
      });
      return [null];
    });
    
    if (popup) {
      console.log('Popup opened');
      await popup.waitForLoadState?.() || await new Promise(r => setTimeout(r, 3000));
      await popup.screenshot({ path: 'test-screenshot-popup.png' });
      console.log('Popup URL:', popup.url());
    }
  }
  
  await browser.close();
}

getTokens().catch(console.error);
