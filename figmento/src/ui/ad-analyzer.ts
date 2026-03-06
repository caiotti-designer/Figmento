/**
 * Ad Analyzer Mode — Upload ad, fill brief, copy prompt for Claude Code.
 * Watches Bridge traffic for progress, receives completion report.
 */

import { adAnalyzerState } from './state';
import { getBridgeChannelId, getBridgeConnected } from './bridge';
import { showToast, postMessage } from './utils';

// ═══════════════════════════════════════════════════════════════
// DOM REFS
// ═══════════════════════════════════════════════════════════════

let dropZone: HTMLDivElement;
let dropHint: HTMLDivElement;
let previewEl: HTMLDivElement;
let previewImage: HTMLImageElement;
let previewDims: HTMLDivElement;
let changeBtn: HTMLButtonElement;
let fileInput: HTMLInputElement;

let productNameInput: HTMLInputElement;
let productCategoryInput: HTMLInputElement;
let platformSelect: HTMLSelectElement;
let notesInput: HTMLTextAreaElement;

let bridgeConnectedEl: HTMLDivElement;
let bridgeDisconnectedEl: HTMLDivElement;
let channelIdEl: HTMLElement;
let goToBridgeBtn: HTMLButtonElement;

let copyBriefBtn: HTMLButtonElement;

let uploadPanel: HTMLDivElement;
let briefForm: HTMLDivElement;
let launchSection: HTMLDivElement;
let statusPanel: HTMLDivElement;
let activityLog: HTMLDivElement;
let inactivityHint: HTMLDivElement;
let reportPanel: HTMLDivElement;
let reportContent: HTMLDivElement;
let viewInFigmaBtn: HTMLButtonElement;
let runAgainBtn: HTMLButtonElement;

let bridgePollInterval: number | null = null;
let inactivityTimeout: number | null = null;

const MAX_BASE64_SIZE = 5_000_000; // chars
const MAX_IMAGE_DIM = 2048;
const INACTIVITY_TIMEOUT_MS = 60_000;

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════

export function initAdAnalyzer(): void {
  dropZone = document.getElementById('aaDropZone') as HTMLDivElement;
  dropHint = document.getElementById('aaDropHint') as HTMLDivElement;
  previewEl = document.getElementById('aaPreview') as HTMLDivElement;
  previewImage = document.getElementById('aaPreviewImage') as HTMLImageElement;
  previewDims = document.getElementById('aaPreviewDims') as HTMLDivElement;
  changeBtn = document.getElementById('aaChangeBtn') as HTMLButtonElement;
  fileInput = document.getElementById('aaFileInput') as HTMLInputElement;

  productNameInput = document.getElementById('aaProductName') as HTMLInputElement;
  productCategoryInput = document.getElementById('aaProductCategory') as HTMLInputElement;
  platformSelect = document.getElementById('aaPlatform') as HTMLSelectElement;
  notesInput = document.getElementById('aaNotes') as HTMLTextAreaElement;

  bridgeConnectedEl = document.getElementById('aaBridgeConnected') as HTMLDivElement;
  bridgeDisconnectedEl = document.getElementById('aaBridgeDisconnected') as HTMLDivElement;
  channelIdEl = document.getElementById('aaChannelId') as HTMLElement;
  goToBridgeBtn = document.getElementById('aaGoToBridge') as HTMLButtonElement;

  copyBriefBtn = document.getElementById('aaCopyBriefBtn') as HTMLButtonElement;

  uploadPanel = document.getElementById('aaUploadPanel') as HTMLDivElement;
  briefForm = document.getElementById('aaBriefForm') as HTMLDivElement;
  launchSection = document.getElementById('aaLaunchSection') as HTMLDivElement;
  statusPanel = document.getElementById('aaStatusPanel') as HTMLDivElement;
  activityLog = document.getElementById('aaActivityLog') as HTMLDivElement;
  inactivityHint = document.getElementById('aaInactivityHint') as HTMLDivElement;
  reportPanel = document.getElementById('aaReportPanel') as HTMLDivElement;
  reportContent = document.getElementById('aaReportContent') as HTMLDivElement;
  viewInFigmaBtn = document.getElementById('aaViewInFigmaBtn') as HTMLButtonElement;
  runAgainBtn = document.getElementById('aaRunAgainBtn') as HTMLButtonElement;

  setupListeners();
  startBridgePoll();
}

// ═══════════════════════════════════════════════════════════════
// LISTENERS
// ═══════════════════════════════════════════════════════════════

function setupListeners(): void {
  // Upload — drag-drop
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const files = e.dataTransfer?.files;
    if (files && files[0]) handleFile(files[0]);
  });
  dropZone.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.aa-change-btn')) return;
    if (adAnalyzerState.imageBase64) return;
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files[0]) handleFile(fileInput.files[0]);
    fileInput.value = '';
  });

  changeBtn.addEventListener('click', () => {
    fileInput.click();
  });

  // Brief form inputs
  productNameInput.addEventListener('input', () => {
    adAnalyzerState.productName = productNameInput.value;
    updateButtonState();
  });
  productCategoryInput.addEventListener('input', () => {
    adAnalyzerState.productCategory = productCategoryInput.value;
    updateButtonState();
  });
  platformSelect.addEventListener('change', () => {
    adAnalyzerState.platform = platformSelect.value;
  });
  notesInput.addEventListener('input', () => {
    adAnalyzerState.notes = notesInput.value;
  });

  // Go to Bridge tab
  goToBridgeBtn.addEventListener('click', () => {
    const bridgeTab = document.querySelector('.unified-tab-btn[data-tab="bridgeTab"]') as HTMLElement;
    if (bridgeTab) bridgeTab.click();
  });

  // Copy Brief & Start
  copyBriefBtn.addEventListener('click', handleCopyBrief);

  // Report actions
  viewInFigmaBtn.addEventListener('click', () => {
    if (adAnalyzerState.carouselNodeId) {
      postMessage({ type: 'zoom-to-node', nodeId: adAnalyzerState.carouselNodeId });
    }
  });
  runAgainBtn.addEventListener('click', resetToStart);

  // Listen for ad-analyzer-complete from sandbox
  window.addEventListener('message', (event) => {
    const msg = event.data?.pluginMessage;
    if (!msg) return;
    if (msg.type === 'ad-analyzer-complete') {
      handleCompletion(msg.report, msg.carouselNodeId, msg.variantNodeIds);
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// IMAGE UPLOAD + RESIZE
// ═══════════════════════════════════════════════════════════════

function handleFile(file: File): void {
  if (!file.type.match(/^image\/(png|jpeg)$/)) {
    showToast('Only PNG and JPG images are supported', 'warning');
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = reader.result as string;
    const img = new Image();
    img.onload = () => {
      resizeAndStore(img, file.type);
    };
    img.src = dataUrl;
  };
  reader.readAsDataURL(file);
}

function resizeAndStore(img: HTMLImageElement, mimeType: string): void {
  let w = img.naturalWidth;
  let h = img.naturalHeight;

  // Scale down if needed
  if (w > MAX_IMAGE_DIM || h > MAX_IMAGE_DIM) {
    const ratio = Math.min(MAX_IMAGE_DIM / w, MAX_IMAGE_DIM / h);
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);

  const outputType = mimeType === 'image/jpeg' ? 'image/jpeg' : 'image/png';
  const base64 = canvas.toDataURL(outputType);

  adAnalyzerState.imageBase64 = base64;
  adAnalyzerState.imageMimeType = outputType;
  adAnalyzerState.imageWidth = w;
  adAnalyzerState.imageHeight = h;

  // Show preview
  previewImage.src = base64;
  previewDims.textContent = `${w} × ${h}px`;
  dropHint.style.display = 'none';
  previewEl.style.display = '';
  updateButtonState();
}

// ═══════════════════════════════════════════════════════════════
// BRIDGE STATE POLLING
// ═══════════════════════════════════════════════════════════════

function startBridgePoll(): void {
  if (bridgePollInterval) return;
  bridgePollInterval = window.setInterval(updateBridgeStatus, 2000);
  updateBridgeStatus();
}

function updateBridgeStatus(): void {
  const connected = getBridgeConnected();
  const channelId = getBridgeChannelId();

  if (connected && channelId) {
    bridgeConnectedEl.style.display = '';
    bridgeDisconnectedEl.style.display = 'none';
    channelIdEl.textContent = channelId;
  } else {
    bridgeConnectedEl.style.display = 'none';
    bridgeDisconnectedEl.style.display = '';
  }
  updateButtonState();
}

// ═══════════════════════════════════════════════════════════════
// BUTTON STATE
// ═══════════════════════════════════════════════════════════════

function updateButtonState(): void {
  const hasImage = adAnalyzerState.imageBase64 !== null;
  const hasName = adAnalyzerState.productName.trim() !== '';
  const hasCategory = adAnalyzerState.productCategory.trim() !== '';
  const bridgeOk = getBridgeConnected();

  copyBriefBtn.disabled = !(hasImage && hasName && hasCategory && bridgeOk);
}

// ═══════════════════════════════════════════════════════════════
// COPY BRIEF
// ═══════════════════════════════════════════════════════════════

function handleCopyBrief(): void {
  const channelId = getBridgeChannelId();
  if (!channelId) return;

  const base64 = adAnalyzerState.imageBase64!;
  const rawBase64 = base64.replace(/^data:image\/\w+;base64,/, '');
  const isLarge = rawBase64.length > MAX_BASE64_SIZE;

  if (isLarge) {
    showToast('Image too large for clipboard. Save to ad-analyzer/original-ad.png manually.', 'warning', 6000);
  }

  const imageSection = isLarge
    ? `**Image:** Save to \`ad-analyzer/original-ad.png\` manually (image too large for clipboard).`
    : `**Image (base64):**\n<image mime="${adAnalyzerState.imageMimeType}">\n${rawBase64}\n</image>`;

  const prompt = `Run the Ad Analyzer workflow.

**Brief:**
- Product: ${adAnalyzerState.productName}
- Category: ${adAnalyzerState.productCategory}
- Platform: ${adAnalyzerState.platform}
- Notes: ${adAnalyzerState.notes || 'None'}

${imageSection}
**Bridge channel:** ${channelId}

Call the \`start_ad_analyzer\` tool with these parameters, then follow the returned MISSION.md instructions for Phases 2-5.`;

  // Copy to clipboard
  const ta = document.createElement('textarea');
  ta.value = prompt;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  ta.style.top = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    showToast('Copied! Paste into Claude Code to start the analysis.', 'success');
  } catch (_) {
    showToast('Failed to copy. Select and copy manually.', 'error');
  }
  document.body.removeChild(ta);

  // Transition to status panel
  transitionToWatching();
}

// ═══════════════════════════════════════════════════════════════
// STATUS PANEL
// ═══════════════════════════════════════════════════════════════

function transitionToWatching(): void {
  adAnalyzerState.isWatching = true;
  adAnalyzerState.lastActivityTime = Date.now();

  uploadPanel.style.display = 'none';
  briefForm.style.display = 'none';
  launchSection.style.display = 'none';
  document.getElementById('aaBridgeStatus')!.style.display = 'none';
  statusPanel.style.display = '';
  activityLog.innerHTML = '';
  inactivityHint.style.display = 'none';

  // Start inactivity timer
  startInactivityTimer();

  // Start watching bridge commands for activity log
  startActivityWatcher();
}

let activityWatcherInterval: number | null = null;
let lastCommandCount = 0;

function startActivityWatcher(): void {
  // Poll bridge command count to detect new commands
  const bridgeCmdCountEl = document.getElementById('bridge-cmd-count');
  if (bridgeCmdCountEl) {
    lastCommandCount = parseInt(bridgeCmdCountEl.textContent || '0', 10);
  }

  activityWatcherInterval = window.setInterval(() => {
    if (!adAnalyzerState.isWatching) return;
    if (!bridgeCmdCountEl) return;

    const current = parseInt(bridgeCmdCountEl.textContent || '0', 10);
    if (current > lastCommandCount) {
      const delta = current - lastCommandCount;
      lastCommandCount = current;
      adAnalyzerState.lastActivityTime = Date.now();
      inactivityHint.style.display = 'none';

      addActivityLogEntry(`${delta} command(s) executed`, 'cmd');
      resetInactivityTimer();
    }
  }, 1000);
}

function addActivityLogEntry(text: string, type: string = 'sys'): void {
  const entry = document.createElement('div');
  entry.className = 'aa-log-entry ' + type;
  const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  entry.textContent = `${time}  ${text}`;
  activityLog.appendChild(entry);
  activityLog.scrollTop = activityLog.scrollHeight;
  while (activityLog.children.length > 100) activityLog.removeChild(activityLog.firstChild!);
}

function startInactivityTimer(): void {
  if (inactivityTimeout) clearTimeout(inactivityTimeout);
  inactivityTimeout = window.setTimeout(() => {
    if (adAnalyzerState.isWatching && Date.now() - adAnalyzerState.lastActivityTime >= INACTIVITY_TIMEOUT_MS) {
      inactivityHint.style.display = '';
    }
  }, INACTIVITY_TIMEOUT_MS);
}

function resetInactivityTimer(): void {
  if (inactivityTimeout) clearTimeout(inactivityTimeout);
  startInactivityTimer();
}

// ═══════════════════════════════════════════════════════════════
// COMPLETION
// ═══════════════════════════════════════════════════════════════

function handleCompletion(report: string, carouselNodeId: string, variantNodeIds: string[]): void {
  adAnalyzerState.isWatching = false;
  adAnalyzerState.report = report;
  adAnalyzerState.carouselNodeId = carouselNodeId;
  adAnalyzerState.variantNodeIds = variantNodeIds;

  if (activityWatcherInterval) {
    clearInterval(activityWatcherInterval);
    activityWatcherInterval = null;
  }
  if (inactivityTimeout) {
    clearTimeout(inactivityTimeout);
    inactivityTimeout = null;
  }

  statusPanel.style.display = 'none';
  reportPanel.style.display = '';
  reportContent.innerHTML = markdownToHtml(report);
}

// ═══════════════════════════════════════════════════════════════
// MARKDOWN RENDERER (basic, no external lib)
// ═══════════════════════════════════════════════════════════════

function markdownToHtml(md: string): string {
  let html = md
    // Escape HTML entities
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks
  html = html.replace(/```[\s\S]*?```/g, (match) => {
    const code = match.slice(3, -3).replace(/^\w*\n/, '');
    return `<pre><code>${code}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headings
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold and italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Unordered lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // Paragraphs — lines not already wrapped
  html = html.replace(/^(?!<[hluop])((?!<).+)$/gm, '<p>$1</p>');

  return html;
}

// ═══════════════════════════════════════════════════════════════
// RESET
// ═══════════════════════════════════════════════════════════════

function resetToStart(): void {
  adAnalyzerState.imageBase64 = null;
  adAnalyzerState.imageMimeType = null;
  adAnalyzerState.imageWidth = 0;
  adAnalyzerState.imageHeight = 0;
  adAnalyzerState.productName = '';
  adAnalyzerState.productCategory = '';
  adAnalyzerState.platform = 'instagram-4x5';
  adAnalyzerState.notes = '';
  adAnalyzerState.isWatching = false;
  adAnalyzerState.lastActivityTime = 0;
  adAnalyzerState.report = null;
  adAnalyzerState.carouselNodeId = null;
  adAnalyzerState.variantNodeIds = null;

  if (activityWatcherInterval) {
    clearInterval(activityWatcherInterval);
    activityWatcherInterval = null;
  }
  if (inactivityTimeout) {
    clearTimeout(inactivityTimeout);
    inactivityTimeout = null;
  }

  // Reset form inputs
  productNameInput.value = '';
  productCategoryInput.value = '';
  platformSelect.value = 'instagram-4x5';
  notesInput.value = '';

  // Reset preview
  dropHint.style.display = '';
  previewEl.style.display = 'none';

  // Show upload/brief, hide status/report
  uploadPanel.style.display = '';
  briefForm.style.display = '';
  launchSection.style.display = '';
  document.getElementById('aaBridgeStatus')!.style.display = '';
  statusPanel.style.display = 'none';
  reportPanel.style.display = 'none';

  updateButtonState();
}

// ═══════════════════════════════════════════════════════════════
// BACK NAVIGATION GUARD
// ═══════════════════════════════════════════════════════════════

/** Returns true if navigation should proceed, false if blocked. */
export function canLeaveAdAnalyzer(): boolean {
  if (!adAnalyzerState.isWatching) return true;
  return confirm('The workflow may still be running in Claude Code. Going back won\'t stop it. Continue?');
}
