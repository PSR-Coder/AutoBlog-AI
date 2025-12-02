
import { Campaign, GlobalConfig, ProcessingMode, SeoPlugin, ProcessedPost, WordPressCategory } from '../types';

const CAMPAIGNS_KEY = 'autoblog_campaigns';
const CONFIG_KEY = 'autoblog_config';
const PROCESSED_POSTS_KEY = 'autoblog_processed_posts';

const DEFAULT_CONFIG: GlobalConfig = {
  gemini_key: '',
  openai_key: '',
  claude_key: '',
  google_translate_key: ''
};

// --- Campaigns ---

export const getCampaigns = (): Campaign[] => {
  const data = localStorage.getItem(CAMPAIGNS_KEY);
  return data ? JSON.parse(data) : [];
};

export const getCampaign = (id: string): Campaign | undefined => {
  return getCampaigns().find(c => c.id === id);
};

export const saveCampaign = (campaign: Campaign): void => {
  const campaigns = getCampaigns();
  const existingIndex = campaigns.findIndex(c => c.id === campaign.id);
  
  if (existingIndex >= 0) {
    campaigns[existingIndex] = campaign;
  } else {
    campaigns.push(campaign);
  }
  
  localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(campaigns));
};

export const deleteCampaign = (id: string): void => {
  const campaigns = getCampaigns().filter(c => c.id !== id);
  localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(campaigns));
  // Cleanup logs
  const allPosts = getAllProcessedPosts().filter(p => p.campaign_id !== id);
  localStorage.setItem(PROCESSED_POSTS_KEY, JSON.stringify(allPosts));
};

// --- Config ---

export const getConfig = (): GlobalConfig => {
  const data = localStorage.getItem(CONFIG_KEY);
  return data ? JSON.parse(data) : DEFAULT_CONFIG;
};

export const saveConfig = (config: GlobalConfig): void => {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
};

// --- Processed Posts (Stats) ---

export const getProcessedPosts = (campaignId: string): ProcessedPost[] => {
  const all = getAllProcessedPosts();
  return all.filter(p => p.campaign_id === campaignId).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
};

const getAllProcessedPosts = (): ProcessedPost[] => {
  const data = localStorage.getItem(PROCESSED_POSTS_KEY);
  return data ? JSON.parse(data) : [];
};

export const addProcessedPost = (post: ProcessedPost): void => {
  const all = getAllProcessedPosts();
  all.push(post);
  localStorage.setItem(PROCESSED_POSTS_KEY, JSON.stringify(all));
};

export const updateProcessedPost = (post: ProcessedPost): void => {
  const all = getAllProcessedPosts();
  const index = all.findIndex(p => p.id === post.id);
  if (index !== -1) {
    all[index] = post;
    localStorage.setItem(PROCESSED_POSTS_KEY, JSON.stringify(all));
  }
};

export const deleteProcessedPost = (id: string): void => {
  const all = getAllProcessedPosts();
  const filtered = all.filter(p => p.id !== id);
  localStorage.setItem(PROCESSED_POSTS_KEY, JSON.stringify(filtered));
};

export const isUrlProcessed = (campaignId: string, sourceUrl: string): boolean => {
  const posts = getProcessedPosts(campaignId);
  // Check exact match or if the new URL contains the old one (handling http/https differences)
  return posts.some(p => p.source_url === sourceUrl || p.source_url.includes(sourceUrl) || sourceUrl.includes(p.source_url));
};

// --- Seed ---

export const seedDefaults = () => {
  if (!localStorage.getItem(CAMPAIGNS_KEY)) {
    const seed: Campaign[] = [
      {
        id: '1',
        name: 'Tech News Daily',
        source_url: 'https://techcrunch.com/feed/',
        source_type: 'RSS',
        processing_mode: ProcessingMode.AI_REWRITE,
        ai_model: 'gemini-2.5-flash',
        prompt_type: 'default',
        seo_plugin: SeoPlugin.YOAST,
        post_status: 'draft',
        schedule_days: [1, 2, 3, 4, 5], // Mon-Fri
        schedule_start_hour: 10,
        schedule_end_hour: 22,
        min_interval_minutes: 60,
        status: 'active',
        max_posts_limit: 50,
        target_category_id: 2,
        last_run_at: new Date(Date.now() - 3600000).toISOString(),
        wordpress_site: {
          site_url: 'https://my-tech-blog.com',
          username: 'admin',
          status: 'connected'
        }
      }
    ];
    localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(seed));
  }
};
