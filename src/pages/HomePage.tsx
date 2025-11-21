import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccount, useWalletClient } from 'wagmi';
import { Contract, BrowserProvider, toUtf8Bytes, formatEther } from 'ethers';
import { CONTRACT_ADDRESSES } from '../config';
import RegistryABI from '../abis/DWebNSRegistry.json';
import RegistrarABI from '../abis/DWebNSRegistrar.json';

interface DomainInfo {
    name: string;
    label: string;
    owner: string;
    expires: number;
}

export function HomePage() {
    const navigate = useNavigate();
    const { address, isConnected } = useAccount();
    const { data: walletClient } = useWalletClient();

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Register domain state
    const [registerUsername, setRegisterUsername] = useState('');
    const [registerDuration, setRegisterDuration] = useState(365);
    const [registerPrice, setRegisterPrice] = useState('0');
    const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
    const [domainOwner, setDomainOwner] = useState<string | null>(null);
    const [domainExpires, setDomainExpires] = useState<number>(0);

    // Renewal dialog state
    const [showRenewalDialog, setShowRenewalDialog] = useState(false);
    const [renewalDomain, setRenewalDomain] = useState<string>('');
    const [renewalDuration, setRenewalDuration] = useState(365);
    const [renewalPrice, setRenewalPrice] = useState('0');
    const [renewalExpires, setRenewalExpires] = useState<number>(0);

    // My domains state
    const [myDomains, setMyDomains] = useState<DomainInfo[]>([]);

    // Get contracts
    const getContracts = async () => {
        if (!walletClient) {
            console.error('No wallet client available');
            return null;
        }

        try {
            const provider = new BrowserProvider(walletClient as unknown as { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> });
            const signer = await provider.getSigner();

            const registry = new Contract(CONTRACT_ADDRESSES.registry, RegistryABI, signer);
            const registrar = new Contract(CONTRACT_ADDRESSES.registrar, RegistrarABI, signer);

            return { registry, registrar };
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

            const available = await contracts.registry.available(nameHex);
            setIsAvailable(available);

            if (!available) {
                // Check if the owner is current user
                const record = await contracts.registry.records(nameHex);
                setDomainOwner(record.owner);
                setDomainExpires(Number(record.expires));

                // If it's current user's domain, get renewal price
                if (address && record.owner.toLowerCase() === address.toLowerCase()) {
                    const durationSeconds = registerDuration * 24 * 60 * 60;
                    const price = await contracts.registrar.priceForDuration(durationSeconds);
                    const formattedPrice = Number(formatEther(price)).toFixed(6).replace(/\.?0+$/, '');
                    setRegisterPrice(formattedPrice);
                }
            } else {
                setDomainOwner(null);
                setDomainExpires(0);
            }

            if (available) {
                const durationSeconds = registerDuration * 24 * 60 * 60;
                const price = await contracts.registrar.priceForDuration(durationSeconds);
                const formattedPrice = Number(formatEther(price)).toFixed(6).replace(/\.?0+$/, '');
                setRegisterPrice(formattedPrice);
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

            const contracts = await getContracts();
            if (!contracts) {
                setError('Failed to initialize contracts');
                return;
            }

            const durationSeconds = registerDuration * 24 * 60 * 60;
            const price = await contracts.registrar.priceForDuration(durationSeconds);

            const tx = await contracts.registrar.register(registerUsername, durationSeconds, {
                value: price,
            });

            await tx.wait();

            alert(`Domain registered successfully!\n\nTransaction: ${tx.hash}`);
            setRegisterUsername('');
            setIsAvailable(null);
            setDomainOwner(null);
            if (address) await loadMyDomains(address);
        } catch (err: unknown) {
            console.error('Registration error:', err);

            let errorMessage = 'Registration failed';
            const error = err as { code?: string; reason?: string; message?: string };

            if (error.code === 'ACTION_REJECTED' || error.message?.includes('user rejected')) {
                errorMessage = 'Transaction was rejected. Please try again and approve the transaction in your wallet.';
            } else if (error.message?.includes('insufficient funds')) {
                errorMessage = 'Insufficient funds. Please make sure you have enough ETH for the registration fee and gas.';
            } else if (error.message?.includes('name taken')) {
                errorMessage = 'This domain name is already taken. Please try a different name.';
            } else if (error.reason) {
                errorMessage = `Error: ${error.reason}`;
            } else if (error.message) {
                errorMessage = error.message;
            }

            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const loadMyDomains = async (userAddress: string) => {
        try {
            const contracts = await getContracts();
            if (!contracts) return;

            const filter = contracts.registry.filters.NameRegistered(userAddress);
            const events = await contracts.registry.queryFilter(filter);

            const domains: DomainInfo[] = [];

            for (const event of events) {
                if (!('args' in event)) continue;
                const nameBytes32 = event.args?.[1];
                const record = await contracts.registry.records(nameBytes32);

                if (record.owner.toLowerCase() === userAddress.toLowerCase() && Number(record.expires) > Date.now() / 1000) {
                    // Ensure nameBytes32 is a string
                    const nameHex = typeof nameBytes32 === 'string' ? nameBytes32 : String(nameBytes32);
                    let nameStr = '';
                    try {
                        const nameBytes = new Uint8Array(
                            nameHex.slice(2).match(/.{2}/g)?.map((byte: string) => parseInt(byte, 16)) || []
                        );
                        nameStr = new TextDecoder().decode(nameBytes).replace(/\0/g, '');
                    } catch (err) {
                        console.error('Failed to decode domain name:', err);
                        continue;
                    }

                    domains.push({
                        name: `${nameStr}.dweb`,
                        label: nameStr,
                        owner: record.owner,
                        expires: Number(record.expires),
                    });
                }
            }

            setMyDomains(domains);
        } catch (err) {
            console.error('Failed to load domains:', err);
        }
    };

    const updatePrice = async (duration: number) => {
        if (!walletClient) return;

        try {
            const contracts = await getContracts();
            if (!contracts) return;

            const durationSeconds = duration * 24 * 60 * 60;
            const price = await contracts.registrar.priceForDuration(durationSeconds);
            // Format price and remove trailing zeros
            const formattedPrice = Number(formatEther(price)).toFixed(6).replace(/\.?0+$/, '');
            setRegisterPrice(formattedPrice);
        } catch (err) {
            console.error('Failed to update price:', err);
        }
    };

    const handleDurationChange = (newDuration: number) => {
        setRegisterDuration(newDuration);
        // Only update price if we have already checked availability
        if (isAvailable !== null && (isAvailable || (domainOwner && address && domainOwner.toLowerCase() === address.toLowerCase()))) {
            updatePrice(newDuration);
        }
    };

    const openRenewalDialog = async (domainLabel: string, expires: number) => {
        setRenewalDomain(domainLabel);
        setRenewalExpires(expires);
        setRenewalDuration(365);
        setShowRenewalDialog(true);

        // Calculate initial renewal price
        if (walletClient) {
            try {
                const contracts = await getContracts();
                if (contracts) {
                    const durationSeconds = 365 * 24 * 60 * 60;
                    const price = await contracts.registrar.priceForDuration(durationSeconds);
                    const formattedPrice = Number(formatEther(price)).toFixed(6).replace(/\.?0+$/, '');
                    setRenewalPrice(formattedPrice);
                }
            } catch (err) {
                console.error('Failed to get renewal price:', err);
            }
        }
    };

    const handleRenewalDurationChange = async (newDuration: number) => {
        setRenewalDuration(newDuration);

        if (walletClient) {
            try {
                const contracts = await getContracts();
                if (contracts) {
                    const durationSeconds = newDuration * 24 * 60 * 60;
                    const price = await contracts.registrar.priceForDuration(durationSeconds);
                    const formattedPrice = Number(formatEther(price)).toFixed(6).replace(/\.?0+$/, '');
                    setRenewalPrice(formattedPrice);
                }
            } catch (err) {
                console.error('Failed to update renewal price:', err);
            }
        }
    };

    const handleRenewFromDialog = async () => {
        if (!renewalDomain || !walletClient) return;

        try {
            setError('');
            setLoading(true);

            const contracts = await getContracts();
            if (!contracts) {
                setError('Failed to initialize contracts');
                return;
            }

            // Convert string name to bytes32
            const nameBytes32 = new Uint8Array(32);
            const nameBytes = toUtf8Bytes(renewalDomain);
            nameBytes32.set(nameBytes.slice(0, 32));
            const nameHex = '0x' + Array.from(nameBytes32).map(b => b.toString(16).padStart(2, '0')).join('');

            const durationSeconds = renewalDuration * 24 * 60 * 60;
            const price = await contracts.registrar.priceForDuration(durationSeconds);

            const tx = await contracts.registrar.renew(nameHex, durationSeconds, {
                value: price,
            });

            await tx.wait();

            alert(`Domain renewed successfully!\n\nTransaction: ${tx.hash}`);
            setShowRenewalDialog(false);
            if (address) await loadMyDomains(address);

            // If renewing from search result, refresh the search
            if (registerUsername === renewalDomain) {
                await checkAvailability();
            }
        } catch (err: unknown) {
            console.error('Renewal error:', err);

            let errorMessage = 'Renewal failed';
            const error = err as { code?: string; reason?: string; message?: string };

            if (error.code === 'ACTION_REJECTED' || error.message?.includes('user rejected')) {
                errorMessage = 'Transaction was rejected. Please try again and approve the transaction in your wallet.';
            } else if (error.message?.includes('insufficient funds')) {
                errorMessage = 'Insufficient funds. Please make sure you have enough ETH for the renewal fee and gas.';
            } else if (error.reason) {
                errorMessage = `Error: ${error.reason}`;
            } else if (error.message) {
                errorMessage = error.message;
            }

            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isConnected && address && walletClient) {
            loadMyDomains(address);
        }
    }, [isConnected, address, walletClient]);

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && showRenewalDialog) {
                setShowRenewalDialog(false);
            }
        };

        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [showRenewalDialog]);

    if (!isConnected || !walletClient) {
        return null;
    }

    return (
        <div className="main-content">
            {error && <div className="error">{error}</div>}

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
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && registerUsername && !loading) {
                                checkAvailability();
                            }
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
                                            onChange={(e) => handleDurationChange(Number(e.target.value))}
                                            min="1"
                                        />
                                    </label>
                                    <p>Price: {registerPrice} ETH</p>
                                    <button onClick={registerDomain} disabled={loading}>
                                        {loading ? 'Registering...' : 'Register Domain'}
                                    </button>
                                </div>
                            </>
                        ) : domainOwner && address && domainOwner.toLowerCase() === address.toLowerCase() ? (
                            <>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <p className="owned">✓ You own {registerUsername}.dweb</p>
                                        <p className="expires">Expires: {new Date(domainExpires * 1000).toLocaleDateString()}</p>
                                    </div>
                                    <button
                                        onClick={() => openRenewalDialog(registerUsername, domainExpires)}
                                        disabled={loading}
                                        style={{
                                            height: 'fit-content',
                                            background: '#10b981',
                                        }}
                                    >
                                        Renew
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
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                                    <h3 style={{ margin: 0 }}>{domain.name}</h3>
                                    <button
                                        onClick={() => openRenewalDialog(domain.label, domain.expires)}
                                        disabled={loading}
                                        style={{
                                            margin: '0 0 0.5rem 5rem',
                                            background: '#10b981',
                                        }}
                                    >
                                        Renew
                                    </button>
                                </div>
                                <p>Expires: {new Date(domain.expires * 1000).toLocaleDateString()}</p>
                                <button onClick={() => navigate(`/console/name/${domain.label}`)}>
                                    Manage Records
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* Renewal Dialog */}
            {showRenewalDialog && (
                <>
                    <div
                        className="modal-overlay"
                        onClick={() => setShowRenewalDialog(false)}
                    />
                    <div className="modal-dialog">
                        <div className="modal-header">
                            <h3>Renew Domain</h3>
                            <button
                                className="modal-close"
                                onClick={() => setShowRenewalDialog(false)}
                            >
                                ×
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="renewal-info">
                                <p><strong>Domain:</strong> {renewalDomain}.dweb</p>
                                <p><strong>Current Expiry:</strong> {new Date(renewalExpires * 1000).toLocaleDateString()}</p>
                            </div>

                            <div className="form-group" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                                <label>
                                    Extend duration (days):
                                    <input
                                        type="number"
                                        value={renewalDuration}
                                        onChange={(e) => handleRenewalDurationChange(Number(e.target.value))}
                                        min="1"
                                        style={{ marginTop: '0.5rem' }}
                                    />
                                </label>
                                <p style={{ marginTop: '1rem', fontSize: '1.125rem', fontWeight: '600' }}>
                                    Renewal Price: {renewalPrice} ETH
                                </p>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button
                                onClick={() => setShowRenewalDialog(false)}
                                disabled={loading}
                                style={{ background: '#6b7280' }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleRenewFromDialog}
                                disabled={loading || !renewalPrice}
                                style={{ background: '#10b981' }}
                            >
                                {loading ? 'Renewing...' : 'Renew Domain'}
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
