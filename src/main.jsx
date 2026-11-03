import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/anton/400.css';
import '@fontsource/big-shoulders-display/700';
import '@fontsource/big-shoulders-display/800';
import '@fontsource/schibsted-grotesk/400';
import '@fontsource/schibsted-grotesk/500';
import '@fontsource/schibsted-grotesk/600';
import '@fontsource/schibsted-grotesk/700';
import './styles.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(<App />);
