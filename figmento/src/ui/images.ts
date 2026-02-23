import { UIAnalysis, UIElement, HeroGeneratorInput } from '../types';
import { apiState, imageGenState, screenshotState } from './state';

// ═══════════════════════════════════════════════════════════════
// IMAGE GENERATION (GEMINI)
// ═══════════════════════════════════════════════════════════════

export function collectImageElements(elements: UIElement[]): UIElement[] {
  const images: UIElement[] = [];

  const traverse = (els: UIElement[]): void => {
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      if (el.type === 'image') {
        images.push(el);
      }
      if (el.children && el.children.length > 0) {
        traverse(el.children);
      }
    }
  };

  traverse(elements);
  return images;
}

export function generateImageWithGemini(prompt: string, apiKey: string): Promise<string | null> {
  if (imageGenState.imageGenModel === 'gemini-image') {
    return generateWithGeminiImage(prompt, apiKey);
  } else {
    return generateWithImagen4(prompt, apiKey);
  }
}

export async function generateWithImagen4(prompt: string, apiKey: string): Promise<string | null> {
  // Use Imagen 4 Fast model for image generation
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-fast-generate-001:predict';

  const fetchOptions: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      instances: [
        {
          prompt: prompt,
        },
      ],
      parameters: {
        sampleCount: 1,
        aspectRatio: '1:1',
        personGeneration: 'allow_adult',
      },
    }),
  };

  if (apiState.abortController) {
    fetchOptions.signal = apiState.abortController.signal;
  }

  try {
    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      console.warn('Imagen 4 API error, falling back to placeholder');
      return null;
    }

    const data = await response.json();
    if (!data) return null;

    const predictions = data.predictions;
    if (predictions && predictions[0] && predictions[0].bytesBase64Encoded) {
      return 'data:image/png;base64,' + predictions[0].bytesBase64Encoded;
    }
    return null;
  } catch (error: any) {
    if (error.name !== 'AbortError') {
      console.warn('Image generation failed:', error);
    }
    return null;
  }
}

export async function generateWithGeminiImage(prompt: string, apiKey: string): Promise<string | null> {
  // Use Gemini 3 Pro Image Preview for image generation
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent';

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
              text: 'Generate an image: ' + prompt,
            },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    }),
  };

  if (apiState.abortController) {
    fetchOptions.signal = apiState.abortController.signal;
  }

  try {
    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      console.warn('Gemini Image API error, falling back to placeholder');
      return null;
    }

    const data = await response.json();
    if (!data) return null;

    // Parse Gemini response for image data
    const candidates = data.candidates;
    if (candidates && candidates[0] && candidates[0].content && candidates[0].content.parts) {
      const parts = candidates[0].content.parts;
      for (let i = 0; i < parts.length; i++) {
        if (parts[i].inlineData && parts[i].inlineData.data) {
          const mimeType = parts[i].inlineData.mimeType || 'image/png';
          return 'data:' + mimeType + ';base64,' + parts[i].inlineData.data;
        }
      }
    }
    return null;
  } catch (error: any) {
    if (error.name !== 'AbortError') {
      console.warn('Gemini image generation failed:', error);
    }
    return null;
  }
}

export async function generateImagesForPlaceholders(
  analysis: UIAnalysis,
  _apiKey: string,
  progressCallback: (percent: number, message: string) => void
): Promise<UIAnalysis> {
  // Image generation requires a Gemini API key but works with any layout analysis provider
  const geminiKey = apiState.savedApiKeys['gemini'];
  if (!imageGenState.enableImageGeneration || !geminiKey) {
    return analysis;
  }

  const imageElements = collectImageElements(analysis.elements);
  if (imageElements.length === 0) {
    return analysis;
  }

  // Limit to first 4 images to avoid long processing times
  const elementsToGenerate = imageElements.slice(0, 4);
  const totalImages = elementsToGenerate.length;
  let completedImages = 0;

  progressCallback(75, 'Generating images (0/' + totalImages + ')...');

  // Generate images in parallel with concurrency limit of 2
  const CONCURRENCY = 2;
  for (let batchStart = 0; batchStart < elementsToGenerate.length; batchStart += CONCURRENCY) {
    if (!screenshotState.isProcessing) break;

    const batch = elementsToGenerate.slice(batchStart, batchStart + CONCURRENCY);
    const batchPromises = batch.map(async (el) => {
      if (!screenshotState.isProcessing) return;

      const description = el.imageDescription || el.name || 'placeholder image';
      const prompt =
        'Generate an image for a design mockup. ' +
        'This is a ' +
        (el.name || 'image') +
        ' element (' +
        el.width +
        'x' +
        el.height +
        'px). ' +
        'Description: ' +
        description +
        '. ' +
        'Style: Clean, professional, high-resolution. Match the exact composition described. ' +
        'Do NOT add any text, watermarks, or labels to the image.';

      const imageData = await generateImageWithGemini(prompt, geminiKey);
      if (imageData) {
        (el as UIElement & { generatedImage: string }).generatedImage = imageData;
      }

      completedImages++;
      const imageProgress = 75 + (completedImages / totalImages) * 20;
      progressCallback(imageProgress, 'Generating images (' + completedImages + '/' + totalImages + ')...');
    });

    await Promise.all(batchPromises);
  }

  return analysis;
}

// ═══════════════════════════════════════════════════════════════
// HERO IMAGE GENERATION (GEMINI 3 PRO IMAGE PREVIEW)
// ═══════════════════════════════════════════════════════════════

/**
 * Generates a hero image using Nano Banana Pro (Gemini 3 Pro Image Preview).
 * Accepts multiple reference images (subjects, style, branding) and a scene prompt.
 */
export async function generateHeroImage(
  input: HeroGeneratorInput,
  apiKey: string,
  abortSignal?: AbortSignal
): Promise<string | null> {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent';

  // Build parts array with role-labeled images and prompt
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

  // Add subject images
  for (let i = 0; i < input.subjects.length; i++) {
    parts.push({ text: 'Subject/persona image ' + (i + 1) + ':' });
    parts.push({
      inlineData: {
        mimeType: 'image/png',
        data: input.subjects[i].replace(/^data:image\/\w+;base64,/, ''),
      },
    });
  }

  // Add style reference if provided
  if (input.styleRef) {
    parts.push({
      text: 'Style reference image (use this as visual style reference only — ignore any text, logos, or branding in this image):',
    });
    parts.push({
      inlineData: {
        mimeType: 'image/png',
        data: input.styleRef.replace(/^data:image\/\w+;base64,/, ''),
      },
    });
  }

  // Add branding elements
  for (let i = 0; i < input.elements.length; i++) {
    parts.push({
      text: 'Branding/logo element ' + (i + 1) + ' (composite this naturally into the scene):',
    });
    parts.push({
      inlineData: {
        mimeType: 'image/png',
        data: input.elements[i].replace(/^data:image\/\w+;base64,/, ''),
      },
    });
  }

  // Build the master prompt
  const positionInstruction =
    input.position === 'left'
      ? 'Position the main subject on the LEFT third of the frame, leaving the right side open for text or content.'
      : input.position === 'right'
        ? 'Position the main subject on the RIGHT third of the frame, leaving the left side open for text or content.'
        : 'Position the main subject in the CENTER of the frame.';

  const aspectRatio = input.format.width + 'x' + input.format.height;
  const hasSubjects = input.subjects.length > 0;
  const hasElements = input.elements.length > 0;

  let masterPrompt =
    'Generate a high-quality hero background image at ' +
    aspectRatio +
    ' resolution. ' +
    positionInstruction +
    ' ';

  if (hasSubjects) {
    masterPrompt +=
      'Incorporate the provided subject/persona naturally into the scene with professional lighting and composition. ';
  }

  if (hasElements) {
    masterPrompt +=
      'Subtly composite the provided branding elements into the scene in a natural, non-intrusive way. ';
  }

  masterPrompt +=
    'Scene description: ' +
    input.scenePrompt +
    '. ' +
    'Create a photorealistic, visually stunning hero image suitable for professional web/marketing use. ' +
    'Ensure the composition has clear visual hierarchy with space for overlay text. ' +
    'Use dramatic lighting, rich colors, and professional photography quality.';

  parts.push({ text: masterPrompt });

  const fetchOptions: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: parts }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    }),
  };

  if (abortSignal) {
    fetchOptions.signal = abortSignal;
  }

  try {
    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      const errorData = await response.json().catch(function () {
        return null;
      });
      console.warn('Hero generation API error:', response.status, errorData);
      return null;
    }

    const data = await response.json();
    if (!data) return null;

    // Parse Gemini response for image data
    const candidates = data.candidates;
    if (candidates && candidates[0] && candidates[0].content && candidates[0].content.parts) {
      const responseParts = candidates[0].content.parts;
      for (let i = 0; i < responseParts.length; i++) {
        if (responseParts[i].inlineData && responseParts[i].inlineData.data) {
          const mimeType = responseParts[i].inlineData.mimeType || 'image/png';
          return 'data:' + mimeType + ';base64,' + responseParts[i].inlineData.data;
        }
      }
    }
    return null;
  } catch (error: any) {
    if (error.name !== 'AbortError') {
      console.warn('Hero image generation failed:', error);
    }
    return null;
  }
}
