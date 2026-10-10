import { createRoot } from 'react-dom/client';
import { createNetworkClient } from './client';
import NetworkGame from '../ui/network/NetworkGame';

const parameters = new URL(window.location.href).searchParams;
const client = createNetworkClient({ url: parameters.get('server') ?? 'ws://127.0.0.1:8787' });
const root = createRoot(document.getElementById('root')!);
root.render(
  <NetworkGame
    client={client}
    onBack={() => window.location.reload()}
    allowTestTone={
      ['localhost', '127.0.0.1'].includes(window.location.hostname) &&
      parameters.get('test-tone') === '1'
    }
  />,
);
window.addEventListener('pagehide', () => client.dispose(), { once: true });
