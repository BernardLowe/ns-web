import { useNavigate } from 'react-router-dom';
import '../LandingPage.css';

export function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="landing-page">
      {/* Hero Section */}
      <section className="hero">
        <div className="hero-content">
          <h1 className="hero-title">DWebNS</h1>
          <p className="hero-subtitle">Decentralized Web Naming Service</p>
          <p className="hero-description">
            Smart contract-based domain name management system with full DNS compatibility
          </p>
          <button className="cta-button" onClick={() => navigate('/console/home')}>
            Launch Console
          </button>
        </div>
      </section>

      {/* Features Section */}
      <section className="features">
        <h2>Key Features</h2>
        <div className="feature-grid">
          <div className="feature-card">
            <div className="feature-icon">🔗</div>
            <h3>Blockchain-Powered</h3>
            <p>Domain ownership and records managed through secure smart contracts on Ethereum</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🌐</div>
            <h3>DNS Compatible</h3>
            <p>Support for traditional DNS record types (A, TXT) alongside Web3-native records</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🔐</div>
            <h3>Decentralized</h3>
            <p>No central authority - you own and control your domain entirely through your wallet</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">💎</div>
            <h3>Multi-Chain Records</h3>
            <p>Store addresses for Ethereum, Bitcoin, Solana, and other blockchain networks</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">📦</div>
            <h3>Content Storage</h3>
            <p>Link to decentralized storage (IPFS, Arweave, Swarm) for truly distributed websites</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🆔</div>
            <h3>Identity Management</h3>
            <p>Support for DIDs, public keys, and other identity-related records</p>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="how-it-works">
        <h2>How It Works</h2>
        <div className="steps">
          <div className="step">
            <div className="step-number">1</div>
            <h3>Connect Wallet</h3>
            <p>Connect your MetaMask or compatible Web3 wallet</p>
          </div>
          <div className="step">
            <div className="step-number">2</div>
            <h3>Register Domain</h3>
            <p>Choose your .dweb domain name and register it on-chain</p>
          </div>
          <div className="step">
            <div className="step-number">3</div>
            <h3>Manage Records</h3>
            <p>Add DNS records, crypto addresses, and content links</p>
          </div>
          <div className="step">
            <div className="step-number">4</div>
            <h3>Own Forever</h3>
            <p>Renew periodically to maintain ownership of your domain</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <p>DWebNS - Bringing Web3 domains to everyone</p>
        <p className="footer-links">
          <a href="https://github.com" target="_blank" rel="noopener noreferrer">GitHub</a>
          <span>•</span>
          <a href="#" onClick={(e) => { e.preventDefault(); navigate('/console/home'); }}>Console</a>
        </p>
      </footer>
    </div>
  );
}
