import React, { useState } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import WelcomeScreen from './components/WelcomeScreen';
import DataEntryPage from './components/DataEntryPage';
import GraphsPage from './components/GraphsPage';
import ToolsPage from './components/ToolsPage';
import FileManagerModal from './components/FileManagerModal';
import { HelpProvider } from './contexts/HelpContext';
import HelpOverlay from './components/HelpOverlay';

const App: React.FC = () => {
  const [fileManagerOpen, setFileManagerOpen] = useState(false);

  return (
    <Router>
      <HelpProvider>
        <Routes>
          <Route path="/" element={<WelcomeScreen onOpenFileManager={() => setFileManagerOpen(true)} />} />
          <Route path="/data-entry" element={<DataEntryPage />} />
          <Route path="/graphs" element={<GraphsPage />} />
          <Route path="/tools" element={<ToolsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <FileManagerModal
          isOpen={fileManagerOpen}
          onClose={() => setFileManagerOpen(false)}
          onOpenFile={(_path) => {
            setFileManagerOpen(false);
          }}
        />
        <HelpOverlay />
      </HelpProvider>
    </Router>
  );
};

export default App;