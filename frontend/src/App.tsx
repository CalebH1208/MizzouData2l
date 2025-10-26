import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import WelcomeScreen from './components/WelcomeScreen';
import DataEntryPage from './components/DataEntryPage';
import GraphsPage from './components/GraphsPage';
import ChannelManager from './components/ChannelManager';

const App: React.FC = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<WelcomeScreen />} />
        <Route path="/data-entry" element={<DataEntryPage />} />
        <Route path="/graphs" element={<GraphsPage />} />
        <Route path="/channel-manager" element={<ChannelManager />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
};

export default App;