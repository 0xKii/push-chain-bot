#!/usr/bin/env node
/**
 * Push Chain Rewards Bot
 * Multi-account automation for daily check-in, quests, and spins
 * Now using .env for configuration (secure!)
 */

require('dotenv').config();
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const PushWalletConnector = require('./push-wallet-connector');
const FaucetClaimer = require('./push-faucet-claimer');

// Config
const STATE_FILE = path.join(__dirname, 'push-bot-state.json');

// API Endpoints
const API = {
  QUESTS_UNICHESS: 'https://us-east1-push-prod-apps.cloudfunctions.net/pushpointsrewardsystem/api/v3/apps/unichess/quests',
  QUESTS_MOLESWAP: 'https://us-east1-push-prod-apps.cloudfunctions.net/pushpointsrewardsystem/api/v3/apps/moleswap/quests',
  QUESTS_BOSS: 'https://us-east1-push-prod-apps.cloudfunctions.net/pushpointsrewardsystem/api/v3/apps/boss-quests/quests',
  AUTH_SESSION: 'https://auth.waap.xyz/api/auth/get-session',
  PORTAL: 'https://portal.push.org/rewards'
};

// Load config from environment variables
function loadConfig() {
  const privateKeys = process.env.PRIVATE_KEYS?.split(',').map(k => k.trim()) || [];
  const accountNames = process.env.ACCOUNT_NAMES?.split(',').map(n => n.trim()) || [];
  const network = process.env.NETWORK || 'TESTNET';
  const captchaApiKey = process.env.CAPTCHA_API_KEY || null;

  if (privateKeys.length === 0 || privateKeys[0] === '') {
    console.error('❌ Error: PRIVATE_KEYS not set in .env file');
    console.log('\n📝 Setup instructions:');
    console.log('1. Copy .env.example to .env:');
    console.log('   cp .env.example .env');
    console.log('2. Edit .env and add your private keys');
    console.log('3. Run the bot again\n');
    process.exit(1);
  }

  // Build accounts array
  const accounts = privateKeys.map((key, index) => ({
    name: accountNames[index] || `Account ${index + 1}`,
    privateKey: key,
    network: network,
    enabled: true
  }));

  return {
    accounts,
    tasks: {
      dailyCheckIn: true,
      spin: true,
      claimQuests: true
    },
    delays: {
      betweenAccounts: 5000,
      betweenActions: 2000
    },
    captchaApiKey
  };
}

// Load state
function loadState() {
  if (!fs.existsSync(STATE_FILE)) {
    return {
      lastRun: {},
      stats: {}
    };
  }
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
}

// Save state
function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// Sleep helper
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Main bot class
class PushBot {
  constructor(account, config) {
    this.account = account;
    this.config = config;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.walletConnector = null;
    this.sessionToken = null;
  }

  async init() {
    console.log(`\n🚀 Initializing bot for ${this.account.name}...`);
    
    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
    });

    this.page = await this.context.newPage();
    console.log('✅ Browser initialized');
  }

  async connectWallet() {
    console.log('🔌 Connecting wallet...');
    
    try {
      // 1. Connect via Push Chain SDK
      this.walletConnector = new PushWalletConnector(
        this.account.privateKey,
        this.account.network || 'TESTNET'
      );

      const result = await this.walletConnector.connect();
      if (!result.success) {
        console.error('❌ SDK connection failed:', result.error);
        return false;
      }

      console.log(`✅ Wallet connected: ${result.address}`);

      // 2. Generate session token
      this.sessionToken = await this.walletConnector.generateSessionToken();
      console.log('🔑 Session token generated');

      // 3. Load portal with injected wallet
      await this.page.goto(API.PORTAL, {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      // 4. Inject wallet into page context
      await this.page.evaluate((walletData) => {
        // Store wallet info in localStorage
        localStorage.setItem('push_wallet_address', walletData.address);
        localStorage.setItem('push_session_token', JSON.stringify(walletData.sessionToken));
        
        // Inject wallet provider
        window.ethereum = {
          isMetaMask: true,
          selectedAddress: walletData.address,
          request: async ({ method, params }) => {
            if (method === 'eth_accounts' || method === 'eth_requestAccounts') {
              return [walletData.address];
            }
            if (method === 'personal_sign') {
              // Return pre-signed signature
              return walletData.sessionToken.signature;
            }
            return null;
          }
        };
      }, {
        address: result.address,
        sessionToken: this.sessionToken
      });

      console.log('✅ Wallet injected into page');

      await sleep(2000);

      // 5. Try to auto-connect
      const connectBtn = this.page.locator('button:has-text("Connect")').first();
      if (await connectBtn.isVisible()) {
        await connectBtn.click();
        await sleep(3000);
        
        // Look for wallet options and select injected
        const injectedOption = this.page.locator('text=MetaMask, text=Injected').first();
        if (await injectedOption.isVisible()) {
          await injectedOption.click();
          await sleep(2000);
        }
      }

      // 6. Verify connection
      const isConnected = await this.page.evaluate(() => {
        return !!localStorage.getItem('push_wallet_address');
      });

      if (isConnected) {
        console.log('✅ Portal connection verified');
        return true;
      } else {
        console.log('⚠️ Portal connection not verified, but SDK connected');
        return true; // Continue anyway, SDK is connected
      }

    } catch (error) {
      console.error('❌ Failed to connect wallet:', error.message);
      return false;
    }
  }

  async claimFaucetIfNeeded() {
    try {
      const balance = await this.walletConnector.getBalance();
      console.log(`💰 Current balance: ${balance} PC`);
      
      if (parseFloat(balance) < 0.1) {
        console.log('⚠️ Low balance detected, claiming faucet...');
        
        const claimer = new FaucetClaimer({
          captchaApiKey: this.config.captchaApiKey
        });
        
        await claimer.init();
        const result = await claimer.claimFaucet(this.walletConnector.address);
        await claimer.close();
        
        if (result.success) {
          console.log('✅ Faucet claimed successfully!');
          
          // Wait for tokens to arrive
          console.log('⏳ Waiting 30s for tokens to arrive...');
          await sleep(30000);
          
          const newBalance = await this.walletConnector.getBalance();
          console.log(`💰 New balance: ${newBalance} PC`);
          return true;
        } else {
          console.log('⚠️ Faucet claim failed, continuing anyway...');
          return false;
        }
      } else {
        console.log('✅ Balance sufficient, skipping faucet');
        return true;
      }
    } catch (error) {
      console.error('❌ Faucet claim error:', error.message);
      console.log('⚠️ Continuing without faucet claim...');
      return false;
    }
  }

  async dailyCheckIn() {
    if (!this.config.tasks.dailyCheckIn) return;

    console.log('📅 Performing daily check-in...');
    
    try {
      // Look for check-in button
      const checkInBtn = this.page.locator('button:has-text("Check"), button:has-text("Claim")').first();
      
      if (await checkInBtn.isVisible()) {
        await checkInBtn.click();
        await sleep(2000);
        console.log('✅ Daily check-in completed');
        return true;
      } else {
        console.log('ℹ️ Already checked in today');
        return false;
      }
    } catch (error) {
      console.error('❌ Daily check-in failed:', error.message);
      return false;
    }
  }

  async spin() {
    if (!this.config.tasks.spin) return;

    console.log('🎰 Attempting spin...');
    
    try {
      // Look for spin button
      const spinBtn = this.page.locator('button:has-text("Spin")').first();
      
      if (await spinBtn.isVisible()) {
        const isLocked = await this.page.locator('text=Locked').isVisible();
        if (isLocked) {
          console.log('🔒 Spin is locked (need Lv. 10)');
          return false;
        }

        await spinBtn.click();
        await sleep(3000);
        console.log('✅ Spin completed');
        return true;
      } else {
        console.log('ℹ️ Spin not available');
        return false;
      }
    } catch (error) {
      console.error('❌ Spin failed:', error.message);
      return false;
    }
  }

  async claimQuests() {
    if (!this.config.tasks.claimQuests) return;

    console.log('🎁 Checking for claimable quests...');
    
    try {
      // Look for claim buttons
      const claimBtns = this.page.locator('button:has-text("Claim")');
      const count = await claimBtns.count();

      if (count === 0) {
        console.log('ℹ️ No quests to claim');
        return 0;
      }

      let claimed = 0;
      for (let i = 0; i < count; i++) {
        try {
          await claimBtns.nth(i).click();
          await sleep(2000);
          claimed++;
        } catch (e) {
          // Button might be disabled or already claimed
        }
      }

      console.log(`✅ Claimed ${claimed} quests`);
      return claimed;
    } catch (error) {
      console.error('❌ Quest claiming failed:', error.message);
      return 0;
    }
  }

  async run() {
    try {
      await this.init();

      const connected = await this.connectWallet();
      if (!connected) {
        console.log('⚠️ Wallet not connected, skipping tasks');
        return {
          success: false,
          reason: 'wallet_not_connected'
        };
      }

      // Auto-claim faucet if balance is low
      await this.claimFaucetIfNeeded();

      await sleep(this.config.delays.betweenActions);

      const results = {
        dailyCheckIn: await this.dailyCheckIn(),
        spin: await this.spin(),
        questsClaimed: await this.claimQuests()
      };

      await sleep(this.config.delays.betweenActions);

      // Take screenshot for verification
      const screenshotPath = path.join(__dirname, `push-bot-${this.account.name.replace(/\s+/g, '-')}-${Date.now()}.png`);
      await this.page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`📸 Screenshot saved: ${screenshotPath}`);

      return {
        success: true,
        results
      };

    } catch (error) {
      console.error(`❌ Error running bot for ${this.account.name}:`, error.message);
      return {
        success: false,
        error: error.message
      };
    } finally {
      if (this.browser) {
        await this.browser.close();
      }
    }
  }
}

// Main execution with 24h loop
async function main() {
  console.log('🤖 Push Chain Rewards Bot Starting (24h Auto Loop)...\n');

  const config = loadConfig();
  
  // Infinite loop with 24h cycle
  while (true) {
    const state = loadState();
    const enabledAccounts = config.accounts.filter(acc => acc.enabled);
    console.log(`📊 Found ${enabledAccounts.length} enabled accounts\n`);

    for (const account of enabledAccounts) {
      console.log(`${'='.repeat(60)}`);
      console.log(`🎯 Processing: ${account.name}`);
      console.log(`${'='.repeat(60)}`);

      const bot = new PushBot(account, config);
      const result = await bot.run();

      // Update state
      state.lastRun[account.name] = {
        timestamp: new Date().toISOString(),
        result
      };

      if (!state.stats[account.name]) {
        state.stats[account.name] = {
          totalRuns: 0,
          successfulRuns: 0,
          totalCheckIns: 0,
          totalSpins: 0,
          totalQuestsClaimed: 0
        };
      }

      const stats = state.stats[account.name];
      stats.totalRuns++;
      if (result.success) {
        stats.successfulRuns++;
        if (result.results) {
          if (result.results.dailyCheckIn) stats.totalCheckIns++;
          if (result.results.spin) stats.totalSpins++;
          stats.totalQuestsClaimed += result.results.questsClaimed || 0;
        }
      }

      saveState(state);

      // Delay between accounts
      if (enabledAccounts.indexOf(account) < enabledAccounts.length - 1) {
        console.log(`\n⏳ Waiting ${config.delays.betweenAccounts}ms before next account...\n`);
        await sleep(config.delays.betweenAccounts);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ All accounts processed!');
    console.log('='.repeat(60));
    console.log('\n📊 Summary:');
    
    for (const account of enabledAccounts) {
      const stats = state.stats[account.name];
      if (stats) {
        console.log(`\n${account.name}:`);
        console.log(`  Total runs: ${stats.totalRuns}`);
        console.log(`  Successful: ${stats.successfulRuns}`);
        console.log(`  Check-ins: ${stats.totalCheckIns}`);
        console.log(`  Spins: ${stats.totalSpins}`);
        console.log(`  Quests claimed: ${stats.totalQuestsClaimed}`);
      }
    }

    // Sleep 24 hours before next cycle
    const nextRun = new Date(Date.now() + 24 * 60 * 60 * 1000);
    console.log(`\n⏰ Next run scheduled at: ${nextRun.toLocaleString('id-ID', { timeZone: 'Asia/Makassar' })} WIT`);
    console.log('😴 Sleeping for 24 hours...\n');
    await sleep(24 * 60 * 60 * 1000); // 24 hours
  }
}

// Run
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

module.exports = PushBot;
