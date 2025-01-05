import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import Swal from 'sweetalert2';

const Toast = Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true
});

const erc20ABI = [
    "function balanceOf(address account) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)"
];

const BRIDGE_WALLET = process.env.REACT_APP_BRIDGE_WALLET_ADDRESS;
const USDT_ADDRESS = "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9";
const WBTC_ADDRESS = "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f"; // Arbitrum WBTC
const USDT_BITLAYER = "0xfe9f969faf8ad72a83b761138bf25de87eff9dd2";

// Add WBTC ABI
const wbtcABI = [
    "function balanceOf(address account) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function decimals() view returns (uint8)"
];

const ARBITRUM_RPC = process.env.REACT_APP_ARBITRUM_RPC;
const BITLAYER_RPC = process.env.REACT_APP_BITLAYER_RPC;

if (!BRIDGE_WALLET || !ARBITRUM_RPC) {
    console.error("Required environment variables are not set");
}

// Initialize provider with complete network configuration
const provider = new ethers.providers.JsonRpcProvider(
    {
        url: ARBITRUM_RPC!,
        timeout: 30000, // 30 seconds
    },
    {
        chainId: 42161,
        name: 'arbitrum'
    }
);

// Add retry logic for provider
const getProviderWithRetry = async () => {
    for (let i = 0; i < 3; i++) {
        try {
            await provider.getNetwork();
            return provider;
        } catch (error) {
            console.warn(`RPC connection attempt ${i + 1} failed:`, error);
            if (i === 2) throw error; // Throw on last attempt
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before retry
        }
    }
    return null;
};

// Initialize provider
getProviderWithRetry().catch(error => {
    console.error("Failed to connect to Arbitrum RPC after retries:", error);
});

// Add BitLayer provider
const bitlayerProvider = new ethers.providers.JsonRpcProvider(
    BITLAYER_RPC,
    {
        chainId: 200901,
        name: 'bitlayer'
    }
);

// 添加延迟函数
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 添加带重试的请求函数
const withRetry = async <T,>(fn: () => Promise<T>, retries = 3, delayMs = 1000): Promise<T> => {
    try {
        return await fn();
    } catch (error: any) {
        if (retries === 0 || error.code !== 429) throw error;
        await delay(delayMs);
        return withRetry(fn, retries - 1, delayMs * 2);
    }
};

const Bridge: React.FC = () => {
    const [amount, setAmount] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(false);
    const [connected, setConnected] = useState<boolean>(false);
    const [wbtcBalance, setWbtcBalance] = useState<string>('0');
    const [usdtBalance, setUsdtBalance] = useState<string>('0');
    const [isWBTC, setIsWBTC] = useState<boolean>(true);
    const [walletAddress, setWalletAddress] = useState<string>('');
    const [copySuccess, setCopySuccess] = useState<string>('');
    const [txHash, setTxHash] = useState<string>('');
    const [bitlayerTxHash, setBitlayerTxHash] = useState<string>('');
    const [monitoring, setMonitoring] = useState<boolean>(false);

    const updateBalances = async () => {
        if (!window.ethereum) return;

        try {
            const injectedProvider = new ethers.providers.Web3Provider(window.ethereum);
            const signer = injectedProvider.getSigner();
            const address = await signer.getAddress();
            setWalletAddress(address);

            // Get WBTC balance
            const wbtcContract = new ethers.Contract(WBTC_ADDRESS, wbtcABI, injectedProvider);
            const wbtcBal = await wbtcContract.balanceOf(address);
            const formattedWbtcBalance = ethers.utils.formatUnits(wbtcBal, 8);
            setWbtcBalance(formattedWbtcBalance);
            if (isWBTC) {
                setAmount(formattedWbtcBalance);
            }

            // Get USDT balance
            const usdtContract = new ethers.Contract(USDT_ADDRESS, erc20ABI, injectedProvider);
            const usdtBal = await usdtContract.balanceOf(address);
            const formattedUsdtBalance = ethers.utils.formatUnits(usdtBal, 6);
            setUsdtBalance(formattedUsdtBalance);
            if (!isWBTC) {
                setAmount(formattedUsdtBalance);
            }
        } catch (error) {
            console.error("Error updating balances:", error);
        }
    };

    const showError = (message: string) => {
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: message,
            confirmButtonColor: '#1a73e8'
        });
    };

    const showSuccess = (message: string, isToast = false) => {
        if (isToast) {
            Toast.fire({
                icon: 'success',
                title: message
            });
        } else {
            Swal.fire({
                icon: 'success',
                title: 'Success',
                text: message,
                confirmButtonColor: '#1a73e8'
            });
        }
    };

    const showInfo = (message: string) => {
        Swal.fire({
            icon: 'info',
            title: 'Info',
            text: message,
            confirmButtonColor: '#1a73e8'
        });
    };

    const connectWallet = async () => {
        if (!window.ethereum) {
            showError('Please install MetaMask!');
            return;
        }

        try {
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: '0xa4b1' }],
            });
        } catch (switchError: any) {
            if (switchError.code === 4902) {
                try {
                    await window.ethereum.request({
                        method: 'wallet_addEthereumChain',
                        params: [
                            {
                                chainId: '0xa4b1',
                                chainName: 'Arbitrum One',
                                nativeCurrency: {
                                    name: 'ETH',
                                    symbol: 'ETH',
                                    decimals: 18
                                },
                                rpcUrls: [ARBITRUM_RPC],
                                blockExplorerUrls: ['https://arbiscan.io/']
                            }
                        ]
                    });
                } catch (addError) {
                    showError('Failed to add Arbitrum network');
                    return;
                }
            } else {
                showError('Failed to switch to Arbitrum network');
                return;
            }
        }

        await window.ethereum.request({ method: 'eth_requestAccounts' });
        setConnected(true);
        await updateBalances();
    };

    const monitorBitlayerTransaction = async (fromAmount: string) => {
        try {
            let initialBalance: ethers.BigNumber;
            let lastCheckedBlock: number;

            if (isWBTC) {
                initialBalance = await bitlayerProvider.getBalance(walletAddress);
                lastCheckedBlock = await bitlayerProvider.getBlockNumber();
                console.log('Initial BitLayer BTC balance:', ethers.utils.formatEther(initialBalance));
                console.log('Starting block number:', lastCheckedBlock);
            } else {
                const usdtContract = new ethers.Contract(
                    USDT_BITLAYER,
                    erc20ABI,
                    bitlayerProvider
                );
                initialBalance = await usdtContract.balanceOf(walletAddress);
                console.log('Initial BitLayer USDT balance:', ethers.utils.formatUnits(initialBalance, 6));
            }

            return async (txHash: string) => {
                setMonitoring(true);
                setTxHash(txHash);
                let attempts = 0;
                const maxAttempts = 120;

                const checkInterval = setInterval(async () => {
                    try {
                        if (attempts >= maxAttempts) {
                            clearInterval(checkInterval);
                            setMonitoring(false);
                            showInfo('Transaction monitoring timeout. Please check BitLayer explorer manually.');
                            return;
                        }

                        attempts++;
                        console.log(`Checking BitLayer (attempt ${attempts})...`);

                        let currentBalance: ethers.BigNumber;
                        let currentBlock: number;

                        if (isWBTC) {
                            currentBalance = await bitlayerProvider.getBalance(walletAddress);
                            currentBlock = await bitlayerProvider.getBlockNumber();
                            console.log('Current BitLayer BTC balance:', ethers.utils.formatEther(currentBalance));
                            console.log('Current block:', currentBlock);

                            if (currentBalance.gt(initialBalance)) {
                                // Check all new blocks since last check
                                for (let blockNum = lastCheckedBlock + 1; blockNum <= currentBlock; blockNum++) {
                                    console.log(`Checking block ${blockNum}...`);
                                    const block = await withRetry(() => bitlayerProvider.getBlock(blockNum));

                                    if (block.transactions.length > 0) {
                                        // 批量获取交易，每批5个，避免过多并发请求
                                        const batchSize = 5;
                                        const txs = [];

                                        for (let i = 0; i < block.transactions.length; i += batchSize) {
                                            const batch = block.transactions.slice(i, i + batchSize);
                                            const batchTxs = await Promise.all(
                                                batch.map(txHash =>
                                                    withRetry(() => bitlayerProvider.getTransaction(txHash))
                                                )
                                            );
                                            txs.push(...batchTxs);
                                            await delay(500); // 每批之间添加500ms延迟
                                        }

                                        // Find matching transaction
                                        const matchingTx = txs.find(tx =>
                                            tx &&
                                            tx.to?.toLowerCase() === walletAddress.toLowerCase() &&
                                            tx.value.gt(0)
                                        );

                                        if (matchingTx) {
                                            clearInterval(checkInterval);
                                            setMonitoring(false);
                                            setBitlayerTxHash(matchingTx.hash);
                                            showSuccess('BTC received on BitLayer!', true);
                                            await updateBalances();
                                            return;
                                        }
                                    }
                                }
                                // Update last checked block
                                lastCheckedBlock = currentBlock;
                            }
                        } else {
                            const usdtContract = new ethers.Contract(
                                USDT_BITLAYER,
                                [...erc20ABI, "event Transfer(address indexed from, address indexed to, uint256 value)"],
                                bitlayerProvider
                            );

                            const filter = usdtContract.filters.Transfer(null, walletAddress);
                            const events = await usdtContract.queryFilter(filter, lastCheckedBlock, 'latest');

                            for (const event of events) {
                                const [from, to, value] = event.args!;
                                if (value.toString() === ethers.utils.parseUnits(fromAmount, 6).toString()) {
                                    clearInterval(checkInterval);
                                    setMonitoring(false);
                                    setBitlayerTxHash(event.transactionHash);
                                    showSuccess('USDT received on BitLayer!', true);
                                    await updateBalances();
                                    return;
                                }
                            }
                        }
                    } catch (error) {
                        console.error('Error monitoring BitLayer transaction:', error);
                    }
                }, 2000);

                return () => clearInterval(checkInterval);
            };
        } catch (error) {
            console.error('Error getting initial BitLayer balance:', error);
            throw error;
        }
    };

    const setMaxBalance = () => {
        if (isWBTC) {
            setAmount(wbtcBalance);
        } else {
            setAmount(usdtBalance);
        }
    };

    const transferWBTC = async () => {
        if (!amount || parseFloat(amount) <= 0) {
            showInfo('Please enter a valid amount');
            return;
        }

        const wbtcBalanceNum = parseFloat(wbtcBalance);
        if (wbtcBalanceNum <= 0) {
            showError('Your WBTC balance is 0');
            return;
        }

        try {
            const startMonitoring = await monitorBitlayerTransaction(amount);

            setLoading(true);
            setBitlayerTxHash('');

            const provider = new ethers.providers.Web3Provider(window.ethereum);
            const signer = provider.getSigner();
            const wbtcContract = new ethers.Contract(WBTC_ADDRESS, wbtcABI, signer);

            const amountInSats = ethers.utils.parseUnits(amount, 8); // WBTC uses 8 decimals
            const balance = await wbtcContract.balanceOf(walletAddress);

            if (balance.lt(amountInSats)) {
                showError('Insufficient WBTC balance');
                return;
            }

            const tx = await wbtcContract.transfer(BRIDGE_WALLET, amountInSats);
            await tx.wait();
            showSuccess('WBTC transfer successful!', true);
            await updateBalances();

            startMonitoring(tx.hash);
        } catch (error: any) {
            console.error('Transfer error:', error);
            if (error.code === 4001) {
                showInfo('Transaction cancelled by user');
            } else {
                showError(`Transfer failed: ${error.message}`);
            }
        } finally {
            setLoading(false);
        }
    };

    const transferERC20 = async () => {
        if (!amount || parseFloat(amount) <= 0) {
            showInfo('Please enter a valid amount');
            return;
        }

        const usdtBalanceNum = parseFloat(usdtBalance);
        if (usdtBalanceNum <= 0) {
            showError('Your USDT balance is 0');
            return;
        }

        try {
            const startMonitoring = await monitorBitlayerTransaction(amount);

            setLoading(true);
            setBitlayerTxHash('');

            const provider = new ethers.providers.Web3Provider(window.ethereum);
            const signer = provider.getSigner();
            const usdtContract = new ethers.Contract(USDT_ADDRESS, erc20ABI, signer);

            const amountInWei = ethers.utils.parseUnits(amount, 6);
            const balance = await usdtContract.balanceOf(walletAddress);

            if (balance.lt(amountInWei)) {
                showError('Insufficient USDT balance');
                return;
            }

            const tx = await usdtContract.transfer(BRIDGE_WALLET, amountInWei);
            await tx.wait();
            showSuccess('USDT transfer successful!', true);
            await updateBalances();

            startMonitoring(tx.hash);
        } catch (error: any) {
            console.error('Transfer error:', error);
            if (error.code === 4001) {
                showInfo('Transaction cancelled by user');
            } else {
                showError(`Transfer failed: ${error.message}`);
            }
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            showSuccess('Copied to clipboard!');
        } catch (err) {
            showError('Failed to copy to clipboard');
        }
    };

    const handleTokenChange = (isWBTCToken: boolean) => {
        setIsWBTC(isWBTCToken);
        setAmount(isWBTCToken ? wbtcBalance : usdtBalance);
    };

    useEffect(() => {
        if (window.ethereum) {
            window.ethereum.on('accountsChanged', () => {
                updateBalances();
            });
            window.ethereum.on('chainChanged', () => {
                updateBalances();
            });
        }
    }, []);

    return (
        <div>
            <h1>Arbitrum -&gt; BitLayer Bridge</h1>
            {!connected ? (
                <button onClick={connectWallet}>Connect Wallet</button>
            ) : (
                <div>
                    <div className="wallet-info">
                        <div className="address-container">
                            <p>Connected Wallet: {walletAddress}</p>
                            <button
                                className="copy-button"
                                onClick={() => copyToClipboard(walletAddress)}
                            >
                                {copySuccess || 'Copy'}
                            </button>
                        </div>
                    </div>
                    <div className="balances">
                        <p>WBTC Balance: {wbtcBalance} WBTC</p>
                        <p>USDT Balance: {usdtBalance} USDT</p>
                    </div>
                    <div className="transfer-container">
                        <div className="transfer-box">
                            <h3>Transfer WBTC</h3>
                            <input
                                type="number"
                                value={isWBTC ? amount : ''}
                                onChange={(e) => {
                                    setIsWBTC(true);
                                    setAmount(e.target.value);
                                }}
                                onClick={() => handleTokenChange(true)}
                                placeholder="Enter amount (WBTC)"
                            />
                            <button
                                onClick={transferWBTC}
                                disabled={loading || parseFloat(wbtcBalance) <= 0}
                            >
                                {loading && isWBTC ? 'Processing...' : 'Transfer WBTC'}
                            </button>
                        </div>
                        <div className="transfer-box">
                            <h3>Transfer USDT</h3>
                            <input
                                type="number"
                                value={!isWBTC ? amount : ''}
                                onChange={(e) => {
                                    setIsWBTC(false);
                                    setAmount(e.target.value);
                                }}
                                onClick={() => handleTokenChange(false)}
                                placeholder="Enter amount (USDT)"
                            />
                            <button
                                onClick={transferERC20}
                                disabled={loading || parseFloat(usdtBalance) <= 0}
                            >
                                {loading && !isWBTC ? 'Processing...' : 'Transfer USDT'}
                            </button>
                        </div>
                    </div>
                    {txHash && (
                        <div className="transaction-info">
                            <p>Arbitrum Transaction:</p>
                            <div className="hash-container">
                                <span>{txHash}</span>
                                <button
                                    className="copy-button"
                                    onClick={() => copyToClipboard(txHash)}
                                >
                                    {copySuccess || 'Copy'}
                                </button>
                            </div>
                            <a
                                href={`https://arbiscan.io/tx/${txHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="view-link"
                            >
                                View on Arbiscan
                            </a>
                        </div>
                    )}
                    {monitoring && (
                        <div className="monitoring-info">
                            <p>Monitoring BitLayer for incoming transaction...</p>
                            <div className="loading-spinner"></div>
                            <button
                                className="refresh-button"
                                onClick={() => updateBalances()}
                            >
                                Refresh Balances
                            </button>
                        </div>
                    )}
                    {bitlayerTxHash && (
                        <div className="transaction-info bitlayer">
                            <p>BitLayer Transaction:</p>
                            <div className="hash-container">
                                <span>{bitlayerTxHash}</span>
                                <button
                                    className="copy-button"
                                    onClick={() => copyToClipboard(bitlayerTxHash)}
                                >
                                    {copySuccess || 'Copy'}
                                </button>
                            </div>
                            <a
                                href={`https://www.btrscan.com/tx/${bitlayerTxHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="view-link"
                            >
                                View on BTRscan
                            </a>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default Bridge; 