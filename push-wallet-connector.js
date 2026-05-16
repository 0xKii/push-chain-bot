#!/usr/bin/env node
/**
 * Push Chain Wallet Connector
 * Handles wallet connection using Push Chain SDK + ethers
 */

const { PushChain } = require('@pushchain/core');
const { ethers } = require('ethers');

class PushWalletConnector {
  constructor(privateKey, network = 'TESTNET') {
    this.privateKey = privateKey;
    this.network = network;
    this.pushClient = null;
    this.wallet = null;
    this.universalSigner = null;
  }

  async connect() {
    try {
      console.log('🔌 Connecting to Push Chain...');

      // 1. Create provider (Push Chain RPC)
      const rpcUrl = this.network === 'TESTNET' 
        ? 'https://evm.donut.rpc.push.org/'
        : 'https://mainnet.push.org/rpc'; // Mainnet coming soon
      
      const provider = new ethers.JsonRpcProvider(rpcUrl);

      // 2. Create wallet from private key
      this.wallet = new ethers.Wallet(this.privateKey, provider);
      console.log(`📍 Wallet address: ${this.wallet.address}`);

      // 3. Convert to Universal Signer
      this.universalSigner = await PushChain.utils.signer.toUniversal(this.wallet);
      console.log('✅ Universal signer created');

      // 4. Initialize Push Chain client
      this.pushClient = await PushChain.initialize(this.universalSigner, {
        network: PushChain.CONSTANTS.PUSH_NETWORK[this.network],
      });

      console.log('✅ Push Chain client initialized');

      // 5. Get account info
      const pushChainAccount = this.pushClient.universal.account;
      const originAccount = this.pushClient.universal.origin;

      console.log(`📊 Push Chain account: ${pushChainAccount.address}`);
      console.log(`📊 Origin account: ${originAccount.address}`);

      return {
        success: true,
        wallet: this.wallet,
        pushClient: this.pushClient,
        address: this.wallet.address,
        pushChainAddress: pushChainAccount.address
      };

    } catch (error) {
      console.error('❌ Connection failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async signMessage(message) {
    if (!this.wallet) {
      throw new Error('Wallet not connected');
    }
    return await this.wallet.signMessage(message);
  }

  async sendTransaction(to, value) {
    if (!this.pushClient) {
      throw new Error('Push client not initialized');
    }

    const txHash = await this.pushClient.universal.sendTransaction({
      to,
      value: BigInt(value)
    });

    return txHash;
  }

  async getBalance() {
    if (!this.wallet) {
      throw new Error('Wallet not connected');
    }
    const balance = await this.wallet.provider.getBalance(this.wallet.address);
    return ethers.formatEther(balance);
  }

  getAuthHeaders() {
    if (!this.wallet) {
      throw new Error('Wallet not connected');
    }

    // Generate auth headers for API calls
    return {
      'X-Wallet-Address': this.wallet.address,
      'X-Chain': 'push',
      'X-Network': this.network.toLowerCase()
    };
  }

  async generateSessionToken() {
    if (!this.wallet) {
      throw new Error('Wallet not connected');
    }

    // Sign a message to prove ownership
    const timestamp = Date.now();
    const message = `Push Chain Session\nTimestamp: ${timestamp}`;
    const signature = await this.signMessage(message);

    return {
      address: this.wallet.address,
      timestamp,
      signature
    };
  }
}

// Export for use in other scripts
module.exports = PushWalletConnector;

// CLI test
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: node push-wallet-connector.js <private_key> [network]');
    console.log('Example: node push-wallet-connector.js 0x... TESTNET');
    process.exit(1);
  }

  const privateKey = args[0];
  const network = args[1] || 'TESTNET';

  (async () => {
    const connector = new PushWalletConnector(privateKey, network);
    const result = await connector.connect();

    if (result.success) {
      console.log('\n✅ Connection successful!');
      
      // Test balance
      const balance = await connector.getBalance();
      console.log(`💰 Balance: ${balance} ETH`);

      // Test session token
      const session = await connector.generateSessionToken();
      console.log('\n🔑 Session token generated:');
      console.log(JSON.stringify(session, null, 2));

      // Test auth headers
      const headers = connector.getAuthHeaders();
      console.log('\n📋 Auth headers:');
      console.log(JSON.stringify(headers, null, 2));
    } else {
      console.log('\n❌ Connection failed');
      process.exit(1);
    }
  })();
}
