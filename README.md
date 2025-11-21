# DWebNS Frontend

A React-based web application for interacting with DWebNS (Decentralized Web Name Service).

## Features

- **Connect Wallet**: Connect MetaMask to interact with the DWebNS contracts
- **Register Domains**: Purchase .dweb domain names
- **View My Domains**: See all domains you own
- **Manage Records**: Set resolver records for your domains:
  - Ethereum address
  - Content hash (IPFS CID)
  - Text records (email, URL, description, etc.)

## Setup

1. Install dependencies:
```bash
npm install
```

2. Update contract addresses in `src/config.ts`:
   - After deploying contracts using `yarn deploy` in the root directory
   - Copy the deployed contract addresses to `CONTRACT_ADDRESSES`

3. Start the development server:
```bash
npm run dev
```

4. Open http://localhost:5173 in your browser

## Configuration

Edit `src/config.ts` to configure:
- Network settings (chain ID, RPC URL)
- Contract addresses (Registry, Registrar, Resolver)

## Usage

1. **Connect MetaMask**: Click "Connect Wallet" and approve the connection
2. **Register a Domain**:
   - Enter a username (e.g., "alice")
   - Click "Check Availability"
   - If available, select duration and click "Register Domain"
   - Approve the transaction in MetaMask
3. **View Your Domains**: See all your registered domains in "My Domains"
4. **Manage Records**: Click "Manage Records" on any domain to:
   - Set Ethereum address resolution
   - Set content hash (IPFS CID)
   - Set text records (key-value pairs)

## Network Requirements

- Network: Hardhat Local (Chain ID: 31337)
- RPC: http://hardhat.deweb.world
- Make sure MetaMask is connected to the correct network

## Technology Stack

- React 18
- TypeScript
- Vite
- ethers.js v6
- CSS3

## Build for Production

```bash
npm run build
```

The built files will be in the `dist` directory.
