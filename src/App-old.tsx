import { useState, useEffect } from 'react';
import { useAccount, useWalletClient, useConnect, useDisconnect } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { Contract, BrowserProvider, toUtf8Bytes, formatEther, AbiCoder } from 'ethers';
import { CONTRACT_ADDRESSES, NETWORK_CONFIG } from './config';
import RegistryABI from './abis/DWebNSRegistry.json';
import RegistrarABI from './abis/DWebNSRegistrar.json';
import ResolverABI from './abis/DWebNSResolver.json';
import { RecordTypes } from './constants/recordTypes';
import './App.css';

interface DomainInfo {
  name: string;
  label: string;
  owner: string;
  expires: number;
}

interface RecordData {
  recordType: number;
  label: string;
  data: string;
  decodedValue?: string;
  isEditing?: boolean;
}

function App() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  
  // Debug: Log connection state
  useEffect(() => {
    console.log('Connection state:', { isConnected, address, hasWalletClient: !!walletClient });
  }, [isConnected, address, walletClient]);

  // Auto-retry to get walletClient if connected but client not ready
  useEffect(() => {
    if (isConnected && address && !walletClient) {
      console.log('Wallet connected but client not ready, will retry...');
      const timer = setTimeout(() => {
        console.log('Attempting to refresh wallet client...');
        // Force a re-render by updating a dummy state
        setError('');
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isConnected, address, walletClient]);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Register domain state
  const [registerUsername, setRegisterUsername] = useState('');
  const [registerDuration, setRegisterDuration] = useState(365);
  const [registerPrice, setRegisterPrice] = useState('0');
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  
  // My domains state
  const [myDomains, setMyDomains] = useState<DomainInfo[]>([]);
  
  // Resolver state
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list'); // 'list' or 'detail'
  const [selectedDomain, setSelectedDomain] = useState('');
  const [records, setRecords] = useState<RecordData[]>([]);
  const [editingRecordKey, setEditingRecordKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editType, setEditType] = useState<number>(RecordTypes.TYPE_A);
  const [editLabel, setEditLabel] = useState('');

  // Get contracts
  const getContracts = async () => {
    if (!walletClient) {
      console.error('No wallet client available');
      return null;
    }
    
    try {
      console.log('Creating provider and signer...');
      const provider = new BrowserProvider(walletClient as unknown as { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> });
      const signer = await provider.getSigner();
      console.log('Signer address:', await signer.getAddress());
      
      console.log('Initializing contracts with addresses:', CONTRACT_ADDRESSES);
      const registry = new Contract(CONTRACT_ADDRESSES.registry, RegistryABI, signer);
      const registrar = new Contract(CONTRACT_ADDRESSES.registrar, RegistrarABI, signer);
      const resolver = new Contract(CONTRACT_ADDRESSES.resolver, ResolverABI, signer);
      
      return { registry, registrar, resolver };
    } catch (err) {
      console.error('Failed to initialize contracts:', err);
      return null;
    }
  };

  const checkAvailability = async () => {
    if (!registerUsername) {
      setError('Please enter a username');
      return;
    }
    
    if (!walletClient) {
      setError('Please connect your wallet first');
      return;
    }
    
    try {
      setError('');
      setLoading(true);
      console.log('Checking availability for:', registerUsername);
      
      const contracts = await getContracts();
      if (!contracts) {
        setError('Failed to initialize contracts');
        return;
      }
      
      // Convert string name to bytes32
      const nameBytes32 = new Uint8Array(32);
      const nameBytes = toUtf8Bytes(registerUsername);
      nameBytes32.set(nameBytes.slice(0, 32));
      const nameHex = '0x' + Array.from(nameBytes32).map(b => b.toString(16).padStart(2, '0')).join('');
      
      console.log('Name bytes32:', nameHex);
      
      const available = await contracts.registry.available(nameHex);
      console.log('Available:', available);
      setIsAvailable(available);
      
      if (available) {
        const durationSeconds = registerDuration * 24 * 60 * 60;
        const price = await contracts.registrar.priceForDuration(durationSeconds);
        console.log('Price:', formatEther(price), 'ETH');
        setRegisterPrice(formatEther(price));
      }
    } catch (err) {
      console.error('Check availability error:', err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const registerDomain = async () => {
    if (!registerUsername || !walletClient) return;
    
    try {
      setError('');
      setLoading(true);
      console.log('=== Starting domain registration ===');
      console.log('Username:', registerUsername);
      console.log('Duration (days):', registerDuration);
      
      const contracts = await getContracts();
      if (!contracts) {
        setError('Failed to initialize contracts');
        return;
      }
      
      const durationSeconds = registerDuration * 24 * 60 * 60;
      console.log('Duration (seconds):', durationSeconds);
      
      const price = await contracts.registrar.priceForDuration(durationSeconds);
      console.log('Calculated price:', formatEther(price), 'ETH');
      console.log('Price in wei:', price.toString());

      console.log('Calling registrar.register with:', {
        name: registerUsername,
        durationSeconds,
        value: price.toString()
      });

      // Call the register function with string name (not hash)
      const tx = await contracts.registrar.register(registerUsername, durationSeconds, {
        value: price,
      });
      
      console.log('Transaction sent:', tx.hash);
      console.log('Waiting for confirmation...');
      
      const receipt = await tx.wait();
      console.log('Transaction confirmed:', receipt);
      
      alert(`Domain registered successfully!\n\nTransaction: ${tx.hash}`);
      setRegisterUsername('');
      setIsAvailable(null);
      if (address) await loadMyDomains(address);
    } catch (err: unknown) {
      console.error('Registration error:', err);
      
      // Parse different error types
      let errorMessage = 'Registration failed';
      
      const error = err as { code?: string; reason?: string; message?: string };
      
      if (error.code === 'ACTION_REJECTED' || error.message?.includes('user rejected')) {
        errorMessage = 'Transaction was rejected. Please try again and approve the transaction in your wallet.';
      } else if (error.message?.includes('insufficient funds')) {
        errorMessage = 'Insufficient funds. Please make sure you have enough ETH for the registration fee and gas.';
      } else if (error.message?.includes('name taken')) {
        errorMessage = 'This domain name is already taken. Please try a different name.';
      } else if (error.message?.includes('signal is aborted')) {
        errorMessage = 'Transaction was cancelled or timed out. Please try again.';
      } else if (error.reason) {
        errorMessage = `Error: ${error.reason}`;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      console.error('Error message:', errorMessage);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const loadMyDomains = async (userAddress: string) => {
    try {
      console.log('Loading domains for:', userAddress);
      const contracts = await getContracts();
      if (!contracts) {
        console.log('No contracts available');
        return;
      }
      
      console.log('Querying events...');
      const filter = contracts.registry.filters.NameRegistered(userAddress);
      const events = await contracts.registry.queryFilter(filter);
      console.log('Found events:', events.length);

      const domains: DomainInfo[] = [];
      
      for (const event of events) {
        if (!('args' in event)) continue;
        const nameBytes32 = event.args?.[1]; // name is the second argument
        const record = await contracts.registry.records(nameBytes32);
        
        if (record.owner.toLowerCase() === userAddress.toLowerCase() && Number(record.expires) > Date.now() / 1000) {
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

      console.log('Loaded domains:', domains);
      setMyDomains(domains);
    } catch (err) {
      console.error('Failed to load domains:', err);
      // Don't show error to user, just log it
      // This is not critical for the app to function
    }
  };

  const loadResolverData = async () => {
    if (!selectedDomain || !walletClient) return;
    
    try {
      setError('');
      setLoading(true);
      const contracts = await getContracts();
      if (!contracts) return;
      
      // Convert name to bytes32
      const nameBytes32 = new Uint8Array(32);
      const nameBytes = toUtf8Bytes(selectedDomain);
      nameBytes32.set(nameBytes.slice(0, 32));
      const nameHex = '0x' + Array.from(nameBytes32).map(b => b.toString(16).padStart(2, '0')).join('');
      
      console.log('Loading records for name:', nameHex);
      
      // Query RecordChanged events for this name
      const filter = contracts.resolver.filters.RecordChanged(nameHex);
      const events = await contracts.resolver.queryFilter(filter);
      
      console.log('Found RecordChanged events:', events.length);
      
      // Process events to get unique records (latest value for each type+label combination)
      const recordMap = new Map<string, RecordData>();
      const abiCoder = AbiCoder.defaultAbiCoder();
      
      for (const event of events) {
        if (!('args' in event)) continue;
        
        const eventName = event.args?.[0];
        const label = event.args?.[1];
        const recordType = event.args?.[2];
        const data = event.args?.[3];
        
        // Only process events for the selected domain
        if (eventName !== nameHex) continue;
        
        // Skip empty data (record deletion)
        if (!data || data === '0x') continue;
        
        // Create unique key for this record
        const recordKey = `${recordType}-${label}`;
        
        // Decode label to string
        let labelStr = '';
        if (label !== '0x' + '0'.repeat(64)) {
          try {
            const labelBytes = new Uint8Array(
              label.slice(2).match(/.{2}/g)?.map((byte: string) => parseInt(byte, 16)) || []
            );
            labelStr = new TextDecoder().decode(labelBytes).replace(/\0/g, '');
          } catch {
            labelStr = label.slice(0, 10) + '...';
          }
        }
        
        // Decode data based on type
        let decodedValue = data;
        try {
          if (recordType === RecordTypes.TYPE_ETH_ADDRESS || 
              recordType === RecordTypes.TYPE_BTC_ADDRESS || 
              recordType === RecordTypes.TYPE_SOL_ADDRESS) {
            // Address types - ABI encoded
            decodedValue = abiCoder.decode(['address'], data)[0];
          } else {
            // All other types (Identity/Crypto/Content/Text) - UTF-8 string
            const textBytes = new Uint8Array(
              data.slice(2).match(/.{2}/g)?.map((byte: string) => parseInt(byte, 16)) || []
            );
            decodedValue = new TextDecoder().decode(textBytes).replace(/\0/g, '');
          }
        } catch (err) {
          console.log('Failed to decode data for type', recordType, err);
        }
        
        recordMap.set(recordKey, {
          recordType: Number(recordType),
          label: labelStr,
          data,
          decodedValue,
        });
      }
      
      const loadedRecords = Array.from(recordMap.values());
      console.log('Loaded records:', loadedRecords);
      setRecords(loadedRecords);
    } catch (err) {
      console.error('Load resolver data error:', err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const updateRecord = async (recordType: number, label: string, value: string) => {
    if (!selectedDomain || !value || !walletClient) return;
    
    try {
      setError('');
      setLoading(true);
      const contracts = await getContracts();
      if (!contracts) return;
      
      // Convert name to bytes32
      const nameBytes32 = new Uint8Array(32);
      const nameBytes = toUtf8Bytes(selectedDomain);
      nameBytes32.set(nameBytes.slice(0, 32));
      const nameHex = '0x' + Array.from(nameBytes32).map(b => b.toString(16).padStart(2, '0')).join('');
      
      // Convert label to bytes32
      let labelHex: string;
      if (!label || label.trim() === '') {
        labelHex = '0x' + '0'.repeat(64); // Empty label = bytes32(0)
      } else {
        const labelBytes32 = new Uint8Array(32);
        const labelBytes = toUtf8Bytes(label);
        labelBytes32.set(labelBytes.slice(0, 32));
        labelHex = '0x' + Array.from(labelBytes32).map(b => b.toString(16).padStart(2, '0')).join('');
      }
      
      // Encode data based on record type
      let encodedData: string;
      const abiCoder = AbiCoder.defaultAbiCoder();
      
      if (recordType === RecordTypes.TYPE_ETH_ADDRESS || 
          recordType === RecordTypes.TYPE_BTC_ADDRESS || 
          recordType === RecordTypes.TYPE_SOL_ADDRESS) {
        // Address types - ABI encode as address
        encodedData = abiCoder.encode(['address'], [value]);
      } else {
        // All other types (Identity/Crypto/Content/Text) - UTF-8 string
        encodedData = '0x' + Array.from(toUtf8Bytes(value))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
      }
      
      console.log('Setting record:', {
        name: nameHex,
        recordType,
        label: labelHex,
        data: encodedData
      });
      
      const tx = await contracts.resolver.setRecord(nameHex, recordType, labelHex, encodedData);
      await tx.wait();
      
      alert(`Record updated successfully!\nTransaction: ${tx.hash}`);
      setEditingRecordKey(null);
      setEditValue('');
      setEditType(RecordTypes.TYPE_A);
      setEditLabel('');
      await loadResolverData();
    } catch (err) {
      console.error('Set record error:', err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleEditRecord = (recordType: number, label: string, currentValue: string) => {
    const key = `${recordType}-${label}`;
    setEditingRecordKey(key);
    setEditValue(currentValue);
    setEditType(recordType);
    setEditLabel(label);
  };

  const handleCancelEdit = () => {
    setEditingRecordKey(null);
    setEditValue('');
    setEditType(RecordTypes.TYPE_A);
    setEditLabel('');
  };

  const handleSaveRecord = async () => {
    await updateRecord(editType, editLabel, editValue);
  };

  const handleAddNewRecord = () => {
    // Set editing mode for a new record
    setEditingRecordKey('new-record');
    setEditType(RecordTypes.TYPE_A);
    setEditLabel('');
    setEditValue('');
  };

  const handleConnect = async () => {
    // Check if MetaMask is installed
    if (typeof window !== 'undefined' && !window.ethereum) {
      setError('Please install MetaMask to use this app');
      alert('Please install MetaMask browser extension to connect your wallet.\n\nVisit: https://metamask.io');
      return;
    }

    try {
      setError('');
      setLoading(true);
      
      // First, try to switch to the correct network
      const chainIdHex = `0x${NETWORK_CONFIG.chainId.toString(16)}`;
      
      try {
        console.log('Attempting to switch to chain:', chainIdHex);
        await window.ethereum!.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: chainIdHex }],
        });
        console.log('Successfully switched to network');
      } catch (switchError: unknown) {
        const error = switchError as { code?: number; message?: string };
        // This error code indicates that the chain has not been added to MetaMask
        if (error.code === 4902) {
          console.log('Network not found, adding it...');
          try {
            await window.ethereum!.request({
              method: 'wallet_addEthereumChain',
              params: [
                {
                  chainId: chainIdHex,
                  chainName: NETWORK_CONFIG.chainName,
                  nativeCurrency: {
                    name: 'Ethereum',
                    symbol: 'ETH',
                    decimals: 18,
                  },
                  rpcUrls: [NETWORK_CONFIG.rpcUrl],
                  blockExplorerUrls: NETWORK_CONFIG.blockExplorer ? [NETWORK_CONFIG.blockExplorer] : undefined,
                },
              ],
            });
            console.log('Network added successfully');
          } catch (addError) {
            console.error('Failed to add network:', addError);
            throw addError;
          }
        } else {
          // Handle other errors
          throw switchError;
        }
      }
      
      // Now connect the wallet
      await connect({ connector: injected() });
    } catch (err) {
      console.error('Connection error:', err);
      setError((err as Error).message || 'Failed to connect wallet');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedDomain && walletClient) {
      loadResolverData();
      
      // Set up event listener for new records
      const setupEventListener = async () => {
        const contracts = await getContracts();
        if (!contracts) return;
        
        // Convert name to bytes32
        const nameBytes32 = new Uint8Array(32);
        const nameBytes = toUtf8Bytes(selectedDomain);
        nameBytes32.set(nameBytes.slice(0, 32));
        const nameHex = '0x' + Array.from(nameBytes32).map(b => b.toString(16).padStart(2, '0')).join('');
        
        // Listen for new RecordChanged events for this domain
        const filter = contracts.resolver.filters.RecordChanged(nameHex);
        
        const handleRecordChanged = () => {
          console.log('Record changed event detected, reloading...');
          loadResolverData();
        };
        
        contracts.resolver.on(filter, handleRecordChanged);
        
        // Cleanup function
        return () => {
          contracts.resolver.off(filter, handleRecordChanged);
        };
      };
      
      setupEventListener();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDomain]);

  useEffect(() => {
    if (isConnected && address && walletClient) {
      console.log('Connection ready, loading domains...');
      loadMyDomains(address);
    }
  }, [isConnected, address, walletClient]);

  return (
    <div className="App">
      <header className="header">
        <h1>DWebNS - Decentralized Name Service</h1>
        {!isConnected ? (
          <button onClick={handleConnect} disabled={loading}>
            {loading ? 'Connecting...' : 'Connect Wallet'}
          </button>
        ) : (
          <div className="account-info">
            <span>Connected: {address?.slice(0, 6)}...{address?.slice(-4)}</span>
            <button onClick={() => disconnect()} style={{ marginLeft: '1rem' }}>
              Disconnect
            </button>
          </div>
        )}
      </header>

      {error && <div className="error">{error}</div>}

      {/* Debug info */}
      {isConnected && !walletClient && (
        <div style={{ padding: '1rem', margin: '1rem auto', maxWidth: '1200px', background: '#fff3cd', borderRadius: '8px', border: '1px solid #ffc107' }}>
          <p style={{ margin: '0 0 0.5rem 0', fontWeight: 600 }}>⚠️ Wallet Client Initializing...</p>
          <p style={{ fontSize: '0.875rem', color: '#666', margin: '0 0 1rem 0' }}>Your wallet is connected, but the client is still initializing. Waiting for wallet client...</p>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button onClick={() => window.location.reload()} style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}>
              Refresh Page
            </button>
            <button onClick={() => disconnect()} style={{ fontSize: '0.875rem', padding: '0.5rem 1rem', background: '#6c757d' }}>
              Disconnect & Retry
            </button>
          </div>
        </div>
      )}

      {isConnected && address && walletClient && (
        <div className="main-content">
          {loading && (
            <div style={{ padding: '1rem', textAlign: 'center', color: '#666' }}>
              Loading...
            </div>
          )}
          {/* Register Domain Section */}
          <section className="section">
            <h2>Register Domain</h2>
            <div className="form-group">
              <input
                type="text"
                placeholder="Enter username (e.g., alice)"
                value={registerUsername}
                onChange={(e) => {
                  setRegisterUsername(e.target.value.toLowerCase());
                  setIsAvailable(null);
                }}
              />
              <button onClick={checkAvailability} disabled={loading || !registerUsername}>
                Check Availability
              </button>
            </div>

            {isAvailable !== null && (
              <div className="availability-result">
                {isAvailable ? (
                  <>
                    <p className="available">✓ {registerUsername}.dweb is available!</p>
                    <div className="form-group">
                      <label>
                        Duration (days):
                        <input
                          type="number"
                          value={registerDuration}
                          onChange={(e) => setRegisterDuration(Number(e.target.value))}
                          min="1"
                        />
                      </label>
                      <p>Price: {registerPrice} ETH</p>
                      <button onClick={registerDomain} disabled={loading}>
                        {loading ? 'Registering...' : 'Register Domain'}
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="unavailable">✗ {registerUsername}.dweb is not available</p>
                )}
              </div>
            )}
          </section>

          {/* My Domains Section */}
          <section className="section">
            <h2>My Domains</h2>
            {myDomains.length === 0 ? (
              <p>You don't have any domains yet.</p>
            ) : (
              <div className="domains-list">
                {myDomains.map((domain, index) => (
                  <div key={index} className="domain-card">
                    <h3>{domain.name}</h3>
                    <p>Expires: {new Date(domain.expires * 1000).toLocaleDateString()}</p>
                    <button onClick={() => {
                      setSelectedDomain(domain.label);
                      setViewMode('detail');
                    }}>
                      Manage Records
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* DNS Records Management Section (Detail View) */}
          {selectedDomain && viewMode === 'detail' && (
            <section className="section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2>DNS Records - {selectedDomain}.dweb</h2>
                <button onClick={() => {
                  setSelectedDomain('');
                  setViewMode('list');
                  setEditingRecordKey(null);
                }} className="back-button">
                  ← Back to Domains
                </button>
              </div>
              
              <div className="dns-records-table">
                <div className="table-header">
                  <button onClick={handleAddNewRecord} disabled={loading} style={{ marginBottom: '1rem' }}>
                    + Add Record
                  </button>
                  <button 
                    onClick={loadResolverData} 
                    disabled={loading}
                    style={{ marginBottom: '1rem', marginLeft: '0.5rem' }}
                  >
                    {loading ? 'Refreshing...' : '🔄 Refresh'}
                  </button>
                </div>

                {(records.length === 0 && editingRecordKey !== 'new-record') ? (
                  <p style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
                    No DNS records configured yet. Click "+ Add Record" to get started.
                  </p>
                ) : (
                  <table className="records-table">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Label</th>
                        <th>Value</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Existing records */}
                      {records.map((record, index) => {
                        const recordKey = `${record.recordType}-${record.label}`;
                        const isEditing = editingRecordKey === recordKey;
                        
                        return (
                          <tr key={index}>
                            <td>
                              {isEditing ? (
                                <select 
                                  value={record.recordType}
                                  disabled
                                  style={{ width: '150px', opacity: 0.6, cursor: 'not-allowed' }}
                                >
                                  <optgroup label="DNS Standard">
                                    <option value={RecordTypes.TYPE_A}>A</option>
                                    <option value={RecordTypes.TYPE_TXT}>TXT</option>
                                  </optgroup>
                                  <optgroup label="Address">
                                    <option value={RecordTypes.TYPE_ETH_ADDRESS}>ETH Address</option>
                                    <option value={RecordTypes.TYPE_BTC_ADDRESS}>BTC Address</option>
                                    <option value={RecordTypes.TYPE_SOL_ADDRESS}>SOL Address</option>
                                  </optgroup>
                                  <optgroup label="Content">
                                    <option value={RecordTypes.TYPE_IPFS_CID}>IPFS CID</option>
                                    <option value={RecordTypes.TYPE_CONTENT_HASH}>Content Hash</option>
                                    <option value={RecordTypes.TYPE_ARWEAVE_ID}>Arweave</option>
                                  </optgroup>
                                  <optgroup label="Identity">
                                    <option value={RecordTypes.TYPE_PUBKEY}>Public Key</option>
                                    <option value={RecordTypes.TYPE_DID}>DID</option>
                                  </optgroup>
                                </select>
                              ) : (
                                <span className="record-type-badge">{getRecordTypeName(record.recordType)}</span>
                              )}
                            </td>
                            <td>
                              {isEditing ? (
                                <input 
                                  type="text" 
                                  value={record.label}
                                  disabled
                                  placeholder="(default)"
                                  style={{ width: '120px', opacity: 0.6, cursor: 'not-allowed' }}
                                />
                              ) : (
                                <span className="record-label">{record.label || '(default)'}</span>
                              )}
                            </td>
                            <td>
                              {isEditing ? (
                                <input 
                                  type="text" 
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  placeholder={getPlaceholderForType(record.recordType)}
                                  style={{ width: '100%', minWidth: '300px' }}
                                />
                              ) : (
                                <span className="record-value" title={record.decodedValue || record.data}>
                                  {record.decodedValue || record.data}
                                </span>
                              )}
                            </td>
                            <td>
                              {isEditing ? (
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                  <button 
                                    onClick={handleSaveRecord}
                                    disabled={loading || !editValue}
                                    style={{ padding: '0.25rem 0.75rem', fontSize: '0.875rem', background: '#10b981' }}
                                  >
                                    Save
                                  </button>
                                  <button 
                                    onClick={handleCancelEdit}
                                    disabled={loading}
                                    style={{ padding: '0.25rem 0.75rem', fontSize: '0.875rem', background: '#6b7280' }}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button 
                                  onClick={() => handleEditRecord(record.recordType, record.label, record.decodedValue || '')}
                                  disabled={loading}
                                  style={{ padding: '0.25rem 0.75rem', fontSize: '0.875rem' }}
                                >
                                  Edit
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      
                      {/* New record row */}
                      {editingRecordKey === 'new-record' && (
                        <tr>
                          <td>
                            <select 
                              value={editType}
                              onChange={(e) => setEditType(Number(e.target.value))}
                              style={{ width: '150px' }}
                            >
                              <optgroup label="DNS Standard">
                                <option value={RecordTypes.TYPE_A}>A</option>
                                <option value={RecordTypes.TYPE_TXT}>TXT</option>
                              </optgroup>
                              <optgroup label="Address">
                                <option value={RecordTypes.TYPE_ETH_ADDRESS}>ETH Address</option>
                                <option value={RecordTypes.TYPE_BTC_ADDRESS}>BTC Address</option>
                                <option value={RecordTypes.TYPE_SOL_ADDRESS}>SOL Address</option>
                              </optgroup>
                              <optgroup label="Content">
                                <option value={RecordTypes.TYPE_IPFS_CID}>IPFS CID</option>
                                <option value={RecordTypes.TYPE_CONTENT_HASH}>Content Hash</option>
                                <option value={RecordTypes.TYPE_ARWEAVE_ID}>Arweave</option>
                              </optgroup>
                              <optgroup label="Identity">
                                <option value={RecordTypes.TYPE_PUBKEY}>Public Key</option>
                                <option value={RecordTypes.TYPE_DID}>DID</option>
                              </optgroup>
                            </select>
                          </td>
                          <td>
                            <input 
                              type="text" 
                              value={editLabel}
                              onChange={(e) => setEditLabel(e.target.value)}
                              placeholder="(default)"
                              style={{ width: '120px' }}
                            />
                          </td>
                          <td>
                            <input 
                              type="text" 
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              placeholder={getPlaceholderForType(editType)}
                              style={{ width: '100%', minWidth: '300px' }}
                              autoFocus
                            />
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button 
                                onClick={handleSaveRecord}
                                disabled={loading || !editValue}
                                style={{ padding: '0.25rem 0.75rem', fontSize: '0.875rem', background: '#10b981' }}
                              >
                                Add
                              </button>
                              <button 
                                onClick={handleCancelEdit}
                                disabled={loading}
                                style={{ padding: '0.25rem 0.75rem', fontSize: '0.875rem', background: '#6b7280' }}
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

// Helper function to get record type name
function getRecordTypeName(type: number): string {
  const typeMap: { [key: number]: string } = {
    // DNS Standard Types
    [RecordTypes.TYPE_A]: 'A',
    [RecordTypes.TYPE_TXT]: 'TXT',
    // Address Records
    [RecordTypes.TYPE_ETH_ADDRESS]: 'ETH',
    [RecordTypes.TYPE_BTC_ADDRESS]: 'BTC',
    [RecordTypes.TYPE_SOL_ADDRESS]: 'SOL',
    // Identity Records
    [RecordTypes.TYPE_PUBKEY]: 'PUBKEY',
    [RecordTypes.TYPE_DID]: 'DID',
    // Content Records
    [RecordTypes.TYPE_CONTENT_HASH]: 'HASH',
    [RecordTypes.TYPE_IPFS_CID]: 'IPFS',
    [RecordTypes.TYPE_SWARM_HASH]: 'SWARM',
    [RecordTypes.TYPE_ARWEAVE_ID]: 'AR',
  };
  return typeMap[type] || `TYPE_${type}`;
}

// Helper function to get placeholder text for input
function getPlaceholderForType(type: number): string {
  if (type === RecordTypes.TYPE_ETH_ADDRESS) return '0x...';
  if (type === RecordTypes.TYPE_BTC_ADDRESS) return 'bc1... or 1...';
  if (type === RecordTypes.TYPE_SOL_ADDRESS) return 'Solana address...';
  if (type === RecordTypes.TYPE_IPFS_CID) return 'QmXxx... or bafyxxx...';
  if (type === RecordTypes.TYPE_CONTENT_HASH) return '0x...';
  if (type === RecordTypes.TYPE_ARWEAVE_ID) return 'Arweave transaction ID...';
  if (type === RecordTypes.TYPE_PUBKEY) return '0x... (hex public key)';
  if (type === RecordTypes.TYPE_DID) return 'did:...';
  if (type === RecordTypes.TYPE_TXT) return 'Text content...';
  return 'Value...';
}

export default App;
