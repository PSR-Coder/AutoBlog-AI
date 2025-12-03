
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  Check, Rss, Settings as SettingsIcon, Calendar, UploadCloud, 
  Globe, Zap, AlertCircle, Loader2, Clock, Save, ArrowLeft, LayoutTemplate, Link2, Filter
} from 'lucide-react';
import { ProcessingMode, SeoPlugin, Campaign, WordPressCategory, RssItem } from '../types';
import { saveCampaign, getCampaign } from '../services/mockDb';
import { verifyRealWpConnection, normalizeWpUrl, testFetchSource } from '../services/externalServices';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const DEFAULT_REWRITE_TEMPLATE = `You are an expert SEO Content Writer.
Task: Rewrite the following article into an engaging blog post.

SOURCE TITLE: {{SOURCE_TITLE}}
SOURCE CONTENT: {{SOURCE_CONTENT}}

Requirements:
1. Tone: Energetic and engaging.
2. Reading Level: Grade 8 English.
3. Structure: Use short paragraphs (max 3 sentences).
4. Start with a "Quick Summary" bullet list.
5. Use Active Voice only.`;

const DEFAULT_DIRECT_TEMPLATE = `Role: You are an entertainment news editor.
Task: Read the article at {{SOURCE_URL}} and write a fresh, hype-building blog post.

Requirements:
1. Tone: Enthusiastic and factual.
2. Reading Level: Grade 7 English.
3. Focus Keyword: Derived from the source content.
4. Structure: HTML format with <h2>, <p>, <ul> tags.
5. Key Takeaways: Include a bulleted list at the top.`;

// Helper to convert ISO string (UTC) to local datetime-local input string
const toLocalISOString = (isoString?: string) => {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '';
    const offset = date.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(date.getTime() - offset)).toISOString().slice(0, 16);
    return localISOTime;
  } catch (e) {
    return '';
  }
};

const CampaignWizard: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>(); 
  
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [testingSource, setTestingSource] = useState(false);
  const [sourceTestResult, setSourceTestResult] = useState<{item?: RssItem, error?: string} | null>(null);

  const [categories, setCategories] = useState<WordPressCategory[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const [formData, setFormData] = useState<Partial<Campaign>>({
    name: '',
    source_url: '',
    source_type: 'RSS',
    start_date: new Date().toISOString(), // Default to now
    url_keywords: '',
    wordpress_site: { site_url: '', username: '', application_password: '', status: 'pending' },
    processing_mode: ProcessingMode.AS_IS,
    ai_model: 'gemini-2.5-flash',
    prompt_type: 'default',
    custom_prompt: '',
    min_word_count: 600,
    max_word_count: 1000,
    schedule_days: [1, 2, 3, 4, 5],
    schedule_start_hour: 10,
    schedule_end_hour: 22,
    min_interval_minutes: 60,
    batch_size: 5,
    delay_seconds: 10,
    seo_plugin: SeoPlugin.NONE,
    post_status: 'draft',
    status: 'active',
    max_posts_limit: 5000,
    target_category_id: undefined
  });

  useEffect(() => {
    if (id) {
      const existing = getCampaign(id);
      if (existing) {
        setFormData(existing);
        if (existing.wordpress_site.status === 'connected') {
          verifyRealWpConnection(
            existing.wordpress_site.site_url, 
            existing.wordpress_site.username, 
            existing.wordpress_site.application_password || ''
          ).then(res => {
            if (res.categories) setCategories(res.categories);
          });
        }
      }
    }
  }, [id]);

  useEffect(() => {
    if (formData.prompt_type === 'custom' && !formData.custom_prompt) {
       if (formData.processing_mode === ProcessingMode.AI_REWRITE) {
           updateField('custom_prompt', DEFAULT_REWRITE_TEMPLATE);
       } else if (formData.processing_mode === ProcessingMode.AI_URL_DIRECT) {
           updateField('custom_prompt', DEFAULT_DIRECT_TEMPLATE);
       }
    }
  }, [formData.processing_mode, formData.prompt_type]);

  const updateField = (field: keyof Campaign, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      if (!val) return;
      try {
          // Convert local time back to UTC ISO
          const date = new Date(val);
          if (!isNaN(date.getTime())) {
              updateField('start_date', date.toISOString());
          }
      } catch (e) {
          console.error("Invalid date", e);
      }
  };

  const updateWpField = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      wordpress_site: { ...prev.wordpress_site!, [field]: value, status: 'pending' } 
    }));
  };

  const verifyConnection = async () => {
    setVerifying(true);
    setConnectionError(null);
    try {
      const { site_url, username, application_password } = formData.wordpress_site!;
      
      if (!site_url || !username || !application_password) {
        setConnectionError("Please fill in all WordPress fields.");
        setVerifying(false);
        return;
      }

      const result = await verifyRealWpConnection(site_url, username, application_password);
      
      if (result.success) {
        setFormData(prev => ({
          ...prev,
          wordpress_site: { 
            ...prev.wordpress_site!, 
            site_url: normalizeWpUrl(site_url), 
            status: 'connected' 
          }
        }));
        setCategories(result.categories);
        if (!formData.target_category_id && result.categories.length > 0) {
          updateField('target_category_id', result.categories[0].id);
        }
      } else {
        setConnectionError(result.error || "Connection failed.");
        setFormData(prev => ({
          ...prev,
          wordpress_site: { ...prev.wordpress_site!, status: 'error' }
        }));
      }
    } catch (e) {
      setConnectionError("Unexpected error during verification.");
    } finally {
      setVerifying(false);
    }
  };

  const handleTestSource = async () => {
    if (!formData.source_url) return;
    setTestingSource(true);
    setSourceTestResult(null);
    const result = await testFetchSource(formData.source_url, formData.source_type || 'RSS');
    setSourceTestResult({ item: result.item, error: result.error });
    setTestingSource(false);
  };

  const handleSubmit = () => {
    if (!formData.name) return;
    setLoading(true);
    setTimeout(() => {
      const newCampaign: Campaign = {
        ...formData as Campaign,
        id: id || crypto.randomUUID(), 
        last_run_at: formData.last_run_at,
        wordpress_site: { ...formData.wordpress_site!, status: 'connected' }
      };
      saveCampaign(newCampaign);
      setLoading(false);
      navigate('/');
    }, 1000);
  };

  const isWpConnected = formData.wordpress_site?.status === 'connected';

  return (
    <div className="max-w-5xl mx-auto pb-20">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between sticky top-0 bg-slate-50 dark:bg-slate-950 py-4 z-10 border-b border-slate-200 dark:border-slate-800 transition-colors">
        <div>
          <button 
             onClick={() => navigate('/')}
             className="flex items-center text-sm text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 mb-1"
          >
             <ArrowLeft size={16} className="mr-1"/> Back to Dashboard
          </button>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{id ? 'Edit Campaign' : 'Create New Campaign'}</h1>
        </div>
        <div className="flex gap-3">
             <button
                onClick={() => navigate('/')}
                className="px-4 py-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 font-medium transition-colors"
             >
                Cancel
             </button>
             <button 
                onClick={handleSubmit} 
                disabled={loading || !formData.name} 
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg font-medium flex items-center space-x-2 shadow-sm transition-all"
             >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                <span>{id ? 'Update Campaign' : 'Save Campaign'}</span>
             </button>
        </div>
      </div>

      <div className="space-y-8">
        
        {/* SECTION 1: SOURCE & TARGET */}
        <section className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden transition-colors">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex items-center gap-3">
                <div className="p-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-orange-500">
                    <Rss size={20} />
                </div>
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Source & Target</h2>
            </div>
            
            <div className="p-6 space-y-6">
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Campaign Name</label>
                    <input 
                        type="text" 
                        value={formData.name}
                        onChange={(e) => updateField('name', e.target.value)}
                        className="w-full px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                        placeholder="e.g., Daily Tech News"
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Source Type</label>
                        <div className="flex items-center space-x-4">
                            <label className="flex items-center space-x-2 cursor-pointer p-3 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 flex-1 transition-colors">
                                <input 
                                    type="radio" 
                                    checked={formData.source_type === 'RSS'}
                                    onChange={() => updateField('source_type', 'RSS')}
                                    className="text-indigo-600 focus:ring-indigo-500"
                                />
                                <div className="flex items-center">
                                    <Rss size={16} className="text-orange-500 mr-2" />
                                    <span className="text-slate-700 dark:text-slate-300 font-medium">RSS Feed</span>
                                </div>
                            </label>
                            <label className="flex items-center space-x-2 cursor-pointer p-3 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 flex-1 transition-colors">
                                <input 
                                    type="radio" 
                                    checked={formData.source_type === 'DIRECT'}
                                    onChange={() => updateField('source_type', 'DIRECT')}
                                    className="text-indigo-600 focus:ring-indigo-500"
                                />
                                <div className="flex items-center">
                                    <Globe size={16} className="text-blue-500 mr-2" />
                                    <span className="text-slate-700 dark:text-slate-300 font-medium">Website URL</span>
                                </div>
                            </label>
                        </div>
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                            {formData.source_type === 'RSS' ? 'RSS Feed URL' : 'Website Home URL'}
                        </label>
                        <div className="flex space-x-2">
                            <div className="flex flex-1">
                                <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                                    URL
                                </span>
                                <input 
                                    type="text" 
                                    value={formData.source_url}
                                    onChange={(e) => updateField('source_url', e.target.value)}
                                    className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-r-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                                    placeholder={formData.source_type === 'RSS' ? "https://site.com/feed" : "https://site.com"}
                                />
                            </div>
                            <button 
                                onClick={handleTestSource}
                                disabled={testingSource || !formData.source_url}
                                className="px-4 py-2 bg-slate-800 dark:bg-slate-700 text-white rounded-lg text-sm font-medium hover:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-50"
                            >
                                {testingSource ? <Loader2 size={16} className="animate-spin" /> : 'Test Source'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* --- NEW FILTERS --- */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 dark:bg-slate-800/30 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center">
                             <Calendar size={14} className="mr-1 text-slate-500"/> Start Processing From
                        </label>
                        <input
                            type="datetime-local"
                            value={toLocalISOString(formData.start_date)}
                            onChange={handleDateChange}
                            className="w-full px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                        />
                        <p className="text-xs text-slate-500 mt-1">Only process posts published after this date.</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center">
                            <Filter size={14} className="mr-1 text-slate-500"/> URL Keyword Filter (Optional)
                        </label>
                        <input
                            type="text"
                            value={formData.url_keywords || ''}
                            onChange={(e) => updateField('url_keywords', e.target.value)}
                            placeholder="e.g., movienews, featured"
                            className="w-full px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                        />
                        <p className="text-xs text-slate-500 mt-1">Comma-separated. URL must contain at least one of these.</p>
                    </div>
                </div>

                {sourceTestResult && (
                    <div className={`p-4 rounded-lg text-sm border ${
                        sourceTestResult.error 
                          ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-900 text-red-800 dark:text-red-300' 
                          : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-900 text-green-800 dark:text-green-300'
                    }`}>
                        {sourceTestResult.error ? (
                            <div className="flex items-start">
                                <AlertCircle size={16} className="mt-0.5 mr-2 shrink-0"/>
                                <div>
                                    <span className="font-bold">Fetch Failed:</span> {sourceTestResult.error}
                                </div>
                            </div>
                        ) : (
                            <div>
                                <div className="flex items-center mb-1">
                                    <Check size={16} className="mr-2"/>
                                    <span className="font-bold">Successfully Fetched Latest Post</span>
                                </div>
                                <div className="ml-6 space-y-1 opacity-90">
                                    <p><span className="font-medium">Title:</span> {sourceTestResult.item?.title}</p>
                                    <p><span className="font-medium">Link:</span> {sourceTestResult.item?.link}</p>
                                    <p><span className="font-medium">Content Length:</span> {sourceTestResult.item?.content.length} chars</p>
                                </div>
                            </div>
                        )}
                    </div>
                )}
                
                <div className="pt-6 border-t border-slate-100 dark:border-slate-800">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4 uppercase tracking-wide flex items-center">
                        <LayoutTemplate size={16} className="mr-2 text-slate-400 dark:text-slate-500"/>
                        WordPress Connection
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Site URL</label>
                            <input 
                                type="text" 
                                value={formData.wordpress_site?.site_url}
                                onChange={(e) => updateWpField('site_url', e.target.value)}
                                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                                placeholder="https://example.com"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Username</label>
                            <input 
                                type="text" 
                                value={formData.wordpress_site?.username}
                                onChange={(e) => updateWpField('username', e.target.value)}
                                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Application Password</label>
                            <input 
                                type="password" 
                                value={formData.wordpress_site?.application_password || ''}
                                onChange={(e) => updateWpField('application_password', e.target.value)}
                                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                                placeholder="xxxx xxxx xxxx xxxx"
                            />
                        </div>
                        
                        <div className="md:col-span-2 flex items-center justify-between pt-2">
                            <div className="text-sm">
                                {connectionError && (
                                    <span className="text-red-600 dark:text-red-400 flex items-start">
                                        <AlertCircle size={16} className="mr-1 mt-0.5 shrink-0" /> 
                                        <span>{connectionError}</span>
                                    </span>
                                )}
                                {isWpConnected && (
                                    <span className="text-green-600 dark:text-green-400 flex items-center font-medium">
                                        <Check size={16} className="mr-1" /> Connection Established
                                    </span>
                                )}
                            </div>
                            <button 
                                onClick={verifyConnection}
                                disabled={verifying}
                                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors flex items-center
                                    ${isWpConnected 
                                        ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' 
                                        : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'}
                                `}
                            >
                                {verifying && <Loader2 size={14} className="animate-spin mr-2" />}
                                {isWpConnected ? 'Re-Verify Connection' : 'Verify Connection'}
                            </button>
                        </div>
                    </div>
                    
                    <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        Need an Application Password? Go to WP Admin → Users → Profile → Application Passwords.
                    </div>
                </div>
            </div>
        </section>

        {/* SECTION 2: PROCESSING LOGIC */}
        <section className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden transition-colors">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex items-center gap-3">
                <div className="p-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-purple-600 dark:text-purple-400">
                    <Zap size={20} />
                </div>
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Processing Logic</h2>
            </div>
            
            <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <button 
                        onClick={() => updateField('processing_mode', ProcessingMode.AS_IS)}
                        className={`p-4 rounded-xl border-2 text-left transition-all ${
                            formData.processing_mode === ProcessingMode.AS_IS 
                            ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 ring-1 ring-indigo-600' 
                            : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700'
                        }`}
                    >
                        <div className="mb-2 text-indigo-600 dark:text-indigo-400"><SettingsIcon size={24} /></div>
                        <h3 className="font-semibold text-slate-900 dark:text-white">As Is</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Directly repost content.</p>
                    </button>

                    <button 
                        onClick={() => updateField('processing_mode', ProcessingMode.AI_REWRITE)}
                        className={`p-4 rounded-xl border-2 text-left transition-all ${
                            formData.processing_mode === ProcessingMode.AI_REWRITE 
                            ? 'border-purple-600 bg-purple-50 dark:bg-purple-900/20 ring-1 ring-purple-600' 
                            : 'border-slate-200 dark:border-slate-700 hover:border-purple-300 dark:hover:border-purple-700'
                        }`}
                    >
                        <div className="mb-2 text-purple-600 dark:text-purple-400"><Zap size={24} /></div>
                        <h3 className="font-semibold text-slate-900 dark:text-white">AI Rewrite</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Scrape & Rewrite.</p>
                    </button>
                    
                    <button 
                        onClick={() => updateField('processing_mode', ProcessingMode.AI_URL_DIRECT)}
                        className={`p-4 rounded-xl border-2 text-left transition-all ${
                            formData.processing_mode === ProcessingMode.AI_URL_DIRECT 
                            ? 'border-pink-600 bg-pink-50 dark:bg-pink-900/20 ring-1 ring-pink-600' 
                            : 'border-slate-200 dark:border-slate-700 hover:border-pink-300 dark:hover:border-pink-700'
                        }`}
                    >
                        <div className="mb-2 text-pink-600 dark:text-pink-400"><Link2 size={24} /></div>
                        <h3 className="font-semibold text-slate-900 dark:text-white">AI Direct URL</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">AI reads link directly.</p>
                    </button>

                    <button 
                        onClick={() => updateField('processing_mode', ProcessingMode.TRANSLATOR_SPIN)}
                        className={`p-4 rounded-xl border-2 text-left transition-all ${
                            formData.processing_mode === ProcessingMode.TRANSLATOR_SPIN 
                            ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-600' 
                            : 'border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700'
                        }`}
                    >
                        <div className="mb-2 text-blue-600 dark:text-blue-400"><Globe size={24} /></div>
                        <h3 className="font-semibold text-slate-900 dark:text-white">Translator Spin</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">En &gt; Te &gt; En loop.</p>
                    </button>
                </div>

                {(formData.processing_mode === ProcessingMode.AI_REWRITE || formData.processing_mode === ProcessingMode.AI_URL_DIRECT) && (
                    <div className="bg-purple-50 dark:bg-purple-900/10 border border-purple-100 dark:border-purple-900/30 p-6 rounded-lg animate-in fade-in slide-in-from-top-4">
                        <div className="flex justify-between items-center mb-4">
                             <h3 className="text-sm font-semibold text-purple-900 dark:text-purple-200">AI Configuration</h3>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-purple-800 dark:text-purple-300 mb-1">Select Model</label>
                                <select 
                                    value={formData.ai_model}
                                    onChange={(e) => updateField('ai_model', e.target.value)}
                                    className="w-full px-4 py-2 border border-purple-200 dark:border-purple-800 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                                >
                                    <optgroup label="Google Gemini">
                                        <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                                        <option value="gemini-pro">Gemini Pro 1.5</option>
                                    </optgroup>
                                    <optgroup label="OpenAI">
                                        <option value="gpt-4o">GPT-4o</option>
                                        <option value="gpt-4-turbo">GPT-4 Turbo</option>
                                        <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                                    </optgroup>
                                    <optgroup label="Anthropic">
                                        <option value="claude-3-opus-20240229">Claude 3 Opus</option>
                                        <option value="claude-3-sonnet-20240229">Claude 3 Sonnet</option>
                                        <option value="claude-3-haiku-20240307">Claude 3 Haiku</option>
                                    </optgroup>
                                </select>
                            </div>

                            {/* Prompt Configuration */}
                            <div className="bg-white dark:bg-slate-800 p-4 rounded-lg border border-purple-100 dark:border-slate-700">
                                <label className="block text-sm font-medium text-purple-800 dark:text-purple-300 mb-2">Prompt Strategy</label>
                                <div className="flex items-center space-x-4 mb-3">
                                    <label className="flex items-center space-x-2 cursor-pointer">
                                        <input 
                                            type="radio" 
                                            checked={!formData.prompt_type || formData.prompt_type === 'default'}
                                            onChange={() => updateField('prompt_type', 'default')}
                                            className="text-purple-600 focus:ring-purple-500"
                                        />
                                        <span className="text-sm text-slate-700 dark:text-slate-300">Default Best-Practice</span>
                                    </label>
                                    <label className="flex items-center space-x-2 cursor-pointer">
                                        <input 
                                            type="radio" 
                                            checked={formData.prompt_type === 'custom'}
                                            onChange={() => updateField('prompt_type', 'custom')}
                                            className="text-purple-600 focus:ring-purple-500"
                                        />
                                        <span className="text-sm text-slate-700 dark:text-slate-300">Custom Prompt</span>
                                    </label>
                                </div>

                                {formData.prompt_type === 'custom' && (
                                    <div className="animate-in fade-in">
                                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 flex justify-between">
                                            <span>System Prompt Template</span>
                                            <span className="text-purple-600 dark:text-purple-400 font-mono text-[10px] bg-purple-50 dark:bg-purple-900/30 px-1 rounded">
                                                Placeholders: {formData.processing_mode === 'AI_REWRITE' ? '{{SOURCE_TITLE}}, {{SOURCE_CONTENT}}' : '{{SOURCE_URL}}'}
                                            </span>
                                        </label>
                                        <textarea 
                                            value={formData.custom_prompt}
                                            onChange={(e) => updateField('custom_prompt', e.target.value)}
                                            rows={8}
                                            className="w-full px-3 py-2 border border-purple-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm font-mono text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900"
                                            placeholder="Enter your system instructions here..."
                                        />
                                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 italic">
                                            Note: We will automatically append instructions for JSON output format and SEO data extraction to ensure the app functions correctly. You only need to provide the writing style/task instructions.
                                        </p>
                                    </div>
                                )}
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-purple-800 dark:text-purple-300 mb-1">Min Word Count</label>
                                    <input
                                        type="number"
                                        value={formData.min_word_count || 600}
                                        onChange={(e) => updateField('min_word_count', parseInt(e.target.value))}
                                        className="w-full px-4 py-2 border border-purple-200 dark:border-purple-800 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                                        min={100}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-purple-800 dark:text-purple-300 mb-1">Max Word Count</label>
                                    <input
                                        type="number"
                                        value={formData.max_word_count || 1000}
                                        onChange={(e) => updateField('max_word_count', parseInt(e.target.value))}
                                        className="w-full px-4 py-2 border border-purple-200 dark:border-purple-800 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                                        min={100}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </section>

        {/* SECTION 3: SCHEDULING */}
        <section className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden transition-colors">
             <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex items-center gap-3">
                <div className="p-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-blue-500 dark:text-blue-400">
                    <Calendar size={20} />
                </div>
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Scheduling</h2>
            </div>
            
            <div className="p-6 space-y-6">
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Active Days</label>
                    <div className="flex gap-2 flex-wrap">
                        {DAYS.map((day, index) => {
                            const isSelected = formData.schedule_days?.includes(index);
                            return (
                                <button
                                    key={day}
                                    onClick={() => {
                                        const current = formData.schedule_days || [];
                                        const next = current.includes(index) ? current.filter(d => d !== index) : [...current, index];
                                        updateField('schedule_days', next);
                                    }}
                                    className={`w-12 h-12 rounded-lg font-medium text-sm transition-all
                                        ${isSelected 
                                            ? 'bg-indigo-600 text-white' 
                                            : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-indigo-300 dark:hover:border-indigo-500'}
                                    `}
                                >
                                    {day}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Start Hour (0-23)</label>
                        <div className="relative">
                            <Clock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="number"
                                min={0}
                                max={23}
                                value={formData.schedule_start_hour}
                                onChange={(e) => updateField('schedule_start_hour', parseInt(e.target.value))}
                                className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">End Hour (0-23)</label>
                        <div className="relative">
                            <Clock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="number"
                                min={0}
                                max={23}
                                value={formData.schedule_end_hour}
                                onChange={(e) => updateField('schedule_end_hour', parseInt(e.target.value))}
                                className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Interval (Minutes)</label>
                        <input
                            type="number"
                            min={5}
                            value={formData.min_interval_minutes}
                            onChange={(e) => updateField('min_interval_minutes', parseInt(e.target.value))}
                            className="w-full px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 dark:bg-slate-800/30 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Posts per Run (Batch Size)</label>
                        <input
                            type="number"
                            min={1}
                            max={20}
                            value={formData.batch_size || 5}
                            onChange={(e) => updateField('batch_size', parseInt(e.target.value))}
                            className="w-full px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                        />
                         <p className="text-xs text-slate-500 mt-1">Number of posts to process in one scheduled interval.</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Delay between Posts (Seconds)</label>
                        <input
                            type="number"
                            min={5}
                            value={formData.delay_seconds || 10}
                            onChange={(e) => updateField('delay_seconds', parseInt(e.target.value))}
                            className="w-full px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                        />
                        <p className="text-xs text-slate-500 mt-1">Wait time to prevent browser freezing.</p>
                    </div>
                </div>
                
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-400 flex items-start">
                    <AlertCircle size={16} className="mr-2 mt-0.5 text-slate-400 shrink-0" />
                    <p>
                        Campaign will run automatically between {formData.schedule_start_hour}:00 and {formData.schedule_end_hour}:00 on selected days, checking for new content every {formData.min_interval_minutes} minutes.
                    </p>
                </div>
            </div>
        </section>

        {/* SECTION 4: SEO & PUBLISH */}
        <section className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden transition-colors">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex items-center gap-3">
                <div className="p-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-green-600 dark:text-green-400">
                    <UploadCloud size={20} />
                </div>
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">SEO & Publishing</h2>
            </div>
            
            <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Target Category</label>
                        <select
                            value={formData.target_category_id || ''}
                            onChange={(e) => updateField('target_category_id', parseInt(e.target.value))}
                            className="w-full px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                        >
                            <option value="">Select Category</option>
                            {categories.map(cat => (
                                <option key={cat.id} value={cat.id}>{cat.name}</option>
                            ))}
                        </select>
                        {categories.length === 0 && (
                            <p className="text-xs text-red-500 mt-1">Connect WordPress to fetch categories.</p>
                        )}
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">SEO Plugin</label>
                        <select 
                            value={formData.seo_plugin}
                            onChange={(e) => updateField('seo_plugin', e.target.value as SeoPlugin)}
                            className="w-full px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                        >
                            <option value={SeoPlugin.NONE}>No Plugin</option>
                            <option value={SeoPlugin.YOAST}>Yoast SEO</option>
                            <option value={SeoPlugin.RANK_MATH}>RankMath</option>
                        </select>
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Max Posts Limit</label>
                        <input
                            type="number"
                            value={formData.max_posts_limit || 5000}
                            onChange={(e) => updateField('max_posts_limit', parseInt(e.target.value))}
                            className="w-full px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                        />
                        <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">Stop after X successful posts.</p>
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Post Status</label>
                        <select
                            value={formData.post_status}
                            onChange={(e) => updateField('post_status', e.target.value)}
                            className="w-full px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                        >
                            <option value="draft">Draft</option>
                            <option value="publish">Publish Immediately</option>
                        </select>
                        <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">Set the initial status for new posts.</p>
                    </div>
                </div>
            </div>
        </section>

      </div>
    </div>
  );
};

export default CampaignWizard;
