
import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink, CheckCircle, Clock, XCircle, AlertTriangle, Trash2, RefreshCw } from 'lucide-react';
import { getCampaign, getProcessedPosts, deleteProcessedPost, updateProcessedPost } from '../services/mockDb';
import { Campaign, ProcessedPost } from '../types';
import { deletePostFromWordpress, getWordpressPostStatuses } from '../services/externalServices';

const CampaignDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [campaign, setCampaign] = useState<Campaign | undefined>(undefined);
  const [posts, setPosts] = useState<ProcessedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (id) {
      setCampaign(getCampaign(id));
      const localPosts = getProcessedPosts(id);
      setPosts(localPosts);
      setLoading(false);
      
      // Auto-sync status on load if we have posts with IDs
      if (localPosts.some(p => p.wordpress_post_id)) {
        syncStatuses(localPosts);
      }
    }
  }, [id]);

  const syncStatuses = async (currentPosts: ProcessedPost[]) => {
      if (!campaign || !campaign.wordpress_site.status) return;
      setSyncing(true);
      
      const idsToSync = currentPosts
        .filter(p => p.wordpress_post_id)
        .map(p => p.wordpress_post_id!);
      
      if (idsToSync.length > 0) {
          const statuses = await getWordpressPostStatuses(
              campaign.wordpress_site.site_url,
              campaign.wordpress_site.username,
              campaign.wordpress_site.application_password || '',
              idsToSync
          );

          // Update local DB
          currentPosts.forEach(post => {
              if (post.wordpress_post_id && statuses[post.wordpress_post_id]) {
                  const newStatus = statuses[post.wordpress_post_id];
                  if (post.status !== newStatus) {
                      post.status = newStatus as any; // Cast for now
                      updateProcessedPost(post);
                  }
              }
          });
          
          setPosts(getProcessedPosts(id!)); // Reload from DB
      }
      setSyncing(false);
  };

  const handleDeletePost = async (post: ProcessedPost) => {
      if (!confirm("Are you sure you want to delete this post from WordPress and the Dashboard?")) return;

      // 1. Delete from WordPress if ID exists
      if (post.wordpress_post_id && campaign) {
          await deletePostFromWordpress(
              campaign.wordpress_site.site_url,
              campaign.wordpress_site.username,
              campaign.wordpress_site.application_password || '',
              post.wordpress_post_id
          );
      }

      // 2. Delete from Local DB
      deleteProcessedPost(post.id);
      setPosts(prev => prev.filter(p => p.id !== post.id));
  };

  if (loading) return <div className="p-10 text-center">Loading stats...</div>;
  if (!campaign) return <div className="p-10 text-center">Campaign not found.</div>;

  const totalTokens = posts.reduce((sum, p) => sum + (p.tokens_used || 0), 0);
  const successRate = posts.length > 0 
    ? Math.round((posts.filter(p => p.status === 'published' || p.status === 'draft').length / posts.length) * 100)
    : 0;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <Link to="/" className="inline-flex items-center text-sm text-slate-500 hover:text-indigo-600 mb-4 transition-colors">
          <ArrowLeft size={16} className="mr-1" /> Back to Dashboard
        </Link>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{campaign.name} <span className="text-slate-400 font-light">Stats</span></h1>
            <p className="text-slate-500 mt-1">
              Source: <a href={campaign.source_url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">{campaign.source_url}</a>
            </p>
          </div>
          <div className="flex space-x-2">
            <button 
                onClick={() => syncStatuses(posts)}
                disabled={syncing}
                className="px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg text-sm font-medium hover:bg-indigo-100 transition-colors flex items-center"
            >
                <RefreshCw size={14} className={`mr-2 ${syncing ? 'animate-spin' : ''}`} />
                Sync Status
            </button>
            <Link 
                to={`/edit/${campaign.id}`}
                className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
            >
                Edit Settings
            </Link>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs text-slate-500 uppercase tracking-wide font-medium">Total Processed</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{posts.length}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs text-slate-500 uppercase tracking-wide font-medium">Tokens Consumed</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{totalTokens.toLocaleString()}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs text-slate-500 uppercase tracking-wide font-medium">Success Rate</div>
          <div className="text-2xl font-bold text-green-600 mt-1">{successRate}%</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
           <div className="text-xs text-slate-500 uppercase tracking-wide font-medium">Limit</div>
           <div className="text-2xl font-bold text-slate-900 mt-1">{campaign.max_posts_limit || '∞'}</div>
        </div>
      </div>

      {/* Posts Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <h3 className="font-semibold text-slate-800">Processing History</h3>
        </div>
        
        {posts.length === 0 ? (
          <div className="p-10 text-center text-slate-500">
            No posts processed yet. Run the campaign simulation from the dashboard.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Source</th>
                  <th className="px-6 py-3">Status Workflow</th>
                  <th className="px-6 py-3">Target</th>
                  <th className="px-6 py-3 text-right">Tokens</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {posts.map(post => (
                  <tr key={post.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 text-slate-500 whitespace-nowrap">
                      {new Date(post.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900 truncate max-w-[200px]">{post.title}</div>
                      <a href={post.source_url} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:underline flex items-center mt-1">
                        Source Link <ExternalLink size={10} className="ml-1"/>
                      </a>
                    </td>
                    <td className="px-6 py-4">
                       <div className="flex items-center space-x-2">
                         {/* Visualizing workflow */}
                         <div className="flex items-center text-xs">
                            <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded">Fetched</span>
                            <div className="w-4 h-px bg-slate-300 mx-1"></div>
                            {post.status === 'failed' ? (
                               <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded flex items-center">
                                 <XCircle size={10} className="mr-1"/> Failed
                               </span>
                            ) : (
                              <>
                                <span className="bg-purple-100 text-purple-600 px-2 py-0.5 rounded">Processed</span>
                                <div className="w-4 h-px bg-slate-300 mx-1"></div>
                                <span className={`px-2 py-0.5 rounded flex items-center capitalize
                                  ${post.status === 'published' ? 'bg-green-100 text-green-700' : ''}
                                  ${post.status === 'draft' ? 'bg-yellow-100 text-yellow-700' : ''}
                                  ${post.status === 'trashed' ? 'bg-red-50 text-red-500 line-through' : ''}
                                `}>
                                  {post.status === 'published' && <CheckCircle size={10} className="mr-1"/>}
                                  {post.status === 'draft' && <Clock size={10} className="mr-1"/>}
                                  {post.status === 'trashed' && <Trash2 size={10} className="mr-1"/>}
                                  {post.status}
                                </span>
                              </>
                            )}
                         </div>
                       </div>
                    </td>
                    <td className="px-6 py-4">
                      {post.target_url ? (
                        <a href={post.target_url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline flex items-center">
                          Target Post <ExternalLink size={12} className="ml-1"/>
                        </a>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-slate-600">
                      {post.tokens_used ? post.tokens_used : '-'}
                    </td>
                    <td className="px-6 py-4 text-right">
                        <button 
                            onClick={() => handleDeletePost(post)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Delete Post"
                        >
                            <Trash2 size={16} />
                        </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default CampaignDetails;
