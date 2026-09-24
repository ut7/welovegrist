/**
 * Grist Markdown & Mermaid Widget
 * Renders Markdown content with embedded Mermaid diagrams
 */

class MarkdownMermaidWidget {
    constructor() {
        // Widget state
        this.currentRecord = null;
        this.mappings = null;
        this.currentDarkMode = null;
        this.themeObserver = null;
        
        // DOM elements
        this.elements = {
            loadingState: document.getElementById('loadingState'),
            emptyState: document.getElementById('emptyState'),
            contentDisplay: document.getElementById('contentDisplay'),
            contentWrapper: document.getElementById('contentWrapper'),
            zoomControls: document.getElementById('zoomControls'),
            zoomInBtn: document.getElementById('zoomIn'),
            zoomOutBtn: document.getElementById('zoomOut'),
            zoomResetBtn: document.getElementById('zoomReset'),
            zoomLevel: document.getElementById('zoomLevel')
        };
        
        // Mermaid counter for unique IDs
        this.mermaidCounter = 0;
        
        // Zoom and pan state
        this.zoomScale = 1;
        this.minZoom = 0.25;
        this.maxZoom = 5;
        this.zoomStep = 0.25;
        this.isPanning = false;
        this.panStart = { x: 0, y: 0 };
        this.panOffset = { x: 0, y: 0 };
        
        this.init();
    }
    
    /**
     * Initialize the widget
     */
    init() {
        this.setupMarkdown();
        this.setupMermaid();
        this.setupThemeObserver();
        this.setupZoomControls();
        this.initializeGrist();
    }
    
    /**
     * Setup Markdown configuration
     */
    setupMarkdown() {
        if (typeof marked !== 'undefined') {
            marked.setOptions({
                breaks: true,
                gfm: true,
                sanitize: false, // We'll handle XSS protection manually
                smartLists: true,
                smartypants: false
            });
        }
    }
    
    /**
     * Setup Mermaid configuration
     */
    setupMermaid() {
        if (typeof mermaid !== 'undefined') {
            // Detect dark mode from Grist CSS variables
            const isDarkMode = this.detectDarkMode();
            this.currentDarkMode = isDarkMode;
            
            this.initializeMermaid(isDarkMode);
        }
    }
    
    /**
     * Initialize Mermaid with theme
     */
    initializeMermaid(isDarkMode) {
        if (typeof mermaid === 'undefined') return;
        
        mermaid.initialize({
            startOnLoad: false,
            theme: isDarkMode ? 'dark' : 'default',
            securityLevel: 'strict',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            fontSize: 14,
            flowchart: {
                useMaxWidth: true,
                htmlLabels: true
            },
            sequence: {
                useMaxWidth: true,
                wrap: true
            },
            gantt: {
                useMaxWidth: true
            },
            journey: {
                useMaxWidth: true
            },
            pie: {
                useMaxWidth: true
            },
            // Force dark theme colors when in dark mode
            themeVariables: isDarkMode ? {
                darkMode: true,
                primaryColor: '#bb86fc',
                primaryTextColor: '#ffffff',
                primaryBorderColor: '#bb86fc',
                lineColor: '#ffffff',
                secondaryColor: '#03dac6',
                tertiaryColor: '#cf6679',
                background: '#121212',
                mainBkg: '#1e1e1e',
                secondBkg: '#2d2d2d',
                tertiaryBkg: '#404040'
            } : {}
        });
    }
    
    /**
     * Setup theme change observer
     */
    setupThemeObserver() {
        // Method 1: Observer CSS variable changes on document root
        this.themeObserver = new MutationObserver(() => {
            this.checkThemeChange();
        });
        
        // Observe changes to document element attributes and style
        this.themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class', 'style', 'data-theme']
        });
        
        // Also observe body changes (some apps change theme classes on body)
        this.themeObserver.observe(document.body, {
            attributes: true,
            attributeFilter: ['class', 'style', 'data-theme']
        });
        
        // Method 2: Listen for CSS custom property changes (polyfill approach)
        // Check periodically as CSS custom properties don't have native change events
        this.themeCheckInterval = setInterval(() => {
            this.checkThemeChange();
        }, 1000); // Check every second
        
        // Method 3: Listen for system preference changes
        if (window.matchMedia) {
            const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
            darkModeQuery.addEventListener('change', () => {
                // Add small delay to let Grist update its theme
                setTimeout(() => this.checkThemeChange(), 100);
            });
        }
    }
    
    /**
     * Check if theme has changed and update if needed
     */
    checkThemeChange() {
        const newDarkMode = this.detectDarkMode();
        
        if (newDarkMode !== this.currentDarkMode) {
            console.log('Theme change detected:', this.currentDarkMode, '->', newDarkMode);
            this.currentDarkMode = newDarkMode;
            this.handleThemeChange(newDarkMode);
        }
    }
    
    /**
     * Handle theme change
     */
    async handleThemeChange(isDarkMode) {
        try {
            // Reinitialize Mermaid with new theme
            this.initializeMermaid(isDarkMode);
            
            // Re-render current content if we have any
            if (this.currentRecord && this.mappings) {
                const mapped = grist.mapColumnNames(this.currentRecord);
                if (mapped && mapped.Content !== undefined) {
                    const content = this.getFieldValue(mapped.Content);
                    if (content && content.trim() !== '') {
                        await this.renderContent(content);
                    }
                }
            }
        } catch (error) {
            console.error('Error handling theme change:', error);
        }
    }
    
    /**
     * Setup zoom and pan controls
     */
    setupZoomControls() {
        if (!this.elements.zoomInBtn || !this.elements.zoomOutBtn || !this.elements.zoomResetBtn) {
            console.warn('Zoom control elements not found');
            return;
        }
        
        // Zoom in button
        this.elements.zoomInBtn.addEventListener('click', () => this.zoomIn());
        
        // Zoom out button
        this.elements.zoomOutBtn.addEventListener('click', () => this.zoomOut());
        
        // Reset zoom button
        this.elements.zoomResetBtn.addEventListener('click', () => this.resetZoom());
        
        // Mouse wheel zoom
        this.elements.contentWrapper.addEventListener('wheel', (e) => this.handleWheel(e));
        
        // Touch zoom (pinch)
        this.elements.contentWrapper.addEventListener('touchstart', (e) => this.handleTouchStart(e));
        this.elements.contentWrapper.addEventListener('touchmove', (e) => this.handleTouchMove(e));
        this.elements.contentWrapper.addEventListener('touchend', (e) => this.handleTouchEnd(e));
        
        // Pan functionality
        this.elements.contentWrapper.addEventListener('mousedown', (e) => this.handlePanStart(e));
        this.elements.contentWrapper.addEventListener('mousemove', (e) => this.handlePanMove(e));
        this.elements.contentWrapper.addEventListener('mouseup', (e) => this.handlePanEnd(e));
        this.elements.contentWrapper.addEventListener('mouseleave', (e) => this.handlePanEnd(e));
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeydown(e));
        
        // Prevent context menu on content wrapper
        this.elements.contentWrapper.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    
    /**
     * Handle keyboard shortcuts
     */
    handleKeydown(e) {
        if (this.elements.contentWrapper.style.display === 'none') return;
        
        switch (e.key) {
            case '+':
            case '=':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    this.zoomIn();
                }
                break;
            case '-':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    this.zoomOut();
                }
                break;
            case '0':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    this.resetZoom();
                }
                break;
            case 'r':
            case 'R':
                if (!e.ctrlKey && !e.metaKey) {
                    this.resetZoom();
                }
                break;
        }
    }
    
    /**
     * Handle mouse wheel for zooming
     */
    handleWheel(e) {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -this.zoomStep : this.zoomStep;
            this.setZoom(this.zoomScale + delta);
        }
    }
    
    /**
     * Handle touch events for pinch zoom
     */
    handleTouchStart(e) {
        if (e.touches.length === 2) {
            this.touchStartDistance = this.getTouchDistance(e.touches[0], e.touches[1]);
            this.touchStartZoom = this.zoomScale;
        }
    }
    
    handleTouchMove(e) {
        if (e.touches.length === 2 && this.touchStartDistance) {
            e.preventDefault();
            const currentDistance = this.getTouchDistance(e.touches[0], e.touches[1]);
            const scale = currentDistance / this.touchStartDistance;
            this.setZoom(this.touchStartZoom * scale);
        }
    }
    
    handleTouchEnd(e) {
        if (e.touches.length < 2) {
            this.touchStartDistance = null;
            this.touchStartZoom = null;
        }
    }
    
    /**
     * Get distance between two touch points
     */
    getTouchDistance(touch1, touch2) {
        const dx = touch2.clientX - touch1.clientX;
        const dy = touch2.clientY - touch1.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    /**
     * Handle pan start
     */
    handlePanStart(e) {
        if (e.button === 0 && this.zoomScale > 1) { // Left mouse button and zoomed in
            this.isPanning = true;
            this.panStart.x = e.clientX;
            this.panStart.y = e.clientY;
            this.elements.contentWrapper.style.cursor = 'grabbing';
        }
    }
    
    /**
     * Handle pan move
     */
    handlePanMove(e) {
        if (this.isPanning) {
            const dx = e.clientX - this.panStart.x;
            const dy = e.clientY - this.panStart.y;
            
            const newScrollLeft = this.elements.contentWrapper.scrollLeft - dx;
            const newScrollTop = this.elements.contentWrapper.scrollTop - dy;
            
            this.elements.contentWrapper.scrollLeft = newScrollLeft;
            this.elements.contentWrapper.scrollTop = newScrollTop;
            
            this.panStart.x = e.clientX;
            this.panStart.y = e.clientY;
        }
    }
    
    /**
     * Handle pan end
     */
    handlePanEnd(e) {
        if (this.isPanning) {
            this.isPanning = false;
            this.elements.contentWrapper.style.cursor = this.zoomScale > 1 ? 'grab' : 'default';
        }
    }
    
    /**
     * Zoom in
     */
    zoomIn() {
        this.setZoom(this.zoomScale + this.zoomStep);
    }
    
    /**
     * Zoom out
     */
    zoomOut() {
        this.setZoom(this.zoomScale - this.zoomStep);
    }
    
    /**
     * Reset zoom to 100%
     */
    resetZoom() {
        this.setZoom(1);
        this.elements.contentWrapper.scrollLeft = 0;
        this.elements.contentWrapper.scrollTop = 0;
    }
    
    /**
     * Set zoom level
     */
    setZoom(scale) {
        this.zoomScale = Math.max(this.minZoom, Math.min(this.maxZoom, scale));
        
        // Update transform
        this.elements.contentDisplay.style.transform = `scale(${this.zoomScale})`;
        
        // Update zoom level display
        this.elements.zoomLevel.textContent = `${Math.round(this.zoomScale * 100)}%`;
        
        // Update cursor
        this.elements.contentWrapper.style.cursor = this.zoomScale > 1 ? 'grab' : 'default';
        
        // Update button states
        this.elements.zoomInBtn.disabled = this.zoomScale >= this.maxZoom;
        this.elements.zoomOutBtn.disabled = this.zoomScale <= this.minZoom;
    }
    
    /**
     * Cleanup observers when widget is destroyed
     */
    destroy() {
        if (this.themeObserver) {
            this.themeObserver.disconnect();
        }
        if (this.themeCheckInterval) {
            clearInterval(this.themeCheckInterval);
        }
    }
    
    /**
     * Detect dark mode from Grist CSS variables
     */
    detectDarkMode() {
        const computedStyle = getComputedStyle(document.body);
        const bgColor = computedStyle.getPropertyValue('--grist-theme-bg').trim();
        
        // If we can't detect, check text color as fallback
        if (!bgColor) {
            const textColor = computedStyle.getPropertyValue('--grist-theme-text').trim();
            // If text is light colored, we're probably in dark mode
            return textColor.includes('255') || textColor.includes('white') || textColor.includes('#fff');
        }
        
        // Simple heuristic: if background is dark, we're in dark mode
        if (bgColor.includes('rgb')) {
            const rgbMatch = bgColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
            if (rgbMatch) {
                const [, r, g, b] = rgbMatch;
                const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
                return luminance < 0.5;
            }
        }
        
        if (bgColor.includes('#')) {
            const hex = bgColor.replace('#', '');
            const r = parseInt(hex.substr(0, 2), 16);
            const g = parseInt(hex.substr(2, 2), 16);
            const b = parseInt(hex.substr(4, 2), 16);
            const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            return luminance < 0.5;
        }
        
        // Default fallback
        return false;
    }
    
    /**
     * Initialize Grist API connection
     */
    initializeGrist() {
        grist.ready({
            requiredAccess: 'read table',
            columns: [
                {
                    name: 'Content',
                    title: 'Content',
                    description: 'Column containing Markdown and Mermaid content',
                    optional: false
                }
            ]
        });
        
        // Listen for current record changes
        grist.onRecord((record, mappings) => {
            this.currentRecord = record;
            this.mappings = mappings;
            this.handleRecordUpdate();
        });

        // Listen for current record changes
        grist.onNewRecord((record, mappings) => {
            this.currentRecord = null;
            this.mappings = null;
            this.handleRecordUpdate();
        });
    }
    
    /**
     * Handle record updates from Grist
     */
    handleRecordUpdate() {
        this.updateContent();
    }
    
    /**
     * Update the content display
     */
    updateContent() {
        // Hide loading state
        this.elements.loadingState.style.display = 'none';
        
        // Check if we have data and mappings
        if (!this.currentRecord || !this.mappings) {
            this.showEmptyState('No record selected or mappings not configured.');
            return;
        }
        
        // Get mapped content
        const mapped = grist.mapColumnNames(this.currentRecord);
        if (!mapped || mapped.Content === undefined) {
            this.showEmptyState('Column mapping not configured.');
            return;
        }
        
        const content = this.getFieldValue(mapped.Content);
        if (!content || content.trim() === '') {
            this.showEmptyState('No content in this record.');
            return;
        }
        
        this.renderContent(content);
    }
    
    /**
     * Show empty state with custom message
     */
    showEmptyState(message = 'No content to display') {
        this.elements.emptyState.style.display = 'block';
        this.elements.contentWrapper.style.display = 'none';
        this.elements.zoomControls.style.display = 'none';
        
        const messageElement = this.elements.emptyState.querySelector('.empty-state-message');
        if (messageElement) {
            messageElement.textContent = message;
        }
    }
    
    /**
     * Get field value, handling different data types
     */
    getFieldValue(value) {
        if (value == null) return null;
        
        // Handle reference fields
        if (typeof value === 'object' && value.name) {
            return value.name;
        }
        
        // Handle arrays
        if (Array.isArray(value)) {
            return value.map(item => 
                typeof item === 'object' && item.name ? item.name : String(item)
            ).join('\n');
        }
        
        return String(value);
    }
    
    /**
     * Render content with Markdown and Mermaid
     */
    async renderContent(content) {
        this.elements.emptyState.style.display = 'none';
        this.elements.contentWrapper.style.display = 'block';
        this.elements.zoomControls.style.display = 'flex';
        
        try {
            // Reset mermaid counter
            this.mermaidCounter = 0;
            
            // Reset zoom and pan
            this.resetZoom();
            
            // Process content to extract and render Mermaid diagrams
            const processedContent = await this.processContentWithMermaid(content);
            
            // Set the processed content
            this.elements.contentDisplay.innerHTML = processedContent;

            this.openLinksInNewTab(this.elements.contentDisplay);

        } catch (error) {
            console.error('Error rendering content:', error);
            this.elements.contentDisplay.innerHTML = `
                <div class="mermaid-error">
                    <strong>Rendering Error:</strong> ${this.escapeHtml(error.message)}
                </div>
            `;
        }
    }
    
    /**
     * Process content to handle Mermaid diagrams
     */
    async processContentWithMermaid(content) {
        // Extract Mermaid blocks with regex
        const mermaidRegex = /```mermaid\n([\s\S]*?)```/g;
        const parts = [];
        let lastIndex = 0;
        let match;
        
        while ((match = mermaidRegex.exec(content)) !== null) {
            // Add markdown content before this mermaid block
            if (match.index > lastIndex) {
                const markdownContent = content.slice(lastIndex, match.index);
                if (markdownContent.trim()) {
                    parts.push({
                        type: 'markdown',
                        content: markdownContent
                    });
                }
            }
            
            // Add mermaid diagram
            parts.push({
                type: 'mermaid',
                content: match[1].trim()
            });
            
            lastIndex = match.index + match[0].length;
        }
        
        // Add remaining markdown content
        if (lastIndex < content.length) {
            const markdownContent = content.slice(lastIndex);
            if (markdownContent.trim()) {
                parts.push({
                    type: 'markdown',
                    content: markdownContent
                });
            }
        }
        
        // If no mermaid blocks found, treat entire content as markdown
        if (parts.length === 0) {
            parts.push({
                type: 'markdown',
                content: content
            });
        }
        
        // Process each part
        const processedParts = await Promise.all(parts.map(part => this.processPart(part)));
        
        return processedParts.join('');
    }
    
    /**
     * Process a single part (markdown or mermaid)
     */
    async processPart(part) {
        if (part.type === 'markdown') {
            return this.processMarkdown(part.content);
        } else if (part.type === 'mermaid') {
            return await this.processMermaid(part.content);
        }
        return '';
    }
    
    /**
     * Process Markdown content
     */
    processMarkdown(content) {
        if (typeof marked === 'undefined') {
            return `<pre>${this.escapeHtml(content)}</pre>`;
        }
        
        try {
            const html = marked.parse(content);
            return this.sanitizeHtml(html);
        } catch (error) {
            console.warn('Error parsing Markdown:', error);
            return `<pre>${this.escapeHtml(content)}</pre>`;
        }
    }
    
    /**
     * Process Mermaid diagram with detailed error reporting
     */
    async processMermaid(content) {
        if (typeof mermaid === 'undefined') {
            return `<pre class="mermaid-error"><strong>Mermaid Error:</strong> Library not loaded<hr><pre>${this.escapeHtml(content)}</pre></pre>`;
        }
        
        try {
            // Generate unique ID for this diagram
            const diagramId = `mermaid-${this.mermaidCounter++}-${Date.now()}`;
            
            // Validate and render the diagram
            const { svg } = await mermaid.render(diagramId, content);
            
            return `<div class="mermaid-container">${svg}</div>`;
        } catch (error) {
            console.warn('Mermaid rendering error:', error);
            
            // Create detailed error message
            let errorMessage = 'Syntax Error';
            if (error.message) {
                // Clean up error message
                errorMessage = error.message
                    .replace(/Error: /, '')
                    .replace(/\n.*$/, ''); // Remove stack trace
            }
            
            // Add line information if available
            if (error.line) {
                errorMessage += ` (line ${error.line})`;
            }
            
            // Add column information if available
            if (error.column) {
                errorMessage += `:${error.column}`;
            }
            
            return `
                <div class="mermaid-error">
                    <strong>Mermaid Error:</strong> ${this.escapeHtml(errorMessage)}
                    <hr>
                    <pre>${this.escapeHtml(content)}</pre>
                </div>
            `;
        }
    }
    
    /**
     * Make links (Markdown and Mermaid SVG) open in a new browser tab
     * instead of navigating inside the widget iframe
     */
    openLinksInNewTab(container) {
        container.querySelectorAll('a').forEach(link => {
            const href = link.getAttribute('href') || link.getAttribute('xlink:href');
            if (!href || href.startsWith('#')) return;
            link.setAttribute('target', '_blank');
            link.setAttribute('rel', 'noopener noreferrer');
        });
    }

    /**
     * Escape HTML characters
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    /**
     * Basic HTML sanitization
     */
    sanitizeHtml(html) {
        const temp = document.createElement('div');
        temp.innerHTML = html;
        
        // Remove script tags
        const scripts = temp.querySelectorAll('script');
        scripts.forEach(script => script.remove());
        
        // Remove dangerous attributes
        const allElements = temp.querySelectorAll('*');
        allElements.forEach(el => {
            Array.from(el.attributes).forEach(attr => {
                if (attr.name.startsWith('on') || attr.name === 'javascript:') {
                    el.removeAttribute(attr.name);
                }
            });
        });
        
        return temp.innerHTML;
    }

}

// Initialize the widget when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const widget = new MarkdownMermaidWidget();
    
    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        widget.destroy();
    });
});
