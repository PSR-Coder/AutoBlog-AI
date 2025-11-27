
import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { getCampaigns, deleteCampaign, addProcessedPost, isUrlProcessed } from '../services/mockDb';
import { fetchContentFromSource, publishToRealWordpress, fetchRecentPosts, uploadImageFromUrl, validateScrapedContent } from '../services/externalServices';
import { Campaign, ProcessingMode, WorkerLog, ProcessedPost } from '../types';
import { Play, Trash2, ExternalLink, XCircle, Edit, BarChart2 } from 'lucide-react';
import { rewriteContent } from '../services/geminiService';

const Dashboard: React.FC = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [logs, setLogs] = useState<WorkerLog[]>([]);
  const [showLogModal, setShowLogModal] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCampaigns(getCampaigns());
  }, []);

  useEffect(() => {
    if (showLogModal && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, showLogModal]);

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

  const runSimulation = async (campaign: Campaign) => {
    setRunningId(campaign.id);
    setLogs([]);
    setShowLogModal(true);

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
      // 1. Scheduler Check
      addLog(`Checking schedule for campaign: ${campaign.name}...`);
      await new Promise(r => setTimeout(r, 500));
      addLog(`Schedule Valid (Forced Run).`, 'success');

      // 2. Fetching
      addLog(`Fetching content from: ${campaign.source_url} (${campaign.source_type || 'RSS'})...`, 'info');
      
      const rssItem = await fetchContentFromSource(
          campaign.source_url, 
          campaign.source_type || 'RSS',
          (msg, type) => addLog(msg, type || 'info') // Pass Logger
      );
      
      if (rssItem) {
        if (isUrlProcessed(campaign.id, rssItem.link)) {
             addLog(`Duplicate detected. Post already processed: "${rssItem.title}"`, 'warning');
             return; 
        }

        if (!validateScrapedContent(rssItem.title, rssItem.content)) {
            addLog(`Blocked Content Detected.`, 'error');
            return;
        }

        addLog(`Found new article: "${rssItem.title}"`, 'success');
        articleTitle = rssItem.title;
        articleUrl = rssItem.link;
        articleContent = rssItem.content; 
        articleImage = rssItem.imageUrl || "";
        if (articleImage) addLog(`Found image: ${articleImage}`, 'info');
        postLogs.push('Fetched article from source');
      } else {
        throw new Error(`Could not fetch any items from source.`);
      }

      // 3. Processing
      let finalHtml = articleContent;
      let finalTitle = articleTitle;
      let finalSlug = '';
      let featuredMediaId: number | undefined = undefined;

      addLog('Fetching recent posts for internal linking context...', 'info');
      const recentPosts = await fetchRecentPosts(
          campaign.wordpress_site.site_url,
          campaign.wordpress_site.username,
          campaign.wordpress_site.application_password || ''
      );
      const recentPostsStr = recentPosts.map((p: any) => `- ${p.title} (${p.link})`).join('\n');

      if (campaign.processing_mode === ProcessingMode.AS_IS) {
        addLog('Mode AS_IS: Skipping processing.', 'info');
      } 
      else if (campaign.processing_mode === ProcessingMode.AI_REWRITE) {
        addLog(`Mode AI_REWRITE: Rewriting via ${campaign.ai_model || 'gemini'}...`, 'info');
        
        // PASS MIN/MAX WORD COUNT & MODEL
        const aiResult = await rewriteContent(
            articleContent, 
            articleTitle, 
            recentPostsStr,
            campaign.min_word_count || 600,
            campaign.max_word_count || 1000,
            campaign.ai_model || 'gemini-2.5-flash'
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

      // 4. Image Upload
      if (articleImage) {
          addLog(`Uploading featured image to WordPress...`, 'info');
          const altText = seoData.imageAlt || `${seoData.focusKeyphrase || articleTitle} - Featured Image`;
          const mediaId = await uploadImageFromUrl(
              campaign.wordpress_site.site_url,
              campaign.wordpress_site.username,
              campaign.wordpress_site.application_password || '',
              articleImage,
              altText
          );
          if (mediaId) {
              featuredMediaId = mediaId;
              addLog(`Image uploaded successfully (ID: ${mediaId})`, 'success');
          } else {
              addLog(`Image upload failed. Posting without featured image.`, 'warning');
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
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500">Manage and monitor your automation campaigns.</p>
        </div>
      </div>

      {campaigns.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-dashed border-slate-300">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 text-slate-400 mb-4">
            <ExternalLink size={24} />
          </div>
          <h3 className="text-lg font-medium text-slate-900">No campaigns yet</h3>
          <p className="text-slate-500 mb-6">Create your first automation pipeline to get started.</p>
          <Link to="/create" className="text-indigo-600 hover:text-indigo-700 font-medium">Create Campaign &rarr;</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {campaigns.map(campaign => (
            <div key={campaign.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-2">
                  <h3 className="text-lg font-bold text-slate-900">{campaign.name}</h3>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium uppercase tracking-wide
                    ${campaign.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}
                  `}>
                    {campaign.status}
                  </span>
                </div>
                <div className="text-sm text-slate-500 space-y-1">
                  <div className="flex items-center space-x-2">
                    <ExternalLink size={14} />
                    <span className="truncate max-w-md">{campaign.source_url}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-6 px-6 border-l border-slate-100">
                <div className="text-center">
                  <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Mode</div>
                  <div className="font-medium text-slate-700 text-sm">
                     {campaign.processing_mode === ProcessingMode.AS_IS ? 'As Is' : 'AI Rewrite'}
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2 pl-6 border-l border-slate-100">
                <button 
                  onClick={() => runSimulation(campaign)}
                  disabled={runningId === campaign.id}
                  className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-50"
                  title="Run Now (Test)"
                >
                  {runningId === campaign.id ? <div className="animate-spin h-5 w-5 border-2 border-indigo-600 border-t-transparent rounded-full"/> : <Play size={20} />}
                </button>
                <Link
                  to={`/campaign/${campaign.id}`}
                  className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  title="View Stats"
                >
                  <BarChart2 size={20} />
                </Link>
                <Link 
                  to={`/edit/${campaign.id}`}
                  className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  title="Edit Campaign"
                >
                  <Edit size={20} />
                </Link>
                <button 
                  onClick={() => handleDelete(campaign.id)}
                  className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
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
          <div className="bg-slate-900 w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800">
              <h3 className="text-slate-100 font-mono font-medium flex items-center">
                 <div className={`w-2 h-2 rounded-full mr-2 ${runningId ? 'bg-yellow-400 animate-pulse' : 'bg-green-400'}`}></div>
                 Worker Terminal
              </h3>
              <button onClick={() => setShowLogModal(false)} className="text-slate-400 hover:text-white">
                <XCircle size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 font-mono text-sm space-y-2 bg-slate-950">
              {logs.map((log) => (
                <div key={log.id} className="flex items-start space-x-3">
                  <span className="text-slate-600 shrink-0">[{log.timestamp}]</span>
                  <span className={`break-words max-w-full
                    ${log.level === 'info' ? 'text-slate-300' : ''}
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
