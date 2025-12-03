
import { GoogleGenAI } from "@google/genai";
import { getConfig } from "./mockDb";
import { AiResponse } from "./geminiService";

export const generatePostFromUrl = async (
  sourceUrl: string,
  minWords: number = 600,
  maxWords: number = 1000,
  model: string = 'gemini-2.5-flash',
  customPrompt?: string
): Promise<AiResponse> => {
  const config = getConfig();

  if (!config.gemini_key) {
    throw new Error("Gemini API Key is missing in Global Settings.");
  }

  let systemPrompt = "";

  const jsonInstruction = `
    OUTPUT FORMAT: JSON OBJECT ONLY.
    
    The JSON must match this structure:
    {
      "htmlContent": "<p>Content...</p>",
      "seo": {
        "focusKeyphrase": "derived keyword",
        "seoTitle": "The Click-Worthy Title",
        "metaDescription": "A punchy meta description (max 155 chars) including the keyword",
        "slug": "url-friendly-slug",
        "imageAlt": "Description for the featured image",
        "synonyms": "comma, separated, related, keywords"
      }
    }
  `;

  // Conditional Logic for "Quick Summary"
  const includeSummary = maxWords >= 600;
  const summaryInstruction = includeSummary 
    ? `- Include a short "Key Takeaways" bulleted list after the first paragraph.`
    : `- Do NOT include a "Key Takeaways" or Summary section. Start directly with the main content.`;

  if (customPrompt && customPrompt.trim().length > 10) {
      // 1. USE CUSTOM PROMPT
      let processedPrompt = customPrompt.replace(/{{SOURCE_URL}}/g, sourceUrl);
      
      systemPrompt = `
        ${processedPrompt}

        IMPORTANT:
        - DO NOT include an <h1> tag for the Title in the 'htmlContent'.
        - Output strictly valid JSON.
        
        ${jsonInstruction}
      `;
  } else {
      // 2. USE DEFAULT PROMPT
      systemPrompt = `
        Role: You are an entertainment news editor for a high-traffic movie blog. Your tone should be energetic, engaging, and hype-building.
        
        Task: Read the article at the provided URL using your search tools. Rewrite it to be SEO-optimized and ready for direct WordPress import.

        INPUT ARTICLE URL: ${sourceUrl}

        Constraints & Guidelines:
        1. Reading Level: Grade 7 English (Simple, punchy sentences. No complex jargon).
        2. Keywords: Analyze the source article and derive the PRIMARY FOCUS KEYWORD.
        3. Requirement: Use the Primary Keyword naturally in the very first sentence.
        4. Title: Write a click-worthy H1 title (max 60 characters) that includes the keyword.
        5. Length: Between ${minWords} and ${maxWords} words.
        6. No Duplicate Title: DO NOT include the <h1> Title in the 'htmlContent'. The CMS handles the title. Start directly with the body text.
        
        Structure:
        - Write the body in HTML format (use <h2>, <p>, <ul>, <li>, <strong>).
        ${summaryInstruction}
        - Use <strong> tags to bold names of actors and key release dates.
        - Tone: Enthusiastic but factual. Avoid robotic phrases like "delving into" or "testament to."

        ${jsonInstruction}
      `;
  }

  const ai = new GoogleGenAI({ apiKey: config.gemini_key });

  try {
    const response = await ai.models.generateContent({
      model: model, 
      contents: systemPrompt,
      config: {
        // responseMimeType: "application/json", // Removed: Incompatible with tools
        // Enable Google Search so the model can "Read" the fresh URL
        tools: [{ googleSearch: {} }] 
      }
    });

    const text = response.text;
    if (!text) throw new Error("Empty response from AI");

    // Robust JSON Extraction (Substrings > Regex)
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');

    if (jsonStart === -1 || jsonEnd === -1) {
        throw new Error("AI did not return a valid JSON object. Raw response: " + text.substring(0, 50) + "...");
    }

    const jsonStr = text.substring(jsonStart, jsonEnd + 1);
    
    try {
        return JSON.parse(jsonStr) as AiResponse;
    } catch (e) {
        throw new Error("Failed to parse extracted JSON string: " + (e as Error).message);
    }

  } catch (error) {
    console.error("Gemini Direct API Error:", error);
    throw new Error(`Failed to generate content from URL: ${(error as Error).message}`);
  }
};
