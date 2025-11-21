import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWalletClient } from 'wagmi';
import { Contract, BrowserProvider, toUtf8Bytes, AbiCoder } from 'ethers';
import { CONTRACT_ADDRESSES } from '../config';
import ResolverABI from '../abis/DWebNSResolver.json';
import { RecordTypes } from '../constants/recordTypes';
import '../RecordsPage.css';

interface RecordData {
  recordType: number;
  label: string;
  data: string;
  decodedValue?: string;
}

export function RecordsPage() {
  const { domainName } = useParams<{ domainName: string }>();
  const navigate = useNavigate();
  const { data: walletClient } = useWalletClient();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [records, setRecords] = useState<RecordData[]>([]);
  const [editingRecordKey, setEditingRecordKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editType, setEditType] = useState<number>(RecordTypes.TYPE_A);
  const [editLabel, setEditLabel] = useState('');
  const [copySuccess, setCopySuccess] = useState<string | null>(null);

  // Get resolver contract
  const getResolverContract = async () => {
    if (!walletClient) return null;
    
    try {
      const provider = new BrowserProvider(walletClient as unknown as { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> });
      const signer = await provider.getSigner();
      return new Contract(CONTRACT_ADDRESSES.resolver, ResolverABI, signer);
    } catch (err) {
      console.error('Failed to initialize resolver:', err);
      return null;
    }
  };

  const getRecordTypeName = (type: number): string => {
    const typeNames: { [key: number]: string } = {
      [RecordTypes.TYPE_A]: 'A',
      [RecordTypes.TYPE_TXT]: 'TXT',
      [RecordTypes.TYPE_ETH_ADDRESS]: 'ETH Address',
      [RecordTypes.TYPE_BTC_ADDRESS]: 'BTC Address',
      [RecordTypes.TYPE_SOL_ADDRESS]: 'SOL Address',
      [RecordTypes.TYPE_IPFS_CID]: 'IPFS CID',
      [RecordTypes.TYPE_CONTENT_HASH]: 'Content Hash',
      [RecordTypes.TYPE_ARWEAVE_ID]: 'Arweave',
      [RecordTypes.TYPE_PUBKEY]: 'Public Key',
      [RecordTypes.TYPE_DID]: 'DID',
    };
    return typeNames[type] || `Type ${type}`;
  };

  const getPlaceholderForType = (type: number): string => {
    const placeholders: { [key: number]: string } = {
      [RecordTypes.TYPE_A]: '192.168.1.1',
      [RecordTypes.TYPE_TXT]: 'Your text content',
      [RecordTypes.TYPE_ETH_ADDRESS]: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
      [RecordTypes.TYPE_BTC_ADDRESS]: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
      [RecordTypes.TYPE_SOL_ADDRESS]: '7EqQdEULxWcraVx3mXKFjc84LhCkMGZCkRuDpvcMwJeK',
      [RecordTypes.TYPE_IPFS_CID]: 'QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco',
      [RecordTypes.TYPE_CONTENT_HASH]: '0xe301...',
      [RecordTypes.TYPE_ARWEAVE_ID]: 'ar://abc123...',
      [RecordTypes.TYPE_PUBKEY]: 'ssh-rsa AAAA...',
      [RecordTypes.TYPE_DID]: 'did:example:123456',
    };
    return placeholders[type] || 'Enter value';
  };

  const loadResolverData = async () => {
    if (!domainName || !walletClient) return;
    
    try {
      setLoading(true);
      const resolver = await getResolverContract();
      if (!resolver) return;
      
      // Convert name to bytes32
      const nameBytes32 = new Uint8Array(32);
      const nameBytes = toUtf8Bytes(domainName);
      nameBytes32.set(nameBytes.slice(0, 32));
      const nameHex = '0x' + Array.from(nameBytes32).map(b => b.toString(16).padStart(2, '0')).join('');
      
      // Query RecordChanged events for this name
      const filter = resolver.filters.RecordChanged(nameHex);
      const events = await resolver.queryFilter(filter);
      
      // Process events to get unique records
      const recordMap = new Map<string, RecordData>();
      const abiCoder = AbiCoder.defaultAbiCoder();
      
      for (const event of events) {
        if (!('args' in event)) continue;
        // event.args: [name, label, recordType, data]
        const labelBytes32 = event.args?.[1];
        const recordType = Number(event.args?.[2]);
        const data = event.args?.[3];
        
        // Decode label - ensure labelBytes32 is a string
        const labelHex = typeof labelBytes32 === 'string' ? labelBytes32 : String(labelBytes32);
        let label = '';
        if (labelHex && labelHex !== '0x' + '0'.repeat(64)) {
          try {
            const labelBytes = new Uint8Array(
              labelHex.slice(2).match(/.{2}/g)?.map((byte: string) => parseInt(byte, 16)) || []
            );
            label = new TextDecoder().decode(labelBytes).replace(/\0/g, '');
          } catch (err) {
            console.error('Failed to decode label:', err);
            label = '';
          }
        }
        
        const recordKey = `${recordType}-${label}`;
        
        // Decode data based on type
        let decodedValue = '';
        if (data && data !== '0x') {
          if (recordType === RecordTypes.TYPE_ETH_ADDRESS || 
              recordType === RecordTypes.TYPE_BTC_ADDRESS || 
              recordType === RecordTypes.TYPE_SOL_ADDRESS) {
            try {
              decodedValue = abiCoder.decode(['address'], data)[0];
            } catch {
              decodedValue = data;
            }
          } else {
            // UTF-8 string for all other types
            try {
              const dataHex = typeof data === 'string' ? data : String(data);
              const textBytes = new Uint8Array(
                dataHex.slice(2).match(/.{2}/g)?.map((byte: string) => parseInt(byte, 16)) || []
              );
              decodedValue = new TextDecoder().decode(textBytes);
            } catch {
              decodedValue = data;
            }
          }
        }
        
        recordMap.set(recordKey, { recordType, label, data, decodedValue });
      }
      
      setRecords(Array.from(recordMap.values()));
    } catch (err) {
      console.error('Failed to load resolver data:', err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const updateRecord = async (recordType: number, label: string, value: string) => {
    if (!domainName || !value || !walletClient) return;
    
    try {
      setError('');
      setLoading(true);
      const resolver = await getResolverContract();
      if (!resolver) return;
      
      // Convert name to bytes32
      const nameBytes32 = new Uint8Array(32);
      const nameBytes = toUtf8Bytes(domainName);
      nameBytes32.set(nameBytes.slice(0, 32));
      const nameHex = '0x' + Array.from(nameBytes32).map(b => b.toString(16).padStart(2, '0')).join('');
      
      // Convert label to bytes32
      let labelHex: string;
      if (!label || label.trim() === '') {
        labelHex = '0x' + '0'.repeat(64);
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
        encodedData = abiCoder.encode(['address'], [value]);
      } else {
        encodedData = '0x' + Array.from(toUtf8Bytes(value))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
      }
      
      const tx = await resolver.setRecord(nameHex, recordType, labelHex, encodedData);
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
    setEditingRecordKey('new-record');
    setEditType(RecordTypes.TYPE_A);
    setEditLabel('');
    setEditValue('');
  };

  const handleCopyValue = async (value: string, recordKey: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopySuccess(recordKey);
      setTimeout(() => setCopySuccess(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  useEffect(() => {
    if (domainName && walletClient) {
      loadResolverData();
      
      // Set up event listener for new records
      const setupEventListener = async () => {
        const resolver = await getResolverContract();
        if (!resolver) return;
        
        const nameBytes32 = new Uint8Array(32);
        const nameBytes = toUtf8Bytes(domainName);
        nameBytes32.set(nameBytes.slice(0, 32));
        const nameHex = '0x' + Array.from(nameBytes32).map(b => b.toString(16).padStart(2, '0')).join('');
        
        const filter = resolver.filters.RecordChanged(nameHex);
        
        const handleRecordChanged = () => {
          loadResolverData();
        };
        
        resolver.on(filter, handleRecordChanged);
        
        return () => {
          resolver.off(filter, handleRecordChanged);
        };
      };
      
      setupEventListener();
    }
  }, [domainName, walletClient]);

  if (!walletClient) {
    return <div className="main-content">Please connect your wallet</div>;
  }

  return (
    <div className="main-content">
      <div style={{ marginBottom: '1rem' }}>
        <button onClick={() => navigate('/console/home')} style={{ marginRight: '1rem' }}>
          ← Back to Domains
        </button>
      </div>

      <section className="section">
        <h2>DNS Records for {domainName}.dweb</h2>
        
        {error && <div className="error">{error}</div>}

        <div style={{ marginBottom: '1rem' }}>
          <button onClick={handleAddNewRecord} disabled={loading || editingRecordKey !== null}>
            + Add Record
          </button>
        </div>

        {loading && records.length === 0 ? (
          <p>Loading records...</p>
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
                        <div className="value-cell">
                          <span 
                            className="record-value clickable" 
                            onClick={() => handleCopyValue(record.decodedValue || record.data, recordKey)}
                            title="Click to copy"
                          >
                            {record.decodedValue || record.data}
                            <span className="value-tooltip">{record.decodedValue || record.data}</span>
                          </span>
                          {copySuccess === recordKey && (
                            <span className="copy-feedback">✓ Copied!</span>
                          )}
                        </div>
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
      </section>
    </div>
  );
}
