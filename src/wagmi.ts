import { http, createConfig } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { activeChain } from './config';

export const config = createConfig({
  chains: [activeChain],
  connectors: [injected()],
  transports: {
    [activeChain.id]: http(activeChain.rpcUrls.default.http[0]),
  },
});
