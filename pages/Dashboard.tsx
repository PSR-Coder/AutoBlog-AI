
import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { getCampaigns, deleteCampaign, addProcessedPost, isUrlProcessed, saveCampaign } from '../services/mockDb';
import { fetchContentFromSource, publishToRealWordpress, fetchRecentPosts, uploadImageFromUrl, validateScrapedContent } from '../services/externalServices';
import { Campaign, ProcessingMode, WorkerLog, ProcessedPost } from '../types';
import { Play, Trash2, ExternalLink, XCircle, Edit, BarChart2, Clock } from 'lucide-react';
import { rewriteContent } from '../services/geminiService';
import { generatePostFromUrl } from '../services/geminiDirectService';

const Dashboard: React.FC = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [logs, setLogs] = useState<WorkerLog[]>([]);
  const [showLogModal, setShowLogModal] = useState(false);
  const [nextRunTime, setNextRunTime] = useState<string>('');
  const logEndRef = useRef<HTMLDivElement>(null);

  // Load campaigns on mount
  useEffect(() => {
    const loadCampaigns = () => {
        setCampaigns(getCampaigns());
    };
    loadCampaigns();
    // Refresh campaigns list periodically to catch edits
    const interval = setInterval(loadCampaigns, 5000);
    return () => clearInterval(interval);
  }, []);

  // Auto-Scroll Logs
  useEffect(() => {
    if (showLogModal && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, showLogModal]);

  // --- AUTOMATION ENGINE ---
  useEffect(() => {
    const checkSchedules = async () => {
        // If something is already running, skip this tick
        if (runningId) return;

        const now = new Date();
        const currentHour = now.getHours();
        const currentDay = now.getDay(); // 0 = Sun, 6 = Sat

        setNextRunTime(now.toLocaleTimeString());

        for (const campaign of campaigns) {
            if (campaign.status !== 'active') continue;

            // 1. Check Day
            if (!campaign.schedule_days.includes(currentDay)) continue;

            // 2. Check Hour Window
            if (currentHour < campaign.schedule_start_hour || currentHour >= campaign.schedule_end_hour) continue;

            // 3. Check Interval
            const lastRun = campaign.last_run_at ? new Date(campaign.last_run_at).getTime() : 0;
            const intervalMs = campaign.min_interval_minutes * 60 * 1000;
            const nextRun = lastRun + intervalMs;

            if (now.getTime() >= nextRun) {
                console.log(`[Auto-Scheduler] Triggering: ${campaign.name}`);
                await runSimulation(campaign, true); // true = isAuto
                // Only run one at a time to avoid browser resource contention
                break; 
            }
        }
    };

    // Check every 30 seconds
    const timer = setInterval(checkSchedules, 30000);
    return () => clearInterval(timer);
  }, [campaigns, runningId]);


  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this campaign?')) {
      deleteCampaign(id);
      setCampaigns(getCampaigns());
    }
  };

  const addLog = (message: string, level: WorkerLog['level'] = 'info') => {
    setLogs(prev => [...prev, {
      id: crypto.randomUUID(),
      timestamp: new Date().toLocaleTimeString(),
      level,
      message
    }]);
  };

  const runSimulation = async (campaign: Campaign, isAuto = false) => {
    setRunningId(campaign.id);
    setLogs([]); // Clear logs for new run
    if (!isAuto) setShowLogModal(true); // Only show modal for manual runs

    const postLogs: string[] = [];
    let tokensUsed = 0;
    
    // Default fallback values
    let articleTitle = "";
    let articleUrl = "";
    let articleContent = "";
    let articleImage = "";
    let finalStatus: ProcessedPost['status'] = 'fetched';
    let targetLink: string | undefined = undefined;
    let wordpressPostId: number | undefined = undefined;
    
    let seoData = {
        focusKeyphrase: '',
        seoTitle: '',
        metaDescription: '',
        slug: '',
        imageAlt: '',
        synonyms: ''
    };

    try {
      // 1. Scheduler Check (Visual Log)
      addLog(`Checking schedule for campaign: ${campaign.name}...`);
      // Update Last Run immediately to prevent double-triggering
      const updatedCampaign = { ...campaign, last_run_at: new Date().toISOString() };
      saveCampaign(updatedCampaign);
      setCampaigns(getCampaigns()); // Refresh UI

      // 2. Fetching
      addLog(`Fetching content from: ${campaign.source_url} (${campaign.source_type || 'RSS'})...`, 'info');
      
      const rssItem = await fetchContentFromSource(
          campaign.source_url, 
          campaign.source_type || 'RSS',
          (msg, type) => addLog(msg, type || 'info') // Pass Logger
      );
      
      const isValidFetch = rssItem && (
          campaign.processing_mode === ProcessingMode.AI_URL_DIRECT 
          ? !!rssItem.link 
          : (rssItem.title && rssItem.content)
      );

      if (isValidFetch && rssItem) {
        if (isUrlProcessed(campaign.id, rssItem.link)) {
             addLog(`Duplicate detected. Post already processed: "${rssItem.title || rssItem.link}"`, 'warning');
             return; 
        }

        if (campaign.processing_mode !== ProcessingMode.AI_URL_DIRECT) {
             if (!validateScrapedContent(rssItem.title, rssItem.content)) {
                addLog(`Blocked Content Detected.`, 'error');
                return;
            }
        }

        addLog(`Found new article: "${rssItem.title || 'URL Mode'}"`, 'success');
        articleTitle = rssItem.title;
        articleUrl = rssItem.link;
        articleContent = rssItem.content; 
        articleImage = rssItem.imageUrl || "";
        if (articleImage) addLog(`Found image: ${articleImage}`, 'info');
        postLogs.push('Fetched article from source');
      } else {
        throw new Error(`Could not fetch valid items from source.`);
      }

      // 3. Processing
      let finalHtml = articleContent;
      let finalTitle = articleTitle;
      let finalSlug = '';
      let featuredMediaId: number | undefined = undefined;

      // MODE A: AS IS
      if (campaign.processing_mode === ProcessingMode.AS_IS) {
        addLog('Mode AS_IS: Skipping processing.', 'info');
      } 
      
      // MODE B: AI REWRITE
      else if (campaign.processing_mode === ProcessingMode.AI_REWRITE) {
        addLog('Fetching recent posts for internal linking context...', 'info');
        const recentPosts = await fetchRecentPosts(
            campaign.wordpress_site.site_url,
            campaign.wordpress_site.username,
            campaign.wordpress_site.application_password || ''
        );
        const recentPostsStr = recentPosts.map((p: any) => `- ${p.title} (${p.link})`).join('\n');

        addLog(`Mode AI_REWRITE: Rewriting via ${campaign.ai_model || 'gemini'}...`, 'info');
        
        const customPrompt = campaign.prompt_type === 'custom' ? campaign.custom_prompt : undefined;
        
        const aiResult = await rewriteContent(
            articleContent, 
            articleTitle, 
            recentPostsStr,
            campaign.min_word_count || 600,
            campaign.max_word_count || 1000,
            campaign.ai_model || 'gemini-2.5-flash',
            customPrompt
        );
          
        finalHtml = aiResult.htmlContent;
        seoData = aiResult.seo;
        finalTitle = seoData.seoTitle || articleTitle;
        finalSlug = seoData.slug;
        
        tokensUsed = Math.floor(finalHtml.length / 4) + 150;
        
        addLog('AI Rewrite Successful.', 'success');
        addLog(`Focus Keyphrase: "${seoData.focusKeyphrase}"`, 'success');
        postLogs.push(`Rewritten by ${campaign.ai_model}`);
        finalStatus = 'rewritten';
      }

      // MODE C: AI URL DIRECT
      else if (campaign.processing_mode === ProcessingMode.AI_URL_DIRECT) {
        addLog(`Mode AI_URL_DIRECT: Analyzing URL via ${campaign.ai_model || 'gemini'}...`, 'info');
        
        const customPrompt = campaign.prompt_type === 'custom' ? campaign.custom_prompt : undefined;
        
        const aiResult = await generatePostFromUrl(
            articleUrl,
            campaign.min_word_count || 600,
            campaign.max_word_count || 1000,
            campaign.ai_model || 'gemini-2.5-flash',
            customPrompt
        );
        
        finalHtml = aiResult.htmlContent;
        seoData = aiResult.seo;
        finalTitle = seoData.seoTitle || articleTitle;
        finalSlug = seoData.slug;
        
        tokensUsed = 1000;
        
        addLog('AI Generation Successful.', 'success');
        addLog(`Derived Keyphrase: "${seoData.focusKeyphrase}"`, 'success');
        postLogs.push(`Generated from URL via ${campaign.ai_model}`);
        finalStatus = 'rewritten';
      }

      // 4. Image Upload
      if (articleImage) {
          addLog(`Uploading featured image to WordPress...`, 'info');
          const altText = seoData.imageAlt || `${seoData.focusKeyphrase || articleTitle} - Featured Image`;
          const mediaId = await uploadImageFromUrl(
              campaign.wordpress_site.site_url,
              campaign.wordpress_site.username,
              campaign.wordpress_site.application_password || '',
              articleImage,
              altText,
              (msg, type) => addLog(msg, type)
          );
          if (mediaId) {
              featuredMediaId = mediaId;
              addLog(`Image uploaded successfully (ID: ${mediaId})`, 'success');
          } else {
              addLog(`STRICT MODE: Image upload failed. Aborting.`, 'error');
              throw new Error("Image upload failed in Strict Mode. Check WP permissions or image source.");
          }
      }

      // 5. Publishing
      addLog(`Publishing to WordPress...`, 'info');
      
      const publishResult = await publishToRealWordpress(
          campaign.wordpress_site.site_url,
          campaign.wordpress_site.username,
          campaign.wordpress_site.application_password || '',
          {
              title: finalTitle,
              content: finalHtml,
              status: campaign.post_status,
              categories: campaign.target_category_id ? [campaign.target_category_id] : [],
              slug: finalSlug,
              featuredMediaId: featuredMediaId,
              seo: {
                  plugin: campaign.seo_plugin,
                  focusKeyphrase: seoData.focusKeyphrase,
                  seoTitle: seoData.seoTitle,
                  metaDescription: seoData.metaDescription,
                  synonyms: seoData.synonyms
              }
          }
      );

      if (publishResult.success) {
          addLog(`Successfully published to WordPress! (ID: ${publishResult.id})`, 'success');
          finalStatus = campaign.post_status === 'publish' ? 'published' : 'draft';
          targetLink = publishResult.link;
          wordpressPostId = publishResult.id;
          postLogs.push(`Posted to WP as ${finalStatus}`);
      } else {
          throw new Error(publishResult.error);
      }

      addLog('Campaign Run Completed Successfully.', 'success');

      const newPost: ProcessedPost = {
        id: crypto.randomUUID(),
        campaign_id: campaign.id,
        wordpress_post_id: wordpressPostId,
        title: articleTitle,
        source_url: articleUrl,
        target_url: targetLink,
        status: finalStatus as any,
        tokens_used: tokensUsed,
        created_at: new Date().toISOString(),
        logs: postLogs
      };
      addProcessedPost(newPost);

    } catch (error) {
      addLog(`Process Failed: ${(error as Error).message}`, 'error');
    } finally {
      setRunningId(null);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Dashboard</h1>
          <p className="text-slate-500 dark:text-slate-400">
             Manage and monitor your automation campaigns. 
             {nextRunTime && <span className="text-xs ml-2 opacity-70 flex items-center inline-flex"><Clock size={10} className="mr-1"/> Scheduler Active (Last Check: {nextRunTime})</span>}
          </p>
        </div>
      </div>

      {campaigns.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 mb-4">
            <ExternalLink size={24} />
          </div>
          <h3 className="text-lg font-medium text-slate-900 dark:text-white">No campaigns yet</h3>
          <p className="text-slate-500 dark:text-slate-400 mb-6">Create your first automation pipeline to get started.</p>
          <Link to="/create" className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 font-medium">Create Campaign &rarr;</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {campaigns.map(campaign => (
            <div key={campaign.id} className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 flex items-center justify-between transition-colors">
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-2">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">{campaign.name}</h3>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium uppercase tracking-wide
                    ${campaign.status === 'active' 
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                      : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'}
                  `}>
                    {campaign.status}
                  </span>
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-400 space-y-1">
                  <div className="flex items-center space-x-2">
                    <ExternalLink size={14} />
                    <span className="truncate max-w-md">{campaign.source_url}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-6 px-6 border-l border-slate-100 dark:border-slate-800">
                <div className="text-center">
                  <div className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Mode</div>
                  <div className="font-medium text-slate-700 dark:text-slate-300 text-sm">
                     {campaign.processing_mode === ProcessingMode.AS_IS ? 'As Is' : 
                      campaign.processing_mode === ProcessingMode.AI_URL_DIRECT ? 'AI Direct' : 'AI Rewrite'}
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2 pl-6 border-l border-slate-100 dark:border-slate-800">
                <button 
                  onClick={() => runSimulation(campaign)}
                  disabled={runningId === campaign.id}
                  className="p-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors disabled:opacity-50"
                  title="Run Now (Manual Trigger)"
                >
                  {runningId === campaign.id ? <div className="animate-spin h-5 w-5 border-2 border-indigo-600 border-t-transparent rounded-full"/> : <Play size={20} />}
                </button>
                <Link
                  to={`/campaign/${campaign.id}`}
                  className="p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                  title="View Stats"
                >
                  <BarChart2 size={20} />
                </Link>
                <Link 
                  to={`/edit/${campaign.id}`}
                  className="p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                  title="Edit Campaign"
                >
                  <Edit size={20} />
                </Link>
                <button 
                  onClick={() => handleDelete(campaign.id)}
                  className="p-2 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                  title="Delete"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showLogModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-900 dark:bg-black w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] border border-slate-700 dark:border-slate-800">
            <div className="p-4 border-b border-slate-700 dark:border-slate-800 flex justify-between items-center bg-slate-800 dark:bg-slate-900">
              <h3 className="text-slate-100 font-mono font-medium flex items-center">
                 <div className={`w-2 h-2 rounded-full mr-2 ${runningId ? 'bg-yellow-400 animate-pulse' : 'bg-green-400'}`}></div>
                 Worker Terminal
              </h3>
              <button onClick={() => setShowLogModal(false)} className="text-slate-400 hover:text-white">
                <XCircle size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 font-mono text-sm space-y-2 bg-slate-950 dark:bg-slate-950">
              {logs.map((log) => (
                <div key={log.id} className="flex items-start space-x-3">
                  <span className="text-slate-600 dark:text-slate-500 shrink-0">[{log.timestamp}]</span>
                  <span className={`break-words max-w-full
                    ${log.level === 'info' ? 'text-slate-300 dark:text-slate-400' : ''}
                    ${log.level === 'success' ? 'text-green-400' : ''}
                    ${log.level === 'warning' ? 'text-yellow-400' : ''}
                    ${log.level === 'error' ? 'text-red-400' : ''}
                  `}>
                    {log.level === 'success' && '✔ '}
                    {log.level === 'error' && '✖ '}
                    {log.level === 'warning' && '⚠ '}
                    {log.message}
                  </span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
