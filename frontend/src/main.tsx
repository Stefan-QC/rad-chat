import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './app/AuthContext';
import { ServicesProvider } from './app/ServicesContext';
import { AppConfig, ConfigError } from './config/AppConfig';
import { IconSprite } from './components/Icon';
import { ToastProvider } from './components/ui/Toast';
import { Services } from './services/Services';
import './styles/index.css';

const container = document.getElementById('root')!;
const root = createRoot(container);

try {
  const services = new Services(AppConfig.load());
  // Geen StrictMode: het spel en de realtime-kanalen mogen niet dubbel opstarten in ontwikkeling.
  root.render(
    <ServicesProvider services={services}>
      <BrowserRouter>
        <IconSprite />
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </ServicesProvider>,
  );
} catch (error) {
  const message = error instanceof ConfigError ? error.message : 'The app could not start.';
  root.render(<div className="splash error">{message}</div>);
}
