
import { WordPressCategory, ProcessedPost, SeoPlugin, RssItem } from '../types';
import { findLatestPostFromSitemap } from './sitemapService';

/**
 * CONFIGURATION
 */
const CORS_PROXY_PRIMARY = "https://corsproxy.io/?";
const CORS_PROXY_SECONDARY = "https://api.allorigins.win/raw?url=";
const CORS_PROXY_TERTIARY = "https://thingproxy.freeboard.io/fetch/";

type Logger = (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;

/**
 * UTILITIES
 */
export const normalizeWpUrl = (url: string) => {
    if (!url) return "";
    let clean = url.trim().replace(/\/+$/, "");
    if (!/^https?:\/\//i.test(clean)) {
        clean = 'https://' + clean;
    }
    return clean;
};

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const absolutizeUrl = (base: string, link: string): string => {
    if (!link) return link;
    try {
        if (link.startsWith('//')) {
            const u = new URL(base);
            return `${u.protocol}${link}`;
        }
        if (/^https?:\/\//i.test(link)) return link;
        return new URL(link, base).href;
    } catch (e) {
        return link;
    }
};

const stripQuery = (url: string) => url.split('?')[0];

export const validateScrapedContent = (title: string, content: string): boolean => {
    const blockedPhrases = [
        "sorry, you have been blocked",
        "attention required! | cloudflare",
        "access denied",
        "403 forbidden",
        "please enable cookies",
        "security check to access",
        "challenge validation"
    ];

    const combined = (title + " " + content).toLowerCase();
    for (const phrase of blockedPhrases) {
        if (combined.includes(phrase)) return false;
    }
    return true;
};

/**
 * PROXY FETCHING ENGINE
 */
const fetchWithProxyOnce = async (proxyPrefix: string, url: string): Promise<{ text: string; ok: boolean; status?: number }> => {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s Timeout
        
        const res = await fetch(`${proxyPrefix}${encodeURIComponent(url)}`, { 
            signal: controller.signal,
            headers: {
                // Simulate browser to avoid some basic blocks
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        clearTimeout(timeoutId);
        
        const text = await res.text();
        return { text, ok: res.ok, status: res.status };
    } catch (e) {
        return { text: "", ok: false };
    }
};

export const fetchWithProxy = async (url: string, retries = 1, baseDelay = 1000, log?: Logger): Promise<{ text: string; ok: boolean; status?: number; usedProxy?: string }> => {
    const proxies = [CORS_PROXY_PRIMARY, CORS_PROXY_SECONDARY, CORS_PROXY_TERTIARY];

    try {
        const direct = await fetch(url);
        if (direct.ok) {
            const t = await direct.text();
            if (t.length > 200 && !t.toLowerCase().includes('cloudflare')) {
                return { text: t, ok: true, status: direct.status, usedProxy: 'DIRECT' };
            }
        }
    } catch (e) { /* ignore */ }

    for (const proxy of proxies) {
        for (let attempt = 0; attempt <= retries; attempt++) {
            const { text, ok, status } = await fetchWithProxyOnce(proxy, url);
            if (ok && text && text.length > 200 && !text.toLowerCase().includes('403 forbidden')) {
                return { text, ok: true, status, usedProxy: proxy };
            }
            await wait(baseDelay * Math.pow(2, attempt));
        }
    }
    return { text: "", ok: false };
};

/**
 * RSS PARSING
 */
export const fetchRealRssFeedMultiple = async (url: string, maxItems = 10): Promise<RssItem[] | null> => {
    try {
        const { text, ok } = await fetchWithProxy(url);
        if (!ok || !text) return null;
        
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, "text/xml");
        const items = Array.from(xmlDoc.querySelectorAll("item, entry")).slice(0, maxItems);
        
        if (items.length === 0) return null;

        return items.map((el: Element) => {
             const getText = (tag: string) => {
                 const node = el.querySelector(tag);
                 return node ? (node.textContent || '') : '';
             };
             
             let link = getText('link');
             if (!link) link = el.querySelector('link')?.getAttribute('href') || '';
             
             // Handle CDATA content
             let content = '';
             const encoded = el.getElementsByTagNameNS("*", "encoded")[0];
             if (encoded) content = encoded.textContent || '';
             if (!content) content = getText('description') || getText('content');
             
             // Image Extraction (Enhanced for Tupaki & Generic RSS)
             let img = el.querySelector('enclosure')?.getAttribute('url') || "";
             if (!img) {
                 const mediaContent = el.getElementsByTagNameNS("*", "content")[0];
                 if (mediaContent) img = mediaContent.getAttribute('url') || "";
             }
             
             if (!img && content) {
                 // 1. Tupaki Figure Pattern
                 const figureMatch = content.match(/<figure>\s*<img[^>]+src=["']([^"'>]+)["']/i);
                 if (figureMatch) {
                    img = figureMatch[1];
                 } else {
                    // 2. Tupaki Hocalwire DIV Pattern
                    const divMatch = content.match(/<div[^>]+class=["'][^"']*image-and-caption-wrapper[^"']*["'][^>]*>\s*<img[^>]+src=["']([^"'>]+)["']/i);
                    if (divMatch) {
                        img = divMatch[1];
                    } else {
                        // 3. Fallback to any image
                        let match = content.match(/<img[^>]+src=["']([^"'>]+)["']/i);
                        if (match) img = match[1];
                    }
                 }
             }

             return {
                 title: getText('title'),
                 link: stripQuery(link),
                 content,
                 pubDate: getText('pubDate') || new Date().toISOString(),
                 guid: getText('guid') || stripQuery(link),
                 imageUrl: img || undefined
             };
        });
    } catch { return null; }
};

/**
 * DISCOVERY & HTML SCRAPING
 */
const discoverAndFetchContent = async (baseUrl: string, log?: Logger): Promise<RssItem | null> => {
    const cleanBase = baseUrl.replace(/\/$/, '');
    
    // STRATEGY 1: SITEMAP DISCOVERY (Prioritized)
    if (log) log(`[Discovery] Trying Strategy 1: Sitemap Traversal`, 'info');
    try {
        const sitemapUrl = await findLatestPostFromSitemap(cleanBase, log);
        if (sitemapUrl) {
            if (log) log(`[Discovery] Found post via sitemap: ${sitemapUrl}`, 'success');
            return await scrapeSinglePage(cleanBase, sitemapUrl, log);
        }
    } catch (e) {
        if (log) log(`[Discovery] Sitemap strategy failed: ${e}`, 'warning');
    }

    // STRATEGY 2: COMMON RSS PATTERNS
    if (log) log(`[Discovery] Trying Strategy 2: Common RSS Patterns`, 'info');
    const rssPatterns = [
        'google_feeds.xml', 
        'feed', 
        'rss', 
        'feed.xml', 
        'rss.xml', 
        'atom.xml',
        'feed/index.xml'
    ];

    for (const pattern of rssPatterns) {
        try {
            const pathUrl = `${cleanBase}/${pattern}`;
            let items = await fetchRealRssFeedMultiple(pathUrl, 1);
            if (items && items.length > 0) {
                 if (log) log(`[Discovery] Found RSS feed at: ${pathUrl}`, 'success');
                 return items[0];
            }
        } catch (e) { /* ignore */ }
    }

    // STRATEGY 3: HTML SCRAPING (Home/Category Page Scanning)
    if (log) log(`[Discovery] Trying Strategy 3: HTML Link Scanning`, 'info');
    try {
        const { text: listHtml, ok } = await fetchWithProxy(cleanBase, 1, 1000, log);
        if (!ok || !listHtml) return null;

        const parser = new DOMParser();
        const doc = parser.parseFromString(listHtml, 'text/html');

        // Look for RSS link in head
        const rssLink = doc.querySelector('link[rel="alternate"][type="application/rss+xml"]');
        if (rssLink) {
            const href = rssLink.getAttribute('href');
            if (href) {
                const feedUrl = absolutizeUrl(cleanBase, href);
                if (log) log(`[Discovery] Found RSS link in HTML head: ${feedUrl}`, 'success');
                const items = await fetchRealRssFeedMultiple(feedUrl, 1);
                if (items && items.length > 0) return items[0];
            }
        }
        
        let selectors = [
             '.post-box-title a', 
             'article h2 a', 
             'article h3 a', 
             '.entry-title a', 
             '.post-title a', 
             '.news-card a', 
             '.item-details a'
        ];
        const generalSelectors = ['h1 a', 'h2 a', 'h3 a'];
        
        const candidates = Array.from(doc.querySelectorAll([...selectors, ...generalSelectors].join(', ')));
        
        let bestLink: string | null = null;
        let bestTextLen = 0;

        for (const link of candidates) {
            const href = link.getAttribute('href');
            const text = link.textContent?.trim() || '';
            
            if (href && text.length > 10 && text.length > bestTextLen) {
                if (!href.includes('comment') && !href.includes('#') && !href.includes('login') && !href.includes('signup')) {
                    if (!link.closest('nav') && !link.closest('footer') && !link.closest('.sidebar') && !link.closest('.menu')) {
                        if (link.closest('.post-box-title')) {
                            bestLink = href;
                            bestTextLen = text.length + 100; // Boost Gulte specific
                        } else {
                            if (text.length > bestTextLen) {
                                bestLink = href;
                                bestTextLen = text.length;
                            }
                        }
                    }
                }
            }
        }

        if (!bestLink) return null;
        const articleUrl = absolutizeUrl(cleanBase, bestLink);
        if (log) log(`[Discovery] Found article link via HTML scan: ${articleUrl}`, 'success');
        
        return await scrapeSinglePage(cleanBase, articleUrl, log);

    } catch (e) {
        return null;
    }
};

/**
 * HELPER: Scrape a Single Page (Recursive for pagination)
 */
const scrapeSinglePage = async (cleanBase: string, articleUrl: string, log?: Logger): Promise<RssItem | null> => {
    if (log) log(`[Scraper] Starting scrape of: ${articleUrl}`, 'info');
    
    const parser = new DOMParser();
    let fullContent = "";
    let finalTitle = "";
    let finalImage = "";
    let nextUrl: string | null = articleUrl;
    let pagesFetched = 0;
    const visited = new Set<string>();

    while (nextUrl && pagesFetched < 5 && !visited.has(nextUrl)) {
        visited.add(nextUrl);
        if (log && pagesFetched > 0) log(`[Scraper] Fetching page ${pagesFetched + 1}...`, 'info');
        
        const { text: html, ok: pgOk } = await fetchWithProxy(nextUrl, 1, 1000, log);
        if (!pgOk || !html) {
            if (log) log(`[Scraper] Failed to fetch HTML for ${nextUrl}`, 'error');
            break;
        }

        const artDoc = parser.parseFromString(html, 'text/html');
        
        // --- CLEAN UP DOM (Remove Video Players, Meta, etc) ---
        const unwantedSelectors = [
            'script', 'style', 'noscript', 'iframe', 'svg',
            '.jwplayer', '.jw-player', '.video-container', '.sticky-video', '.video-wrapper', // Videos
            '.post-meta', '.entry-meta', '.article-meta', '.author', '.byline', '.post-info', // Meta/Author
            '.date', '.published', '.updated', '.time', '.entry-date', // Dates
            '.share-buttons', '.social-icons', '.related-posts', '.social-share', // Social
            '.ads', '.advertisement', '.ad-container', // Ads
            '.sidebar', '#sidebar', '.widget-area' // Layout
        ];
        
        unwantedSelectors.forEach(sel => {
            artDoc.querySelectorAll(sel).forEach(el => el.remove());
        });
        // --------------------------------------------------------

        if (pagesFetched === 0) {
            finalTitle = artDoc.querySelector('h1')?.textContent || artDoc.title || '';
            finalImage = artDoc.querySelector('meta[property="og:image"]')?.getAttribute('content') || "";
            // Fallback image scraping
            if (!finalImage) {
                 const firstImg = artDoc.querySelector('article img, .entry-content img');
                 if (firstImg) finalImage = firstImg.getAttribute('src') || "";
            }
            if (log) log(`[Scraper] Title found: "${finalTitle.trim()}"`, 'info');
        }

        let pageContent = "";
        const contentSelectors = ['.entry-content', '.post-content', 'article', 'main', '#content', '.story-content', '.post_details', '.content-body'];
        for (const sel of contentSelectors) {
            const el = artDoc.querySelector(sel);
            if (el && el.textContent && el.textContent.length > 100) {
                pageContent = el.innerHTML;
                break;
            }
        }
        if (!pageContent) {
            const ps = Array.from(artDoc.querySelectorAll('p')).map(p => p.outerHTML).join('');
            if (ps.length > 200) pageContent = ps;
        }
        
        fullContent += pageContent + "<hr/>";

        const nextLinkEl = artDoc.querySelector('link[rel="next"], a.next, a.next-page, .pagination a:last-child');
        let foundNext = nextLinkEl?.getAttribute('href');
        
        if (!foundNext) {
            const numberedLinks = Array.from(artDoc.querySelectorAll('.pagination a, .page-links a, .pages a'));
            for (const l of numberedLinks) {
                    const href = l.getAttribute('href');
                    if (href && !visited.has(absolutizeUrl(cleanBase, href))) {
                        foundNext = href;
                        break;
                    }
            }
        }

        nextUrl = foundNext ? absolutizeUrl(cleanBase, foundNext) : null;
        pagesFetched++;
    }

    if (!finalTitle || fullContent.length < 50) {
        if (log) log(`[Scraper] Failed: Content too short or no title.`, 'error');
        return null;
    }

    return {
        title: finalTitle.trim(),
        link: articleUrl,
        content: fullContent,
        pubDate: new Date().toISOString(),
        guid: articleUrl,
        imageUrl: finalImage || undefined
    };
}

export const fetchContentFromSource = async (url: string, type: 'RSS' | 'DIRECT', log?: Logger): Promise<RssItem | null> => {
    let targetUrl = url.trim();
    if (!/^https?:\/\//i.test(targetUrl)) targetUrl = 'https://' + targetUrl;
    
    if (type === 'RSS') {
        const items = await fetchRealRssFeedMultiple(targetUrl, 1);
        return items ? items[0] : null;
    }
    return discoverAndFetchContent(targetUrl, log);
};

export const testFetchSource = async (url: string, type: 'RSS' | 'DIRECT'): Promise<{ success: boolean; item?: RssItem; error?: string }> => {
    try {
        const item = await fetchContentFromSource(url, type);
        if (!item) return { success: false, error: "No content found." };
        if (!validateScrapedContent(item.title, item.content)) return { success: false, error: "Content blocked." };
        return { success: true, item };
    } catch (e) {
        return { success: false, error: (e as Error).message };
    }
};

/**
 * WORDPRESS
 */

export const verifyRealWpConnection = async (
  siteUrl: string, username: string, appPassword: string
): Promise<{ success: boolean; categories: WordPressCategory[]; error?: string }> => {
  const baseUrl = normalizeWpUrl(siteUrl);
  const auth = btoa(`${username}:${appPassword}`);
  const headers = { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' };

  try {
    let endpoint = `${baseUrl}/wp-json/wp/v2/users/me`;
    let res = await fetch(endpoint, { method: 'GET', headers });

    if (res.status === 404) {
        endpoint = `${baseUrl}/?rest_route=/wp/v2/users/me`;
        res = await fetch(endpoint, { method: 'GET', headers });
    }

    if (!res.ok) throw new Error(`WP Connection Failed: ${res.status}`);

    const catsEndpoint = endpoint.includes('rest_route') 
        ? `${baseUrl}/?rest_route=/wp/v2/categories&per_page=100` 
        : `${baseUrl}/wp-json/wp/v2/categories?per_page=100`;
        
    const catRes = await fetch(catsEndpoint, { method: 'GET', headers });
    const categories = catRes.ok ? await catRes.json() : [];

    return { 
        success: true, 
        categories: categories.map((c: any) => ({ id: c.id, name: c.name, slug: c.slug })) 
    };
  } catch (error: any) {
    return { success: false, categories: [], error: error.message };
  }
};

export async function fetchRecentPosts(wpUrl: string, username: string, appPassword: string) {
    const baseUrl = normalizeWpUrl(wpUrl);
    const auth = btoa(`${username}:${appPassword}`);
    try {
        const res = await fetch(`${baseUrl}/wp-json/wp/v2/posts?per_page=5&_fields=id,title,link`, {
             headers: { 'Authorization': `Basic ${auth}` }
        });
        return res.ok ? await res.json() : [];
    } catch { return []; }
}

export async function uploadImageFromUrl(
    wpUrl: string, 
    username: string, 
    appPassword: string, 
    imageUrl: string, 
    altText: string,
    log?: Logger
) {
    const cleanWp = normalizeWpUrl(wpUrl);
    const auth = btoa(`${username}:${appPassword}`);
    const logFn = (msg: string, type: 'info'|'success'|'warning'|'error' = 'info') => {
        if (log) log(msg, type);
    };
    
    // wsrv.nl is a robust Image CDN that returns CORS-enabled images
    const strategies = [
        {
            name: "WsRv (Image CDN)",
            url: `https://wsrv.nl/?url=${encodeURIComponent(imageUrl)}&output=jpg&n=-1`
        },
        {
            name: "CorsProxy",
            url: `https://corsproxy.io/?${encodeURIComponent(imageUrl)}`
        },
        {
            name: "AllOrigins",
            url: `https://api.allorigins.win/raw?url=${encodeURIComponent(imageUrl)}`
        },
        {
             name: "CodeTabs",
             url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(imageUrl)}`
        }
    ];

    let blob: Blob | null = null;
    
    // 1. DOWNLOAD PHASE
    for (const strat of strategies) {
        try {
            logFn(`[Image] Downloading via ${strat.name}...`, 'info');
            const res = await fetch(strat.url, { referrerPolicy: "no-referrer" });
            
            if (res.ok) {
                const tempBlob = await res.blob();
                if (tempBlob.size > 1000) {
                    blob = tempBlob;
                    logFn(`[Image] Download success! Size: ${Math.round(tempBlob.size/1024)}KB, Type: ${tempBlob.type}`, 'success');
                    break;
                } else {
                    logFn(`[Image] ${strat.name} returned invalid data (${tempBlob.size} bytes)`, 'warning');
                }
            } else {
                logFn(`[Image] ${strat.name} failed with status: ${res.status}`, 'warning');
            }
        } catch (e) {
            logFn(`[Image] ${strat.name} exception: ${(e as Error).message}`, 'warning');
        }
    }

    if (!blob) {
         logFn(`[Image] All download strategies failed. Cannot upload.`, 'error');
         return null;
    }

    // 2. UPLOAD PHASE - DUAL STRATEGY
    const ext = blob.type.split('/')[1] || 'jpg';
    const safeName = `img-${Date.now()}.${ext}`; 
    const endpoint = `${cleanWp}/wp-json/wp/v2/media`;

    // STRATEGY A: RAW BINARY (Standard)
    try {
        logFn(`[Image] Attempting Upload Strategy A (Raw Binary)...`, 'info');
        const uploadRes = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Authorization": "Basic " + auth,
                "Content-Disposition": `attachment; filename="${safeName}"`,
                "Content-Type": blob.type
            },
            body: blob
        });
        
        if (uploadRes.ok) {
            const json = await uploadRes.json();
            await updateImageAltText(cleanWp, auth, json.id, altText);
            return json.id;
        } else {
            const err = await uploadRes.text();
            logFn(`[Image] Strategy A failed: ${uploadRes.status}. Retrying with FormData...`, 'warning');
        }
    } catch (e) { 
        logFn(`[Image] Strategy A exception: ${(e as Error).message}`, 'warning');
    }

    // STRATEGY B: FORM DATA (Hostinger/WAF Bypass)
    try {
        logFn(`[Image] Attempting Upload Strategy B (Multipart FormData)...`, 'info');
        const formData = new FormData();
        formData.append('file', blob, safeName);
        if (altText) formData.append('alt_text', altText);
        
        const uploadRes = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Authorization": "Basic " + auth
                // NOTE: Do NOT set Content-Type here, browser sets it with boundary for FormData
            },
            body: formData
        });

        if (uploadRes.ok) {
            const json = await uploadRes.json();
            return json.id;
        } else {
            const err = await uploadRes.text();
            logFn(`[Image] Strategy B failed: ${uploadRes.status} - ${err.substring(0, 100)}`, 'error');
            return null;
        }
    } catch (e) {
        logFn(`[Image] Strategy B exception: ${(e as Error).message}`, 'error');
        return null;
    }
}

async function updateImageAltText(cleanWp: string, auth: string, id: number, altText: string) {
    if (!id || !altText) return;
    try {
        await fetch(`${cleanWp}/wp-json/wp/v2/media/${id}`, {
            method: "POST",
            headers: {
                "Authorization": "Basic " + auth,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ alt_text: altText })
        });
    } catch { /* ignore */ }
}

export async function publishToRealWordpress(
    wpUrl: string, username: string, appPassword: string, payload: any
) {
    const cleanWp = normalizeWpUrl(wpUrl);
    const auth = btoa(`${username}:${appPassword}`);
    
    const endpoint = `${cleanWp}/wp-json/wp/v2/posts`;
    
    const body: any = {
        title: payload.title,
        content: payload.content,
        status: payload.status,
        categories: payload.categories || [],
        featured_media: payload.featuredMediaId,
        slug: payload.slug
    };

    if (payload.seo?.plugin === SeoPlugin.YOAST) {
         body.meta = {
             _yoast_wpseo_focuskw: payload.seo.focusKeyphrase,
             _yoast_wpseo_metadesc: payload.seo.metaDescription,
             _yoast_wpseo_title: payload.seo.seoTitle,
             _yoast_wpseo_focuskw_text_input: payload.seo.focusKeyphrase,
             _yoast_wpseo_desc: payload.seo.metaDescription // Fallback for some versions
         };
         if (payload.seo.synonyms) {
            body.meta._yoast_wpseo_focuskw_synonyms = payload.seo.synonyms;
         }
    }

    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) {
            const txt = await res.text();
            return { success: false, error: `${res.status} ${txt}` };
        }
        const json = await res.json();
        return { success: true, id: json.id, link: json.link };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function deletePostFromWordpress(wpUrl: string, username: string, appPassword: string, postId: number) {
    const cleanWp = normalizeWpUrl(wpUrl);
    const auth = btoa(`${username}:${appPassword}`);
    try {
        const res = await fetch(`${cleanWp}/wp-json/wp/v2/posts/${postId}`, {
            method: 'DELETE',
            headers: { "Authorization": "Basic " + auth }
        });
        return res.ok;
    } catch (e) {
        console.error("Delete Error", e);
        return false;
    }
}

export async function getWordpressPostStatuses(wpUrl: string, username: string, appPassword: string, postIds: number[]) {
    const cleanWp = normalizeWpUrl(wpUrl);
    const auth = btoa(`${username}:${appPassword}`);
    const result: Record<number, string> = {};

    for (const id of postIds) {
        try {
            const res = await fetch(`${cleanWp}/wp-json/wp/v2/posts/${id}?context=edit`, {
                 headers: { 'Authorization': `Basic ${auth}` }
            });
            if (res.ok) {
                const json = await res.json();
                result[id] = json.status;
            } else if (res.status === 404) {
                result[id] = 'trashed';
            }
        } catch { /* ignore */ }
    }
    return result;
}
