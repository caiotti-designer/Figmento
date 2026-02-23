import { UIAnalysis, UIElement, AIProvider } from '../types';
import { apiState } from './state';
import { showToast, fetchWithRetry } from './utils';
import { getAnalysisPrompt } from './prompt';
import { updateRateLimits } from './rate-limit';

// ═══════════════════════════════════════════════════════════════
// SSE STREAM PARSER
// ═══════════════════════════════════════════════════════════════

export const readSSEStream = async (response: Response, onEvent: (data: any) => void): Promise<void> => {
  // Fallback: if ReadableStream is not available, read full text
  if (!response.body) {
    const text = await response.text();

    // Try parsing as regular JSON first (non-SSE response)
    try {
      onEvent(JSON.parse(text));
      return;
    } catch (_e) {
      /* Not plain JSON, try SSE format */
    }

    // Parse SSE format from full text
    const events = text.split('\n\n');
    for (const event of events) {
      const lines = event.split('\n');
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (line.indexOf('data: ') === 0) {
          const data = line.substring(6).trim();
          if (data === '[DONE]') continue;
          try {
            onEvent(JSON.parse(data));
          } catch (_e) {
            /* skip */
          }
        }
      }
    }
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const processBuffer = (chunk: string): void => {
    buffer += chunk;
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';

    for (const part of parts) {
      const eventBlock = part.trim();
      if (!eventBlock) continue;
      const lines = eventBlock.split('\n');
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (line.indexOf('data: ') === 0) {
          const data = line.substring(6).trim();
          if (data === '[DONE]') continue;
          try {
            onEvent(JSON.parse(data));
          } catch (_e) {
            /* skip */
          }
        }
      }
    }
  };

  const pump = async (): Promise<void> => {
    const result = await reader.read();
    if (result.done) {
      // Flush remaining buffer
      if (buffer.trim()) {
        processBuffer('\n\n');
      }
      return;
    }
    processBuffer(decoder.decode(result.value, { stream: true }));
    return pump();
  };

  return pump();
};

// ═══════════════════════════════════════════════════════════════
// STREAMING ANALYSIS DISPATCHER
// ═══════════════════════════════════════════════════════════════

export const analyzeImageStreaming = (
  imageBase64: string,
  provider: AIProvider,
  apiKey: string,
  setProgress: (percent: number, message?: string) => void
): Promise<UIAnalysis> => {
  const ESTIMATED_RESPONSE_BYTES = 30000;
  const PROGRESS_START = 10;
  const PROGRESS_END = 58;

  const onProgress = (receivedBytes: number): void => {
    const fraction = Math.min(receivedBytes / ESTIMATED_RESPONSE_BYTES, 1);
    const progress = PROGRESS_START + fraction * (PROGRESS_END - PROGRESS_START);
    const kbReceived = (receivedBytes / 1024).toFixed(1);
    setProgress(progress, 'Analyzing UI layout... (' + kbReceived + 'KB received)');
  };

  if (provider === 'claude') {
    return analyzeWithClaudeStreaming(imageBase64, apiKey, onProgress);
  } else if (provider === 'gemini') {
    return analyzeWithGeminiStreaming(imageBase64, apiKey, onProgress);
  } else {
    return analyzeWithOpenAIStreaming(imageBase64, apiKey, onProgress);
  }
};

// ═══════════════════════════════════════════════════════════════
// CLAUDE STREAMING ANALYSIS
// ═══════════════════════════════════════════════════════════════

export const analyzeWithClaudeStreaming = async (
  imageBase64: string,
  apiKey: string,
  onProgress: (receivedBytes: number) => void
): Promise<UIAnalysis> => {
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const mediaTypeMatch = imageBase64.match(/^data:(image\/\w+);base64,/);
  const mediaType = mediaTypeMatch ? mediaTypeMatch[1] : 'image/png';

  const fetchOptions: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: apiState.claudeModel,
      max_tokens: 32768,
      stream: true,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64Data,
              },
            },
            {
              type: 'text',
              text: getAnalysisPrompt(),
            },
          ],
        },
      ],
    }),
  };

  if (apiState.abortController) {
    fetchOptions.signal = apiState.abortController.signal;
  }

  let fullText = '';
  let receivedBytes = 0;
  let wasTruncated = false;

  const response = await fetchWithRetry('https://api.anthropic.com/v1/messages', fetchOptions, 2, 120000);
  updateRateLimits('claude', response.headers);

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error((errorData.error && errorData.error.message) || 'Claude API error: ' + response.status);
  }

  await readSSEStream(response, (data) => {
    if (data.type === 'content_block_delta' && data.delta && data.delta.text) {
      fullText += data.delta.text;
      receivedBytes += data.delta.text.length;
      onProgress(receivedBytes);
    }
    if (data.type === 'message_delta' && data.delta && data.delta.stop_reason === 'max_tokens') {
      wasTruncated = true;
    }
  });

  if (wasTruncated) {
    showToast('Response was truncated due to token limit — some elements may be missing', 'warning', 6000);
  }
  if (!fullText) {
    throw new Error('No response content from Claude');
  }
  return parseAIResponse(fullText);
};

// ═══════════════════════════════════════════════════════════════
// OPENAI STREAMING ANALYSIS
// ═══════════════════════════════════════════════════════════════

export const analyzeWithOpenAIStreaming = async (
  imageBase64: string,
  apiKey: string,
  onProgress: (receivedBytes: number) => void
): Promise<UIAnalysis> => {
  const fetchOptions: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey,
    },
    body: JSON.stringify({
      model: apiState.openaiModel,
      max_tokens: 32768,
      stream: true,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: imageBase64 },
            },
            {
              type: 'text',
              text: getAnalysisPrompt(),
            },
          ],
        },
      ],
    }),
  };

  if (apiState.abortController) {
    fetchOptions.signal = apiState.abortController.signal;
  }

  let fullText = '';
  let receivedBytes = 0;
  let wasTruncated = false;

  const response = await fetchWithRetry('https://api.openai.com/v1/chat/completions', fetchOptions, 2, 120000);
  updateRateLimits('openai', response.headers);

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error((errorData.error && errorData.error.message) || 'OpenAI API error: ' + response.status);
  }

  await readSSEStream(response, (data) => {
    const content = data.choices && data.choices[0] && data.choices[0].delta && data.choices[0].delta.content;
    if (content) {
      fullText += content;
      receivedBytes += content.length;
      onProgress(receivedBytes);
    }
    if (data.choices && data.choices[0] && data.choices[0].finish_reason === 'length') {
      wasTruncated = true;
    }
  });

  if (wasTruncated) {
    showToast('Response was truncated due to token limit — some elements may be missing', 'warning', 6000);
  }
  if (!fullText) {
    throw new Error('No response content from OpenAI');
  }
  return parseAIResponse(fullText);
};

// ═══════════════════════════════════════════════════════════════
// GEMINI STREAMING ANALYSIS
// ═══════════════════════════════════════════════════════════════

export const analyzeWithGeminiStreaming = async (
  imageBase64: string,
  apiKey: string,
  onProgress: (receivedBytes: number) => void
): Promise<UIAnalysis> => {
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const mediaTypeMatch = imageBase64.match(/^data:(image\/\w+);base64,/);
  const mimeType = mediaTypeMatch ? mediaTypeMatch[1] : 'image/png';

  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/' +
    apiState.geminiModel +
    ':streamGenerateContent?alt=sse';

  const fetchOptions: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Data,
              },
            },
            {
              text: getAnalysisPrompt(),
            },
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens: 65536,
        responseMimeType: 'application/json',
        temperature: 0,
      },
    }),
  };

  if (apiState.abortController) {
    fetchOptions.signal = apiState.abortController.signal;
  }

  let fullText = '';
  let receivedBytes = 0;
  let wasTruncated = false;

  const response = await fetchWithRetry(url, fetchOptions, 2, 120000);
  updateRateLimits('gemini', response.headers);

  if (!response.ok) {
    const errorData = await response.json();
    let errMsg = 'Gemini API error: ' + response.status;
    if (errorData.error && errorData.error.message) {
      errMsg = errorData.error.message;
    }
    throw new Error(errMsg);
  }

  await readSSEStream(response, (data) => {
    const text =
      data &&
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts[0] &&
      data.candidates[0].content.parts[0].text;
    if (text) {
      fullText += text;
      receivedBytes += text.length;
      onProgress(receivedBytes);
    }
    const candidate = data && data.candidates && data.candidates[0];
    if (candidate && candidate.finishReason === 'MAX_TOKENS') {
      wasTruncated = true;
    }
  });

  if (wasTruncated) {
    showToast('Response was truncated due to token limit — some elements may be missing', 'warning', 6000);
  }
  if (!fullText) {
    throw new Error('No response content from Gemini');
  }
  return parseAIResponse(fullText);
};

// ═══════════════════════════════════════════════════════════════
// JSON REPAIR
// ═══════════════════════════════════════════════════════════════

export const attemptJsonRepair = (jsonStr: string): string | null => {
  // Track unmatched brackets/braces in a stack (skipping those inside strings)
  const stack: string[] = [];
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < jsonStr.length; i++) {
    const c = jsonStr[i];
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (c === '\\') {
      escapeNext = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === '{' || c === '[') {
      stack.push(c);
    } else if (c === '}' || c === ']') {
      stack.pop();
    }
  }

  if (stack.length === 0) return null; // Not a truncation issue

  let repaired = jsonStr.trim();

  // If we're in the middle of a string, close it
  if (inString) repaired += '"';

  // Remove trailing comma
  repaired = repaired.replace(/,\s*$/, '');

  // Close open brackets and braces in reverse stack order
  for (let j = stack.length - 1; j >= 0; j--) {
    repaired += stack[j] === '{' ? '}' : ']';
  }

  return repaired;
};

// ═══════════════════════════════════════════════════════════════
// AI RESPONSE PARSING
// ═══════════════════════════════════════════════════════════════

export const parseAIResponse = (content: string): UIAnalysis => {
  let jsonStr = content.trim();

  // Try to extract JSON from markdown code blocks
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  // If no code block, try to find JSON object directly
  if (!jsonMatch) {
    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonStr = content.substring(firstBrace, lastBrace + 1);
    }
  }

  try {
    const analysis = JSON.parse(jsonStr) as UIAnalysis;

    if (typeof analysis.width !== 'number' || typeof analysis.height !== 'number') {
      throw new Error('Invalid dimensions in response');
    }

    if (!Array.isArray(analysis.elements)) {
      analysis.elements = [];
    }

    if (!analysis.backgroundColor) {
      analysis.backgroundColor = '#FFFFFF';
    }

    return validateAndFixAnalysis(analysis);
  } catch (_parseError) {
    // Attempt to repair truncated JSON before giving up
    const repaired = attemptJsonRepair(jsonStr);
    if (repaired) {
      try {
        const repairedAnalysis = JSON.parse(repaired) as UIAnalysis;
        if (typeof repairedAnalysis.width === 'number' && typeof repairedAnalysis.height === 'number') {
          showToast('Response was truncated — some elements may be missing', 'warning', 6000);
          if (!Array.isArray(repairedAnalysis.elements)) repairedAnalysis.elements = [];
          if (!repairedAnalysis.backgroundColor) repairedAnalysis.backgroundColor = '#FFFFFF';
          return validateAndFixAnalysis(repairedAnalysis);
        }
      } catch (_e) {
        /* repair also failed */
      }
    }

    console.error('Failed to parse AI response. Raw content:', content);
    console.error('Attempted to parse:', jsonStr.substring(0, 500));
    throw new Error('Failed to parse AI response as JSON. Please try again.');
  }
};

// ═══════════════════════════════════════════════════════════════
// ANALYSIS VALIDATION
// ═══════════════════════════════════════════════════════════════

export const validateAndFixAnalysis = (analysis: UIAnalysis): UIAnalysis => {
  // Clamp canvas dimensions
  analysis.width = Math.max(1, Math.min(4096, analysis.width));
  analysis.height = Math.max(1, Math.min(4096, analysis.height));

  // Fix backgroundColor format
  if (!analysis.backgroundColor || typeof analysis.backgroundColor !== 'string') {
    analysis.backgroundColor = '#FFFFFF';
  } else if (!analysis.backgroundColor.startsWith('#')) {
    analysis.backgroundColor = '#' + analysis.backgroundColor;
  }

  // Recursively validate elements
  analysis.elements = validateElements(analysis.elements, analysis.width, analysis.height, false);
  return analysis;
};

export const validateElements = (
  elements: UIElement[],
  maxW: number,
  maxH: number,
  parentIsAutoLayout: boolean
): UIElement[] => {
  if (!Array.isArray(elements)) return [];

  return elements.map((el) => {
    // Ensure required fields
    if (!el.id) el.id = 'el_' + Math.random().toString(36).substr(2, 6);
    if (!el.name) el.name = el.type || 'Element';
    if (!el.type) el.type = 'frame';

    // Clamp dimensions
    el.width = Math.max(1, Math.min(maxW, typeof el.width === 'number' ? el.width : 100));
    el.height = Math.max(1, Math.min(maxH, typeof el.height === 'number' ? el.height : 100));

    // Remove x/y from auto-layout children (common AI mistake)
    if (parentIsAutoLayout && (el as any).layoutPositioning !== 'ABSOLUTE') {
      delete el.x;
      delete el.y;
    }

    // Fix hex color format in fills
    if (el.fills && Array.isArray(el.fills)) {
      el.fills = el.fills.map((fill) => {
        if (fill.color && !fill.color.startsWith('#')) {
          fill.color = '#' + fill.color;
        }
        return fill;
      });
    }

    // Remove fills from text elements (color goes in text.color)
    if (el.type === 'text') {
      delete el.fills;
    }

    // Validate text properties
    if (el.text) {
      if (typeof el.text.fontSize !== 'number' || el.text.fontSize < 1) {
        el.text.fontSize = 16;
      }
      el.text.fontSize = Math.min(200, el.text.fontSize);

      if (!el.text.color) el.text.color = '#000000';
      if (!el.text.color.startsWith('#')) el.text.color = '#' + el.text.color;
      if (!el.text.fontFamily) el.text.fontFamily = 'Inter';
      if (!el.text.content) el.text.content = '';
    }

    // Fix stroke color format
    if (el.stroke && el.stroke.color && !el.stroke.color.startsWith('#')) {
      el.stroke.color = '#' + el.stroke.color;
    }

    // Ensure children array exists
    if (!el.children) el.children = [];

    // Determine if this element uses auto-layout
    const isAutoLayout = el.layoutMode === 'HORIZONTAL' || el.layoutMode === 'VERTICAL';

    // Validate children recursively
    el.children = validateElements(el.children, el.width, el.height, isAutoLayout);

    return el;
  });
};

// ═══════════════════════════════════════════════════════════════
// API KEY VALIDATION
// ═══════════════════════════════════════════════════════════════

export const validateGeminiKey = async (apiKey: string): Promise<boolean> => {
  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
      headers: { 'x-goog-api-key': apiKey },
    });
    return response.ok;
  } catch {
    return false;
  }
};

export const validateClaudeKey = async (apiKey: string): Promise<boolean> => {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: apiState.claudeModel,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    });
    return response.status === 200 || response.status === 400;
  } catch {
    return false;
  }
};

export const validateOpenAIKey = async (apiKey: string): Promise<boolean> => {
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        Authorization: 'Bearer ' + apiKey,
      },
    });
    return response.ok;
  } catch {
    return false;
  }
};
