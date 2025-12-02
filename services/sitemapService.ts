
import { RssItem } from '../types';

/**
 * UTILS
 */
const PROXIES = [
    "https://corsproxy.io/?",
    "https://api.allorigins.win/raw?url=",
    "https://api.codetabs.com/v1/proxy?quest=",
    "https://thingproxy.freeboard.io/fetch/"
];

type Logger = (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;

const fetchString = async (url: string, log?: Logger): Promise<string | null> => {
    
    // 1. Direct (Optimistic)
    try {
        if (log) log(`[Fetch] Trying Direct: ${url}`, 'info');
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(id);
        if (res.ok) {
            const txt = await res.text();
            if (txt.length > 50) return txt;
        }
    } catch (e) { /* ignore */ }

    // 2. Proxies
    for (const proxy of PROXIES) {
        try {
            const target = `${proxy}${encodeURIComponent(url)}`;
            if (log) log(`[Fetch] Trying Proxy (${new URL(proxy).hostname})...`, 'info');
            
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), 15000); // 15s Timeout
            
            const res = await fetch(target, { 
                signal: controller.signal,
                headers: {
                    // Fake User Agent to bypass some blocks
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });
            clearTimeout(id);
            
            if (res.ok) {
                const txt = await res.text();
                // Basic validation it's not a proxy error page or Cloudflare block
                if (!txt.includes('403 Forbidden') && !txt.includes('Proxy Error') && !txt.includes('Cloudflare')) {
                    if (log) log(`[Fetch] Success via proxy!`, 'success');
                    return txt;
                } else {
                    if (log) log(`[Fetch] Proxy returned error/block text.`, 'warning');
                }
            } else {
                if (log) log(`[Fetch] Proxy failed. Status: ${res.status}`, 'warning');
            }
        } catch (e) {
            if (log) log(`[Fetch] Proxy Exception: ${(e as Error).message}`, 'error');
        }
    }
    return null;
};

const parseXml = (xmlStr: string): Document | null => {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlStr, "text/xml");
        if (doc.querySelector("parsererror")) return null;
        return doc;
    } catch (e) {
        return null;
    }
};

/**
 * CORE LOGIC
 */
export const findCandidateUrlsFromSitemap = async (baseUrl: string, log?: Logger): Promise<{link: string, pubDate: string}[]> => {
    // Normalize URL
    let inputUrl = baseUrl.trim();
    if (!/^https?:\/\//i.test(inputUrl)) inputUrl = 'https://' + inputUrl;
    
    if (log) log(`[Sitemap] Starting discovery for: ${inputUrl}`, 'info');

    let sitemapIndexContent: string | null = null;
    let foundAtUrl = "";
    
    // CASE A: User provided a direct XML link
    if (inputUrl.endsWith('.xml')) {
        if (log) log(`[Sitemap] Detected direct XML input.`, 'info');
        sitemapIndexContent = await fetchString(inputUrl, log);
        if (sitemapIndexContent) foundAtUrl = inputUrl;
    } 
    // CASE B: User provided a domain. We must hunt.
    else {
        const domain = inputUrl.replace(/\/$/, "");
        
        const sitemapVariations = [
            '/sitemap_index.xml',
            '/sitemap.xml',
            '/wp-sitemap.xml',
            '/post-sitemap.xml',
            '/sitemap_posts.xml'
        ];

        for (const path of sitemapVariations) {
            const target = domain + path;
            const content = await fetchString(target, log);
            if (content && (content.includes('<sitemap') || content.includes('<url'))) {
                sitemapIndexContent = content;
                foundAtUrl = target;
                if (log) log(`[Sitemap] Found valid XML at: ${target}`, 'success');
                break;
            }
        }
    }

    if (!sitemapIndexContent) {
        if (log) log(`[Sitemap] Could not find any standard sitemap file after trying all proxies.`, 'error');
        return [];
    }

    const doc = parseXml(sitemapIndexContent);
    if (!doc) {
        if (log) log(`[Sitemap] Failed to parse XML content.`, 'error');
        return [];
    }

    // 2. Is this an Index (contains <sitemap>) or a Leaf (contains <url>)?
    const sitemapTags = Array.from(doc.querySelectorAll('sitemap'));
    let targetSitemapUrl = foundAtUrl;
    let leafContent = sitemapIndexContent;
    
    if (sitemapTags.length > 0) {
        // --- INDEX LOGIC ---
        if (log) log(`[Sitemap] Processing Index with ${sitemapTags.length} sitemaps...`, 'info');

        const maps = sitemapTags.map(tag => {
            const loc = tag.querySelector('loc')?.textContent || "";
            const lastmodStr = tag.querySelector('lastmod')?.textContent || "";
            const lastmod = lastmodStr ? new Date(lastmodStr).getTime() : 0;
            return { loc, lastmod };
        });

        // Filter: We care about 'post', 'news', 'article'. 
        const postMaps = maps.filter(m => {
            const l = m.loc.toLowerCase();
            const isContent = (l.includes('post') || l.includes('news') || l.includes('article'));
            const isJunk = l.includes('image') || l.includes('video') || l.includes('author') || l.includes('tag') || l.includes('category');
            return isContent && !isJunk;
        });

        if (log) log(`[Sitemap] Filtered down to ${postMaps.length} 'post' sitemaps.`, 'info');

        const candidates = postMaps.length > 0 ? postMaps : maps;

        // Sort by Numeric Suffix (Latest Bucket)
        candidates.sort((a, b) => {
            const getSequenceNum = (str: string) => {
                if (str.endsWith('/post-sitemap.xml')) return 1;
                const match = str.match(/(\d+)\.xml$/);
                return match ? parseInt(match[1], 10) : -1;
            };
            const numA = getSequenceNum(a.loc);
            const numB = getSequenceNum(b.loc);
            if (numA > -1 && numB > -1 && numA !== numB) {
                return numB - numA; 
            }
            return b.lastmod - a.lastmod;
        });

        if (candidates.length === 0) return [];
        
        targetSitemapUrl = candidates[0].loc;
        if (log) log(`[Sitemap] Winner sitemap (Latest Bucket): ${targetSitemapUrl}`, 'success');

        const fetchedSub = await fetchString(targetSitemapUrl, log);
        if (!fetchedSub) {
            if (log) log(`[Sitemap] Failed to fetch sub-sitemap: ${targetSitemapUrl}`, 'error');
            return [];
        }
        leafContent = fetchedSub;
    } 
    else {
        if (log) log(`[Sitemap] Found direct leaf sitemap (contains <url>).`, 'info');
    }

    // --- LEAF PARSING ---
    const leafDoc = parseXml(leafContent);
    if (!leafDoc) return [];

    const urls = Array.from(leafDoc.querySelectorAll('url')).map(tag => {
        const loc = tag.querySelector('loc')?.textContent || "";
        const lastmodStr = tag.querySelector('lastmod')?.textContent || "";
        // If lastmod is missing, we can't reliably filter by date, but we still return it
        return { 
            link: loc, 
            pubDate: lastmodStr || new Date().toISOString() 
        };
    });

    if (log) log(`[Sitemap] Found ${urls.length} URLs in sitemap.`, 'info');
    return urls;
};
