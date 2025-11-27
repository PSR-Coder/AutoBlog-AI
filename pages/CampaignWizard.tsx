
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  Check, Rss, Settings as SettingsIcon, Calendar, UploadCloud, 
  Globe, Zap, AlertCircle, Loader2, Clock, Save, ArrowLeft, LayoutTemplate
} from 'lucide-react';
import { ProcessingMode, SeoPlugin, Campaign, WordPressCategory, RssItem } from '../types';
import { saveCampaign, getCampaign } from '../services/mockDb';
import { verifyRealWpConnection, normalizeWpUrl, testFetchSource } from '../services/externalServices';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
    wordpress_site: { site_url: '', username: '', application_password: '', status: 'pending' },
    processing_mode: ProcessingMode.AS_IS,
    ai_model: 'gemini-2.5-flash',
    min_word_count: 600,
    max_word_count: 1000,
    schedule_days: [1, 2, 3, 4, 5],
    schedule_start_hour: 10,
    schedule_end_hour: 22,
    min_interval_minutes: 60,
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

  const updateField = (field: keyof Campaign, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
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
      <div className="mb-8 flex items-center justify-between sticky top-0 bg-slate-50 py-4 z-10 border-b border-slate-200">
        <div>
          <button 
             onClick={() => navigate('/')}
             className="flex items-center text-sm text-slate-500 hover:text-indigo-600 mb-1"
          >
             <ArrowLeft size={16} className="mr-1"/> Back to Dashboard
          </button>
          <h1 className="text-2xl font-bold text-slate-900">{id ? 'Edit Campaign' : 'Create New Campaign'}</h1>
        </div>
        <div className="flex gap-3">
             <button
                onClick={() => navigate('/')}
                className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-200 font-medium transition-colors"
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
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
                <div className="p-2 bg-white rounded-lg border border-slate-200 text-orange-500">
                    <Rss size={20} />
                </div>
                <h2 className="text-lg font-semibold text-slate-800">Source & Target</h2>
            </div>
            
            <div className="p-6 space-y-6">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Campaign Name</label>
                    <input 
                        type="text" 
                        value={formData.name}
                        onChange={(e) => updateField('name', e.target.value)}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                        placeholder="e.g., Daily Tech News"
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Source Type</label>
                        <div className="flex items-center space-x-4">
                            <label className="flex items-center space-x-2 cursor-pointer p-3 border rounded-lg hover:bg-slate-50 flex-1">
                                <input 
                                    type="radio" 
                                    checked={formData.source_type === 'RSS'}
                                    onChange={() => updateField('source_type', 'RSS')}
                                    className="text-indigo-600 focus:ring-indigo-500"
                                />
                                <div className="flex items-center">
                                    <Rss size={16} className="text-orange-500 mr-2" />
                                    <span className="text-slate-700 font-medium">RSS Feed</span>
                                </div>
                            </label>
                            <label className="flex items-center space-x-2 cursor-pointer p-3 border rounded-lg hover:bg-slate-50 flex-1">
                                <input 
                                    type="radio" 
                                    checked={formData.source_type === 'DIRECT'}
                                    onChange={() => updateField('source_type', 'DIRECT')}
                                    className="text-indigo-600 focus:ring-indigo-500"
                                />
                                <div className="flex items-center">
                                    <Globe size={16} className="text-blue-500 mr-2" />
                                    <span className="text-slate-700 font-medium">Website URL</span>
                                </div>
                            </label>
                        </div>
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            {formData.source_type === 'RSS' ? 'RSS Feed URL' : 'Website Home URL'}
                        </label>
                        <div className="flex space-x-2">
                            <div className="flex flex-1">
                                <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-slate-300 bg-slate-50 text-slate-500">
                                    URL
                                </span>
                                <input 
                                    type="text" 
                                    value={formData.source_url}
                                    onChange={(e) => updateField('source_url', e.target.value)}
                                    className="flex-1 px-4 py-2 border border-slate-300 rounded-r-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                    placeholder={formData.source_type === 'RSS' ? "https://site.com/feed" : "https://site.com"}
                                />
                            </div>
                            <button 
                                onClick={handleTestSource}
                                disabled={testingSource || !formData.source_url}
                                className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-700 disabled:opacity-50"
                            >
                                {testingSource ? <Loader2 size={16} className="animate-spin" /> : 'Test Source'}
                            </button>
                        </div>
                    </div>
                </div>

                {sourceTestResult && (
                    <div className={`p-4 rounded-lg text-sm border ${sourceTestResult.error ? 'bg-red-50 border-red-200 text-red-800' : 'bg-green-50 border-green-200 text-green-800'}`}>
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
                                <div className="ml-6 space-y-1">
                                    <p><span className="font-medium">Title:</span> {sourceTestResult.item?.title}</p>
                                    <p><span className="font-medium">Link:</span> {sourceTestResult.item?.link}</p>
                                    <p><span className="font-medium">Content Length:</span> {sourceTestResult.item?.content.length} chars</p>
                                </div>
                            </div>
                        )}
                    </div>
                )}
                
                <div className="pt-6 border-t border-slate-100">
                    <h3 className="text-sm font-bold text-slate-900 mb-4 uppercase tracking-wide flex items-center">
                        <LayoutTemplate size={16} className="mr-2 text-slate-400"/>
                        WordPress Connection
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-slate-700 mb-1">Site URL</label>
                            <input 
                                type="text" 
                                value={formData.wordpress_site?.site_url}
                                onChange={(e) => updateWpField('site_url', e.target.value)}
                                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                placeholder="https://example.com"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
                            <input 
                                type="text" 
                                value={formData.wordpress_site?.username}
                                onChange={(e) => updateWpField('username', e.target.value)}
                                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Application Password</label>
                            <input 
                                type="password" 
                                value={formData.wordpress_site?.application_password || ''}
                                onChange={(e) => updateWpField('application_password', e.target.value)}
                                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                placeholder="xxxx xxxx xxxx xxxx"
                            />
                        </div>
                        
                        <div className="md:col-span-2 flex items-center justify-between pt-2">
                            <div className="text-sm">
                                {connectionError && (
                                    <span className="text-red-600 flex items-start">
                                        <AlertCircle size={16} className="mr-1 mt-0.5 shrink-0" /> 
                                        <span>{connectionError}</span>
                                    </span>
                                )}
                                {isWpConnected && (
                                    <span className="text-green-600 flex items-center font-medium">
                                        <Check size={16} className="mr-1" /> Connection Established
                                    </span>
                                )}
                            </div>
                            <button 
                                onClick={verifyConnection}
                                disabled={verifying}
                                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors flex items-center
                                    ${isWpConnected 
                                        ? 'border-green-200 bg-green-50 text-green-700' 
                                        : 'border-slate-300 bg-white hover:bg-slate-50 text-slate-700'}
                                `}
                            >
                                {verifying && <Loader2 size={14} className="animate-spin mr-2" />}
                                {isWpConnected ? 'Re-Verify Connection' : 'Verify Connection'}
                            </button>
                        </div>
                    </div>
                    
                    <div className="mt-2 text-xs text-slate-500">
                        Need an Application Password? Go to WP Admin → Users → Profile → Application Passwords.
                    </div>
                </div>
            </div>
        </section>

        {/* SECTION 2: PROCESSING LOGIC */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
                <div className="p-2 bg-white rounded-lg border border-slate-200 text-purple-600">
                    <Zap size={20} />
                </div>
                <h2 className="text-lg font-semibold text-slate-800">Processing Logic</h2>
            </div>
            
            <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <button 
                        onClick={() => updateField('processing_mode', ProcessingMode.AS_IS)}
                        className={`p-4 rounded-xl border-2 text-left transition-all ${formData.processing_mode === ProcessingMode.AS_IS ? 'border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600' : 'border-slate-200 hover:border-indigo-300'}`}
                    >
                        <div className="mb-2 text-indigo-600"><SettingsIcon size={24} /></div>
                        <h3 className="font-semibold text-slate-900">As Is</h3>
                        <p className="text-xs text-slate-500 mt-1">Directly repost content.</p>
                    </button>

                    <button 
                        onClick={() => updateField('processing_mode', ProcessingMode.AI_REWRITE)}
                        className={`p-4 rounded-xl border-2 text-left transition-all ${formData.processing_mode === ProcessingMode.AI_REWRITE ? 'border-purple-600 bg-purple-50 ring-1 ring-purple-600' : 'border-slate-200 hover:border-purple-300'}`}
                    >
                        <div className="mb-2 text-purple-600"><Zap size={24} /></div>
                        <h3 className="font-semibold text-slate-900">AI Rewrite</h3>
                        <p className="text-xs text-slate-500 mt-1">Rewrite and optimize.</p>
                    </button>

                    <button 
                        onClick={() => updateField('processing_mode', ProcessingMode.TRANSLATOR_SPIN)}
                        className={`p-4 rounded-xl border-2 text-left transition-all ${formData.processing_mode === ProcessingMode.TRANSLATOR_SPIN ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600' : 'border-slate-200 hover:border-blue-300'}`}
                    >
                        <div className="mb-2 text-blue-600"><Globe size={24} /></div>
                        <h3 className="font-semibold text-slate-900">Translator Spin</h3>
                        <p className="text-xs text-slate-500 mt-1">En &gt; Te &gt; En loop.</p>
                    </button>
                </div>

                {formData.processing_mode === ProcessingMode.AI_REWRITE && (
                    <div className="bg-purple-50 border border-purple-100 p-6 rounded-lg animate-in fade-in slide-in-from-top-4">
                        <h3 className="text-sm font-semibold text-purple-900 mb-3">AI Configuration</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-purple-800 mb-1">Select Model</label>
                                <select 
                                    value={formData.ai_model}
                                    onChange={(e) => updateField('ai_model', e.target.value)}
                                    className="w-full px-4 py-2 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none bg-white"
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
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-purple-800 mb-1">Min Word Count</label>
                                    <input
                                        type="number"
                                        value={formData.min_word_count || 600}
                                        onChange={(e) => updateField('min_word_count', parseInt(e.target.value))}
                                        className="w-full px-4 py-2 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none bg-white"
                                        min={100}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-purple-800 mb-1">Max Word Count</label>
                                    <input
                                        type="number"
                                        value={formData.max_word_count || 1000}
                                        onChange={(e) => updateField('max_word_count', parseInt(e.target.value))}
                                        className="w-full px-4 py-2 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none bg-white"
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
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
             <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
                <div className="p-2 bg-white rounded-lg border border-slate-200 text-blue-500">
                    <Calendar size={20} />
                </div>
                <h2 className="text-lg font-semibold text-slate-800">Scheduling</h2>
            </div>
            
            <div className="p-6 space-y-6">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-3">Active Days</label>
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
                                        ${isSelected ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:border-indigo-300'}
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
                        <label className="block text-sm font-medium text-slate-700 mb-1">Start Hour (0-23)</label>
                        <div className="relative">
                            <Clock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="number"
                                min={0}
                                max={23}
                                value={formData.schedule_start_hour}
                                onChange={(e) => updateField('schedule_start_hour', parseInt(e.target.value))}
                                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">End Hour (0-23)</label>
                        <div className="relative">
                            <Clock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="number"
                                min={0}
                                max={23}
                                value={formData.schedule_end_hour}
                                onChange={(e) => updateField('schedule_end_hour', parseInt(e.target.value))}
                                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Interval (Minutes)</label>
                        <input
                            type="number"
                            min={5}
                            value={formData.min_interval_minutes}
                            onChange={(e) => updateField('min_interval_minutes', parseInt(e.target.value))}
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                    </div>
                </div>
                
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-sm text-slate-600 flex items-start">
                    <AlertCircle size={16} className="mr-2 mt-0.5 text-slate-400 shrink-0" />
                    <p>
                        Campaign will run automatically between {formData.schedule_start_hour}:00 and {formData.schedule_end_hour}:00 on selected days, checking for new content every {formData.min_interval_minutes} minutes.
                    </p>
                </div>
            </div>
        </section>

        {/* SECTION 4: SEO & PUBLISH */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
                <div className="p-2 bg-white rounded-lg border border-slate-200 text-green-600">
                    <UploadCloud size={20} />
                </div>
                <h2 className="text-lg font-semibold text-slate-800">SEO & Publishing</h2>
            </div>
            
            <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-3">Target Category</label>
                        <select
                            value={formData.target_category_id || ''}
                            onChange={(e) => updateField('target_category_id', parseInt(e.target.value))}
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
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
                        <label className="block text-sm font-medium text-slate-700 mb-3">SEO Plugin</label>
                        <select 
                            value={formData.seo_plugin}
                            onChange={(e) => updateField('seo_plugin', e.target.value as SeoPlugin)}
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                        >
                            <option value={SeoPlugin.NONE}>No Plugin</option>
                            <option value={SeoPlugin.YOAST}>Yoast SEO</option>
                            <option value={SeoPlugin.RANK_MATH}>RankMath</option>
                        </select>
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-3">Max Posts Limit</label>
                        <input
                            type="number"
                            value={formData.max_posts_limit || 5000}
                            onChange={(e) => updateField('max_posts_limit', parseInt(e.target.value))}
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                        <p className="text-xs text-slate-500 mt-1">Stop after X successful posts.</p>
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-3">Post Status</label>
                        <select
                            value={formData.post_status}
                            onChange={(e) => updateField('post_status', e.target.value)}
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                        >
                            <option value="draft">Draft</option>
                            <option value="publish">Publish Immediately</option>
                        </select>
                        <p className="text-xs text-slate-500 mt-1">Set the initial status for new posts.</p>
                    </div>
                </div>
            </div>
        </section>

      </div>
    </div>
  );
};

export default CampaignWizard;
