import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider as UrqlProvider } from 'urql';
import { App } from './App';
import { urqlClient } from './urql';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root element not found');

createRoot(root).render(
  <StrictMode>
    <UrqlProvider value={urqlClient}>
      <App />
    </UrqlProvider>
  </StrictMode>,
);
