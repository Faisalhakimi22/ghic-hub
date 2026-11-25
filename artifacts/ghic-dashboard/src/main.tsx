import { createRoot } from 'react-dom/client';

import App from './App';
import { initMonitoring } from './lib/monitoring';

import './index.css';

initMonitoring();

createRoot(document.getElementById('root')!).render(<App />);
