import React, { useEffect } from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import CampaignWizard from './pages/CampaignWizard';
import CampaignDetails from './pages/CampaignDetails';
import { seedDefaults } from './services/mockDb';

const App: React.FC = () => {
  useEffect(() => {
    seedDefaults();
  }, []);

  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/create" element={<CampaignWizard />} />
          <Route path="/edit/:id" element={<CampaignWizard />} />
          <Route path="/campaign/:id" element={<CampaignDetails />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Layout>
    </Router>
  );
};

export default App;