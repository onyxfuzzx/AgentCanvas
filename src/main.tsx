import { createRoot } from 'react-dom/client';
import { App } from './App';
import './style.css';
import './redesign.css';
document.title = __PRODUCT_NAME__;
createRoot(document.getElementById('root')!).render(<App />);
