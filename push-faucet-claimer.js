#!/usr/bin/env node

/**
 * Push Chain Faucet Auto-Claimer
 * Automatically claims testnet PC tokens with 2captcha support
 */

const { chromium } = require('playwright');
const axios = require('axios');

class FaucetClaimer {
  constructor(config) {
    this.config = config;
    this.browser = null;
    this.page = null;
  }

  async init() {
    console.log('🚀 Initializing faucet claimer...');
    this.browser = await chromium.launch({
      headless: false, // Show browser for debugging
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    
    this.page = await context.newPage();
    console.log('✅ Browser initialized');
  }

  async solveCaptcha(sitekey, pageUrl) {
    if (!this.config.captchaApiKey) {
      throw new Error('2captcha API key not configured');
    }

    console.log('🔐 Solving captcha with 2captcha...');
    
    // Submit captcha to 2captcha
    const submitUrl = `https://2captcha.com/in.php?key=${this.config.captchaApiKey}&method=userrecaptcha&googlekey=${sitekey}&pageurl=${pageUrl}&json=1`;
    const submitRes = await axios.get(submitUrl);
    
    if (submitRes.data.status !== 1) {
      throw new Error(`2captcha submit failed: ${submitRes.data.request}`);
    }
    
    const captchaId = submitRes.data.request;
    console.log(`📝 Captcha ID: ${captchaId}`);
    
    // Poll for solution (max 2 minutes)
    for (let i = 0; i < 24; i++) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5s
      
      const resultUrl = `https://2captcha.com/res.php?key=${this.config.captchaApiKey}&action=get&id=${captchaId}&json=1`;
      const resultRes = await axios.get(resultUrl);
      
      if (resultRes.data.status === 1) {
        console.log('✅ Captcha solved!');
        return resultRes.data.request;
      }
      
      if (resultRes.data.request !== 'CAPCHA_NOT_READY') {
        throw new Error(`2captcha error: ${resultRes.data.request}`);
      }
      
      console.log(`⏳ Waiting for captcha solution... (${i + 1}/24)`);
    }
    
    throw new Error('Captcha solving timeout');
  }

  async claimFaucet(walletAddress) {
    try {
      console.log(`\n💧 Claiming faucet for ${walletAddress}...`);
      
      // Navigate to faucet
      await this.page.goto('https://faucet.push.org/', { waitUntil: 'networkidle' });
      console.log('📍 Loaded faucet page');
      
      // Take screenshot for debugging
      await this.page.screenshot({ path: '/root/.openclaw/workspace/scripts/screenshots/faucet-1-loaded.png' });
      
      // Wait for page to fully load
      await this.page.waitForTimeout(3000);
      
      // Find wallet input field
      const inputSelector = 'input[type="text"], input[placeholder*="address"], input[placeholder*="wallet"]';
      await this.page.waitForSelector(inputSelector, { timeout: 10000 });
      
      // Fill wallet address
      await this.page.fill(inputSelector, walletAddress);
      console.log('✅ Wallet address filled');
      
      await this.page.screenshot({ path: '/root/.openclaw/workspace/scripts/screenshots/faucet-2-filled.png' });
      
      // Look for reCAPTCHA
      const recaptchaFrame = this.page.frameLocator('iframe[src*="recaptcha"]').first();
      const hasCaptcha = await recaptchaFrame.locator('.g-recaptcha').count() > 0 || 
                         await this.page.locator('.g-recaptcha').count() > 0;
      
      if (hasCaptcha) {
        console.log('🔐 Captcha detected');
        
        // Get sitekey
        const sitekey = await this.page.evaluate(() => {
          const recaptcha = document.querySelector('.g-recaptcha');
          return recaptcha ? recaptcha.getAttribute('data-sitekey') : null;
        });
        
        if (!sitekey) {
          throw new Error('Could not find reCAPTCHA sitekey');
        }
        
        console.log(`🔑 Sitekey: ${sitekey}`);
        
        // Solve captcha
        const captchaToken = await this.solveCaptcha(sitekey, 'https://faucet.push.org/');
        
        // Inject captcha token
        await this.page.evaluate((token) => {
          document.getElementById('g-recaptcha-response').innerHTML = token;
        }, captchaToken);
        
        console.log('✅ Captcha token injected');
      } else {
        console.log('ℹ️ No captcha detected');
      }
      
      await this.page.screenshot({ path: '/root/.openclaw/workspace/scripts/screenshots/faucet-3-captcha.png' });
      
      // Find and click claim button
      const buttonSelectors = [
        'button:has-text("Claim")',
        'button:has-text("Request")',
        'button:has-text("Get")',
        'button[type="submit"]',
        'input[type="submit"]'
      ];
      
      let clicked = false;
      for (const selector of buttonSelectors) {
        try {
          const button = this.page.locator(selector).first();
          if (await button.count() > 0) {
            await button.click();
            console.log(`✅ Clicked button: ${selector}`);
            clicked = true;
            break;
          }
        } catch (e) {
          // Try next selector
        }
      }
      
      if (!clicked) {
        throw new Error('Could not find claim button');
      }
      
      // Wait for response
      await this.page.waitForTimeout(5000);
      
      await this.page.screenshot({ path: '/root/.openclaw/workspace/scripts/screenshots/faucet-4-claimed.png' });
      
      // Check for success message
      const successSelectors = [
        'text=success',
        'text=claimed',
        'text=sent',
        'text=transaction',
        '.success',
        '.alert-success'
      ];
      
      let success = false;
      for (const selector of successSelectors) {
        try {
          const element = this.page.locator(selector).first();
          if (await element.count() > 0) {
            const text = await element.textContent();
            console.log(`✅ Success message: ${text}`);
            success = true;
            break;
          }
        } catch (e) {
          // Try next selector
        }
      }
      
      if (success) {
        console.log('🎉 Faucet claim successful!');
        return { success: true, message: 'Claimed successfully' };
      } else {
        console.log('⚠️ Could not verify success, check screenshots');
        return { success: false, message: 'Could not verify claim' };
      }
      
    } catch (error) {
      console.error('❌ Faucet claim failed:', error.message);
      
      // Take error screenshot
      try {
        await this.page.screenshot({ path: '/root/.openclaw/workspace/scripts/screenshots/faucet-error.png' });
      } catch (e) {
        // Ignore screenshot error
      }
      
      return { success: false, error: error.message };
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      console.log('🔒 Browser closed');
    }
  }
}

// CLI usage
async function main() {
  const walletAddress = process.argv[2];
  const captchaApiKey = process.argv[3];
  
  if (!walletAddress) {
    console.error('Usage: node push-faucet-claimer.js <wallet-address> [2captcha-api-key]');
    process.exit(1);
  }
  
  const claimer = new FaucetClaimer({
    captchaApiKey: captchaApiKey || process.env.CAPTCHA_API_KEY
  });
  
  try {
    await claimer.init();
    const result = await claimer.claimFaucet(walletAddress);
    
    console.log('\n📊 Result:', result);
    
    if (result.success) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  } finally {
    await claimer.close();
  }
}

if (require.main === module) {
  main();
}

module.exports = FaucetClaimer;
