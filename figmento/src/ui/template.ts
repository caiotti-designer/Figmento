import { TemplateScanResult, ImageSlotReference, TemplateTextResponse } from '../types';
import { apiState, templateState, imageGenState } from './state';
import { postMessage, showToast, fetchWithRetry, escapeHtml } from './utils';
import { generateWithGeminiImage } from './images';

// ═══════════════════════════════════════════════════════════════
// TEMPLATE FILL FUNCTIONALITY
// ═══════════════════════════════════════════════════════════════

/**
 * Initialize template fill UI: scan, apply, reset, image buttons and listeners.
 */
export function initTemplateFillUI(): void {
  const scanTemplateBtn = document.getElementById('scanTemplateBtn') as HTMLButtonElement;
  const applyTextBtn = document.getElementById('applyTextBtn') as HTMLButtonElement;
  const generateAllImagesBtn = document.getElementById('generateAllImagesBtn') as HTMLButtonElement;
  const templateCancelBtn = document.getElementById('templateCancelBtn') as HTMLButtonElement;
  const templateNewBtn = document.getElementById('templateNewBtn') as HTMLButtonElement;

  if (scanTemplateBtn) {
    scanTemplateBtn.onclick = () => {
      scanTemplateBtn.disabled = true;
      scanTemplateBtn.textContent = 'Scanning...';
      postMessage({ type: 'scan-template' });
    };
  }

  if (applyTextBtn) {
    applyTextBtn.onclick = () => {
      handleApplyText();
    };
  }

  if (generateAllImagesBtn) {
    generateAllImagesBtn.onclick = () => {
      handleGenerateAllImages();
    };
  }

  if (templateCancelBtn) {
    templateCancelBtn.onclick = () => {
      cancelTemplateProcessing();
    };
  }

  if (templateNewBtn) {
    templateNewBtn.onclick = () => {
      resetTemplateFill();
      // Re-show scan section
      const templateFillFlow = document.getElementById('templateFillFlow');
      if (templateFillFlow) {
        templateFillFlow.querySelectorAll('.template-section').forEach((s) => {
          s.classList.add('hidden');
        });
        const scanSection = document.getElementById('templateScanSection');
        if (scanSection) scanSection.classList.remove('hidden');
      }
    };
  }

  // Style chip toggle handlers
  document.querySelectorAll('.style-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const wasActive = chip.classList.contains('active');
      document.querySelectorAll('.style-chip').forEach((c) => {
        c.classList.remove('active');
      });
      if (!wasActive) {
        chip.classList.add('active');
        templateState.imageStyle = (chip as HTMLElement).getAttribute('data-style') || '';
      } else {
        templateState.imageStyle = '';
      }
    });
  });
}

/**
 * Process template scan results from the Figma sandbox and build the UI.
 */
export function handleTemplateScanResult(result: TemplateScanResult, error?: string): void {
  const scanTemplateBtn = document.getElementById('scanTemplateBtn') as HTMLButtonElement;
  if (scanTemplateBtn) {
    scanTemplateBtn.disabled = false;
    scanTemplateBtn.textContent = 'Scan Selected Frames';
  }

  if (error) {
    showToast(error, 'error');
    return;
  }

  if (result.slideCount === 0) {
    showToast('No frames with #-prefixed layers found. Name layers like #h1, #p1, #cta1, #img1.', 'warning');
    return;
  }

  templateState.scanResult = result;

  // Show result info
  const scanResultInfo = document.getElementById('scanResultInfo');
  if (scanResultInfo) scanResultInfo.classList.remove('hidden');

  const slideCountBadge = document.getElementById('slideCountBadge');
  if (slideCountBadge) slideCountBadge.textContent = result.slideCount + ' slide' + (result.slideCount > 1 ? 's' : '');

  const slotTypesBadge = document.getElementById('slotTypesBadge');
  if (slotTypesBadge) slotTypesBadge.textContent = result.textSlots.concat(result.imageSlots).join(', ');

  // Build detail list
  const scanDetailList = document.getElementById('scanDetailList');
  if (scanDetailList) {
    let detailHtml = '';
    for (let i = 0; i < result.slides.length; i++) {
      const slide = result.slides[i];
      const slotNames = slide.placeholders.map((p) => p.name).join(', ');
      detailHtml += '<div class="scan-detail-item">Slide ' + (i + 1) + ': ' + escapeHtml(slotNames) + '</div>';
    }
    scanDetailList.innerHTML = detailHtml;
  }

  // Show text section
  const templateTextSection = document.getElementById('templateTextSection');
  if (templateTextSection) templateTextSection.classList.remove('hidden');

  // Show image section if image slots exist
  if (result.imageSlots.length > 0) {
    buildImageSlotsList(result);
  }
}

/**
 * Apply text distribution with AI. Reads content from the textarea,
 * validates API key, then calls AI to distribute content across slides.
 */
export async function handleApplyText(): Promise<void> {
  if (!templateState.scanResult) return;

  const templateContentInput = document.getElementById('templateContentInput') as HTMLTextAreaElement;
  const content = templateContentInput ? templateContentInput.value.trim() : '';
  if (!content) {
    showToast('Please paste your content text', 'warning');
    return;
  }

  const apiKey = apiState.savedApiKeys[apiState.currentProvider];
  if (!apiKey) {
    showToast('Please configure your API key in Settings', 'warning');
    return;
  }

  showTemplateProcessing('Distributing content across slides...');
  templateState.abortController = new AbortController();

  try {
    const aiResponse = await distributeContentWithAI(templateState.scanResult, content, apiKey);
    setTemplateProgress(70, 'Applying text to Figma layers...');

    // Update image slots context with the NEW content (not the old scanned text)
    for (let i = 0; i < templateState.imageSlots.length; i++) {
      const slot = templateState.imageSlots[i];
      const slideContent = aiResponse.slides[slot.slideIndex];
      if (slideContent) {
        const texts: string[] = [];
        for (const key in slideContent) {
          if (slideContent.hasOwnProperty(key)) {
            texts.push(slideContent[key]);
          }
        }
        slot.contextText = texts.join(' | ');
      }
    }

    postMessage({
      type: 'apply-template-text',
      data: {
        slides: templateState.scanResult!.slides,
        content: aiResponse,
      },
    });
  } catch (error: any) {
    if (error.name === 'AbortError') return;
    hideTemplateProcessing();
    showToast('Error: ' + (error.message || 'Unknown error'), 'error');
  }
}

/**
 * Handle the result of applying template text from the Figma sandbox.
 */
export function handleTemplateApplyResult(success: boolean, slidesUpdated: number, errors?: string[]): void {
  hideTemplateProcessing();

  if (success) {
    const templateSuccess = document.getElementById('templateSuccess');
    const templateSuccessDetail = document.getElementById('templateSuccessDetail');
    const templateScanSection = document.getElementById('templateScanSection');
    const templateTextSection = document.getElementById('templateTextSection');

    if (templateSuccessDetail) {
      templateSuccessDetail.textContent =
        slidesUpdated + ' slide' + (slidesUpdated > 1 ? 's' : '') + ' updated successfully.';
      if (errors && errors.length > 0) {
        templateSuccessDetail.textContent += ' (' + errors.length + ' warning' + (errors.length > 1 ? 's' : '') + ')';
      }
    }

    // Hide other sections, show success
    if (templateScanSection) templateScanSection.classList.add('hidden');
    if (templateTextSection) templateTextSection.classList.add('hidden');
    if (templateSuccess) templateSuccess.classList.remove('hidden');

    // Keep image section visible if it has slots
    if (templateState.scanResult && templateState.scanResult.imageSlots.length > 0) {
      const templateImageSection = document.getElementById('templateImageSection');
      if (templateImageSection) templateImageSection.classList.remove('hidden');
    }
  } else {
    const errorMsg = errors && errors.length > 0 ? errors[0] : 'Unknown error';
    showToast('Failed to apply text: ' + errorMsg, 'error');
  }
}

/**
 * Route content distribution to the appropriate AI provider.
 */
export function distributeContentWithAI(
  scanResult: TemplateScanResult,
  fullText: string,
  apiKey: string
): Promise<TemplateTextResponse> {
  const prompt = buildTemplateTextPrompt(scanResult, fullText);

  if (apiState.currentProvider === 'claude') {
    return callClaudeForTemplateText(prompt, apiKey);
  } else if (apiState.currentProvider === 'gemini') {
    return callGeminiForTemplateText(prompt, apiKey);
  } else {
    return callOpenAIForTemplateText(prompt, apiKey);
  }
}

/**
 * Build the AI prompt for distributing content across template placeholders.
 */
export function buildTemplateTextPrompt(scanResult: TemplateScanResult, fullText: string): string {
  let slideStructure = '';
  for (let i = 0; i < scanResult.slides.length; i++) {
    const textSlots = scanResult.slides[i].placeholders.filter((p) => p.slotCategory === 'text').map((p) => p.slotType);
    slideStructure += '  Slide ' + (i + 1) + ': [' + textSlots.join(', ') + ']\n';
  }

  return [
    'You are a content distribution engine for social media carousels and multi-slide templates.',
    '',
    '# TASK',
    'Distribute the provided copy text across the template slides, matching content to the appropriate slot types.',
    '',
    '# TEMPLATE STRUCTURE',
    'Total slides: ' + scanResult.slideCount,
    'Slots per slide:',
    slideStructure,
    '',
    '# SLOT TYPE DEFINITIONS',
    '- h1, h2: Headlines (short, impactful, attention-grabbing)',
    '- p1, p2: Paragraph/body text (longer explanatory content)',
    '- text1, text2: Generic text (medium length, versatile)',
    '- cta1, cta2: Call-to-action text (short, action-oriented, e.g. "Learn More", "Get Started")',
    '- tag1, tag2: Tags/labels (very short, 1-3 words, e.g. "NEW", "STEP 1")',
    '- caption1: Captions (short descriptive text)',
    '',
    '# RULES',
    '1. Distribute ALL the provided content across the slides logically',
    '2. Headlines (h1/h2) should be concise, max 6-8 words',
    '3. CTAs should be action verbs, max 3-4 words',
    '4. Tags should be 1-3 words maximum',
    '5. Body/paragraph text can be longer but should fit the slide context',
    '6. Content should flow naturally from slide to slide (narrative progression)',
    '7. If the copy has clear sections/paragraphs, use them as natural slide breaks',
    '8. Each slide should be self-contained yet part of the overall story',
    '',
    '# OUTPUT FORMAT',
    'Return ONLY valid JSON, no markdown, no explanation:',
    '{',
    '  "slides": [',
    '    { "h1": "...", "p1": "...", "cta1": "..." },',
    '    { "h1": "...", "p1": "...", "cta1": "..." }',
    '  ]',
    '}',
    '',
    'The "slides" array must have exactly ' + scanResult.slideCount + ' entries.',
    'Each slide object must contain keys matching the slot types listed for that slide.',
    '',
    '# USER CONTENT TO DISTRIBUTE:',
    '---',
    fullText,
    '---',
  ].join('\n');
}

/**
 * Call Claude API for template text distribution.
 */
export async function callClaudeForTemplateText(prompt: string, apiKey: string): Promise<TemplateTextResponse> {
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
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  };

  if (templateState.abortController) {
    fetchOptions.signal = templateState.abortController.signal;
  }

  const response = await fetchWithRetry('https://api.anthropic.com/v1/messages', fetchOptions);
  if (!response.ok) {
    const errorData: any = await response.json();
    throw new Error((errorData.error && errorData.error.message) || 'Claude API error: ' + response.status);
  }
  const data: any = await response.json();
  const text = data.content[0].text;
  return parseTemplateTextResponse(text);
}

/**
 * Call Gemini API for template text distribution.
 */
export async function callGeminiForTemplateText(prompt: string, apiKey: string): Promise<TemplateTextResponse> {
  const model = imageGenState.geminiModel || 'gemini-3.1-pro-preview';
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent';

  const fetchOptions: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096,
      },
    }),
  };

  if (templateState.abortController) {
    fetchOptions.signal = templateState.abortController.signal;
  }

  const response = await fetchWithRetry(url, fetchOptions);
  if (!response.ok) {
    const errorData: any = await response.json();
    throw new Error((errorData.error && errorData.error.message) || 'Gemini API error: ' + response.status);
  }
  const data: any = await response.json();
  const text = data.candidates[0].content.parts[0].text;
  return parseTemplateTextResponse(text);
}

/**
 * Call OpenAI API for template text distribution.
 */
export async function callOpenAIForTemplateText(prompt: string, apiKey: string): Promise<TemplateTextResponse> {
  const fetchOptions: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey,
    },
    body: JSON.stringify({
      model: apiState.openaiModel,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: 4096,
      temperature: 0.7,
    }),
  };

  if (templateState.abortController) {
    fetchOptions.signal = templateState.abortController.signal;
  }

  const response = await fetchWithRetry('https://api.openai.com/v1/chat/completions', fetchOptions);
  if (!response.ok) {
    const errorData: any = await response.json();
    throw new Error((errorData.error && errorData.error.message) || 'OpenAI API error: ' + response.status);
  }
  const data: any = await response.json();
  const text = data.choices[0].message.content;
  return parseTemplateTextResponse(text);
}

/**
 * Parse the JSON response from any AI provider into a TemplateTextResponse.
 */
export function parseTemplateTextResponse(text: string): TemplateTextResponse {
  // Try to extract JSON from the response (handle markdown wrapping)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found in AI response');

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.slides || !Array.isArray(parsed.slides)) {
      throw new Error('Invalid response format: missing slides array');
    }
    return parsed as TemplateTextResponse;
  } catch (e) {
    throw new Error('Failed to parse AI response as JSON: ' + (e instanceof Error ? e.message : 'Unknown error'));
  }
}

/**
 * Build the UI list for image slot management from the scan result.
 */
export function buildImageSlotsList(scanResult: TemplateScanResult): void {
  const templateImageSection = document.getElementById('templateImageSection');
  const imageSlotsList = document.getElementById('imageSlotsList');
  if (!templateImageSection || !imageSlotsList) return;

  templateImageSection.classList.remove('hidden');
  imageSlotsList.innerHTML = '';
  templateState.imageSlots = [];

  for (let i = 0; i < scanResult.slides.length; i++) {
    const slide = scanResult.slides[i];
    for (let j = 0; j < slide.placeholders.length; j++) {
      const placeholder = slide.placeholders[j];
      if (placeholder.slotCategory !== 'image') continue;

      const ref: ImageSlotReference = {
        slideIndex: i,
        slotType: placeholder.slotType,
        nodeId: placeholder.nodeId,
        width: placeholder.width,
        height: placeholder.height,
        contextText: getSlideContextText(scanResult, i),
      };
      templateState.imageSlots.push(ref);

      const slotIdx = templateState.imageSlots.length - 1;
      const item = document.createElement('div');
      item.className = 'image-slot-item';
      item.innerHTML =
        '<div class="image-slot-label">Slide ' +
        (i + 1) +
        ' - #' +
        escapeHtml(placeholder.slotType) +
        '</div>' +
        '<img class="image-slot-preview" id="slotPreview_' +
        slotIdx +
        '" />' +
        '<button class="btn-upload-small" data-slot="' +
        slotIdx +
        '">Upload</button>';

      imageSlotsList.appendChild(item);
    }
  }

  // Bind upload buttons
  imageSlotsList.querySelectorAll('.btn-upload-small').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt((btn as HTMLElement).getAttribute('data-slot') || '0');
      triggerImageUploadForSlot(idx);
    });
  });
}

/**
 * Extract the text context from a slide's text placeholders.
 */
export function getSlideContextText(scanResult: TemplateScanResult, slideIndex: number): string {
  const texts: string[] = [];
  const slide = scanResult.slides[slideIndex];
  for (let i = 0; i < slide.placeholders.length; i++) {
    if (slide.placeholders[i].slotCategory === 'text' && slide.placeholders[i].currentContent) {
      texts.push(slide.placeholders[i].currentContent!);
    }
  }
  return texts.join(' | ');
}

/**
 * Handle manual image upload for a specific image slot.
 */
export function triggerImageUploadForSlot(slotIndex: number): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = () => {
    if (input.files && input.files[0]) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target?.result as string;
        if (!base64) return;

        templateState.imageSlots[slotIndex].imageData = base64;

        // Update preview
        const preview = document.getElementById('slotPreview_' + slotIndex) as HTMLImageElement;
        if (preview) {
          preview.src = base64;
          preview.classList.add('has-image');
        }

        // Apply to Figma
        postMessage({
          type: 'apply-template-image',
          data: {
            nodeId: templateState.imageSlots[slotIndex].nodeId,
            imageData: base64,
            width: templateState.imageSlots[slotIndex].width,
            height: templateState.imageSlots[slotIndex].height,
          },
        });
      };
      reader.readAsDataURL(input.files[0]);
    }
  };
  input.click();
}

/**
 * Generate all missing images for template image slots using AI.
 */
export async function handleGenerateAllImages(): Promise<void> {
  const apiKey = apiState.savedApiKeys[apiState.currentProvider];
  if (!apiKey) {
    showToast('Please configure your API key in Settings', 'warning');
    return;
  }

  if (apiState.currentProvider === 'claude') {
    showToast('Image generation not supported with Claude. Switch to Gemini or OpenAI.', 'warning');
    return;
  }

  const slotsToGenerate = templateState.imageSlots.filter((slot) => !slot.imageData);

  if (slotsToGenerate.length === 0) {
    showToast('All image slots already have images', 'warning');
    return;
  }

  showTemplateProcessing('Generating images (' + slotsToGenerate.length + ' slots)...');
  templateState.abortController = new AbortController();

  // Build style string from chip selection + custom input
  const styleInput = document.getElementById('imageStyleInput') as HTMLInputElement;
  const customStyle = styleInput ? styleInput.value.trim() : '';
  const fullStyle = [templateState.imageStyle, customStyle].filter(Boolean).join(', ') || 'modern, professional, clean';
  const noTextToggle = document.getElementById('imageNoTextToggle') as HTMLInputElement;
  const noTextInImage = noTextToggle ? noTextToggle.checked : true;

  let completed = 0;

  try {
    for (let idx = 0; idx < slotsToGenerate.length; idx++) {
      if (!templateState.abortController) break;

      const slot = slotsToGenerate[idx];

      setTemplateProgress(
        10 + (idx / slotsToGenerate.length) * 80,
        'Generating image ' + (idx + 1) + ' of ' + slotsToGenerate.length + '...'
      );

      const imgPrompt =
        'Create a visually appealing image for a social media slide.' +
        ' Style: ' +
        fullStyle +
        '.' +
        ' Content context: ' +
        (slot.contextText || 'modern abstract background') +
        '. Aspect ratio approximately ' +
        Math.round((slot.width / slot.height) * 100) / 100 +
        ':1.' +
        (noTextInImage
          ? ' IMPORTANT: Do NOT include any text, words, letters, or typography in the image. Pure visual content only.'
          : '');

      let imageBase64: string | null;
      if (apiState.currentProvider === 'openai') {
        imageBase64 = await generateWithOpenAIImage(imgPrompt, apiKey);
      } else {
        imageBase64 = await generateWithGeminiImage(imgPrompt, apiKey);
      }

      if (imageBase64) {
        slot.imageData = imageBase64;
        postMessage({
          type: 'apply-template-image',
          data: {
            nodeId: slot.nodeId,
            imageData: imageBase64,
            width: slot.width,
            height: slot.height,
          },
        });
        // Update preview
        const slotIdx = templateState.imageSlots.indexOf(slot);
        const preview = document.getElementById('slotPreview_' + slotIdx) as HTMLImageElement;
        if (preview) {
          preview.src = imageBase64;
          preview.classList.add('has-image');
        }
      }
      completed++;
    }

    hideTemplateProcessing();
    showToast(completed + ' image' + (completed > 1 ? 's' : '') + ' generated!', 'success');
  } catch (error: any) {
    hideTemplateProcessing();
    if (error.name !== 'AbortError') {
      showToast('Image generation error: ' + (error.message || 'Unknown error'), 'error');
    }
  }
}

/**
 * Generate an image using OpenAI's image generation API.
 */
async function generateWithOpenAIImage(prompt: string, apiKey: string): Promise<string | null> {
  const fetchOptions: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey,
    },
    body: JSON.stringify({
      model: 'gpt-image-1.5',
      prompt: prompt,
      n: 1,
      size: '1024x1024',
      response_format: 'b64_json',
    }),
  };

  if (templateState.abortController) {
    fetchOptions.signal = templateState.abortController.signal;
  }

  try {
    const response = await fetch('https://api.openai.com/v1/images/generations', fetchOptions);
    if (!response.ok) {
      console.warn('OpenAI Image API error, falling back to placeholder');
      return null;
    }
    const data: any = await response.json();
    if (!data) return null;
    if (data.data && data.data[0] && data.data[0].b64_json) {
      return 'data:image/png;base64,' + data.data[0].b64_json;
    }
    return null;
  } catch (error: any) {
    if (error.name !== 'AbortError') {
      console.warn('OpenAI image generation failed:', error);
    }
    return null;
  }
}

/**
 * Show the template processing UI overlay with a message.
 */
export function showTemplateProcessing(message: string): void {
  const processing = document.getElementById('templateProcessing');
  const status = document.getElementById('templateProcessingStatus');
  const progressBar = document.getElementById('templateProgressBar');
  if (processing) processing.classList.remove('hidden');
  if (status) status.textContent = message;
  if (progressBar) progressBar.style.width = '5%';

  // Hide other sections while processing
  const scanSection = document.getElementById('templateScanSection');
  const textSection = document.getElementById('templateTextSection');
  const imageSection = document.getElementById('templateImageSection');
  if (scanSection) scanSection.classList.add('hidden');
  if (textSection) textSection.classList.add('hidden');
  if (imageSection) imageSection.classList.add('hidden');
}

/**
 * Hide the template processing UI overlay.
 */
export function hideTemplateProcessing(): void {
  const processing = document.getElementById('templateProcessing');
  if (processing) processing.classList.add('hidden');
}

/**
 * Update the template processing progress bar and status message.
 */
export function setTemplateProgress(percent: number, message?: string): void {
  const progressBar = document.getElementById('templateProgressBar');
  const status = document.getElementById('templateProcessingStatus');
  if (progressBar) progressBar.style.width = percent + '%';
  if (message && status) status.textContent = message;
}

/**
 * Cancel the current template processing operation.
 */
export function cancelTemplateProcessing(): void {
  if (templateState.abortController) {
    templateState.abortController.abort();
    templateState.abortController = null;
  }
  hideTemplateProcessing();

  // Re-show sections
  const scanSection = document.getElementById('templateScanSection');
  const textSection = document.getElementById('templateTextSection');
  if (scanSection) scanSection.classList.remove('hidden');
  if (textSection && templateState.scanResult) textSection.classList.remove('hidden');
}

/**
 * Reset all template fill state and UI back to initial scan view.
 */
export function resetTemplateFill(): void {
  templateState.scanResult = null;
  templateState.imageSlots = [];
  templateState.abortController = null;

  const scanResultInfo = document.getElementById('scanResultInfo');
  const templateTextSection = document.getElementById('templateTextSection');
  const templateImageSection = document.getElementById('templateImageSection');
  const templateProcessing = document.getElementById('templateProcessing');
  const templateSuccess = document.getElementById('templateSuccess');
  const templateScanSection = document.getElementById('templateScanSection');
  const templateContentInput = document.getElementById('templateContentInput') as HTMLTextAreaElement;
  const imageSlotsList = document.getElementById('imageSlotsList');

  if (scanResultInfo) scanResultInfo.classList.add('hidden');
  if (templateTextSection) templateTextSection.classList.add('hidden');
  if (templateImageSection) templateImageSection.classList.add('hidden');
  if (templateProcessing) templateProcessing.classList.add('hidden');
  if (templateSuccess) templateSuccess.classList.add('hidden');
  if (templateScanSection) templateScanSection.classList.remove('hidden');
  if (templateContentInput) templateContentInput.value = '';
  if (imageSlotsList) imageSlotsList.innerHTML = '';

  // Reset image style
  templateState.imageStyle = '';
  document.querySelectorAll('.style-chip').forEach((c) => {
    c.classList.remove('active');
  });
  const styleInput = document.getElementById('imageStyleInput') as HTMLInputElement;
  if (styleInput) styleInput.value = '';
}
