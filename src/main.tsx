import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './lib/theme';
import { Toaster } from '@/components/ui/sonner';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    {/* Mounted at the root so messages survive screen changes (setup, start over, sign-in). */}
    <Toaster position="top-center" />
  </StrictMode>,
);
