import Koa from 'koa';
import Router from '@koa/router';
import bodyParser from 'koa-bodyparser';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

// Types and Interfaces
interface TokenConfig {
    symbol: string;
    name: string;
    sourceAddress: string;
    targetAddress?: string;
    decimals: number;
    isNative?: boolean;
    abi: string[];
}

interface NetworkConfig {
    name: string;
    chainId: number;
    rpc: string;
    provider: ethers.providers.JsonRpcProvider;
    isSource?: boolean;
}

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

// Basic ABIs
const ERC20_ABI = [
    'function transfer(address to, uint256 amount)',
    'function balanceOf(address account) view returns (uint256)'
];

// Token configurations
const TOKENS: { [key: string]: TokenConfig } = {
    WBTC: {
        symbol: 'WBTC',
        name: 'Wrapped Bitcoin',
        sourceAddress: process.env.WBTC_ARBITRUM_ADDRESS!,
        decimals: 8,
        isNative: true,
        abi: ERC20_ABI
    },
    USDT: {
        symbol: 'USDT',
        name: 'Tether USD',
        sourceAddress: process.env.USDT_ARBITRUM_ADDRESS!,
        targetAddress: process.env.USDT_BITLAYER_ADDRESS!,
        decimals: 6,
        abi: ERC20_ABI
    }
};

// Network configurations
const createNetworkConfig = (
    name: string,
    chainId: number,
    rpc: string,
    isSource: boolean = false
): NetworkConfig => {
    const provider = new ethers.providers.JsonRpcProvider(rpc);
    if (!isSource) {
        // Add wallet only for target network
        const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
        (provider as any).wallet = wallet;
    }
    return { name, chainId, rpc, provider, isSource };
};

const NETWORKS: { [key: string]: NetworkConfig } = {
    ARBITRUM: createNetworkConfig('Arbitrum One', 42161, process.env.ARBITRUM_RPC!, true),
    BITLAYER: createNetworkConfig('BitLayer', 200901, process.env.BITLAYER_RPC!)
};

// Gas settings for different networks
const GAS_SETTINGS: { [key: string]: any } = {
    BITLAYER: {
        maxPriorityFeePerGas: ethers.utils.parseUnits('0.05', 'gwei'),
        maxFeePerGas: ethers.utils.parseUnits('0.050000007', 'gwei'),
    }
};

// Transaction processing cache
const processedTxs = new Set<string>();

// Clear cache every hour to prevent memory leaks
setInterval(() => {
    processedTxs.clear();
}, 1000 * 60 * 60);

// Helper functions
const handleNativeTransfer = async (
    activity: ActivityLog,
    sourceToken: TokenConfig,
    targetNetwork: NetworkConfig
) => {
    console.log(`Processing ${sourceToken.symbol} transfer: ${activity.fromAddress} sent ${activity.value} ${sourceToken.symbol}`);

    try {
        // Convert amount based on decimals
        const sourceAmount = ethers.utils.parseUnits(activity.value.toString(), sourceToken.decimals);
        const sourceNumber = parseFloat(ethers.utils.formatUnits(sourceAmount, sourceToken.decimals));
        const targetAmount = ethers.utils.parseEther(sourceNumber.toString());

        const wallet = (targetNetwork.provider as any).wallet as ethers.Wallet;
        const tx = await wallet.sendTransaction({
            to: activity.fromAddress,
            value: targetAmount,
            ...GAS_SETTINGS[targetNetwork.name]
        });

        await tx.wait(1);
        console.log(`${sourceToken.symbol} transfer successful on ${targetNetwork.name}: ${tx.hash}`);
        return true;
    } catch (error) {
        console.error(`${sourceToken.symbol} transfer failed:`, error);
        return false;
    }
};

const handleTokenTransfer = async (
    activity: ActivityLog,
    sourceToken: TokenConfig,
    targetNetwork: NetworkConfig
) => {
    if (!sourceToken.targetAddress) {
        console.error(`No target address configured for ${sourceToken.symbol}`);
        return false;
    }

    console.log(`Processing ${sourceToken.symbol} transfer: ${activity.fromAddress} sent ${activity.value} ${sourceToken.symbol}`);

    try {
        const wallet = (targetNetwork.provider as any).wallet as ethers.Wallet;
        const tokenContract = new ethers.Contract(
            sourceToken.targetAddress,
            sourceToken.abi,
            wallet
        );

        const tx = await tokenContract.transfer(
            activity.fromAddress,
            ethers.utils.parseUnits(activity.value.toString(), sourceToken.decimals),
            {
                ...GAS_SETTINGS[targetNetwork.name]
            }
        );

        await tx.wait(1);
        console.log(`${sourceToken.symbol} transfer successful on ${targetNetwork.name}: ${tx.hash}`);
        return true;
    } catch (error) {
        console.error(`${sourceToken.symbol} transfer failed:`, error);
        return false;
    }
};

// Initialize Koa app and router
const app = new Koa();
const router = new Router();

// Webhook handler
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
            // Skip processed transactions
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

            // Verify bridge wallet
            if (activity.toAddress.toLowerCase() !== process.env.BRIDGE_WALLET_ADDRESS!.toLowerCase()) {
                console.log('Skipping activity: Not matching bridge wallet', {
                    receivedAddress: activity.toAddress,
                    expectedAddress: process.env.BRIDGE_WALLET_ADDRESS,
                    hash: activity.hash
                });
                continue;
            }

            // Find matching token configuration
            const sourceToken = Object.values(TOKENS).find(token =>
                activity.category === 'token' &&
                activity.rawContract?.address.toLowerCase() === token.sourceAddress.toLowerCase()
            );

            if (!sourceToken) {
                console.log('Skipping activity: No matching token configuration', {
                    category: activity.category,
                    tokenAddress: activity.rawContract?.address
                });
                continue;
            }

            // Add to processed set before processing
            processedTxs.add(activity.hash);

            // Process transfer based on token type
            const success = sourceToken.isNative
                ? await handleNativeTransfer(activity, sourceToken, NETWORKS.BITLAYER)
                : await handleTokenTransfer(activity, sourceToken, NETWORKS.BITLAYER);

            // Remove from processed set if failed
            if (!success) {
                processedTxs.delete(activity.hash);
            }
        }

        ctx.body = { success: true };
    } catch (error) {
        console.error('Failed to process webhook:', error);
        ctx.status = 500;
        ctx.body = { error: 'Internal server error' };
    }
});

// Setup middleware
app.use(bodyParser());
app.use(router.routes());
app.use(router.allowedMethods());

// Start server
const PORT = process.env.PORT || 3301;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 