
import { GoogleGenAI } from "@google/genai";
import { getConfig } from "./mockDb";

export interface AiResponse {
  htmlContent: string;
  seo: {
    focusKeyphrase: string;
    seoTitle: string;
    metaDescription: string;
    slug: string;
    imageAlt: string;
    synonyms: string;
  };
}

export const rewriteContent = async (
  originalContent: string, 
  sourceTitle: string,
  existingPostsContext: string = "",
  minWords: number = 600,
  maxWords: number = 1000,
  model: string = 'gemini-2.5-flash'
): Promise<AiResponse> => {
  const config = getConfig();

  const systemPrompt = `
    You are an expert SEO Content Writer and WordPress Specialist.
    Your task is to take a source article and rewrite it into a highly engaging, readable blog post.

    SOURCE TITLE: "${sourceTitle}"
    SOURCE CONTENT: "${originalContent.substring(0, 15000)}" 
    
    EXISTING BLOG POSTS (Use these for internal linking if relevant):
    ${existingPostsContext || "No existing posts available."}

    STRICT READABILITY & STRUCTURE REQUIREMENTS:
    1.  **Quick Summary:** Start the article immediately with a "<h3>Quick Summary</h3>" section containing 3-4 bullet points summarizing the key news.
    2.  **Paragraph Length:** Keep paragraphs SHORT (maximum 3 sentences). Avoid walls of text.
    3.  **Vocabulary:** Use simple, Grade 8 reading level English. Avoid complex words like "synergy", "arduous", "formidable".
    4.  **Tone:** Engaging, Active Voice only. No Passive Voice.
    5.  **Length:** Between ${minWords} and ${maxWords} words.
    
    SEO REQUIREMENTS:
    1.  **Focus Keyphrase:** Derive the most potent SEO keyphrase from the source.
    2.  **SEO Title:** Must start with the Focus Keyphrase. Max 60 chars.
    3.  **Meta Description:** Must include the Focus Keyphrase. Max 155 chars.
    4.  **Headings:** Use descriptive <h2> and <h3> tags. Do not use vague headers like "Introduction" or "Conclusion".
    5.  **Pagination:** If the content exceeds ${maxWords} words, insert <!--nextpage--> tag once to split it naturally.
    6.  **Featured Image Alt:** Provide a descriptive ALT TEXT for the featured image containing the keyphrase.
    7.  **Internal Linking:** If relevant, hyperlink existing posts naturally. If not, add a "<h3>Also Read</h3>" list at the end.

    OUTPUT FORMAT: JSON ONLY.

    OUTPUT JSON STRUCTURE:
    {
      "htmlContent": "<h3>Quick Summary</h3><ul>...</ul><p>...</p>",
      "seo": {
        "focusKeyphrase": "...",
        "seoTitle": "...",
        "metaDescription": "...",
        "slug": "...",
        "imageAlt": "...",
        "synonyms": "comma, separated, keywords"
      }
    }
  `;

  // --- OPENAI HANDLER ---
  if (model.startsWith('gpt')) {
    if (!config.openai_key) throw new Error("OpenAI API Key is missing in Global Settings.");
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.openai_key}`
        },
        body: JSON.stringify({
            model: model,
            messages: [
                { role: "system", content: "You are a helpful SEO assistant that outputs valid JSON only." },
                { role: "user", content: systemPrompt }
            ],
            response_format: { type: "json_object" }
        })
    });
    
    if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenAI Error: ${err}`);
    }
    
    const json = await response.json();
    const content = json.choices[0].message.content;
    return JSON.parse(content) as AiResponse;
  }

  // --- CLAUDE HANDLER ---
  if (model.startsWith('claude')) {
    if (!config.claude_key) throw new Error("Claude API Key is missing in Global Settings.");
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'x-api-key': config.claude_key,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            model: model,
            max_tokens: 4096,
            messages: [{ role: "user", content: systemPrompt + "\n\nRespond strictly with the JSON." }]
        })
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Claude Error: ${err}`);
    }

    const json = await response.json();
    const text = json.content[0].text;
    const jsonStr = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
    return JSON.parse(jsonStr) as AiResponse;
  }

  // --- GEMINI HANDLER (Default) ---
  if (!config.gemini_key) {
    throw new Error("Gemini API Key is missing in Global Settings.");
  }

  const ai = new GoogleGenAI({ apiKey: config.gemini_key });

  try {
    const response = await ai.models.generateContent({
      model: model.startsWith('gemini') ? model : 'gemini-2.5-flash',
      contents: systemPrompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const text = response.text;
    if (!text) throw new Error("Empty response from AI");

    const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const data = JSON.parse(jsonStr) as AiResponse;

    return data;
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw new Error(`Failed to generate content: ${(error as Error).message}`);
  }
};
