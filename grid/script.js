/**
 * Grist Grid Widget
 * Displays Grist table data in a customizable grid format
 */

class GristGridWidget {
    constructor() {
        // Widget state
        this.records = [];
        this.mappings = null;
        this.selectedRecordId = null;
        this.focusedElement = null;
        this.choiceOptions = null;
        this.access = (new URLSearchParams(window.location.search)).get('access');

        // DOM elements
        this.elements = {
            loadingState: document.getElementById('loadingState'),
            emptyState: document.getElementById('emptyState'),
            gridTable: document.getElementById('gridTable'),
            gridHeader: document.getElementById('gridHeader'),
            gridBody: document.getElementById('gridBody'),
            gridCaption: document.getElementById('gridCaption'),
            status: document.getElementById('status')
        };

        this.init();
    }

    /**
     * Initialize the widget
     */
    async init() {
        this.setupMarkdown();
        this.setupKeyboardNavigation();
        this.initializeGrist();
    }

    /**
     * Setup keyboard navigation
     */
    setupKeyboardNavigation() {
        // Global keyboard handler
        document.addEventListener('keydown', (e) => {
            this.handleKeyDown(e);
        });

        // Focus management
        document.addEventListener('focusin', (e) => {
            if (e.target.classList.contains('cell-item')) {
                this.focusedElement = e.target;
            }
        });

        document.addEventListener('focusout', (e) => {
            if (e.target.classList.contains('cell-item')) {
                // Small delay to check if focus moved to another cell-item
                setTimeout(() => {
                    if (!document.activeElement?.classList.contains('cell-item')) {
                        this.focusedElement = null;
                    }
                }, 10);
            }
        });
    }

    /**
     * Handle keyboard navigation
     */
    handleKeyDown(e) {
        const focusedItem = document.activeElement;

        // Only handle keyboard events when focused on cell items
        if (!focusedItem?.classList.contains('cell-item')) {
            return;
        }

        switch (e.key) {
            case 'Enter':
            case ' ': // Space
                e.preventDefault();
                this.activateItem(focusedItem);
                break;

            case 'ArrowRight':
                e.preventDefault();
                this.moveFocus('right', focusedItem);
                break;

            case 'ArrowLeft':
                e.preventDefault();
                this.moveFocus('left', focusedItem);
                break;

            case 'ArrowDown':
                e.preventDefault();
                this.moveFocus('down', focusedItem);
                break;

            case 'ArrowUp':
                e.preventDefault();
                this.moveFocus('up', focusedItem);
                break;

            case 'Home':
                e.preventDefault();
                this.moveFocus('home', focusedItem);
                break;

            case 'End':
                e.preventDefault();
                this.moveFocus('end', focusedItem);
                break;
        }
    }

    /**
     * Activate a grid item (same as clicking)
     */
    activateItem(item) {
        if (item.classList.contains('empty-item')) {
            grist.setCursorPos({ rowId: 'new' });
            this.selectedRecordId = null;
            this.updateSelection();
            item.classList.add('selected');
        } else {
            const recordId = parseInt(item.dataset.recordId);
            if (recordId) {
                this.selectRecord(recordId);
            }
        }
    }

    /**
     * Move focus with bounded spatial navigation
     */
    moveFocus(direction, currentItem) {
        const currentCell = currentItem.closest('td');
        if (!currentCell) return;

        switch (direction) {
            case 'right':
                this.moveToColumn(currentCell, 'right');
                break;
            case 'left':
                this.moveToColumn(currentCell, 'left');
                break;
            case 'down':
                this.moveWithinCellOrRow(currentItem, currentCell, 'down');
                break;
            case 'up':
                this.moveWithinCellOrRow(currentItem, currentCell, 'up');
                break;
            case 'home':
                const firstItem = document.querySelector('.cell-item');
                if (firstItem) firstItem.focus();
                break;
            case 'end':
                const allItems = document.querySelectorAll('.cell-item');
                const lastItem = allItems[allItems.length - 1];
                if (lastItem) lastItem.focus();
                break;
        }
    }

    /**
     * Move to adjacent column (bounded navigation)
     */
    moveToColumn(currentCell, direction) {
        const currentRow = currentCell.closest('tr');
        const cellIndex = Array.from(currentRow.cells).indexOf(currentCell);

        let targetCellIndex;
        if (direction === 'right') {
            targetCellIndex = cellIndex + 1;
        } else {
            targetCellIndex = cellIndex - 1;
        }

        // Check bounds - don't move if at edge
        if (targetCellIndex < 0 || targetCellIndex >= currentRow.cells.length) {
            return; // Bounded: no movement at grid edges
        }

        const targetCell = currentRow.cells[targetCellIndex];
        if (targetCell) {
            const targetItems = targetCell.querySelectorAll('.cell-item');
            if (targetItems.length > 0) {
                targetItems[0].focus();
            }
        }
    }

    /**
     * Move within cell items or to adjacent row (bounded)
     */
    moveWithinCellOrRow(currentItem, currentCell, direction) {
        const cellItems = Array.from(currentCell.querySelectorAll('.cell-item'));
        const currentIndexInCell = cellItems.indexOf(currentItem);

        if (direction === 'down') {
            if (currentIndexInCell < cellItems.length - 1) {
                // Move to next item within same cell
                cellItems[currentIndexInCell + 1].focus();
            } else {
                // Try to move to next row, same column
                this.moveToRow(currentCell, 'down');
            }
        } else { // direction === 'up'
            if (currentIndexInCell > 0) {
                // Move to previous item within same cell
                cellItems[currentIndexInCell - 1].focus();
            } else {
                // Try to move to previous row, same column
                this.moveToRow(currentCell, 'up');
            }
        }
    }

    /**
     * Move to adjacent row (bounded navigation)
     */
    moveToRow(currentCell, direction) {
        const currentRow = currentCell.closest('tr');
        const cellIndex = Array.from(currentRow.cells).indexOf(currentCell);

        let targetRow;
        if (direction === 'down') {
            targetRow = currentRow.nextElementSibling;
        } else {
            targetRow = currentRow.previousElementSibling;
        }

        // Check bounds - don't move if at edge
        if (!targetRow || !targetRow.cells[cellIndex]) {
            return; // Bounded: no movement at grid edges
        }

        const targetCell = targetRow.cells[cellIndex];
        const targetItems = targetCell.querySelectorAll('.cell-item');
        if (targetItems.length > 0) {
            const targetItem = direction === 'down' ? targetItems[0] : targetItems[targetItems.length - 1];
            targetItem.focus();
        }
    }

    /**
     * Find vertical neighbor based on table structure
     */
    findVerticalNeighbor(currentItem, allItems, direction) {
        const currentCell = currentItem.closest('td');
        if (!currentCell) return null;

        const currentRow = currentCell.closest('tr');
        const cellIndex = Array.from(currentRow.cells).indexOf(currentCell);

        let targetRow;
        if (direction === 'down') {
            targetRow = currentRow.nextElementSibling;
        } else {
            targetRow = currentRow.previousElementSibling;
        }

        if (targetRow && targetRow.cells[cellIndex]) {
            const targetCell = targetRow.cells[cellIndex];
            const targetItem = targetCell.querySelector('.cell-item');
            if (targetItem) {
                return allItems.indexOf(targetItem);
            }
        }

        return null;
    }

    /**
     * Setup Markdown configuration
     */
    setupMarkdown() {
        if (typeof marked !== 'undefined') {
            // Configure marked for safe rendering
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
     * Initialize Grist API connection with column mapping
     */
    initializeGrist() {
        // Initialize with column mapping for required and optional columns
        grist.ready({
            requiredAccess: 'read table',
            allowSelectBy: true,
            columns: [
                {
                    name: 'VerticalAxis',
                    title: 'Vertical Axis',
                    description: 'Column that determines the vertical axis (rows) of the grid',
                    optional: false
                },
                {
                    name: 'HorizontalAxis',
                    title: 'Horizontal Axis',
                    description: 'Column that determines the horizontal axis (columns) of the grid',
                    optional: false
                },
                {
                    name: 'Content',
                    title: 'Content',
                    description: 'Column that provides the cell content',
                    optional: false
                },
                {
                    name: 'VerticalOrder',
                    title: 'Vertical Order',
                    description: 'Optional: numeric column to control vertical axis ordering',
                    optional: true,
                    type: 'Numeric'
                },
                {
                    name: 'HorizontalOrder',
                    title: 'Horizontal Order',
                    description: 'Optional: numeric column to control horizontal axis ordering',
                    optional: true,
                    type: 'Numeric'
                },
                {
                    name: 'BackgroundColor',
                    title: 'Background Color',
                    description: 'Optional: column that provides background color for items (hex, rgb, or color names)',
                    optional: true
                }
            ]
        });

        // Listen for data changes with mapped columns
        grist.onRecords(async (records, mappings) => {
            const tableId = await grist.selectedTable.getTableId();
            this.records = records || [];
            this.mappings = mappings;
            this.choiceOptions = await this.getWidgetOptions(tableId, mappings.BackgroundColor);
            this.handleDataUpdate();
        });

        // Listen for cursor position changes (current record selection)
        grist.onRecord((record) => {
            if (record && record.id) {
                this.selectedRecordId = record.id;
                this.updateSelection();
            } else {
                this.selectedRecordId = null;
                this.updateSelection();
            }
        });

    }

    /**
     * Announce to screen readers
     */
    announceToScreenReader(message) {
        if (this.elements.status) {
            this.elements.status.textContent = message;
        }
    }

    /**
     * Handle data updates from Grist
     */
    handleDataUpdate() {
        this.updateGrid();
    }

    /**
     * Update the grid display
     */
    updateGrid() {
        // Hide loading state
        this.elements.loadingState.style.display = 'none';

        // Check if we have column mappings and required mappings
        if (!this.mappings || this.records.length === 0) {
            this.showEmptyState('No data available or mappings not configured.');
            return;
        }

        // Get mapped column names using Grist's mapping utility
        const mapped = grist.mapColumnNames(this.records[0] || {});
        if (!mapped || !this.hasRequiredMappings(mapped)) {
            this.showEmptyState('Column mappings are being configured...');
            return;
        }

        this.buildGrid();
    }

    /**
     * Check if all required column mappings are available
     */
    hasRequiredMappings(mapped) {
        return mapped.VerticalAxis !== undefined &&
            mapped.HorizontalAxis !== undefined &&
            mapped.Content !== undefined;
    }

    /**
     * Show empty state with custom message
     */
    showEmptyState(message = 'No data to display') {
        this.elements.emptyState.style.display = 'block';
        this.elements.gridTable.style.display = 'none';

        // Update the empty state message
        const messageElement = this.elements.emptyState.querySelector('.empty-state-message');
        if (messageElement) {
            messageElement.textContent = message;
        }

        // Announce to screen readers
        this.announceToScreenReader(message);
    }

    /**
     * Build the grid from data
     */
    buildGrid() {
        this.elements.emptyState.style.display = 'none';
        this.elements.gridTable.style.display = 'table';

        // Process data into grid structure
        const gridData = this.processDataForGrid();

        // Update caption with current data info
        this.updateCaption(gridData);

        // Build grid HTML
        this.renderGrid(gridData);

        // Announce grid is ready
        this.announceToScreenReader(`Grid loaded with ${gridData.rows.length} rows and ${gridData.columns.length} columns`);
    }

    /**
     * Update table caption with current data
     */
    updateCaption(gridData) {
        if (this.elements.gridCaption) {
            const totalItems = Array.from(gridData.cellData.values()).reduce((sum, items) => sum + items.length, 0);
            this.elements.gridCaption.textContent = `Interactive data grid with ${gridData.rows.length} rows, ${gridData.columns.length} columns, and ${totalItems} total items. Use Tab to navigate, Enter or Space to select.`;
        }
    }

    /**
     * Process records into grid structure using mapped columns
     */
    processDataForGrid() {
        // Collect row and column values with their ordering information
        const rowData = new Map(); // rowValue -> {order: number, value: string}
        const columnData = new Map(); // colValue -> {order: number, value: string}

        // Group records by grid position and store record IDs for linking
        const cellData = new Map(); // cellKey -> [{content: string, recordId: number}]

        this.records.forEach(record => {
            // Use Grist's column mapping to get the correct field values
            const mapped = grist.mapColumnNames(record);
            if (!mapped || !this.hasRequiredMappings(mapped)) {
                return;
            }

            const rowValue = this.getFieldValue(mapped.VerticalAxis);
            const colValue = this.getFieldValue(mapped.HorizontalAxis);
            const content = this.getFieldValue(mapped.Content);
            const backgroundColor = mapped.BackgroundColor ? this.getFieldValue(mapped.BackgroundColor) : null;

            // Skip records with missing row or column values (but allow empty content)
            if (rowValue == null || colValue == null || rowValue === '' || colValue === '') {
                return;
            }

            // Get ordering values (optional)
            const rowOrder = mapped.VerticalOrder != null ? Number(mapped.VerticalOrder) : null;
            const colOrder = mapped.HorizontalOrder != null ? Number(mapped.HorizontalOrder) : null;

            // Store row data with ordering
            if (!rowData.has(rowValue)) {
                rowData.set(rowValue, {
                    value: rowValue,
                    order: rowOrder
                });
            } else if (rowOrder != null && !isNaN(rowOrder)) {
                // Update order if we have a valid numeric order and none was set before
                const existing = rowData.get(rowValue);
                if (existing.order == null) {
                    existing.order = rowOrder;
                }
            }

            // Store column data with ordering
            if (!columnData.has(colValue)) {
                columnData.set(colValue, {
                    value: colValue,
                    order: colOrder
                });
            } else if (colOrder != null && !isNaN(colOrder)) {
                // Update order if we have a valid numeric order and none was set before
                const existing = columnData.get(colValue);
                if (existing.order == null) {
                    existing.order = colOrder;
                }
            }

            // Create cell key
            const cellKey = `${rowValue}|${colValue}`;

            if (!cellData.has(cellKey)) {
                cellData.set(cellKey, []);
            }

            // Store content with record ID for linking functionality
            cellData.get(cellKey).push({
                content: content || '',
                recordId: record.id,
                backgroundColor: backgroundColor
            });
        });

        // Sort rows and columns
        const sortedRows = this.sortDataWithOrder(Array.from(rowData.values()));
        const sortedColumns = this.sortDataWithOrder(Array.from(columnData.values()));

        return {
            rows: sortedRows.map(item => item.value),
            columns: sortedColumns.map(item => item.value),
            cellData: cellData
        };
    }

    /**
     * Sort data array considering optional order values
     */
    sortDataWithOrder(dataArray) {
        return dataArray.sort((a, b) => {
            // If both have order values, sort by order
            if (a.order != null && b.order != null && !isNaN(a.order) && !isNaN(b.order)) {
                return a.order - b.order;
            }
            // If only one has order, prioritize it
            if (a.order != null && !isNaN(a.order) && (b.order == null || isNaN(b.order))) {
                return -1;
            }
            if (b.order != null && !isNaN(b.order) && (a.order == null || isNaN(a.order))) {
                return 1;
            }
            // Otherwise sort alphabetically by value
            return String(a.value).localeCompare(String(b.value));
        });
    }

    /**
     * Get field value, handling different data types
     */
    getFieldValue(value) {
        // Handle null/undefined
        if (value == null) return null;

        // Handle reference fields (which might be objects)
        if (typeof value === 'object' && value.name) {
            return value.name;
        }

        // Handle arrays (reference lists)
        if (Array.isArray(value)) {
            return value.map(item =>
                typeof item === 'object' && item.name ? item.name : String(item)
            ).join(', ');
        }

        return String(value);
    }

    /**
     * Render the grid HTML
     */
    renderGrid(gridData) {
        const { rows, columns, cellData } = gridData;

        // Store cellData for later use in updateSelection
        this.cellDataCache = cellData;

        // Analyze column data types for alignment
        const columnAlignments = this.analyzeColumnAlignments(columns, cellData);

        // Build header
        this.elements.gridHeader.innerHTML = '';
        const headerRow = document.createElement('tr');

        // Empty top-left cell
        const emptyHeader = document.createElement('th');
        emptyHeader.textContent = '';
        emptyHeader.setAttribute('scope', 'col');
        headerRow.appendChild(emptyHeader);

        // Column headers
        columns.forEach((colValue, index) => {
            const th = document.createElement('th');
            th.textContent = colValue;
            th.setAttribute('scope', 'col');
            th.setAttribute('id', `col-header-${index}`);
            // Apply alignment to header based on content
            if (columnAlignments[index] === 'right') {
                th.style.textAlign = 'right';
            }
            headerRow.appendChild(th);
        });

        this.elements.gridHeader.appendChild(headerRow);

        // Build body
        this.elements.gridBody.innerHTML = '';

        rows.forEach((rowValue, rowIndex) => {
            const row = document.createElement('tr');

            // Row header
            const rowHeader = document.createElement('th');
            rowHeader.textContent = rowValue;
            rowHeader.setAttribute('scope', 'row');
            rowHeader.setAttribute('id', `row-header-${rowIndex}`);
            row.appendChild(rowHeader);

            // Data cells
            columns.forEach((colValue, colIndex) => {
                const cell = document.createElement('td');
                cell.className = 'grid-cell';
                cell.setAttribute('headers', `row-header-${rowIndex} col-header-${colIndex}`);

                // Apply column alignment
                if (columnAlignments[colIndex] === 'right') {
                    cell.style.textAlign = 'right';
                }

                const cellKey = `${rowValue}|${colValue}`;
                const cellItems = cellData.get(cellKey) || [];

                if (cellItems.length > 0) {
                    cell.classList.add('has-content');

                    // Add content container
                    const contentDiv = document.createElement('div');
                    contentDiv.className = 'cell-content';
                    contentDiv.setAttribute('role', 'group');
                    contentDiv.setAttribute('aria-label', `Cell content for ${rowValue}, ${colValue}`);

                    // Add hover handlers for default selection
                    contentDiv.addEventListener('mouseenter', () => {
                        // Add default hover to last item
                        const lastItem = contentDiv.querySelector('.cell-item:last-child');
                        if (lastItem) {
                            lastItem.classList.add('hover-default');
                        }
                    });

                    contentDiv.addEventListener('mouseleave', () => {
                        // Remove default hover from all items
                        const items = contentDiv.querySelectorAll('.cell-item');
                        items.forEach(item => item.classList.remove('hover-default'));
                    });

                    // Add click handler to content div for default selection (last item)
                    contentDiv.addEventListener('click', (e) => {
                        // Only handle clicks that are directly on the content div (empty space)
                        if (e.target === contentDiv) {
                            e.stopPropagation();
                            // Select the last item by default when clicking on empty space
                            const lastItem = cellItems[cellItems.length - 1];
                            if (lastItem) {
                                this.selectRecord(lastItem.recordId);
                            }
                        }
                    });

                    cellItems.forEach((item, index) => {
                        const itemDiv = document.createElement('div');
                        itemDiv.className = 'cell-item';
                        itemDiv.style.cursor = 'pointer';
                        itemDiv.dataset.recordId = item.recordId; // Store record ID for selection tracking

                        // Accessibility attributes
                        itemDiv.setAttribute('tabindex', '0');
                        itemDiv.setAttribute('role', 'button');

                        // Create descriptive label for screen readers
                        const contentText = item.content || 'empty';
                        const itemLabel = `${contentText}, row ${rowValue}, column ${colValue}. Press Enter or Space to select.`;
                        itemDiv.setAttribute('aria-label', itemLabel);

                        // If this is the selected record, mark it as pressed
                        if (this.selectedRecordId === item.recordId) {
                            itemDiv.setAttribute('aria-pressed', 'true');
                            itemDiv.classList.add('selected');
                            // Selection color overrides background color
                            itemDiv.style.backgroundColor = 'var(--grist-theme-selection-opaque-bg)';
                            itemDiv.style.color = 'var(--grist-theme-selection-opaque-fg)';
                        } else {
                            itemDiv.setAttribute('aria-pressed', 'false');
                            // Apply background color if provided (only when not selected)
                            if (item.backgroundColor) {
                                const sanitizedColor = this.sanitizeColor(item.backgroundColor);
                                if (sanitizedColor) {
                                    itemDiv.style.backgroundColor = sanitizedColor;
                                    // Adjust text color with Choice text color if given or for better contrast if needed
                                    const color = this.choiceOptions?.[item.backgroundColor]?.textColor;
                                    if (color) {
                                        itemDiv.style.color = color;
                                    } else if (this.isColorDark(sanitizedColor)) {
                                        itemDiv.style.color = 'white';
                                    } else {
                                        itemDiv.style.color = 'black';
                                    }
                                }
                            }
                        }

                        // Display content, showing placeholder for empty content
                        if (item.content === null || item.content === undefined || item.content === '') {
                            itemDiv.textContent = '—';
                            itemDiv.style.color = '#adb5bd';
                            itemDiv.style.fontStyle = 'italic';
                        } else {
                            // Render content as Markdown if it's a string
                            this.renderContent(itemDiv, item.content);
                        }

                        // Add hover handlers to remove default hover when hovering specific items
                        itemDiv.addEventListener('mouseenter', () => {
                            // Remove default hover from all items in this content
                            const items = contentDiv.querySelectorAll('.cell-item');
                            items.forEach(item => item.classList.remove('hover-default'));
                        });

                        // Add click handler for linking functionality
                        itemDiv.addEventListener('click', (e) => {
                            e.stopPropagation();
                            this.selectRecord(item.recordId);
                        });

                        // Add keyboard handler for item activation
                        itemDiv.addEventListener('keydown', (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                this.selectRecord(item.recordId);
                            }
                        });

                        contentDiv.appendChild(itemDiv);
                    });

                    cell.appendChild(contentDiv);
                } else {
                    // Empty cell - create same structure as filled cells
                    const contentDiv = document.createElement('div');
                    contentDiv.className = 'cell-content';
                    contentDiv.setAttribute('role', 'group');
                    contentDiv.setAttribute('aria-label', `Empty cell at row ${rowValue}, column ${colValue}`);

                    // Add hover handlers (same logic as filled cells)
                    contentDiv.addEventListener('mouseenter', () => {
                        const lastItem = contentDiv.querySelector('.cell-item:last-child');
                        if (lastItem) {
                            lastItem.classList.add('hover-default');
                        }
                    });

                    contentDiv.addEventListener('mouseleave', () => {
                        const items = contentDiv.querySelectorAll('.cell-item');
                        items.forEach(item => item.classList.remove('hover-default'));
                    });

                    // Create empty item for uniform structure
                    const emptyItem = document.createElement('div');
                    emptyItem.className = 'cell-item empty-item';
                    emptyItem.setAttribute('role', 'gridcell');
                    emptyItem.setAttribute('aria-label', `Empty cell at row ${rowValue}, column ${colValue}`);
                    emptyItem.setAttribute('tabindex', '0');
                    emptyItem.textContent = '';

                    // Add click handler for empty items
                    emptyItem.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.activateItem(emptyItem);
                    });

                    contentDiv.appendChild(emptyItem);
                    cell.appendChild(contentDiv);
                }

                row.appendChild(cell);
            });

            this.elements.gridBody.appendChild(row);
        });

        // Equalize cell heights after rendering
        this.equalizeRowHeights();
    }

    /**
     * Equalize cell heights within each row
     */
    equalizeRowHeights() {
        // Wait for DOM to be fully rendered
        requestAnimationFrame(() => {
            const rows = this.elements.gridBody.querySelectorAll('tr');

            rows.forEach(row => {
                // Get all data cells (not headers)
                const cells = row.querySelectorAll('td.grid-cell');
                if (cells.length === 0) return;

                // Reset heights for proper measurement
                cells.forEach(cell => {
                    const cellContent = cell.querySelector('.cell-content');
                    if (cellContent) {
                        cellContent.style.height = '';
                    }
                });

                // Force reflow to get natural heights
                row.offsetHeight;

                // Calculate maximum height for this row
                const maxHeight = Math.max(...Array.from(cells).map(cell => cell.offsetHeight));

                // Apply max height to all .cell-content elements
                cells.forEach(cell => {
                    const cellContent = cell.querySelector('.cell-content');
                    if (cellContent) {
                        cellContent.style.height = maxHeight + 'px';
                        // For empty cells, also set the empty-item to fill the height
                        const emptyItem = cellContent.querySelector('.cell-item.empty-item');
                        if (emptyItem) {
                            emptyItem.style.height = '100%';
                        }
                    }
                });
            });
        });
    }

    /**
     * Analyze column data types to determine alignment
     */
    analyzeColumnAlignments(columns, cellData) {
        const alignments = {};

        columns.forEach((colValue, colIndex) => {
            let numericCount = 0;
            let totalCount = 0;

            // Check all cells in this column
            cellData.forEach((cellItems, cellKey) => {
                const [rowValue, currentColValue] = cellKey.split('|');
                if (currentColValue === colValue) {
                    cellItems.forEach(item => {
                        if (item.content && item.content !== '') {
                            totalCount++;
                            // Check if content is numeric
                            const content = String(item.content).trim();
                            if (!isNaN(content) && !isNaN(parseFloat(content)) && content !== '') {
                                numericCount++;
                            }
                        }
                    });
                }
            });

            // If all non-empty content is numeric, align right
            alignments[colIndex] = (totalCount > 0 && numericCount === totalCount) ? 'right' : 'left';
        });

        return alignments;
    }

    /**
     * Render content as Markdown if it's a string, otherwise as plain text
     */
    renderContent(element, content) {
        const contentStr = String(content);

        // Check if marked library is available and content looks like it might contain Markdown
        if (typeof marked !== 'undefined' && this.looksLikeMarkdown(contentStr)) {
            try {
                // Parse and render as Markdown
                const htmlContent = marked.parse(contentStr);
                element.innerHTML = this.sanitizeHtml(htmlContent);
            } catch (error) {
                console.warn('Error parsing Markdown:', error);
                // Fallback to plain text
                element.textContent = contentStr;
            }
        } else {
            // Render as plain text
            element.textContent = contentStr;
        }
    }

    /**
     * Check if content looks like it might contain Markdown
     */
    looksLikeMarkdown(content) {
        // Simple heuristics to detect potential Markdown content
        const markdownIndicators = [
            /\*\*.*\*\*/, // Bold
            /\*.*\*/, // Italic
            /^#{1,6}\s/, // Headers
            /^\s*[-*+]\s/, // Lists
            /^\s*\d+\.\s/, // Numbered lists
            /`.*`/, // Inline code
            /\[.*\]\(.*\)/, // Links
            /^>\s/, // Blockquotes
        ];

        return markdownIndicators.some(pattern => pattern.test(content));
    }

    /**
     * Basic HTML sanitization to prevent XSS
     */
    sanitizeHtml(html) {
        // Create a temporary div to parse HTML
        const temp = document.createElement('div');
        temp.innerHTML = html;

        // Remove script tags and event handlers
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

    /**
     * Sanitize and validate color values
     */
    sanitizeColor(color) {
        if (!color || typeof color !== 'string') return null;

        if (this.choiceOptions) {
            return this.choiceOptions[color]?.fillColor;
        }

        const colorStr = color.trim().toLowerCase();

        // Check for hex colors
        if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(colorStr)) {
            return colorStr;
        }

        // Check for rgb/rgba colors
        if (/^rgb\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})\)$/i.test(colorStr) ||
            /^rgba\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3}),\s*(0?\.?\d+)\)$/i.test(colorStr)) {
            return colorStr;
        }

        // Check for named colors (basic set)
        const namedColors = [
            'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'brown',
            'black', 'white', 'gray', 'grey', 'cyan', 'magenta', 'lime', 'navy',
            'maroon', 'olive', 'teal', 'silver', 'gold', 'indigo', 'violet',
            'lightblue', 'lightgreen', 'lightgray', 'lightgrey', 'darkblue',
            'darkgreen', 'darkred', 'darkgray', 'darkgrey'
        ];

        if (namedColors.includes(colorStr)) {
            return colorStr;
        }

        return null; // Invalid color
    }

    /**
     * Determine if a color is dark (for contrast adjustment)
     */
    isColorDark(color) {
        // Convert color to RGB values for luminance calculation
        let r, g, b;

        if (color.startsWith('#')) {
            // Hex color
            const hex = color.slice(1);
            if (hex.length === 3) {
                r = parseInt(hex[0] + hex[0], 16);
                g = parseInt(hex[1] + hex[1], 16);
                b = parseInt(hex[2] + hex[2], 16);
            } else {
                r = parseInt(hex.slice(0, 2), 16);
                g = parseInt(hex.slice(2, 4), 16);
                b = parseInt(hex.slice(4, 6), 16);
            }
        } else if (color.startsWith('rgb')) {
            // RGB color
            const matches = color.match(/\d+/g);
            if (matches && matches.length >= 3) {
                r = parseInt(matches[0]);
                g = parseInt(matches[1]);
                b = parseInt(matches[2]);
            } else {
                return false; // Default to light if can't parse
            }
        } else {
            // Named colors - approximate luminance
            const darkColors = ['black', 'navy', 'maroon', 'darkblue', 'darkgreen', 'darkred', 'darkgray', 'darkgrey'];
            return darkColors.includes(color.toLowerCase());
        }

        // Calculate relative luminance
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance < 0.5;
    }

    /**
     * Select a record in Grist (linking functionality)
     */
    selectRecord(recordId) {
        try {
            // Update selected record state
            this.selectedRecordId = recordId;

            // Update visual selection in the grid
            this.updateSelection();

            // Announce selection to screen readers
            const itemData = this.findItemByRecordId(recordId.toString());
            if (itemData) {
                const content = itemData.content || 'empty item';
                this.announceToScreenReader(`Selected: ${content}`);
            }

            // Set cursor position in Grist
            grist.setCursorPos({ rowId: recordId });
        } catch (error) {
            console.warn('Could not select record:', error);
            this.announceToScreenReader('Selection failed');
        }
    }

    /**
     * Update visual selection in the grid
     */
    updateSelection() {
        // Remove selection from all items and restore their original colors
        const allItems = this.elements.gridTable.querySelectorAll('.cell-item');
        allItems.forEach(item => {
            item.classList.remove('selected');
            item.setAttribute('aria-pressed', 'false');

            // Reset styles to allow background color to show
            item.style.backgroundColor = '';
            item.style.color = '';

            // Reapply background color if the item has one
            const recordId = item.dataset.recordId;
            if (recordId) {
                const itemData = this.findItemByRecordId(recordId);
                if (itemData && itemData.backgroundColor) {
                    const sanitizedColor = this.sanitizeColor(itemData.backgroundColor);
                    if (sanitizedColor) {
                        item.style.backgroundColor = sanitizedColor;
                        const color = this.choiceOptions?.[itemData.backgroundColor]?.textColor;
                        if (color) {
                            item.style.color = color;
                        } else if (this.isColorDark(sanitizedColor)) {
                            item.style.color = 'white';
                        } else {
                            item.style.color = 'black';
                        }
                    }
                }
            }
        });

        // Add selection to the selected record
        if (this.selectedRecordId) {
            const selectedItems = this.elements.gridTable.querySelectorAll(`[data-record-id="${this.selectedRecordId}"]`);
            selectedItems.forEach(item => {
                item.classList.add('selected');
                item.setAttribute('aria-pressed', 'true');
                // Override with selection color (use Grist theme variable)
                item.style.backgroundColor = 'var(--grist-theme-selection-opaque-bg)';
                item.style.color = 'var(--grist-theme-selection-opaque-fg)';
            });
        }
    }

    /**
     * Find item data by record ID (helper for updateSelection)
     */
    findItemByRecordId(recordId) {
        if (!this.cellDataCache) return null;

        for (const cellItems of this.cellDataCache.values()) {
            const item = cellItems.find(item => item.recordId.toString() === recordId);
            if (item) return item;
        }
        return null;
    }

    /**
     * Get column metadata 
     */
    async getWidgetOptions(tableId, colId) {
        if (this.access !== "full") {
            console.warn("Please use the full access level to allow the widget tu use choices color");
            return null;
        }

        const tables = await grist.docApi.fetchTable('_grist_Tables');
        const columns = await grist.docApi.fetchTable('_grist_Tables_column');
        const tableRef = tables.id[tables.tableId.indexOf(tableId)];

        const colIndex = columns.parentId.map((id, i) => [id, i])
            .find(item => item[0] === tableRef && columns.colId[item[1]] == colId)?.[1];

        try {
            if (columns.type[colIndex] == "Choice")
                return JSON.parse(columns.widgetOptions[colIndex]).choiceOptions;
            else
                return null;
        } catch (err) {
            return null;
        }
    }

}

// Initialize the widget when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new GristGridWidget();
});
