import { BrowserProvider, Contract, ethers, JsonRpcSigner } from 'ethers';
import { NETWORK_CONFIG, CONTRACT_ADDRESSES } from './config';
import RegistryABI from './abis/DWebNSRegistry.json';
import RegistrarABI from './abis/DWebNSRegistrar.json';
import ResolverABI from './abis/DWebNSResolver.json';

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on?: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
    };
  }
}

export interface DomainInfo {
  name: string;
  label: string;
  owner: string;
  expires: number;
}

export class Web3Service {
  private provider: BrowserProvider | null = null;
  private signer: JsonRpcSigner | null = null;
  private registryContract: Contract | null = null;
  private registrarContract: Contract | null = null;
  private resolverContract: Contract | null = null;

  async connect(): Promise<string> {
    if (!window.ethereum) {
      throw new Error('Please install MetaMask!');
    }

    // Request account access
    const accounts = (await window.ethereum.request({
      method: 'eth_requestAccounts',
    })) as string[];

    // Create provider and signer
    this.provider = new BrowserProvider(window.ethereum);
    this.signer = await this.provider.getSigner();

    // Initialize contracts
    this.registryContract = new Contract(
      CONTRACT_ADDRESSES.registry,
      RegistryABI,
      this.signer
    );

    this.registrarContract = new Contract(
      CONTRACT_ADDRESSES.registrar,
      RegistrarABI,
      this.signer
    );

    this.resolverContract = new Contract(
      CONTRACT_ADDRESSES.resolver,
      ResolverABI,
      this.signer
    );

    // Check network
    const network = await this.provider.getNetwork();
    if (Number(network.chainId) !== NETWORK_CONFIG.chainId) {
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: `0x${NETWORK_CONFIG.chainId.toString(16)}` }],
        });
      } catch (switchError: unknown) {
        // Chain not added, add it
        if (typeof switchError === 'object' && switchError !== null && 'code' in switchError && switchError.code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: `0x${NETWORK_CONFIG.chainId.toString(16)}`,
                chainName: NETWORK_CONFIG.chainName,
                rpcUrls: [NETWORK_CONFIG.rpcUrl],
              },
            ],
          });
        } else {
          throw switchError;
        }
      }
    }

    return accounts[0];
  }

  async checkAvailability(username: string): Promise<boolean> {
    if (!this.registryContract) throw new Error('Not connected');
    
    // Convert string name to bytes32
    const nameBytes32 = new Uint8Array(32);
    const nameBytes = ethers.toUtf8Bytes(username);
    nameBytes32.set(nameBytes.slice(0, 32));
    const nameHex = '0x' + Array.from(nameBytes32).map(b => b.toString(16).padStart(2, '0')).join('');
    
    return await this.registryContract.available(nameHex);
  }

  async getPriceForDuration(durationDays: number): Promise<string> {
    if (!this.registrarContract) throw new Error('Not connected');
    
    const durationSeconds = durationDays * 24 * 60 * 60;
    const price = await this.registrarContract.priceForDuration(durationSeconds);
    return ethers.formatEther(price);
  }

  async registerDomain(username: string, durationDays: number): Promise<string> {
    if (!this.registrarContract) throw new Error('Not connected');
    
    const durationSeconds = durationDays * 24 * 60 * 60;
    const price = await this.registrarContract.priceForDuration(durationSeconds);

    // Use string name directly (not hash)
    const tx = await this.registrarContract.register(username, durationSeconds, {
      value: price,
    });

    const receipt = await tx.wait();
    return receipt.hash;
  }

  async getDomainInfo(username: string): Promise<DomainInfo | null> {
    if (!this.registryContract) throw new Error('Not connected');
    
    // Convert string name to bytes32
    const nameBytes32 = new Uint8Array(32);
    const nameBytes = ethers.toUtf8Bytes(username);
    nameBytes32.set(nameBytes.slice(0, 32));
    const nameHex = '0x' + Array.from(nameBytes32).map(b => b.toString(16).padStart(2, '0')).join('');
    
    const record = await this.registryContract.records(nameHex);

    if (record.owner === ethers.ZeroAddress) {
      return null;
    }

    return {
      name: `${username}.dweb`,
      label: username,
      owner: record.owner,
      expires: Number(record.expires),
    };
  }

  async getUserDomains(address: string): Promise<DomainInfo[]> {
    if (!this.registryContract || !this.provider) throw new Error('Not connected');
    
    // Get NameRegistered events
    const filter = this.registryContract.filters.NameRegistered(address);
    const events = await this.registryContract.queryFilter(filter);

    const domains: DomainInfo[] = [];
    
    for (const event of events) {
      if (!('args' in event)) continue;
      const nameBytes32 = event.args?.[1]; // name is the second argument
      const record = await this.registryContract.records(nameBytes32);
      
      // Only include active domains owned by this address
      if (record.owner.toLowerCase() === address.toLowerCase() && Number(record.expires) > Date.now() / 1000) {
        // Convert bytes32 to string
        const nameStr = new TextDecoder().decode(
          new Uint8Array(nameBytes32.slice(2).match(/.{2}/g).map((byte: string) => parseInt(byte, 16)))
        ).replace(/\0/g, '');
        
        domains.push({
          name: `${nameStr}.dweb`,
          label: nameStr,
          owner: record.owner,
          expires: Number(record.expires),
        });
      }
    }

    return domains;
  }

  async getResolver(username: string, recordType: 'addr' | 'contentHash' | 'text', textKey?: string): Promise<string> {
    if (!this.resolverContract || !this.registryContract) throw new Error('Not connected');
    
    const node = await this.registryContract.makeNode(username);

    if (recordType === 'addr') {
      const address = await this.resolverContract.addr(node);
      return address;
    } else if (recordType === 'contentHash') {
      const hash = await this.resolverContract.contentHash(node);
      return hash;
    } else if (recordType === 'text' && textKey) {
      const value = await this.resolverContract.text(node, textKey);
      return value;
    }

    return '';
  }

  async setResolver(
    username: string,
    recordType: 'addr' | 'contentHash' | 'text',
    value: string,
    textKey?: string
  ): Promise<string> {
    if (!this.resolverContract || !this.registryContract) throw new Error('Not connected');
    
    const node = await this.registryContract.makeNode(username);
    const ttl = 0; // No expiration

    let tx;
    if (recordType === 'addr') {
      tx = await this.resolverContract.setAddr(node, value, ttl);
    } else if (recordType === 'contentHash') {
      tx = await this.resolverContract.setContentHash(node, value, ttl);
    } else if (recordType === 'text' && textKey) {
      tx = await this.resolverContract.setText(node, textKey, value, ttl);
    } else {
      throw new Error('Invalid record type');
    }

    const receipt = await tx.wait();
    return receipt.hash;
  }

  getCurrentAddress(): string | null {
    return this.signer ? this.signer.address : null;
  }
}

export const web3Service = new Web3Service();
