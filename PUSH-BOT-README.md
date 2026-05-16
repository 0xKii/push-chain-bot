# Push Chain Rewards Bot

Automation bot untuk Push Chain Rewards Season 3. Multi-account support dengan daily check-in, spin, dan quest claiming.

## Features

✅ **Multi-account support** - Manage unlimited accounts  
✅ **Daily check-in** - Auto stack streak bonus  
✅ **Spin to Win** - Auto spin (when unlocked at Lv. 10)  
✅ **Quest claiming** - Auto claim completed quests  
✅ **State tracking** - Track stats per account  
✅ **Screenshot verification** - Visual proof of actions  

## Installation

```bash
# Install dependencies
cd /root/.openclaw/workspace/scripts
npm install

# Test wallet connection
node test-wallet-auto.js
```

## Configuration

### 1. Generate Config Template

```bash
node push-bot.js
```

This creates `push-bot-config.json` with template structure.

### 2. Edit Config

```json
{
  "accounts": [
    {
      "name": "Main Account",
      "privateKey": "0x...",
      "network": "TESTNET",
      "enabled": true
    },
    {
      "name": "Alt Account 1",
      "privateKey": "0x...",
      "network": "TESTNET",
      "enabled": true
    }
  ],
  "tasks": {
    "dailyCheckIn": true,
    "spin": true,
    "claimQuests": true
  },
  "delays": {
    "betweenAccounts": 5000,
    "betweenActions": 2000
  }
}
```

**Fields:**
- `accounts[]` - List of accounts to manage
  - `name` - Account identifier (for logs)
  - `privateKey` - Wallet private key (⚠️ KEEP SECRET)
  - `network` - "TESTNET" or "MAINNET" (mainnet coming soon)
  - `enabled` - Enable/disable account
- `tasks` - Which tasks to perform
- `delays` - Timing between actions (milliseconds)

### 3. Add Accounts

Replace `YOUR_PRIVATE_KEY_HERE` with actual private keys.

⚠️ **Security:** Never commit config file to git. Add to `.gitignore`.

## Usage

### Manual Run

```bash
node push-bot.js
```

### Automated Daily Run (Cron)

```bash
# Add to crontab (run daily at 9 AM)
0 9 * * * cd /root/.openclaw/workspace/scripts && node push-bot.js >> push-bot.log 2>&1
```

### OpenClaw Cron Integration

```bash
# Create cron job via OpenClaw
openclaw cron add \
  --name "Push Rewards Daily" \
  --schedule "0 9 * * *" \
  --command "cd /root/.openclaw/workspace/scripts && node push-bot.js"
```

## Output

### Console Logs

```
🤖 Push Chain Rewards Bot Starting...

📊 Found 2 enabled accounts

============================================================
🎯 Processing: Main Account
============================================================

🚀 Initializing bot for Main Account...
🔌 Connecting wallet...
📅 Performing daily check-in...
✅ Daily check-in completed
🎰 Attempting spin...
✅ Spin completed
🎁 Checking for claimable quests...
✅ Claimed 2 quests
📸 Screenshot saved: push-bot-Main-Account-1715912345678.png

⏳ Waiting 5000ms before next account...

============================================================
🎯 Processing: Alt Account 1
============================================================
...

============================================================
✅ All accounts processed!
============================================================

📊 Summary:

Main Account:
  Total runs: 5
  Successful: 5
  Check-ins: 5
  Spins: 3
  Quests claimed: 8

Alt Account 1:
  Total runs: 5
  Successful: 5
  Check-ins: 5
  Spins: 2
  Quests claimed: 6

🎉 Done!
```

### State File

`push-bot-state.json` tracks:
- Last run timestamp per account
- Success/failure status
- Cumulative stats (check-ins, spins, quests)

### Screenshots

Saved as `push-bot-{account-name}-{timestamp}.png` for verification.

## API Endpoints

Bot interacts with:

```
https://us-east1-push-prod-apps.cloudfunctions.net/pushpointsrewardsystem/api/v3/
├── apps/unichess/quests
├── apps/moleswap/quests
└── apps/boss-quests/quests

https://auth.waap.xyz/api/auth/get-session
https://portal.push.org/rewards
```

## Quest System

### Daily Tasks
- **Check-in** - Stack 7-day streak bonus
- **Spin** - 1 free spin/day (unlocks Lv. 10)

### App Quests
- **Degen Chess** - 5 quests (ELO, bets, games)
- **MoleSwap** - 5 quests (swaps, liquidity)

### Boss Quests
- Create content + tag @PushChain
- Hold 5 Rare Passes
- Complete all 5 quests of single app

### Rewards
- XP (level up)
- Points
- Rare Passes → Burn & Mint Legendary Shiny

## Troubleshooting

### Test Wallet Connection

Before running the bot, test your wallet connection:

```bash
node test-wallet-auto.js
```

This will:
- Generate a random test wallet
- Connect to Push Chain RPC
- Test balance query
- Test message signing
- Generate session token

If this passes, your setup is correct.

### Wallet Connection Issues

**Status:** ✅ Fully automated via Push Chain SDK + ethers

The bot now uses:
1. Push Chain SDK (`@pushchain/core`)
2. Ethers v6 for wallet management
3. Universal Signer for cross-chain compatibility
4. Injected wallet provider in browser context

**RPC Endpoint:** `https://evm.donut.rpc.push.org/` (Donut Testnet)

**Chain ID:** 42101

### Rate Limiting

If you hit rate limits:
1. Increase `delays.betweenAccounts` (default 5000ms)
2. Increase `delays.betweenActions` (default 2000ms)
3. Reduce number of enabled accounts

### Headless Browser Issues

If Chromium fails to launch:
```bash
# Install system dependencies
sudo npx playwright install-deps chromium
```

### Quest Not Claiming

Some quests require on-chain verification:
- Complete actual tasks (swaps, games, etc.)
- Wait for blockchain confirmation
- Bot will claim once verified

## Development

### API Interceptor

Discover new API endpoints:

```bash
node push-api-interceptor.js
```

Output: `push-api-data.json` with all captured requests/responses.

### Scraper

Extract portal structure:

```bash
node push-rewards-scraper.js
```

Output: `push-rewards-data.json` with page content.

## Security

⚠️ **CRITICAL:**

1. **Never share config file** - Contains private keys
2. **Use dedicated wallets** - Don't use main wallet
3. **Test with small amounts** - Verify before scaling
4. **Monitor activity** - Check screenshots regularly
5. **Backup state file** - Track your progress

## Roadmap

- [✅] Full wallet connection automation
- [ ] On-chain quest verification
- [ ] Telegram notifications
- [ ] Dashboard UI
- [ ] Proxy support
- [ ] Captcha handling
- [ ] Advanced quest strategies
- [ ] Mainnet support (when available)

## Support

Issues? Questions?

1. Check logs in `push-bot.log`
2. Review screenshots
3. Verify config syntax
4. Test with single account first

## License

MIT

---

**Disclaimer:** Use at your own risk. Automation may violate ToS. Always verify actions manually.
