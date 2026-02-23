import { HeroGeneratorInput, HERO_FORMATS, HeroQuality, SubjectPosition } from '../types';
import { heroState, apiState } from './state';
import { generateHeroImage } from './images';
import { postMessage, showToast } from './utils';

// ═══════════════════════════════════════════════════════════════
// HERO GENERATOR MODULE
// ═══════════════════════════════════════════════════════════════

// DOM references (local to this module)
let heroSubjectsZone: HTMLDivElement | null = null;
let heroSubjectsPreviews: HTMLDivElement | null = null;
let heroSubjectsInput: HTMLInputElement | null = null;
let heroStyleRefZone: HTMLDivElement | null = null;
let heroStyleRefPreview: HTMLDivElement | null = null;
let heroStyleRefInput: HTMLInputElement | null = null;
let heroElementsZone: HTMLDivElement | null = null;
let heroElementsPreviews: HTMLDivElement | null = null;
let heroElementsInput: HTMLInputElement | null = null;
let heroPositionBtns: NodeListOf<HTMLButtonElement> | null = null;
let heroQualityBtns: NodeListOf<HTMLButtonElement> | null = null;
let heroFormatCards: NodeListOf<HTMLDivElement> | null = null;
let heroScenePrompt: HTMLTextAreaElement | null = null;
let heroGenerateBtn: HTMLButtonElement | null = null;
let heroProgressSection: HTMLDivElement | null = null;
let heroProgressBar: HTMLDivElement | null = null;
let heroProgressStatus: HTMLDivElement | null = null;
let heroResultSection: HTMLDivElement | null = null;
let heroResultImage: HTMLImageElement | null = null;
let heroRegenerateBtn: HTMLButtonElement | null = null;
let heroAdjustBtn: HTMLButtonElement | null = null;
let heroPlaceBtn: HTMLButtonElement | null = null;
let heroConfigSection: HTMLDivElement | null = null;

/**
 * Initialize Hero Generator DOM references
 */
export function initHeroUI(): void {
    heroSubjectsZone = document.getElementById('heroSubjectsZone') as HTMLDivElement;
    heroSubjectsPreviews = document.getElementById('heroSubjectsPreviews') as HTMLDivElement;
    heroSubjectsInput = document.getElementById('heroSubjectsInput') as HTMLInputElement;
    heroStyleRefZone = document.getElementById('heroStyleRefZone') as HTMLDivElement;
    heroStyleRefPreview = document.getElementById('heroStyleRefPreview') as HTMLDivElement;
    heroStyleRefInput = document.getElementById('heroStyleRefInput') as HTMLInputElement;
    heroElementsZone = document.getElementById('heroElementsZone') as HTMLDivElement;
    heroElementsPreviews = document.getElementById('heroElementsPreviews') as HTMLDivElement;
    heroElementsInput = document.getElementById('heroElementsInput') as HTMLInputElement;
    heroPositionBtns = document.querySelectorAll('.hero-position-btn') as NodeListOf<HTMLButtonElement>;
    heroQualityBtns = document.querySelectorAll('.hero-quality-btn') as NodeListOf<HTMLButtonElement>;
    heroFormatCards = document.querySelectorAll('.hero-format-card') as NodeListOf<HTMLDivElement>;
    heroScenePrompt = document.getElementById('heroScenePrompt') as HTMLTextAreaElement;
    heroGenerateBtn = document.getElementById('heroGenerateBtn') as HTMLButtonElement;
    heroProgressSection = document.getElementById('heroProgressSection') as HTMLDivElement;
    heroProgressBar = document.getElementById('heroProgressBar') as HTMLDivElement;
    heroProgressStatus = document.getElementById('heroProgressStatus') as HTMLDivElement;
    heroResultSection = document.getElementById('heroResultSection') as HTMLDivElement;
    heroResultImage = document.getElementById('heroResultImage') as HTMLImageElement;
    heroRegenerateBtn = document.getElementById('heroRegenerateBtn') as HTMLButtonElement;
    heroAdjustBtn = document.getElementById('heroAdjustBtn') as HTMLButtonElement;
    heroPlaceBtn = document.getElementById('heroPlaceBtn') as HTMLButtonElement;
    heroConfigSection = document.getElementById('heroConfigSection') as HTMLDivElement;
}

/**
 * Setup all Hero Generator event listeners
 */
export function setupHeroListeners(): void {
    // Upload zone click handlers
    if (heroSubjectsZone && heroSubjectsInput) {
        heroSubjectsZone.addEventListener('click', function () {
            heroSubjectsInput!.click();
        });
        heroSubjectsInput.addEventListener('change', function () {
            handleFileUpload(heroSubjectsInput!, 'subjects');
        });
        setupDropZone(heroSubjectsZone, 'subjects');
    }

    if (heroStyleRefZone && heroStyleRefInput) {
        heroStyleRefZone.addEventListener('click', function () {
            heroStyleRefInput!.click();
        });
        heroStyleRefInput.addEventListener('change', function () {
            handleFileUpload(heroStyleRefInput!, 'styleRef');
        });
        setupDropZone(heroStyleRefZone, 'styleRef');
    }

    if (heroElementsZone && heroElementsInput) {
        heroElementsZone.addEventListener('click', function () {
            heroElementsInput!.click();
        });
        heroElementsInput.addEventListener('change', function () {
            handleFileUpload(heroElementsInput!, 'elements');
        });
        setupDropZone(heroElementsZone, 'elements');
    }

    // Position buttons
    if (heroPositionBtns) {
        heroPositionBtns.forEach(function (btn) {
            btn.addEventListener('click', function () {
                const pos = btn.getAttribute('data-position') as SubjectPosition;
                heroState.position = pos;
                heroPositionBtns!.forEach(function (b) {
                    b.classList.toggle('active', b === btn);
                });
            });
        });
    }

    // Quality buttons
    if (heroQualityBtns) {
        heroQualityBtns.forEach(function (btn) {
            btn.addEventListener('click', function () {
                const quality = btn.getAttribute('data-quality') as HeroQuality;
                heroState.quality = quality;
                heroQualityBtns!.forEach(function (b) {
                    b.classList.toggle('active', b === btn);
                });
            });
        });
    }

    // Format cards
    if (heroFormatCards) {
        heroFormatCards.forEach(function (card) {
            card.addEventListener('click', function () {
                const formatId = card.getAttribute('data-format');
                const format = HERO_FORMATS.find(function (f) {
                    return f.id === formatId;
                });
                if (format) {
                    heroState.format = format;
                    heroFormatCards!.forEach(function (c) {
                        c.classList.toggle('active', c === card);
                    });
                }
            });
        });
    }

    // Scene prompt
    if (heroScenePrompt) {
        heroScenePrompt.addEventListener('input', function () {
            heroState.scenePrompt = heroScenePrompt!.value;
        });
    }

    // Generate button
    if (heroGenerateBtn) {
        heroGenerateBtn.addEventListener('click', handleGenerateHero);
    }

    // Result action buttons
    if (heroRegenerateBtn) {
        heroRegenerateBtn.addEventListener('click', handleRegenerate);
    }

    if (heroAdjustBtn) {
        heroAdjustBtn.addEventListener('click', handleAdjust);
    }

    if (heroPlaceBtn) {
        heroPlaceBtn.addEventListener('click', handlePlaceOnCanvas);
    }
}

/**
 * Setup drag-and-drop on an upload zone
 */
function setupDropZone(zone: HTMLDivElement, type: 'subjects' | 'styleRef' | 'elements'): void {
    zone.addEventListener('dragover', function (e) {
        e.preventDefault();
        zone.classList.add('drag-over');
    });

    zone.addEventListener('dragleave', function () {
        zone.classList.remove('drag-over');
    });

    zone.addEventListener('drop', function (e) {
        e.preventDefault();
        zone.classList.remove('drag-over');
        if (e.dataTransfer && e.dataTransfer.files.length > 0) {
            processFiles(e.dataTransfer.files, type);
        }
    });
}

/**
 * Handle file input change
 */
function handleFileUpload(input: HTMLInputElement, type: 'subjects' | 'styleRef' | 'elements'): void {
    if (input.files && input.files.length > 0) {
        processFiles(input.files, type);
        input.value = ''; // Reset so same file can be re-selected
    }
}

/**
 * Process uploaded files and convert to base64
 */
function processFiles(files: FileList, type: 'subjects' | 'styleRef' | 'elements'): void {
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith('image/')) continue;

        const reader = new FileReader();
        reader.onload = function (e) {
            const dataUrl = e.target?.result as string;
            if (!dataUrl) return;

            if (type === 'subjects') {
                heroState.subjects.push(dataUrl);
                renderSubjectPreviews();
            } else if (type === 'styleRef') {
                heroState.styleRef = dataUrl;
                renderStyleRefPreview();
            } else if (type === 'elements') {
                heroState.elements.push(dataUrl);
                renderElementPreviews();
            }
        };
        reader.readAsDataURL(file);

        // For style ref, only take the first file
        if (type === 'styleRef') break;
    }
}

/**
 * Render subject image previews
 */
function renderSubjectPreviews(): void {
    if (!heroSubjectsPreviews) return;
    heroSubjectsPreviews.innerHTML = '';

    heroState.subjects.forEach(function (src, index) {
        const wrapper = document.createElement('div');
        wrapper.className = 'hero-preview-thumb';
        const img = document.createElement('img');
        img.src = src;
        img.alt = 'Subject ' + (index + 1);
        wrapper.appendChild(img);
        const removeBtn = document.createElement('button');
        removeBtn.className = 'hero-preview-remove';
        removeBtn.setAttribute('data-index', String(index));
        removeBtn.setAttribute('data-type', 'subjects');
        removeBtn.textContent = '\u00d7';
        wrapper.appendChild(removeBtn);
        heroSubjectsPreviews!.appendChild(wrapper);
    });

    // Attach remove handlers
    heroSubjectsPreviews.querySelectorAll('.hero-preview-remove').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            const idx = parseInt((btn as HTMLElement).getAttribute('data-index') || '0');
            heroState.subjects.splice(idx, 1);
            renderSubjectPreviews();
        });
    });

    // Show/hide zone hint
    if (heroSubjectsZone) {
        const hint = heroSubjectsZone.querySelector('.hero-upload-hint');
        if (hint) (hint as HTMLElement).style.display = heroState.subjects.length > 0 ? 'none' : '';
    }
}

/**
 * Render style reference preview
 */
function renderStyleRefPreview(): void {
    if (!heroStyleRefPreview) return;
    heroStyleRefPreview.innerHTML = '';

    if (heroState.styleRef) {
        const thumb = document.createElement('div');
        thumb.className = 'hero-preview-thumb';
        const img = document.createElement('img');
        img.src = heroState.styleRef;
        img.alt = 'Style Reference';
        thumb.appendChild(img);
        const removeBtn = document.createElement('button');
        removeBtn.className = 'hero-preview-remove';
        removeBtn.setAttribute('data-type', 'styleRef');
        removeBtn.textContent = '\u00d7';
        thumb.appendChild(removeBtn);
        heroStyleRefPreview.appendChild(thumb);

        heroStyleRefPreview.querySelector('.hero-preview-remove')?.addEventListener('click', function (e) {
            e.stopPropagation();
            heroState.styleRef = null;
            renderStyleRefPreview();
        });
    }

    if (heroStyleRefZone) {
        const hint = heroStyleRefZone.querySelector('.hero-upload-hint');
        if (hint) (hint as HTMLElement).style.display = heroState.styleRef ? 'none' : '';
    }
}

/**
 * Render element/branding previews
 */
function renderElementPreviews(): void {
    if (!heroElementsPreviews) return;
    heroElementsPreviews.innerHTML = '';

    heroState.elements.forEach(function (src, index) {
        const wrapper = document.createElement('div');
        wrapper.className = 'hero-preview-thumb';
        const img = document.createElement('img');
        img.src = src;
        img.alt = 'Element ' + (index + 1);
        wrapper.appendChild(img);
        const removeBtn = document.createElement('button');
        removeBtn.className = 'hero-preview-remove';
        removeBtn.setAttribute('data-index', String(index));
        removeBtn.setAttribute('data-type', 'elements');
        removeBtn.textContent = '\u00d7';
        wrapper.appendChild(removeBtn);
        heroElementsPreviews!.appendChild(wrapper);
    });

    heroElementsPreviews.querySelectorAll('.hero-preview-remove').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            const idx = parseInt((btn as HTMLElement).getAttribute('data-index') || '0');
            heroState.elements.splice(idx, 1);
            renderElementPreviews();
        });
    });

    if (heroElementsZone) {
        const hint = heroElementsZone.querySelector('.hero-upload-hint');
        if (hint) (hint as HTMLElement).style.display = heroState.elements.length > 0 ? 'none' : '';
    }
}

/**
 * Handle hero generation
 */
async function handleGenerateHero(): Promise<void> {
    // Validate
    if (!heroState.scenePrompt.trim()) {
        showToast('Please describe the scene for your hero image', 'warning');
        return;
    }

    const apiKey = apiState.savedApiKeys['gemini'];
    if (!apiKey) {
        showToast('Please add your Gemini API key in Settings first', 'warning');
        return;
    }

    // Show progress, hide config
    heroState.isProcessing = true;
    heroState.abortController = new AbortController();
    if (heroGenerateBtn) heroGenerateBtn.disabled = true;
    showSection('progress');

    if (heroProgressStatus) heroProgressStatus.textContent = 'Generating hero image...';
    if (heroProgressBar) heroProgressBar.style.width = '20%';

    // Simulate progress
    let progress = 20;
    const progressTimer = setInterval(function () {
        if (progress < 85) {
            progress += Math.random() * 5;
            if (heroProgressBar) heroProgressBar.style.width = Math.min(progress, 85) + '%';
        }
    }, 500);

    try {
        const input: HeroGeneratorInput = {
            subjects: heroState.subjects,
            styleRef: heroState.styleRef,
            elements: heroState.elements,
            position: heroState.position,
            scenePrompt: heroState.scenePrompt,
            format: heroState.format,
            quality: heroState.quality,
        };

        const result = await generateHeroImage(input, apiKey, heroState.abortController.signal);

        clearInterval(progressTimer);

        if (result) {
            heroState.lastGeneratedImage = result;
            if (heroProgressBar) heroProgressBar.style.width = '100%';
            if (heroProgressStatus) heroProgressStatus.textContent = 'Hero image generated!';

            // Short delay then show result
            setTimeout(function () {
                showSection('result');
                if (heroResultImage) {
                    heroResultImage.src = result;
                }
            }, 500);
        } else {
            showSection('config');
            showToast('Failed to generate hero image. Please try again.', 'error');
        }
    } catch (error: any) {
        clearInterval(progressTimer);
        if (error.name !== 'AbortError') {
            showSection('config');
            showToast('Generation failed: ' + (error.message || 'Unknown error'), 'error', 4000, () => handleGenerateHero());
        }
    } finally {
        heroState.isProcessing = false;
        heroState.abortController = null;
        if (heroGenerateBtn) heroGenerateBtn.disabled = false;
    }
}

/**
 * Regenerate with same settings
 */
function handleRegenerate(): void {
    showSection('config');
    handleGenerateHero();
}

/**
 * Go back to adjust settings
 */
function handleAdjust(): void {
    showSection('config');
}

/**
 * Place the generated image on the Figma canvas
 */
function handlePlaceOnCanvas(): void {
    if (!heroState.lastGeneratedImage) {
        showToast('No image to place', 'warning');
        return;
    }

    postMessage({
        type: 'create-hero-image',
        imageData: heroState.lastGeneratedImage,
        width: heroState.format.width,
        height: heroState.format.height,
        name: 'Hero — ' + heroState.format.name,
    });

    showToast('Hero image placed on canvas!', 'success');
}

/**
 * Toggle between config, progress, and result sections
 */
function showSection(section: 'config' | 'progress' | 'result'): void {
    if (heroConfigSection) heroConfigSection.style.display = section === 'config' ? '' : 'none';
    if (heroProgressSection) heroProgressSection.style.display = section === 'progress' ? '' : 'none';
    if (heroResultSection) heroResultSection.style.display = section === 'result' ? '' : 'none';
    if (heroGenerateBtn) heroGenerateBtn.style.display = section === 'config' ? '' : 'none';
}
