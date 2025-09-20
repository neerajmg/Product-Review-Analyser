/*
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent';

/**
 * Validates a Gemini API key by making a simple request.
 * @param {string} apiKey The API key to validate.
 * @returns {Promise<string>} 'VALID', 'INVALID', 'QUOTA_EXHAUSTED', or 'ERROR'.
 */
export async function validateKey(apiKey) {
  if (!apiKey) {
    return 'INVALID';
  }

  const url = `${API_ENDPOINT}?key=${apiKey}`;
  const payload = {
    contents: [{ parts: [{ text: 'hello' }] }],
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (response.status === 400) {
      return 'INVALID';
    }
    if (response.status === 429) {
      return 'QUOTA_EXHAUSTED';
    }
    if (response.ok) {
      return 'VALID';
    }
  } catch (error) {
    console.error('Error validating Gemini key:', error);
    return 'ERROR';
  }

  return 'ERROR';
}

/**
 * Calls the Gemini API to generate a summary.
 * @param {string} apiKey The Gemini API key.
 * @param {string} prompt The prompt to send to the model.
 * @returns {Promise<string|null>} The generated summary text or null on error.
 */
export async function generateSummary(apiKey, prompt) {
  const url = `${API_ENDPOINT}?key=${apiKey}`;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.3,
      topK: 10,
      topP: 0.8,
      maxOutputTokens: 1024,
      stopSequences: [],
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.error('Gemini API rate limit exceeded. Please wait before trying again.');
        return null;
      }
      console.error('Gemini API request failed:', response.status, response.statusText);
      return null;
    }

    const data = await response.json();
    if (data.candidates && data.candidates.length > 0) {
      let content = data.candidates[0].content.parts[0].text.trim();
      
      // Extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        content = jsonMatch[1].trim();
      }
      
      return content;
    }
  } catch (error) {
    console.error('Error calling Gemini API:', error);
    return null;
  }

  return null;
}
