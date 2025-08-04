import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import DownloaderPage from './pages/DownloaderPage';
import SettingsPage from './pages/SettingsPage';
import { DownloadProvider } from './contexts/DownloadContext';

function App() {
  return (
    <DownloadProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<DownloaderPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </Router>
    </DownloadProvider>
  );
}

export default App;
