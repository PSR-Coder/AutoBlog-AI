
export enum ProcessingMode {
  AS_IS = 'AS_IS',
  AI_REWRITE = 'AI_REWRITE',
  TRANSLATOR_SPIN = 'TRANSLATOR_SPIN',
  AI_URL_DIRECT = 'AI_URL_DIRECT'
}

export enum SeoPlugin {
  NONE = 'NONE',
  YOAST = 'YOAST',
  RANK_MATH = 'RANK_MATH'
}

export enum AiProvider {
  OPENAI = 'OPENAI',
  GEMINI = 'GEMINI',
  CLAUDE = 'CLAUDE'
}

export interface GlobalConfig {
  gemini_key: string;
  openai_key: string;
  claude_key: string;
  google_translate_key: string;
}

export interface WordPressSite {
  site_url: string;
  username: string;
  application_password?: string;
  status: 'connected' | 'error' | 'pending';
}

export interface WordPressCategory {
  id: number;
  name: string;
  slug: string;
}

export interface Campaign {
  id: string;
  name: string;
  source_url: string;
  source_type: 'RSS' | 'DIRECT';
  
  // Logic
  processing_mode: ProcessingMode;
  ai_model?: string;
  prompt_type: 'default' | 'custom';
  custom_prompt?: string;
  
  // Content Length Configuration
  min_word_count?: number; 
  max_word_count?: number;
  
  // SEO & Targeting
  seo_plugin: SeoPlugin;
  post_status: 'publish' | 'draft';
  target_category_id?: number;
  max_posts_limit?: number;

  // Schedule
  schedule_days: number[]; // 0-6 (Sun-Sat)
  schedule_start_hour: number; // 0-23
  schedule_end_hour: number; // 0-23
  min_interval_minutes: number;

  // Meta
  last_run_at?: string;
  status: 'active' | 'paused';
  
  wordpress_site: WordPressSite;
}

export interface ProcessedPost {
  id: string;
  campaign_id: string;
  wordpress_post_id?: number;
  title: string;
  source_url: string;
  target_url?: string;
  status: 'fetched' | 'rewritten' | 'translated' | 'published' | 'draft' | 'failed' | 'trashed';
  tokens_used?: number;
  created_at: string;
  logs: string[];
  featuredMediaId?: number;
}

export interface WorkerLog {
  id: string;
  timestamp: string;
  level: 'info' | 'success' | 'error' | 'warning';
  message: string;
}

export interface RssItem {
  title: string;
  link: string;
  content: string;
  pubDate: string;
  guid: string;
  imageUrl?: string; 
}
