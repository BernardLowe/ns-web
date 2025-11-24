import { Chain } from 'wagmi/chains';

// Hardhat Remote Chain Configuration (9537)
export const hardhatRemote: Chain = {
  id: 1337,
  name: 'Hardhat Remote (1337)',
  nativeCurrency: {
    decimals: 18,
    name: 'Ethereum',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: {
      http: ['https://hardhat.deweb.world'],
    },
  },
  testnet: true,
};

// Hardhat Local Chain Configuration (31337)
export const hardhatLocal: Chain = {
  id: 31337,
  name: 'Hardhat Local (31337)',
  nativeCurrency: {
    decimals: 18,
    name: 'Ethereum',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: {
      http: ['http://127.0.0.1:8545'],
    },
  },
  testnet: true,
};

// Active chain - Switch between hardhatRemote and hardhatLocal
export const activeChain = hardhatRemote; // Change to hardhatRemote to use remote node

// Network and Contract Configuration
// Testnet: Hardhat Remote (http://hardhat.deweb.world, Chain ID: 1337)
export const NETWORK_CONFIG = {
  chainId: activeChain.id,
  chainName: activeChain.name,
  rpcUrl: activeChain.rpcUrls.default.http[0],
  blockExplorer: '',
};

// Contract addresses - Hardhat Remote Testnet Deployment
// Deployed on 2025-01-20
export const CONTRACT_ADDRESSES = {
  registry: '0xA21926213252bE7a956710deAEe91a192dDb0e5E',
  registrar: '0x65f7C2CD018367fdCFDa6c176E3D7B8BeEa54D0D',
  resolver: '0x9467C76F4A206b8497870C109dFd12C2Debaebd4',
};

export const BASE_NAME = 'dweb';
