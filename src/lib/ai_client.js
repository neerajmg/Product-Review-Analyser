/*
 * Generic AI Client - Multi-provider support
 * Supports OpenAI, Anthropic Claude, and Google Gemini
 */

const PROVIDERS = {
  OPENAI: 'openai',
  ANTHROPIC: 'anthropic',
  GEMINI: 'gemini'
};

const ENDPOINTS = {
  [PROVIDERS.OPENAI]: 'https://api.openai.com/v1/chat/completions',
  [PROVIDERS.ANTHROPIC]: 'https://api.anthropic.com/v1/messages',
  [PROVIDERS.GEMINI]: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent'
};

/**
 * Validates an API key for the specified provider
 * @param {string} provider - The AI provider (openai, anthropic, gemini)
 * @param {string} apiKey - The API key to validate
 * @returns {Promise<string>} 'VALID', 'INVALID', 'QUOTA_EXHAUSTED', or 'ERROR'
 */
export async function validateKey(provider, apiKey) {
  if (!apiKey || !provider) {
    return 'INVALID';
  }

  try {
    switch (provider) {
      case PROVIDERS.OPENAI:
        return await validateOpenAIKey(apiKey);
      case PROVIDERS.ANTHROPIC:
        return await validateAnthropicKey(apiKey);
      case PROVIDERS.GEMINI:
        return await validateGeminiKey(apiKey);
      default:
        return 'INVALID';
    }
  } catch (error) {
    console.error(`Error validating ${provider} key:`, error);
    return 'ERROR';
  }
}

/**
 * Generates a summary using the specified AI provider
 * @param {string} provider - The AI provider to use
 * @param {string} apiKey - The API key
 * @param {string} prompt - The prompt to send
 * @returns {Promise<string|null>} The generated summary or null on error
 */
export async function generateSummary(provider, apiKey, prompt) {
  if (!apiKey || !provider || !prompt) {
    return null;
  }

  try {
    switch (provider) {
      case PROVIDERS.OPENAI:
        return await generateOpenAISummary(apiKey, prompt);
      case PROVIDERS.ANTHROPIC:
        return await generateAnthropicSummary(apiKey, prompt);
      case PROVIDERS.GEMINI:
        return await generateGeminiSummary(apiKey, prompt);
      default:
        console.error('Unknown AI provider:', provider);
        return null;
    }
  } catch (error) {
    console.error(`Error generating summary with ${provider}:`, error);
    return null;
  }
}

// OpenAI Implementation
async function validateOpenAIKey(apiKey) {
  const response = await fetch(ENDPOINTS[PROVIDERS.OPENAI], {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'hello' }],
      max_tokens: 5
    })
  });

  if (response.status === 401) return 'INVALID';
  if (response.status === 429) return 'QUOTA_EXHAUSTED';
  if (response.ok) return 'VALID';
  return 'ERROR';
}

async function generateOpenAISummary(apiKey, prompt) {
  const response = await fetch(ENDPOINTS[PROVIDERS.OPENAI], {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an assistant that extracts product aspects from user reviews and produces ONLY JSON (no markdown). Return raw JSON only.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 1024
    })
  });

  if (!response.ok) {
    console.error('OpenAI API request failed:', response.status, response.statusText);
    return null;
  }

  const data = await response.json();
  if (data.choices && data.choices.length > 0) {
    let content = data.choices[0].message.content.trim();
    
    // Extract JSON from markdown code blocks if present
    const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (jsonMatch) {
      content = jsonMatch[1].trim();
    }
    
    return content;
  }
  
  return null;
}

// Anthropic Implementation
async function validateAnthropicKey(apiKey) {
  const response = await fetch(ENDPOINTS[PROVIDERS.ANTHROPIC], {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307',
      max_tokens: 5,
      messages: [{ role: 'user', content: 'hello' }]
    })
  });

  if (response.status === 401) return 'INVALID';
  if (response.status === 429) return 'QUOTA_EXHAUSTED';
  if (response.ok) return 'VALID';
  return 'ERROR';
}

async function generateAnthropicSummary(apiKey, prompt) {
  const response = await fetch(ENDPOINTS[PROVIDERS.ANTHROPIC], {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `You are an assistant that extracts product aspects from user reviews and produces ONLY JSON (no markdown). Return raw JSON only.\n\n${prompt}`
        }
      ],
      temperature: 0.3
    })
  });

  if (!response.ok) {
    console.error('Anthropic API request failed:', response.status, response.statusText);
    return null;
  }

  const data = await response.json();
  if (data.content && data.content.length > 0) {
    let content = data.content[0].text.trim();
    
    // Extract JSON from markdown code blocks if present
    const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (jsonMatch) {
      content = jsonMatch[1].trim();
    }
    
    return content;
  }
  
  return null;
}

// Gemini Implementation (keeping existing logic)
async function validateGeminiKey(apiKey) {
  const url = `${ENDPOINTS[PROVIDERS.GEMINI]}?key=${apiKey}`;
  const payload = {
    contents: [{ parts: [{ text: 'hello' }] }],
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (response.status === 400) return 'INVALID';
  if (response.status === 429) return 'QUOTA_EXHAUSTED';
  if (response.ok) return 'VALID';
  return 'ERROR';
}

async function generateGeminiSummary(apiKey, prompt) {
  const url = `${ENDPOINTS[PROVIDERS.GEMINI]}?key=${apiKey}`;
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

  return null;
}

export { PROVIDERS };