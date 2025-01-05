import Koa from 'koa';
import Router from '@koa/router';
import bodyParser from 'koa-bodyparser';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

interface ActivityLog {
    fromAddress: string;
    toAddress: string;
    value: number;
    asset: string;
    category: string;
    hash: string;
    rawContract?: {
        address: string;
        decimals: number;
        rawValue: string;
    };
}

interface WebhookBody {
    webhookId: string;
    id: string;
    event: {
        network: string;
        activity: ActivityLog[];
    };
}

const app = new Koa();
const router = new Router();

const BITLAYER_RPC = process.env.BITLAYER_RPC;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const BRIDGE_WALLET = process.env.BRIDGE_WALLET_ADDRESS;
const USDT_BITLAYER = process.env.USDT_BITLAYER_ADDRESS;
const WBTC_ARBITRUM = "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f"; // Arbitrum WBTC address

const bitlayerProvider = new ethers.providers.JsonRpcProvider(BITLAYER_RPC);
const bitlayerWallet = new ethers.Wallet(PRIVATE_KEY!, bitlayerProvider);

// Add gas settings for BitLayer
const BITLAYER_GAS_SETTINGS = {
    maxPriorityFeePerGas: ethers.utils.parseUnits('0.05', 'gwei'),
    maxFeePerGas: ethers.utils.parseUnits('0.050000007', 'gwei'),
};

// Add a simple transaction cache
const processedTxs = new Set<string>();

// Add cache cleanup (optional, to prevent memory leaks)
setInterval(() => {
    processedTxs.clear();
}, 1000 * 60 * 60); // Clear cache every hour

router.post('/webhook', async (ctx: Koa.Context) => {
    try {
        const webhookData = ctx.request.body as WebhookBody;
        const activities = webhookData.event.activity;

        console.log('Received webhook:', {
            id: webhookData.id,
            webhookId: webhookData.webhookId,
            network: webhookData.event.network,
            activityCount: activities.length
        });

        for (const activity of activities) {
            // Check if we've already processed this transaction
            if (processedTxs.has(activity.hash)) {
                console.log(`Skipping already processed transaction: ${activity.hash}`);
                continue;
            }

            console.log('Processing activity:', {
                from: activity.fromAddress,
                to: activity.toAddress,
                value: activity.value,
                asset: activity.asset,
                category: activity.category,
                hash: activity.hash
            });

            // Check if the transfer is to our bridge wallet
            if (activity.toAddress.toLowerCase() !== BRIDGE_WALLET!.toLowerCase()) {
                console.log('Skipping activity: Not matching bridge wallet', {
                    receivedAddress: activity.toAddress,
                    expectedAddress: BRIDGE_WALLET,
                    hash: activity.hash
                });
                continue;
            }

            if (activity.category === 'token' &&
                activity.rawContract?.address.toLowerCase() === WBTC_ARBITRUM.toLowerCase()) {
                // WBTC transfer - send native BTC on BitLayer
                console.log(`Processing WBTC transfer: ${activity.fromAddress} sent ${activity.value} WBTC`);
                try {
                    // Add transaction to processed set before processing
                    processedTxs.add(activity.hash);

                    // Convert WBTC amount (8 decimals) to BTC amount (18 decimals)
                    // First parse as 8 decimals
                    const wbtcAmount = ethers.utils.parseUnits(activity.value.toString(), 8);
                    // Convert to normal number
                    const wbtcNumber = parseFloat(ethers.utils.formatUnits(wbtcAmount, 8));
                    // Then format as 18 decimals
                    const btcAmount = ethers.utils.parseEther(wbtcNumber.toString());

                    console.log('Amount conversion:', {
                        originalWBTC: activity.value,
                        wbtcDecimals: wbtcAmount.toString(),
                        btcDecimals: btcAmount.toString()
                    });

                    const tx = await bitlayerWallet.sendTransaction({
                        to: activity.fromAddress,
                        value: btcAmount,
                        ...BITLAYER_GAS_SETTINGS
                    });
                    await tx.wait();
                    console.log(`BTC transfer successful on BitLayer: ${tx.hash}`);
                } catch (error) {
                    // If processing fails, remove from processed set
                    processedTxs.delete(activity.hash);
                    console.error("BTC transfer failed:", error);
                }
            } else if (activity.category === 'token' &&
                activity.rawContract?.address.toLowerCase() === WBTC_ARBITRUM.toLowerCase()) {
                // USDT transfer
                console.log(`Processing USDT transfer: ${activity.fromAddress} sent ${activity.value} USDT`);
                try {
                    const tokenContract = new ethers.Contract(
                        USDT_BITLAYER!,
                        ['function transfer(address to, uint256 amount)'],
                        bitlayerWallet
                    );

                    const tx = await tokenContract.transfer(
                        activity.fromAddress,
                        ethers.utils.parseUnits(activity.value.toString(), 6),
                        {
                            ...BITLAYER_GAS_SETTINGS
                        }
                    );
                    await tx.wait();
                    console.log(`USDT transfer successful on BitLayer: ${tx.hash}`);
                } catch (error) {
                    console.error("USDT transfer failed:", error);
                }
            } else {
                console.log('Skipping activity: Not matching token or category', {
                    category: activity.category,
                    tokenAddress: activity.rawContract?.address,
                    expectedWBTC: WBTC_ARBITRUM,
                    expectedUSDT: USDT_BITLAYER
                });
            }
        }

        ctx.body = { success: true };
    } catch (error) {
        console.error('Failed to process webhook:', error);
        ctx.status = 500;
        ctx.body = { error: 'Internal server error' };
    }
});

app.use(bodyParser());
app.use(router.routes());
app.use(router.allowedMethods());

const PORT = process.env.PORT || 3301;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 