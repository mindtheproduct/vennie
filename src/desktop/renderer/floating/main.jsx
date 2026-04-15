import React from 'react';
import { createRoot } from 'react-dom/client';
import FloatingCapture from './FloatingCapture.jsx';
import './styles.css';

const root = createRoot(document.getElementById('root'));
root.render(<FloatingCapture />);
