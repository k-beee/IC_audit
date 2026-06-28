import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import type { GenLayerClient } from "genlayer-js/types";

// The contract address can be provided via environment variable
export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ||
  "0x7d4a57Ee97e73713aC0D57670FA729e08beF9852") as `0x${string}`;

declare global {
  interface Window {
    ethereum?: any;
  }
}

export type WalletState = {
  address: `0x${string}` | null;
  client: GenLayerClient<any> | null;
};

// GenLayer Studio Network details for EVM provider switching
const STUDIONET_PARAMS = {
  chainId: "0xF22F", // 61999 in hex
  chainName: "GenLayer Studio Network",
  nativeCurrency: { name: "GEN Token", symbol: "GEN", decimals: 18 },
  rpcUrls: ["https://studio.genlayer.com/api"],
  blockExplorerUrls: ["https://genlayer-explorer.vercel.app"],
};

export function hasWallet(): boolean {
  return typeof window !== "undefined" && !!window.ethereum;
}

// Connect EVM wallet (MetaMask, Rabby, etc.) directly using the standard wallet RPC, bypassing the Snap requirement
export async function connectWallet(): Promise<WalletState> {
  if (!hasWallet()) {
    throw new Error("No compatible EVM wallet found. Please install MetaMask, Rabby, or another browser wallet.");
  }

  const accounts: string[] = await window.ethereum.request({
    method: "eth_requestAccounts",
  });

  if (!accounts || accounts.length === 0) {
    throw new Error("Wallet connection rejected or no accounts found.");
  }

  const address = accounts[0] as `0x${string}`;

  // Attempt to switch to the GenLayer Studio network, adding it if missing
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: STUDIONET_PARAMS.chainId }],
    });
  } catch (switchError: any) {
    // 4902 error code indicates the chain has not been added to the wallet
    if (switchError?.code === 4902 || /unrecognized/i.test(switchError?.message || "")) {
      try {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [STUDIONET_PARAMS],
        });
      } catch (addError: any) {
        throw new Error(`Failed to configure GenLayer Studio Network: ${addError.message}`);
      }
    } else if (switchError?.code !== 4001) {
      // Ignore other non-rejection errors as RPC calls will still succeed if network is selected manually
    } else {
      throw switchError;
    }
  }

  // Create the transaction signing client
  const client = createClient({
    chain: studionet,
    account: address,
    provider: window.ethereum,
  } as any);

  return { address, client };
}

// Create a read-only client for fetching public contract state
export function getReadClient(): GenLayerClient<any> {
  return createClient({ chain: studionet }) as GenLayerClient<any>;
}

// Helper to truncate address for UI display
export function truncateAddress(address: string): string {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
