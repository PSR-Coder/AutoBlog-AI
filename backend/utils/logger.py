# utils/ai_processor.py
import os
import google.generativeai as genai


GEN_API_KEY = os.getenv("GENAI_API_KEY")

if GEN_API_KEY:
    genai.configure(api_key=GEN_API_KEY)


def rewrite_content_gemini(text: str, max_words=800):
    """Rewrite the content using Gemini API."""
    if not GEN_API_KEY:
        return text  # Fail-safe: return raw

    prompt = f"""
Rewrite the following article in simple English, max {max_words} words.
Add 3-5 bullet points summary at top.
Keep HTML clean.

{text}
"""

    model = genai.GenerativeModel("gemini-pro")

    resp = model.generate_content(prompt)
    return resp.text
