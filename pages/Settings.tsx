import React, { useState, useEffect } from 'react';
import { Save, Key, Globe } from 'lucide-react';
import { getConfig, saveConfig } from '../services/mockDb';
import { GlobalConfig } from '../types';

const Settings: React.FC = () => {
  const [config, setConfig] = useState<GlobalConfig>({
    gemini_key: '',
    openai_key: '',
    claude_key: '',
    google_translate_key: ''
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setConfig(getConfig());
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfig({ ...config, [e.target.name]: e.target.value });
    setSaved(false);
  };

  const handleSave = () => {
    saveConfig(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Global Settings</h1>
          <p className="text-slate-500 dark:text-slate-400">Manage API keys for AI providers and Translation services.</p>
        </div>
        <button
          onClick={handleSave}
          className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg font-medium transition-colors"
        >
          <Save size={18} />
          <span>Save Configuration</span>
        </button>
      </div>

      {saved && (
        <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-lg">
          Settings saved successfully.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* AI Providers */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
          <div className="flex items-center space-x-3 mb-6">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-lg">
              <Key size={20} />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">AI Providers</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Google Gemini API Key</label>
              <input
                type="password"
                name="gemini_key"
                value={config.gemini_key}
                onChange={handleChange}
                placeholder="AIza..."
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              />
              <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">Required for Gemini 2.5 Flash Rewrites.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">OpenAI API Key</label>
              <input
                type="password"
                name="openai_key"
                value={config.openai_key}
                onChange={handleChange}
                placeholder="sk-..."
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Anthropic Claude API Key</label>
              <input
                type="password"
                name="claude_key"
                value={config.claude_key}
                onChange={handleChange}
                placeholder="sk-ant-..."
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              />
            </div>
          </div>
        </div>

        {/* Translation Services */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 h-fit transition-colors">
          <div className="flex items-center space-x-3 mb-6">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
              <Globe size={20} />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Translation Services</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Google Cloud Translate API Key</label>
              <input
                type="password"
                name="google_translate_key"
                value={config.google_translate_key}
                onChange={handleChange}
                placeholder="AIza..."
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              />
              <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">Required for 'Translator Spin' mode (En -&gt; Te -&gt; En).</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;