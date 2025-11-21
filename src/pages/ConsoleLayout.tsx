import { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { NETWORK_CONFIG } from '../config';

export function ConsoleLayout() {
  const navigate = useNavigate();
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

  return (
    <div className="console-layout">
      <header className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <h1 style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>
            DWebNS
          </h1>
          <nav className="console-nav">
            <a href="#" onClick={(e) => { e.preventDefault(); navigate('/console/home'); }}>
              Console
            </a>
          </nav>
        </div>
        <div className="wallet-section">
          {!isConnected ? (
            <button onClick={handleConnect} disabled={loading}>
              {loading ? 'Connecting...' : 'Connect Wallet'}
            </button>
          ) : (
            <>
              <span className="address">{address?.slice(0, 6)}...{address?.slice(-4)}</span>
              <button onClick={() => disconnect()}>Disconnect</button>
            </>
          )}
        </div>
      </header>

      {error && <div className="error" style={{ margin: '1rem' }}>{error}</div>}

      {!isConnected ? (
        <div className="main-content">
          <p>Please connect your wallet to use DWebNS Console</p>
        </div>
      ) : (
        <Outlet />
      )}
    </div>
  );
}
