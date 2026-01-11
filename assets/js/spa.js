function appData() {
    return {
        // App version - loaded from version.js
        appVersion: APP_VERSION,
        initialized: false,
        updateAvailable: false,
        updatingApp: false,
        
        // Navigation
        currentView: 'securities',
        previousView: null,
        lastKnownView: 'securities', // Track for back button
        backButtonHandlerSetup: false, // Flag to prevent double setup
        
        // Securities list
        securities: null, // Initialize as null to prevent Alpine x-for errors
        searchQuery: '',
        sortBy: 'symbol',
        sortDirection: 'asc', // 'asc' or 'desc'
        viewMode: 'cards',
        loading: false,
        error: null,
        hideInactive: false,
        
        // Groups/Tabs
        groups: [],
        selectedGroupId: null, // null = "All" tab
        groupsLoading: false,
        newGroupName: '', // For creating new groups
        
        // Add security
        showAddModal: false,
        newSecurity: { symbol: '', name: '', note: '', group_id: null },
        newGroupName: '',
        securitySearch: '',
        searchResults: [],
        addingLoading: false,
        addError: null,
        
        // Notes view
        currentSecurity: null,
        currentSecurityId: null,
        currentSecurityGroupId: null,
        currentUserSecurityId: null,
        securityActiveStatus: 1, // Separate property for active status
        securityDetailsLoading: false,
        notes: [],
        noteContent: '',
        noteLoading: false,
        noteError: null,
        editingNoteId: null,
        
        // Purchase info (flat for Alpine.js reactivity)
        firstPurchaseDate: null,
        firstPurchasePrice: null,
        firstQuantity: null,
        
        // Purchase info editing
        editingPurchase: false,
        purchaseEdit: { date: '', price: '', quantity: '' },
        purchaseLoading: false,
        purchaseError: null,
        
        // Modals
        showDeleteModal: false,
        deleteNoteId: null,
        deleteLoading: false,
        showDeleteSecurityModal: false,
        deleteSecurityLoading: false,
        
        // Settings
        settingsTab: 'display',
        
        // Export/Import
        exportLoading: false,
        exportSuccess: false,
        exportError: null,
        exportIncludeSettings: false,
        importJsonLoading: false,
        importJsonSuccess: false,
        
        // Sync status message
        syncStatusMessage: null,
        importJsonError: null,
        importJsonMessage: '',
        importJsonProgress: 0,
        importJsonPreview: null,
        importJsonFile: null,
        
        manageSecurities: [],
        manageLoading: false,
        selectedSecurities: [],
        selectedManageGroupId: null,
        bulkMoveTargetGroupId: '',
        showBulkDeleteModal: false,
        bulkDeleting: false,
        
        // PIN Management
        showPinSetupModal: false,
        showPinEntryModal: false,
        newPin: '',
        confirmPin: '',
        entryPin: '',
        pinSetupLoading: false,
        pinEntryLoading: false,
        pinSetupError: null,
        pinEntryError: null,
        currentPinChange: '',
        newPinChange: '',
        confirmPinChange: '',
        changePinLoading: false,
        changePinError: null,
        changePinSuccess: null,
        removePinCurrent: '',
        removePinLoading: false,
        removePinError: null,
        removePinSuccess: null,
        userHasPin: false,
        pinAttempts: 0,
        maxPinAttempts: 3,
        
        // Stock Data Import
        stockDataImporting: false,
        stockImportProgress: 0,
        stockImportSummary: null,
        
        // App Logs
        appLogs: [],
        logsLoading: false,
        stockImportMessage: '',
        stockDataCount: 0,
        stockDataDate: null,
        showStockDataInfo: false,
        
        // CSV Import
        csvImporting: false,
        csvImportProgress: 0,
        csvImportMessage: '',
        csvImportPreview: [],
        csvBrokerFormat: 'schwab',
        csvImportGroupId: '',
        csvSkipExisting: true,
        csvImportError: null,
        showImportInfo: false,
        pdfStatementDate: null,
        useStatementDatePrice: false,
        
        // Sync
        syncConnected: false,
        syncing: false,
        lastSyncTime: null,
        pendingOperations: 0,
        runlogCount: 0, // Total operations in cloud runlog
        cloudProvider: null,
        syncCheckInterval: null,
        syncCheckMinutes: 15, // User-configurable: how often to check for remote updates
        
        // Helper function to format currency with commas
        formatCurrency(value, decimals = 2) {
            const num = parseFloat(value);
            if (isNaN(num)) return '$' + '0.'.padEnd(decimals + 2, '0');
            
            // Format with specified decimals
            let fixed = num.toFixed(decimals);
            
            // If 4 decimals requested and last 2 digits are 00, trim to 2 decimals
            if (decimals === 4 && fixed.endsWith('00')) {
                fixed = num.toFixed(2);
            }
            
            // Split into integer and decimal parts
            const parts = fixed.split('.');
            
            // Add commas to integer part only
            parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
            
            return '$' + parts.join('.');
        },
        
        async init() {
            if (this.initialized) {
                console.log('=== INIT SKIPPED (already initialized) ===');
                return;
            }
            this.initialized = true;
            console.log('=== INIT / REFRESH ===');
            
            // Load sync check interval preference
            const savedInterval = localStorage.getItem('sync_check_minutes');
            if (savedInterval) {
                this.syncCheckMinutes = parseInt(savedInterval, 10);
            }
            
            // Initialize IndexedDB and operation log
            try {
                await initDB();
                await initOperationLog();
                console.log('Database initialized');
            } catch (error) {
                console.error('Failed to initialize database:', error);
                this.error = 'Failed to initialize local storage';
                return;
            }
            
            // Check for local PIN
            try {
                const hasPinSetting = await db.settings.get('has_pin');
                this.userHasPin = hasPinSetting ? hasPinSetting.value : false;
                
                if (this.userHasPin) {
                    // Show PIN entry modal
                    this.showPinEntryModal = true;
                    console.log('PIN required - showing entry modal');
                    return; // Don't load app until PIN is verified
                }
            } catch (error) {
                console.error('Failed to check PIN status:', error);
            }
            
            // Check for app updates
            this.checkForUpdates();
            
            // Check for OAuth callback (before checking sync status)
            await this.handleOAuthCallback();
            
            // Check stock data status
            await this.checkStockDataStatus();
            
            // Check sync status
            await this.checkSyncStatus();
            
            // Auto-sync on app load (if connected and not just finished OAuth callback)
            if (this.syncConnected && !window.location.search.includes('code=')) {
                console.log('[Sync] Auto-syncing on app load...');
                try {
                    await this.manualSync();
                } catch (error) {
                    console.warn('[Sync] Auto-sync on load failed:', error);
                    // Don't block app startup if sync fails
                }
            }
            
            // Start directly at securities view (no authentication needed)
            console.log('Starting app, view = securities');
            this.currentView = 'securities';
            this.lastKnownView = 'securities';
            await this.loadUserSettings();
            await this.loadGroups();
            await this.loadSecurities();
            
            console.log('Setting up back button handler');
            // Set up browser back button handling - defer until first user interaction
            if (!this.backButtonHandlerSetup) {
                console.log('Waiting for first user interaction before setting up history');
                
                // Set up event listeners immediately (they don't need user activation)
                this.setupBackButtonHandler();
                
                // Wait for first user interaction to set up history manipulation
                const setupHistory = () => {
                    if (this.historySetup) return; // Already done
                    
                    console.log('First user interaction - setting up history control');
                    console.log('Current history.length:', history.length);
                    
                    // If history length > 2, we might be coming back from OAuth or other navigation
                    // In that case, just replace the current entry and push one new one
                    if (history.length > 2) {
                        console.log('Deep history detected (likely OAuth return) - replacing current entry');
                        history.replaceState({ view: this.currentView, isAppEntry: true, isEntry: false }, '', '#');
                    } else {
                        // Fresh load - set up the entry point and app state
                        history.replaceState({ view: 'entry', isAppEntry: true, isEntry: true }, '', '#');
                        history.pushState({ view: this.currentView, isAppEntry: true, isEntry: false }, '', '#');
                    }
                    
                    console.log('History entries set up, view:', this.currentView);
                    console.log('history.length after setup:', history.length);
                    
                    this.historySetup = true;
                    
                    // Remove the listeners after first interaction
                    document.removeEventListener('click', setupHistory, true);
                    document.removeEventListener('keydown', setupHistory, true);
                    document.removeEventListener('touchstart', setupHistory, true);
                };
                
                // Listen for any user interaction
                document.addEventListener('click', setupHistory, true);
                document.addEventListener('keydown', setupHistory, true);
                document.addEventListener('touchstart', setupHistory, true);
                
                this.backButtonHandlerSetup = true;
            } else {
                console.log('Back button handler already setup, skipping');
                console.log('Current view:', this.currentView);
            }
        },
        
        setupBackButtonHandler() {
            console.log('Setting up back button event listeners');
            
            let isHandlingPopstate = false;
            let skipBeforeUnload = false; // Flag to prevent double prompt
            
            // Handle navigation WITHIN the app (popstate for same-page navigation)
            window.addEventListener('popstate', (event) => {
                console.log('!!! POPSTATE FIRED !!!');
                console.log('event.state:', event.state);
                console.log('history.length:', history.length);
                
                if (isHandlingPopstate) {
                    console.log('=== IGNORING DUPLICATE ===');
                    return;
                }
                isHandlingPopstate = true;
                
                // If we hit the entry point or any non-app entry, user is trying to leave
                if (!event.state || !event.state.isAppEntry || event.state.isEntry) {
                    console.log('=== ATTEMPTING TO LEAVE APP ===');
                    event.preventDefault?.();
                    event.stopPropagation?.();
                    
                    // Push forward to block navigation
                    history.pushState({ view: this.lastKnownView || 'securities', isAppEntry: true, isEntry: false }, '', '#');
                    
                    if (confirm('Are you sure you want to exit TickerNotes? Changes might not be saved.')) {
                        console.log('-> User confirmed exit');
                        // Set flag to skip beforeunload prompt
                        skipBeforeUnload = true;
                        // Allow them to leave - go back past our entry point
                        history.go(-2);
                    } else {
                        console.log('-> User cancelled exit, staying in app');
                    }
                    
                    setTimeout(() => { isHandlingPopstate = false; }, 100);
                    return;
                }
                
                // Within app navigation
                const pageBeforeBack = this.lastKnownView;
                
                // If on a subpage (edit, add, view, settings), go back to securities WITHOUT confirmation
                if (['edit-security', 'add-security', 'view-security', 'notes', 'settings'].includes(pageBeforeBack)) {
                    console.log('-> Detected subpage, going to securities (no prompt)');
                    // Update view directly
                    this.previousView = this.currentView;
                    this.currentView = 'securities';
                    this.lastKnownView = 'securities';
                    this.loadSecurities();
                    
                    // Replace the current history state to mark it as securities
                    // This prevents accumulating multiple entries in the history stack
                    history.replaceState({ view: 'securities', isAppEntry: true, isEntry: false }, '', '');
                    
                    // Reset flag after a brief delay
                    setTimeout(() => { isHandlingPopstate = false; }, 100);
                    return;
                }
                
                // If we get here, we're navigating within the app normally (e.g. securities to securities)
                // Just allow it without any prompt
                console.log('-> Normal back navigation within app, no action needed');
                setTimeout(() => { isHandlingPopstate = false; }, 100);
            });
            
            // Handle navigation AWAY from the app (beforeunload for leaving the page entirely)
            window.addEventListener('beforeunload', (event) => {
                // Skip if we already confirmed via back button
                if (skipBeforeUnload) {
                    console.log('Skipping beforeunload prompt - already confirmed');
                    return;
                }
                
                // Check for unsaved edits
                const hasUnsavedNote = this.editingNoteId !== null || (this.noteContent && this.noteContent.trim().length > 0);
                const hasUnsavedSecurity = this.showAddModal && (this.newSecurity.symbol || this.newSecurity.name || this.newSecurity.note);
                const hasUnsavedPurchase = this.editingPurchase;
                
                // Warn if editing something
                if (hasUnsavedNote || hasUnsavedSecurity || hasUnsavedPurchase) {
                    const message = 'You have unsaved changes. Are you sure you want to leave?';
                    event.preventDefault();
                    event.returnValue = message;
                    return message;
                }
                
                // Warn if there are unsynced operations (and sync is enabled)
                if (this.syncConnected && this.pendingOperations > 0) {
                    const message = `You have ${this.pendingOperations} unsynced change(s). Are you sure you want to leave?`;
                    event.preventDefault(); // Standard way
                    event.returnValue = message; // Chrome requires this
                    return message; // Some browsers use this
                }
                
                // Otherwise, let them leave without warning
            });
        },
        
        async navigateTo(view, data = null) {
            console.log('=== NAVIGATING ===');
            console.log('From:', this.currentView);
            console.log('To:', view);
            
            // Track previous view before changing
            this.previousView = this.currentView;
            
            // Update last known view for back button handling
            this.lastKnownView = view;
            console.log('Updated lastKnownView to:', this.lastKnownView);
            
            // Reload stock data stats when navigating to settings
            if (view === 'settings') {
                await this.checkStockDataStatus();
            }
            
            if (view === 'securities') {
                // If coming from a subpage, just use history.back() instead of manipulating history
                // This actually removes the history entry
                const isFromSubpage = ['edit-security', 'add-security', 'view-security', 'notes', 'settings'].includes(this.previousView);
                if (isFromSubpage) {
                    console.log('Returning from subpage - using history.back()');
                    // Update view immediately so UI changes while history navigates
                    this.currentView = view;
                    this.loadSecurities();
                    // Use history.back() to actually remove the subpage from history
                    history.back();
                    return; // Don't push new state
                }
                
                // Normal navigation - push new state
                this.currentView = view;
                this.loadSecurities();
                history.pushState({ view: 'securities', isAppEntry: true }, '', '');
            } else if (view === 'notes' && data) {
                this.currentSecurityId = data.id;
                this.currentUserSecurityId = data.user_security_id;
                await this.loadSecurityDetails(); // Wait for this to complete
                this.currentView = view; // THEN switch view
                this.loadNotes();
                // Push state for history
                history.pushState({ view: 'notes', securityId: data.id, userSecurityId: data.user_security_id, isAppEntry: true }, '', '');
            } else if (view === 'settings') {
                this.currentView = view;
                this.settingsTab = 'display';
                this.loadManageSecurities();
                this.loadStockDataStats();
                // Push state for history
                history.pushState({ view: 'settings', isAppEntry: true }, '', '');
            } else {
                this.currentView = view;
                // Push state for history
                history.pushState({ view: view, isAppEntry: true }, '', '');
            }
        },
        
        async loadSecurityDetails() {
            this.securityDetailsLoading = true;
            try {
                // Use user_security_id if available, otherwise fall back to security_id
                const id = this.currentUserSecurityId || this.currentSecurityId;
                const security = await db.securities.get(id);
                
                if (!security) {
                    throw new Error('Security not found');
                }
                
                // Create a NEW plain object with all properties BEFORE Alpine wraps it
                const securityData = {
                    id: security.id,
                    symbol: security.symbol,
                    name: security.name,
                    created_at: security.created_at,
                    updated_at: security.updated_at,
                    sector: security.sector,
                    industry: security.industry,
                    exchange: security.exchange,
                    last_sale: security.last_sale,
                    net_change: security.net_change,
                    pct_change: security.pct_change,
                    volume: security.volume,
                    market_cap: security.market_cap,
                    country: security.country,
                    ipo_year: security.ipo_year,
                    note_count: security.note_count,
                    is_active: security.is_active,
                    first_purchase_date: security.first_purchase_date,
                    first_purchase_price: security.first_purchase_price,
                    first_quantity: security.first_quantity
                };
                
                this.currentSecurity = securityData;
                this.securityActiveStatus = security.is_active;
                
                // Set purchase info at root level for Alpine reactivity
                this.firstPurchaseDate = security.first_purchase_date;
                this.firstPurchasePrice = security.first_purchase_price;
                this.firstQuantity = security.first_quantity;
                this.currentSecurityGroupId = security.group_id || null;
                this.currentUserSecurityId = security.id;
                
                // Initialize purchase edit form
                this.purchaseEdit = {
                    date: security.first_purchase_date || '',
                    price: security.first_purchase_price || '',
                    quantity: security.first_quantity || ''
                };
                this.editingPurchase = false;
            } catch (error) {
                console.error('Error loading security details:', error);
            } finally {
                this.securityDetailsLoading = false;
            }
        },
        
        async viewNotes(security) {
            await this.navigateTo('notes', security);
        },
        
        async loadUserSettings() {
            try {
                const viewModeSetting = await db.settings.get('view_mode');
                if (viewModeSetting && viewModeSetting.value) {
                    this.viewMode = viewModeSetting.value;
                }
            } catch (error) {
                console.error('Failed to load user settings:', error);
            }
        },
        
        // --- Groups Management ---
        async loadGroups() {
            this.groupsLoading = true;
            try {
                this.groups = await db.groups.getAll() || [];
                console.log('Loaded groups:', this.groups.length, this.groups);
            } catch (error) {
                console.error('Failed to load groups:', error);
                this.groups = [];
            } finally {
                this.groupsLoading = false;
            }
        },
        
        async createGroup(name) {
            try {
                // Check for duplicate group name
                const existingGroup = this.groups.find(g => g.name.trim().toLowerCase() === name.trim().toLowerCase());
                if (existingGroup) {
                    console.warn(`Group with name "${name}" already exists`);
                    alert(`A group named "${name}" already exists. Please choose a different name.`);
                    return null;
                }
                
                const newGroup = {
                    id: `group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    name: name,
                    display_order: this.groups.length,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };
                
                await db.groups.put(newGroup);
                await recordOperation('group_create', { group_id: newGroup.id, data: newGroup }, this);
                
                this.groups.push(newGroup);
                await new Promise(resolve => setTimeout(resolve, 50));
                await this.updatePendingOperations();
                return newGroup;
            } catch (error) {
                console.error('Failed to create group:', error);
            }
            return null;
        },
        
        getGroupName(groupId) {
            const group = this.groups.find(g => g.id === groupId);
            return group ? group.name : '';
        },
        
        getGroupColor(groupId) {
            if (!groupId) return '';
            // Generate consistent color based on group ID
            const colors = [
                '#6f42c1', '#d63384', '#dc3545', '#fd7e14', 
                '#20c997', '#0dcaf0', '#0d6efd', '#198754'
            ];
            // Simple hash function for consistent color assignment
            let hash = 0;
            for (let i = 0; i < groupId.length; i++) {
                hash = groupId.charCodeAt(i) + ((hash << 5) - hash);
            }
            return colors[Math.abs(hash) % colors.length];
        },
        
        isShowingAllGroups() {
            return this.selectedGroupId === null;
        },
        
        async deleteGroup(groupId) {
            if (!confirm('Delete this group? Securities in this group will be moved to NO GROUP.')) {
                return;
            }
            
            try {
                // First, move all securities in this group to NO GROUP
                const securitiesInGroup = await db.securities
                    .where('group_id')
                    .equals(groupId)
                    .toArray();
                
                console.log(`[Delete Group] Moving ${securitiesInGroup.length} securities to NO GROUP`);
                
                for (const security of securitiesInGroup) {
                    security.group_id = null;
                    security.updated_at = new Date().toISOString();
                    await db.securities.put(security);
                    // Record operation to move security to NO GROUP
                    await recordOperation('update_security_group', { 
                        security_id: security.id, 
                        group_id: null 
                    }, this);
                }
                
                // Now delete the group
                await db.groups.delete(groupId);
                await recordOperation('delete_group', { id: groupId }, this);
                
                this.groups = this.groups.filter(g => g.id !== groupId);
                if (this.selectedGroupId === groupId) {
                    this.selectedGroupId = null;
                }
                await this.loadSecurities();
                await new Promise(resolve => setTimeout(resolve, 50));
                await this.updatePendingOperations();
            } catch (error) {
                console.error('Failed to delete group:', error);
            }
        },
        
        async renameGroup(groupId, newName) {
            try {
                const group = this.groups.find(g => g.id === groupId);
                if (group) {
                    group.name = newName;
                    group.updated_at = new Date().toISOString();
                    await db.groups.put(group);
                    await recordOperation('update_group', { id: groupId, name: newName }, this);
                    await new Promise(resolve => setTimeout(resolve, 50));
                    await this.updatePendingOperations();
                }
            } catch (error) {
                console.error('Failed to rename group:', error);
            }
        },
        
        selectGroup(groupId) {
            this.selectedGroupId = groupId;
        },
        
        get filteredSecurities() {
            if (!this.securities) {
                return [];
            }
            if (this.selectedGroupId === null) {
                return this.securities;
            }
            if (this.selectedGroupId === 'no-group') {
                return this.securities.filter(s => !s.group_id);
            }
            return this.securities.filter(s => s.group_id === this.selectedGroupId);
        },
        
        get filteredManageSecurities() {
            if (!this.manageSecurities) {
                return [];
            }
            if (this.selectedManageGroupId === null) {
                return this.manageSecurities;
            }
            if (this.selectedManageGroupId === 'no-group') {
                return this.manageSecurities.filter(s => !s.group_id);
            }
            return this.manageSecurities.filter(s => s.group_id === this.selectedManageGroupId);
        },
        
        async loadSecurities() {
            this.loading = true;
            this.error = null;
            
            try {
                let allSecurities = await db.securities.getAll() || [];
                
                // Check for orphaned notes and log them
                const allNotes = await db.notes.getAll();
                if (allNotes.length > 0) {
                    const securityIds = new Set(allSecurities.map(s => s.id));
                    const orphanedNotes = allNotes.filter(n => !securityIds.has(n.security_id));
                    
                    if (orphanedNotes.length > 0) {
                        await appLog('warn', `Found ${orphanedNotes.length} orphaned notes (notes pointing to deleted securities)`, {
                            count: orphanedNotes.length,
                            note_ids: orphanedNotes.map(n => n.id)
                        });
                    }
                }
                
                // Enrich each security with its most recent note
                for (const security of allSecurities) {
                    const notes = await db.notes.getByIndex('security_id', security.id);
                    if (notes && notes.length > 0) {
                        // Get the most recent note (sorted by updated_at)
                        const sortedNotes = notes.sort((a, b) => 
                            new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)
                        );
                        const lastNote = sortedNotes[0];
                        security.last_note = lastNote.content;
                        security.last_note_updated = lastNote.updated_at || lastNote.created_at;
                    } else {
                        security.last_note = null;
                        security.last_note_updated = null;
                    }
                }
                
                // Apply search filter
                if (this.searchQuery) {
                    const query = this.searchQuery.toLowerCase();
                    allSecurities = allSecurities.filter(s => 
                        s.symbol.toLowerCase().includes(query) ||
                        (s.name && s.name.toLowerCase().includes(query))
                    );
                }
                
                // Apply inactive filter
                if (this.hideInactive) {
                    allSecurities = allSecurities.filter(s => s.is_active !== 0);
                }
                
                // Filter out any securities with invalid IDs
                this.securities = allSecurities.filter(s => s && s.id !== null && s.id !== undefined);
                this.sortSecurities();
            } catch (error) {
                this.error = error.message;
                console.error('Error loading securities:', error);
            } finally {
                this.loading = false;
            }
        },
        
        sortSecurities() {
            if (!this.securities || !Array.isArray(this.securities)) {
                return;
            }
            
            const direction = this.sortDirection === 'asc' ? 1 : -1;
            
            // Always sort by is_active first (active=1 before inactive=0), then by chosen sort
            this.securities.sort((a, b) => {
                // Primary sort: active status (active first)
                const activeA = a.is_active ?? 1;
                const activeB = b.is_active ?? 1;
                if (activeA !== activeB) {
                    return activeB - activeA; // 1 comes before 0
                }
                
                let result = 0;
                
                // Secondary sort: by chosen sort option
                if (this.sortBy === 'symbol') {
                    result = a.symbol.localeCompare(b.symbol);
                } else if (this.sortBy === 'watchList') {
                    // Sort watch list items (no purchase info) first, then owned items
                    const isWatchA = !a.first_purchase_price ? 1 : 0;
                    const isWatchB = !b.first_purchase_price ? 1 : 0;
                    if (isWatchA !== isWatchB) {
                        result = isWatchB - isWatchA; // Watch items first or last based on direction
                    } else {
                        // Within same category, sort by symbol
                        result = a.symbol.localeCompare(b.symbol);
                    }
                } else if (this.sortBy === 'updated') {
                    const dateA = new Date(a.last_note_updated);
                    const dateB = new Date(b.last_note_updated);
                    result = dateB - dateA;
                } else if (this.sortBy === 'dailyChange') {
                    // Sort by net_change (daily price change)
                    const changeA = parseFloat(a.net_change) || 0;
                    const changeB = parseFloat(b.net_change) || 0;
                    result = changeB - changeA;
                } else if (this.sortBy === 'perShareGain') {
                    // Sort by gain/loss per share (last_sale - first_purchase_price)
                    const gainA = (a.last_sale && a.first_purchase_price) 
                        ? (parseFloat(a.last_sale) - parseFloat(a.first_purchase_price)) 
                        : -Infinity; // Put items without purchase data at the end
                    const gainB = (b.last_sale && b.first_purchase_price) 
                        ? (parseFloat(b.last_sale) - parseFloat(b.first_purchase_price)) 
                        : -Infinity;
                    result = gainB - gainA;
                } else if (this.sortBy === 'totalGain') {
                    // Sort by total gain/loss (per share × quantity)
                    const gainA = (a.last_sale && a.first_purchase_price && a.first_quantity) 
                        ? ((parseFloat(a.last_sale) - parseFloat(a.first_purchase_price)) * parseFloat(a.first_quantity))
                        : (a.last_sale && a.first_purchase_price)
                        ? (parseFloat(a.last_sale) - parseFloat(a.first_purchase_price))
                        : -Infinity; // Put items without purchase data at the end
                    const gainB = (b.last_sale && b.first_purchase_price && b.first_quantity) 
                        ? ((parseFloat(b.last_sale) - parseFloat(b.first_purchase_price)) * parseFloat(b.first_quantity))
                        : (b.last_sale && b.first_purchase_price)
                        ? (parseFloat(b.last_sale) - parseFloat(b.first_purchase_price))
                        : -Infinity;
                    result = gainB - gainA;
                }
                
                return result * direction;
            });
        },
        
        async setViewMode(mode) {
            this.viewMode = mode;
            
            try {
                await db.settings.put({ key: 'view_mode', value: mode });
            } catch (error) {
                console.error('Failed to save view mode:', error);
            }
        },
        
        async searchMasterSecurities() {
            if (!this.securitySearch || this.securitySearch.length < 1) {
                this.searchResults = [];
                return;
            }
            
            try {
                // Search local stock_data cache in IndexedDB
                const allStocks = await db.stock_data.getAll();
                const query = this.securitySearch.toUpperCase();
                
                // Filter stocks that match symbol or name
                this.searchResults = allStocks
                    .filter(stock => 
                        stock.symbol.toUpperCase().includes(query) ||
                        (stock.name && stock.name.toUpperCase().includes(query))
                    )
                    .slice(0, 10); // Limit to 10 results
            } catch (error) {
                console.error('Failed to search securities:', error);
                // If no local data, just allow manual entry
                this.searchResults = [];
            }
        },
        
        selectMasterSecurity(security) {
            this.newSecurity.symbol = security.symbol;
            this.newSecurity.name = security.name;
            this.securitySearch = '';
            this.searchResults = [];
        },
        
        closeAddModal() {
            this.showAddModal = false;
            this.newSecurity = { 
                symbol: '', 
                name: '', 
                note: '',
                purchase_date: '',
                purchase_price: '',
                quantity: '',
                group_id: null
            };
            this.newGroupName = '';
            this.securitySearch = '';
            this.searchResults = [];
            this.addError = null;
        },
        
        async addSecurity() {
            if (!this.newSecurity.symbol || !this.newSecurity.name) {
                this.addError = 'Symbol and Name are required';
                return;
            }
            
            this.addingLoading = true;
            this.addError = null;
            
            try {
                // Create new group if needed
                if (this.newSecurity.group_id === 'new' && this.newGroupName) {
                    const newGroup = await this.createGroup(this.newGroupName);
                    if (newGroup) {
                        this.newSecurity.group_id = newGroup.id;
                    }
                }
                
                // Set group_id to null if it's empty string
                if (this.newSecurity.group_id === '' || this.newSecurity.group_id === 'new') {
                    this.newSecurity.group_id = null;
                }
                
                const newSecurity = {
                    id: `sec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    symbol: this.newSecurity.symbol,
                    name: this.newSecurity.name,
                    group_id: this.newSecurity.group_id,
                    is_active: 1,
                    first_purchase_date: this.newSecurity.purchase_date || null,
                    first_purchase_price: this.newSecurity.purchase_price || null,
                    first_quantity: this.newSecurity.quantity || null,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };
                
                await db.securities.put(newSecurity);
                await recordOperation('add_security', newSecurity, this);
                
                // If there's an initial note, add it
                if (this.newSecurity.note && this.newSecurity.note.trim()) {
                    const newNote = {
                        id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        security_id: newSecurity.id,
                        content: this.newSecurity.note,
                        is_primary: 1,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    };
                    await db.notes.put(newNote);
                    await recordOperation('add_note', newNote, this);
                }
                
                await this.loadGroups();
                await this.loadSecurities();
                this.closeAddModal();
                await new Promise(resolve => setTimeout(resolve, 50));
                await this.updatePendingOperations();
            } catch (error) {
                this.addError = error.message;
            } finally {
                this.addingLoading = false;
            }
        },
        
        async loadNotes() {
            this.loading = true;
            this.error = null;
            
            try {
                const notes = await db.notes.getByIndex('security_id', this.currentSecurityId);
                // Sort by created_at descending (newest first)
                this.notes = notes.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            } catch (error) {
                this.error = error.message;
            } finally {
                this.loading = false;
            }
        },
        
        async saveNote() {
            if (!this.noteContent.trim()) {
                this.noteError = 'Please enter note content';
                return;
            }
            
            this.noteLoading = true;
            this.noteError = null;
            
            try {
                if (this.editingNoteId) {
                    // Update existing note
                    const note = await db.notes.get(this.editingNoteId);
                    if (note) {
                        note.content = this.noteContent;
                        note.updated_at = new Date().toISOString();
                        await db.notes.put(note);
                        await recordOperation('update_note', { id: note.id, content: note.content }, this);
                        await this.loadNotes(); // Refresh the notes display
                        // Wait a tick for IndexedDB transaction to commit
                        await new Promise(resolve => setTimeout(resolve, 50));
                        await this.updatePendingOperations(); // Update sync button
                    }
                } else {
                    // Create new note
                    const newNote = {
                        id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        security_id: this.currentSecurityId,
                        content: this.noteContent,
                        is_primary: 0,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    };
                    await db.notes.put(newNote);
                    await recordOperation('add_note', newNote, this);
                    // Wait a tick for IndexedDB transaction to commit
                    await new Promise(resolve => setTimeout(resolve, 50));
                    await this.updatePendingOperations(); // Update sync button
                }
                
                await this.loadNotes();
                this.noteContent = '';
                this.editingNoteId = null;
            } catch (error) {
                this.noteError = error.message;
            } finally {
                this.noteLoading = false;
            }
        },
        
        editNote(note) {
            this.editingNoteId = note.id;
            this.noteContent = note.content;
            this.noteError = null;
            window.scrollTo({ top: 0, behavior: 'smooth' });
        },
        
        cancelEdit() {
            this.editingNoteId = null;
            this.noteContent = '';
            this.noteError = null;
        },
        
        deleteNote(noteId) {
            this.deleteNoteId = noteId;
            this.showDeleteModal = true;
        },
        
        async confirmDeleteNote() {
            this.deleteLoading = true;
            
            try {
                await db.notes.delete(this.deleteNoteId);
                await recordOperation('delete_note', { id: this.deleteNoteId }, this);
                
                await this.loadNotes();
                this.showDeleteModal = false;
                this.deleteNoteId = null;
                
                // Wait a tick for IndexedDB transaction to commit
                await new Promise(resolve => setTimeout(resolve, 50));
                await this.updatePendingOperations(); // Update sync button
            } catch (error) {
                alert('Error: ' + error.message);
            } finally {
                this.deleteLoading = false;
            }
        },
        
        async togglePrimary(note) {
            try {
                const isPrimary = note.is_primary == 1;
                
                if (!isPrimary) {
                    // Setting this note as primary, unset all others for this security
                    const allNotes = await db.notes.getByIndex('security_id', this.currentSecurityId);
                    for (const n of allNotes) {
                        if (n.is_primary == 1) {
                            n.is_primary = 0;
                            n.updated_at = new Date().toISOString();
                            // Create clean copy to avoid DataCloneError
                            const cleanNote = { ...n };
                            await db.notes.put(cleanNote);
                        }
                    }
                }
                
                // Toggle this note
                note.is_primary = isPrimary ? 0 : 1;
                note.updated_at = new Date().toISOString();
                // Create clean copy to avoid DataCloneError
                const cleanNote = { ...note };
                await db.notes.put(cleanNote);
                await recordOperation('note_update', { note_id: note.id, data: { is_primary: note.is_primary } }, this);
                
                await this.loadNotes();
                await new Promise(resolve => setTimeout(resolve, 50));
                await this.updatePendingOperations();
            } catch (error) {
                alert('Error: ' + error.message);
            }
        },
        
        async savePurchaseInfo() {
            this.purchaseLoading = true;
            this.purchaseError = null;
            
            try {
                const security = await db.securities.get(this.currentSecurityId);
                if (security) {
                    security.first_purchase_date = this.purchaseEdit.date || null;
                    security.first_purchase_price = this.purchaseEdit.price || null;
                    security.first_quantity = this.purchaseEdit.quantity || null;
                    security.updated_at = new Date().toISOString();
                    
                    await db.securities.put(security);
                    await recordOperation('update_purchase', {
                        id: security.id,
                        first_purchase_date: security.first_purchase_date,
                        first_purchase_price: security.first_purchase_price,
                        first_quantity: security.first_quantity
                    }, this);
                    
                    // Reload security details to get updated values
                    await this.loadSecurityDetails();
                    this.editingPurchase = false;
                    
                    // Wait a tick for IndexedDB transaction to commit
                    await new Promise(resolve => setTimeout(resolve, 50));
                    await this.updatePendingOperations(); // Update sync button
                }
            } catch (error) {
                this.purchaseError = error.message;
            } finally {
                this.purchaseLoading = false;
            }
        },
        
        async updateSecurityGroup() {
            // Handle "new" selection - don't update yet, wait for create
            if (this.currentSecurityGroupId === 'new') {
                return;
            }
            
            if (!this.currentUserSecurityId) {
                console.error('currentUserSecurityId is undefined');
                alert('Error: Security not loaded properly. Please try refreshing the page.');
                return;
            }
            
            try {
                const security = await db.securities.get(this.currentUserSecurityId);
                if (security) {
                    security.group_id = this.currentSecurityGroupId || null;
                    security.updated_at = new Date().toISOString();
                    await db.securities.put(security);
                    await recordOperation('update_security_group', {
                        id: security.id,
                        group_id: security.group_id
                    }, this);
                    
                    // Reload securities list to reflect the change
                    await this.loadSecurities();
                    await new Promise(resolve => setTimeout(resolve, 50));
                    await this.updatePendingOperations();
                }
            } catch (error) {
                console.error('Failed to update group:', error);
                alert('Failed to update group: ' + error.message);
            }
        },
        
        async createGroupAndAssign() {
            if (!this.newGroupName || this.newGroupName.trim() === '') {
                return;
            }
            
            if (!this.currentUserSecurityId) {
                alert('Error: Security not loaded properly. Please try refreshing the page.');
                return;
            }
            
            try {
                // Create the group
                const newGroup = await this.createGroup(this.newGroupName);
                
                if (newGroup) {
                    // Assign the security to the new group
                    this.currentSecurityGroupId = newGroup.id;
                    
                    // Now update the security's group
                    const security = await db.securities.get(this.currentUserSecurityId);
                    if (security) {
                        security.group_id = newGroup.id;
                        security.updated_at = new Date().toISOString();
                        await db.securities.put(security);
                        await recordOperation('update_security_group', {
                            id: security.id,
                            group_id: newGroup.id
                        }, this);
                    }
                    
                    // Clear the input
                    this.newGroupName = '';
                    
                    // Reload securities list to reflect the change
                    await this.loadSecurities();
                }
            } catch (error) {
                console.error('Failed to create group and assign:', error);
                alert('Failed to create group: ' + error.message);
            }
        },
        
        confirmDeleteSecurity() {
            this.showDeleteSecurityModal = true;
        },
        
        async toggleSecurityActive() {
            try {
                const security = await db.securities.get(this.currentSecurityId);
                if (security) {
                    security.is_active = security.is_active === 1 ? 0 : 1;
                    security.updated_at = new Date().toISOString();
                    await db.securities.put(security);
                    await recordOperation('toggle_security_active', {
                        id: security.id,
                        is_active: security.is_active
                    }, this);
                    
                    // Reload security details to get fresh data
                    await this.loadSecurityDetails();
                    
                    // Refresh securities list
                    await this.loadSecurities();
                    await new Promise(resolve => setTimeout(resolve, 50));
                    await this.updatePendingOperations();
                }
            } catch (error) {
                alert('Error: ' + error.message);
            }
        },
        
        async deleteSecurity() {
            this.deleteSecurityLoading = true;
            
            try {
                // Delete the security
                await db.securities.delete(this.currentSecurityId);
                await recordOperation('delete_security', { id: this.currentSecurityId }, this);
                
                // Delete all associated notes
                const notes = await db.notes.getByIndex('security_id', this.currentSecurityId);
                for (const note of notes) {
                    await db.notes.delete(note.id);
                }
                
                // Check for empty groups and delete them
                const deletedGroups = [];
                for (const group of this.groups) {
                    const securitiesInGroup = await db.securities.getByIndex('group_id', group.id);
                    if (securitiesInGroup.length === 0) {
                        await db.groups.delete(group.id);
                        await recordOperation('delete_group', { id: group.id }, this);
                        deletedGroups.push(group.name);
                    }
                }
                
                // Close modal and reset state
                this.showDeleteSecurityModal = false;
                this.deleteSecurityLoading = false;
                
                // Show notification with auto-deleted groups info
                let message = 'Security deleted successfully';
                if (deletedGroups.length > 0) {
                    const groupNames = deletedGroups.join(', ');
                    message += `. Auto-deleted empty group(s): ${groupNames}`;
                    // Reload groups list
                    await this.loadGroups();
                }
                alert(message);
                
                // Navigate back to securities list
                this.navigateTo('securities');
                await new Promise(resolve => setTimeout(resolve, 50));
                await this.updatePendingOperations();
            } catch (error) {
                alert('Error: ' + error.message);
                this.deleteSecurityLoading = false;
                this.showDeleteSecurityModal = false;
            }
        },
        
        async loadManageSecurities() {
            this.manageLoading = true;
            console.log('Loading manage securities...');
            
            try {
                this.manageSecurities = await db.securities.getAll() || [];
                console.log('Loaded manage securities:', this.manageSecurities.length, this.manageSecurities);
            } catch (error) {
                console.error('Failed to load securities:', error);
            } finally {
                this.manageLoading = false;
            }
        },
        
        selectAllSecurities() {
            this.selectedSecurities = this.manageSecurities.map(s => s.id.toString());
        },
        
        selectAllManageSecurities() {
            this.selectedSecurities = this.filteredManageSecurities.map(s => s.id);
        },
        
        deselectAllSecurities() {
            this.selectedSecurities = [];
        },
        
        async bulkMoveToGroup() {
            if (this.selectedSecurities.length === 0) {
                alert('Please select securities to move');
                return;
            }
            
            if (this.bulkMoveTargetGroupId === '') {
                alert('Please select a target group');
                return;
            }
            
            const targetGroupId = this.bulkMoveTargetGroupId === 'null' ? null : this.bulkMoveTargetGroupId;
            const groupName = targetGroupId === null ? 'No Group' : this.groups.find(g => g.id === targetGroupId)?.name;
            
            if (!confirm(`Move ${this.selectedSecurities.length} selected securities to "${groupName}"?`)) {
                return;
            }
            
            try {
                let moved = 0;
                for (const secId of this.selectedSecurities) {
                    const security = await db.securities.get(secId);
                    if (security) {
                        security.group_id = targetGroupId;
                        security.updated_at = new Date().toISOString();
                        await db.securities.put(security);
                        await recordOperation('update_security_group', {
                            id: security.id,
                            group_id: targetGroupId
                        }, this);
                        moved++;
                    }
                }
                
                await this.loadManageSecurities();
                await this.loadSecurities();
                this.selectedSecurities = [];
                this.bulkMoveTargetGroupId = '';
                
                alert(`Successfully moved ${moved} securities to "${groupName}"`);
            } catch (error) {
                alert('Error: ' + error.message);
            }
        },
        
        bulkDeleteConfirm() {
            if (this.selectedSecurities.length === 0) return;
            this.showBulkDeleteModal = true;
        },
        
        async bulkDelete() {
            this.bulkDeleting = true;
            
            try {
                let deleted = 0;
                const affectedGroupIds = new Set();
                
                for (const secId of this.selectedSecurities) {
                    // Get the security to track which group it belonged to
                    const security = await db.securities.get(secId);
                    if (security && security.group_id) {
                        affectedGroupIds.add(security.group_id);
                    }
                    
                    // Delete security
                    await db.securities.delete(secId);
                    await recordOperation('delete_security', { id: secId }, this);
                    
                    // Delete associated notes
                    const notes = await db.notes.getByIndex('security_id', secId);
                    for (const note of notes) {
                        await db.notes.delete(note.id);
                    }
                    deleted++;
                }
                
                // Only check groups that had securities deleted from them
                // Don't auto-delete empty groups - user may want to keep them
                // (Removed automatic group deletion)
                
                // Close modal first to avoid showing undefined values
                this.showBulkDeleteModal = false;
                this.selectedSecurities = [];
                
                // Reload data
                await this.loadManageSecurities();
                await this.loadGroups();
                await new Promise(resolve => setTimeout(resolve, 50));
                await this.updatePendingOperations();
                
                // Show success message after modal is closed
                setTimeout(() => {
                    alert(`Successfully deleted ${deleted} securities`);
                }, 100);
            } catch (error) {
                alert('Error: ' + error.message);
            } finally {
                this.bulkDeleting = false;
            }
        },
        
        getSecurityById(id) {
            // Find security by id in the manage securities list
            return this.manageSecurities.find(s => s.id === id);
        },
        
        // Stock Data Import Methods
        async loadStockDataStats() {
            try {
                this.stockDataStats = await getStockDataStats();
            } catch (error) {
                console.error('Failed to load stock data stats:', error);
            }
        },
        
        async startStockImport() {
            // Check if update is needed (once per day limit)
            if (!needsUpdate()) {
                const lastImport = new Date(localStorage.getItem('stockDataLastImport'));
                const nextUpdate = new Date(lastImport.getTime() + 24 * 60 * 60 * 1000);
                const hoursRemaining = Math.ceil((nextUpdate - new Date()) / (1000 * 60 * 60));
                
                alert(`Stock data is up to date! Data is refreshed once daily from JNewman's GitHub repository.\n\nLast updated: ${formatRelativeTime(lastImport)}\nNext update available in: ${hoursRemaining} hour${hoursRemaining !== 1 ? 's' : ''}`);
                return;
            }
            
            if (!confirm('Import stock data from GitHub? This will download ~15MB of data and may take a few minutes.\n\nData is updated once daily from JNewman\'s repository.')) {
                return;
            }
            
            this.stockDataImporting = true;
            this.stockImportProgress = 0;
            this.stockImportMessage = 'Starting import...';
            
            try {
                const result = await importStockData((message, progress) => {
                    this.stockImportMessage = message;
                    this.stockImportProgress = progress;
                });
                
                if (result.success) {
                    await this.loadStockDataStats();
                    
                    console.log('Import result:', result);
                    console.log('Stock data stats:', this.stockDataStats);
                    
                    // Build detailed summary with sector breakdown
                    let summary = `<strong>Successfully imported ${result.imported.toLocaleString()} stocks!</strong>`;
                    if (result.skipped > 0) {
                        summary += `<br><span class="text-muted">Skipped ${result.skipped} invalid entries.</span>`;
                    }
                    
                    if (this.stockDataStats && this.stockDataStats.sectors && this.stockDataStats.sectors.length > 0) {
                        summary += '<br><br><strong>Top Sectors:</strong><ul class="mb-0 mt-2">';
                        this.stockDataStats.sectors.forEach(([sector, count]) => {
                            summary += `<li>${sector}: <strong>${count.toLocaleString()}</strong> stocks</li>`;
                        });
                        summary += '</ul>';
                    } else {
                        console.log('No sector stats available');
                    }
                    
                    this.stockImportSummary = summary;
                    
                    // Also update the display counts
                    await this.checkStockDataStatus();
                }
            } catch (error) {
                alert(`Import failed: ${error.message}`);
                console.error('Import error:', error);
            } finally {
                this.stockDataImporting = false;
                this.stockImportProgress = 0;
                this.stockImportMessage = '';
            }
        },
        
        formatDate(dateString) {
            if (!dateString) return '';
            const date = new Date(dateString);
            return date.toLocaleString();
        },
        
        formatRelativeTime(date) {
            if (!date) return 'Never';
            const targetDate = typeof date === 'string' ? new Date(date) : date;
            const now = new Date();
            const diffMs = now - targetDate;
            const diffSeconds = Math.floor(diffMs / 1000);
            const diffMinutes = Math.floor(diffSeconds / 60);
            const diffHours = Math.floor(diffMinutes / 60);
            const diffDays = Math.floor(diffHours / 24);
            const diffMonths = Math.floor(diffDays / 30);
            const diffYears = Math.floor(diffDays / 365);
            
            if (diffYears > 0) {
                return diffYears === 1 ? '1 year ago' : `${diffYears} years ago`;
            } else if (diffMonths > 0) {
                return diffMonths === 1 ? '1 month ago' : `${diffMonths} months ago`;
            } else if (diffDays > 0) {
                return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`;
            } else if (diffHours > 0) {
                return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
            } else if (diffMinutes > 0) {
                return diffMinutes === 1 ? '1 minute ago' : `${diffMinutes} minutes ago`;
            } else {
                return 'just now';
            }
        },
        
        // PIN Management Functions
        async setupPin() {
            this.pinSetupError = null;
            
            if (!this.newPin || !this.confirmPin) {
                this.pinSetupError = 'Please enter and confirm your PIN';
                return;
            }
            
            if (!/^\d{4,10}$/.test(this.newPin)) {
                this.pinSetupError = 'PIN must be 4-10 digits';
                return;
            }
            
            if (this.newPin !== this.confirmPin) {
                this.pinSetupError = 'PINs do not match';
                return;
            }
            
            this.pinSetupLoading = true;
            
            try {
                // Hash PIN with SHA-256 before storing
                const encoder = new TextEncoder();
                const data = encoder.encode(this.newPin);
                const hashBuffer = await crypto.subtle.digest('SHA-256', data);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const pinHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                
                // Store PIN hash locally
                await db.settings.put({ key: 'pin_hash', value: pinHash });
                await db.settings.put({ key: 'has_pin', value: true });
                
                this.showPinSetupModal = false;
                this.newPin = '';
                this.confirmPin = '';
                this.userHasPin = true;
                // Now load the app
                this.currentView = 'securities';
                await this.loadSecurities();
            } catch (error) {
                this.pinSetupError = 'Failed to set PIN';
                console.error('PIN setup error:', error);
            } finally {
                this.pinSetupLoading = false;
            }
        },
        
        async verifyPin() {
            this.pinEntryError = null;
            
            if (!this.entryPin) {
                this.pinEntryError = 'Please enter your PIN';
                return;
            }
            
            this.pinEntryLoading = true;
            
            try {
                // Hash entered PIN
                const encoder = new TextEncoder();
                const data = encoder.encode(this.entryPin);
                const hashBuffer = await crypto.subtle.digest('SHA-256', data);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const enteredHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                
                // Get stored PIN hash
                const storedPinSetting = await db.settings.get('pin_hash');
                const storedHash = storedPinSetting ? storedPinSetting.value : null;
                
                if (storedHash && enteredHash === storedHash) {
                    // PIN is correct
                    this.showPinEntryModal = false;
                    this.entryPin = '';
                    this.pinAttempts = 0;
                    // Now load the app
                    this.currentView = 'securities';
                    await this.loadSecurities();
                } else {
                    // PIN is incorrect
                    this.pinAttempts++;
                    this.entryPin = ''; // Clear the PIN field
                    if (this.pinAttempts >= this.maxPinAttempts) {
                        // Too many failed attempts - clear the app
                        this.pinEntryError = 'Too many failed attempts. Please refresh the page.';
                        // Could optionally clear data here for security
                    } else {
                        this.pinEntryError = `Incorrect PIN (${this.pinAttempts}/${this.maxPinAttempts} attempts)`;
                    }
                }
            } catch (error) {
                this.pinEntryError = 'Failed to verify PIN';
                console.error('PIN verify error:', error);
            } finally {
                this.pinEntryLoading = false;
            }
        },
        
        async changePin() {
            this.changePinError = null;
            this.changePinSuccess = null;
            
            // For users without a PIN, only require new PIN fields
            if (!this.userHasPin) {
                if (!this.newPinChange || !this.confirmPinChange) {
                    this.changePinError = 'Please fill in both PIN fields';
                    return;
                }
            } else {
                // For users with existing PIN, require all fields
                if (!this.currentPinChange || !this.newPinChange || !this.confirmPinChange) {
                    this.changePinError = 'Please fill in all fields';
                    return;
                }
            }
            
            if (!/^\d{4,10}$/.test(this.newPinChange)) {
                this.changePinError = 'PIN must be 4-10 digits';
                return;
            }
            
            if (this.newPinChange !== this.confirmPinChange) {
                this.changePinError = 'PINs do not match';
                return;
            }
            
            this.changePinLoading = true;
            
            try {
                // If user has existing PIN, verify it first
                if (this.userHasPin) {
                    const encoder = new TextEncoder();
                    const data = encoder.encode(this.currentPinChange);
                    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
                    const hashArray = Array.from(new Uint8Array(hashBuffer));
                    const currentHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                    
                    const storedPinSetting = await db.settings.get('pin_hash');
                    const storedHash = storedPinSetting ? storedPinSetting.value : null;
                    
                    if (!storedHash || currentHash !== storedHash) {
                        this.changePinError = 'Current PIN is incorrect';
                        this.changePinLoading = false;
                        return;
                    }
                }
                
                // Hash new PIN
                const encoder = new TextEncoder();
                const data = encoder.encode(this.newPinChange);
                const hashBuffer = await crypto.subtle.digest('SHA-256', data);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const newPinHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                
                // Store new PIN hash
                await db.settings.put({ key: 'pin_hash', value: newPinHash });
                await db.settings.put({ key: 'has_pin', value: true });
                
                this.changePinSuccess = this.userHasPin ? 'PIN changed successfully' : 'PIN set successfully';
                this.userHasPin = true;
                this.currentPinChange = '';
                this.newPinChange = '';
                this.confirmPinChange = '';
            } catch (error) {
                this.changePinError = 'Failed to set PIN';
                console.error('PIN change error:', error);
            } finally {
                this.changePinLoading = false;
            }
        },
        
        async removePin() {
            this.removePinError = null;
            this.removePinSuccess = null;
            
            if (!this.removePinCurrent) {
                this.removePinError = 'Current PIN is required';
                return;
            }
            
            if (!confirm('Are you sure you want to remove your PIN? This will reduce the security of your app on this device.')) {
                return;
            }
            
            this.removePinLoading = true;
            
            try {
                // Verify current PIN
                const encoder = new TextEncoder();
                const data = encoder.encode(this.removePinCurrent);
                const hashBuffer = await crypto.subtle.digest('SHA-256', data);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const currentHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                
                const storedPinSetting = await db.settings.get('pin_hash');
                const storedHash = storedPinSetting ? storedPinSetting.value : null;
                
                if (!storedHash || currentHash !== storedHash) {
                    this.removePinError = 'Current PIN is incorrect';
                    this.removePinLoading = false;
                    return;
                }
                
                // Remove PIN
                await db.settings.delete('pin_hash');
                await db.settings.put({ key: 'has_pin', value: false });
                
                this.removePinSuccess = 'PIN removed successfully';
                this.userHasPin = false;
                this.removePinCurrent = '';
            } catch (error) {
                this.removePinError = 'Failed to remove PIN';
                console.error('PIN remove error:', error);
            } finally {
                this.removePinLoading = false;
            }
        },

        // Check for service worker updates
        checkForUpdates() {
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.ready.then(registration => {
                    // Check for updates every 30 minutes
                    setInterval(() => {
                        registration.update();
                    }, 30 * 60 * 1000);

                    // Listen for updates
                    registration.addEventListener('updatefound', () => {
                        const newWorker = registration.installing;
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                // New service worker available
                                this.updateAvailable = true;
                                console.log('[App] Update available');
                            }
                        });
                    });

                    // Check immediately for updates
                    registration.update();
                });

                // Handle controller change (when new SW takes over)
                navigator.serviceWorker.addEventListener('controllerchange', () => {
                    if (!this.updatingApp) {
                        // Ensure tokens are in localStorage before reload
                        // (defensive coding - they should already be there)
                        const accessToken = localStorage.getItem('google_access_token');
                        const refreshToken = localStorage.getItem('google_refresh_token');
                        console.log('[SW] Controller change - preserving auth tokens:', !!accessToken, !!refreshToken);
                        
                        // Use regular reload (not hard refresh)
                        window.location.reload(false);
                    }
                });
            }
        },

        // Trigger app update
        async updateApp() {
            console.log('[App] updateApp called, updateAvailable:', this.updateAvailable);
            
            if (!this.updateAvailable) {
                // Force check for updates
                if ('serviceWorker' in navigator) {
                    this.updatingApp = true;
                    console.log('[App] Checking for updates...');
                    console.log('[App] Service worker controller:', !!navigator.serviceWorker.controller);
                    
                    try {
                        // Add timeout to ready promise
                        const registrationPromise = navigator.serviceWorker.ready;
                        const timeoutPromise = new Promise((_, reject) => 
                            setTimeout(() => reject(new Error('Service worker ready timeout')), 5000)
                        );
                        
                        const registration = await Promise.race([registrationPromise, timeoutPromise]);
                        console.log('[App] Registration ready:', registration);
                        console.log('[App] Active worker:', !!registration.active);
                        console.log('[App] Waiting worker:', !!registration.waiting);
                        console.log('[App] Installing worker:', !!registration.installing);
                        
                        await registration.update();
                        console.log('[App] Update called, waiting for changes...');
                        
                        // Check if there's a waiting worker after the update
                        setTimeout(() => {
                            console.log('[App] After timeout - waiting:', !!registration.waiting, 'installing:', !!registration.installing);
                            
                            if (registration.waiting || registration.installing) {
                                // New version found, activate it
                                console.log('[App] New version found!');
                                this.updateAvailable = true;
                                this.activateUpdate();
                            } else {
                                // No update available
                                console.log('[App] No update available');
                                this.updatingApp = false;
                                alert('You are already on the latest version!');
                            }
                        }, 2000);
                    } catch (error) {
                        console.error('[App] Update check failed:', error);
                        this.updatingApp = false;
                        alert('Update check failed: ' + error.message);
                    }
                } else {
                    console.log('[App] No service worker support, reloading');
                    // No service worker, just reload
                    window.location.reload();
                }
            } else {
                // Update is available, activate it
                console.log('[App] Update already available, activating');
                this.activateUpdate();
            }
        },

        // Activate the waiting service worker
        async activateUpdate() {
            console.log('[App] activateUpdate called');
            
            if ('serviceWorker' in navigator) {
                this.updatingApp = true;
                const registration = await navigator.serviceWorker.ready;
                
                console.log('[App] Has waiting worker:', !!registration.waiting);
                
                if (registration.waiting) {
                    // Verify auth tokens are in localStorage before updating
                    const accessToken = localStorage.getItem('google_access_token');
                    const refreshToken = localStorage.getItem('google_refresh_token');
                    console.log('[App] Auth tokens present before update:', !!accessToken, !!refreshToken);
                    
                    // Tell the waiting service worker to take over
                    console.log('[App] Sending SKIP_WAITING message');
                    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                } else {
                    // Just reload if no waiting worker (use soft reload, not hard refresh)
                    console.log('[App] No waiting worker, just reloading');
                    window.location.reload(false);
                }
            } else {
                console.log('[App] No service worker support, reloading');
                window.location.reload(false);
            }
        },
        
        // CSV Import Functions
        async handleCsvFileSelect(event) {
            const file = event.target.files[0];
            if (!file) return;
            
            this.csvImportError = null;
            this.csvImportPreview = [];
            
            try {
                const text = await file.text();
                const securities = this.parseCsvByBroker(text, this.csvBrokerFormat);
                
                if (securities.length === 0) {
                    this.csvImportError = 'No securities found in the CSV file. Please check the format.';
                    return;
                }
                
                this.csvImportPreview = securities;
            } catch (error) {
                console.error('CSV parse error:', error);
                this.csvImportError = `Error reading CSV: ${error.message}`;
            }
        },
        
        // PDF Import Functions
        async handlePdfFileSelect(event) {
            const file = event.target.files[0];
            if (!file) return;
            
            this.csvImportError = null;
            this.csvImportPreview = [];
            this.pdfStatementDate = null;
            
            try {
                this.csvImportMessage = 'Reading PDF file...';
                const text = await this.extractTextFromPdf(file);
                const result = await this.parseRobinhoodPdf(text);
                
                if (!result.securities || result.securities.length === 0) {
                    this.csvImportError = 'No securities found in the PDF file. Please check the format.';
                    return;
                }
                
                this.csvImportPreview = result.securities;
                this.pdfStatementDate = result.statementDate;
                this.csvImportMessage = null;
            } catch (error) {
                console.error('PDF parse error:', error);
                this.csvImportError = `Error reading PDF: ${error.message}`;
                this.csvImportMessage = null;
            }
        },
        
        async extractTextFromPdf(file) {
            if (typeof pdfjsLib === 'undefined') {
                throw new Error('PDF.js library not loaded');
            }
            
            // Convert file to array buffer
            const arrayBuffer = await file.arrayBuffer();
            
            // Load the PDF document
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            
            let fullText = '';
            
            // Extract text from all pages
            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                const page = await pdf.getPage(pageNum);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item.str).join(' ');
                fullText += pageText + '\\n';
            }
            
            return fullText;
        },
        
        async parseRobinhoodPdf(text) {
            const securities = [];
            
            // Clean and prepare text
            const cleanText = text.replace(/\s+/g, ' ').trim();
            
            console.log('=== PDF PARSING DEBUG ===');
            console.log('Total PDF Length:', cleanText.length);
            
            // Build name lookup map from both user securities AND stock data
            const securityMap = new Map();
            
            // First, load from stock_data (master database)
            try {
                const stockData = await db.stock_data.getAll();
                stockData.forEach(stock => {
                    securityMap.set(stock.symbol.toUpperCase(), stock.name);
                });
                console.log(`Loaded ${stockData.length} stocks from master database`);
            } catch (error) {
                console.log('Stock data not available:', error.message);
            }
            
            // Then, load user's existing securities (will override if they customized names)
            const existingSecurities = await db.securities.getAll();
            existingSecurities.forEach(sec => {
                securityMap.set(sec.symbol.toUpperCase(), sec.name);
            });
            console.log(`Total securities in lookup map: ${securityMap.size}`);
            
            // Try to extract statement date (usually near the beginning)
            // Pattern: "Statement Period: MM/DD/YYYY - MM/DD/YYYY" or "as of MM/DD/YYYY"
            let statementDate = null;
            const datePatterns = [
                /Statement Period:.*?(\d{1,2}\/\d{1,2}\/\d{4})\s*-\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
                /as of\s+(\d{1,2}\/\d{1,2}\/\d{4})/i,
                /(\d{1,2}\/\d{1,2}\/\d{4})/
            ];
            
            for (const pattern of datePatterns) {
                const match = cleanText.match(pattern);
                if (match) {
                    // Use end date if it's a range, otherwise use the single date
                    statementDate = match[2] || match[1];
                    console.log('Found statement date:', statementDate);
                    break;
                }
            }
            
            // Find the Portfolio Summary section (between "Portfolio Summary" and "Account Activity")
            const portfolioSummaryStart = cleanText.indexOf('Portfolio Summary');
            const accountActivityStart = cleanText.indexOf('Account Activity');
            
            if (portfolioSummaryStart === -1) {
                console.log('Could not find Portfolio Summary section');
                return { securities, statementDate };
            }
            
            const endIndex = accountActivityStart !== -1 ? accountActivityStart : cleanText.length;
            const searchText = cleanText.substring(portfolioSummaryStart, endIndex);
            console.log('Found Portfolio Summary section');
            console.log('Section length:', searchText.length);
            
            // Pattern: Company Name followed by ticker symbol, account type (like "Margin"), then quantity and price
            // Example: "Bank of America Estimated Yield: 1.92% BAC Margin 12.254155 $55.0000"
            // Look for: TICKER WORD NUMBER $NUMBER
            
            const securityPattern = /\b([A-Z]{2,5})\s+(?:Margin|Cash|[A-Za-z]+)\s+([\d.]+)\s+\$([\d,.]+)/g;
            let match;
            
            while ((match = securityPattern.exec(searchText)) !== null) {
                const symbol = match[1];
                const quantity = parseFloat(match[2]);
                const price = parseFloat(match[3].replace(/,/g, ''));
                
                // Skip common false positives
                const skipWords = ['SYM', 'CUSIP', 'ACCT', 'TYPE', 'QTY', 'PRICE', 'MKT', 'VALUE', 'EST', 'DIV', 'YIELD', 'PCT', 'TOTAL'];
                if (skipWords.includes(symbol)) continue;
                
                // Check if we have this security in our database
                let name;
                if (securityMap.has(symbol)) {
                    name = securityMap.get(symbol);
                    console.log(`✓ Using database name for ${symbol}: ${name}`);
                } else {
                    // Look backwards for company name (everything before the ticker in a reasonable range)
                    const contextStart = Math.max(0, match.index - 150);
                    const beforeContext = searchText.substring(contextStart, match.index);
                    
                    // Company name is usually the last capitalized phrase before the ticker
                    const nameMatch = beforeContext.match(/([A-Z][A-Za-z\s&.,'\-()]+?)(?:\s+Estimated Yield)?$/);
                    name = nameMatch ? nameMatch[1].trim() : symbol;
                }
                
                console.log(`Found security: ${symbol} (${name}) - Qty: ${quantity}, Price: $${price}`);
                
                securities.push({
                    symbol,
                    name,
                    quantity,
                    price,  // Store the price from the statement
                    purchase_price: null,
                    purchase_date: null
                });
            }
            
            console.log(`Found ${securities.length} securities in PDF`);
            if (securities.length > 0) {
                securities.forEach(s => console.log(`✓ ${s.symbol}: ${s.name} (${s.quantity} shares @ $${s.price})`));
            }
            
            return { securities, statementDate };
        },
        
        parseCsvByBroker(csvText, format) {
            switch (format) {
                case 'schwab':
                    return this.parseSchwabCsv(csvText);
                case 'generic':
                    return this.parseGenericCsv(csvText);
                default:
                    throw new Error('Unsupported broker format');
            }
        },
        
        parseSchwabCsv(csvText) {
            const lines = csvText.split('\n');
            const securities = [];
            
            // Find the header line (contains "Symbol")
            let headerIndex = -1;
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes('Symbol') && lines[i].includes('Description')) {
                    headerIndex = i;
                    break;
                }
            }
            
            if (headerIndex === -1) {
                throw new Error('Could not find header row in Schwab CSV');
            }
            
            // Parse CSV lines after header
            for (let i = headerIndex + 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line || line.includes('Cash & Cash') || line.includes('Account Total')) {
                    continue;
                }
                
                // Parse CSV (respecting quoted fields)
                const fields = this.parseCSVLine(line);
                
                if (fields.length < 2) continue;
                
                const symbol = fields[0].trim();
                const name = fields[1].trim();
                
                // Skip if symbol is empty or special entries
                if (!symbol || symbol === '--' || symbol.toLowerCase() === 'n/a') {
                    continue;
                }
                
                // Extract quantity if available (column 3, index 2)
                let quantity = null;
                if (fields.length > 2 && fields[2]) {
                    const qtyStr = fields[2].replace(/,/g, '');
                    const qtyNum = parseFloat(qtyStr);
                    if (!isNaN(qtyNum)) {
                        quantity = qtyNum;
                    }
                }
                
                // Extract cost basis (column 10, index 9) to calculate purchase price
                let purchasePrice = null;
                if (quantity && fields.length > 9 && fields[9]) {
                    const costBasisStr = fields[9].replace(/[$,]/g, '');
                    const costBasis = parseFloat(costBasisStr);
                    if (!isNaN(costBasis) && costBasis > 0) {
                        purchasePrice = Math.round((costBasis / quantity) * 10000) / 10000;
                    }
                }
                
                securities.push({
                    symbol,
                    name,
                    quantity,
                    purchase_price: purchasePrice,
                    purchase_date: null  // Schwab doesn't provide purchase date
                });
            }
            
            return securities;
        },
        
        parseGenericCsv(csvText) {
            const lines = csvText.split('\n');
            const securities = [];
            
            // Skip header line
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                
                const fields = this.parseCSVLine(line);
                if (fields.length < 2) continue;
                
                const symbol = fields[0].trim();
                const name = fields[1].trim();
                
                if (symbol && name) {
                    securities.push({ 
                        symbol, 
                        name, 
                        quantity: null,
                        purchase_date: null
                    });
                }
            }
            
            return securities;
        },
        
        parseCSVLine(line) {
            const fields = [];
            let current = '';
            let inQuotes = false;
            
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                
                if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                    fields.push(current);
                    current = '';
                } else {
                    current += char;
                }
            }
            
            fields.push(current);
            return fields;
        },
        
        async startCsvImport() {
            if (this.csvImportPreview.length === 0) return;
            
            this.csvImporting = true;
            this.csvImportProgress = 0;
            this.csvImportMessage = 'Starting import...';
            
            try {
                let imported = 0;
                let skipped = 0;
                const total = this.csvImportPreview.length;
                
                // Get existing securities if we're skipping
                const existingSymbols = new Set();
                if (this.csvSkipExisting) {
                    const existing = await db.securities.getAll();
                    existing.forEach(s => existingSymbols.add(s.symbol.toUpperCase()));
                }
                
                for (let i = 0; i < this.csvImportPreview.length; i++) {
                    const item = this.csvImportPreview[i];
                    
                    // Check if already exists
                    if (this.csvSkipExisting && existingSymbols.has(item.symbol.toUpperCase())) {
                        skipped++;
                        this.csvImportProgress = Math.floor(((i + 1) / total) * 100);
                        this.csvImportMessage = `Skipped ${skipped}, imported ${imported}...`;
                        continue;
                    }
                    
                    // Create security with optional group assignment
                    let groupId = null;
                    if (this.csvImportGroupId && this.csvImportGroupId !== '') {
                        groupId = this.csvImportGroupId;  // Keep as string, don't parseInt
                        console.log('Assigning to group:', groupId);
                    }
                    
                    // Determine purchase date and price based on checkbox
                    let purchaseDate = item.purchase_date || null;
                    let purchasePrice = item.purchase_price || null;
                    
                    // If user chose to use statement date/price for Robinhood PDF imports
                    if (this.useStatementDatePrice && this.pdfStatementDate && item.price) {
                        purchaseDate = this.pdfStatementDate;
                        purchasePrice = item.price;
                    }
                    
                    const security = {
                        id: `sec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        symbol: item.symbol,
                        name: item.name,
                        group_id: groupId,
                        first_quantity: item.quantity || null,
                        first_purchase_date: purchaseDate,
                        first_purchase_price: purchasePrice,
                        is_active: 1,
                        notes_count: 0,
                        last_note_at: null,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    };
                    
                    await db.securities.put(security);
                    
                    // Create operation for sync
                    await recordOperation('security_create', { security_id: security.id, data: security }, this);
                    
                    imported++;
                    this.csvImportProgress = Math.floor(((i + 1) / total) * 100);
                    this.csvImportMessage = `Imported ${imported} of ${total}...`;
                }
                
                this.csvImportMessage = `Complete! Imported ${imported} securities${skipped > 0 ? `, skipped ${skipped} existing` : ''}`;
                this.csvImportProgress = 100;
                
                // Reload securities list
                await this.loadSecurities();
                
                // Update pending operations count for sync
                await this.updatePendingOperations();
                
                // Clear preview after a delay
                setTimeout(() => {
                    this.clearCsvImport();
                    this.csvImporting = false;
                    alert(`Successfully imported ${imported} securities!`);
                }, 2000);
                
            } catch (error) {
                console.error('Import error:', error);
                this.csvImportError = `Import failed: ${error.message}`;
                this.csvImporting = false;
            }
        },
        
        clearCsvImport() {
            this.csvImportPreview = [];
            this.csvImportError = null;
            this.csvImportProgress = 0;
            this.csvImportMessage = '';
            this.csvImportGroupId = '';
            this.pdfStatementDate = null;
            this.useStatementDatePrice = false;
            // Clear file input
            const fileInput = document.querySelector('input[type="file"]');
            if (fileInput) fileInput.value = '';
        },
        
        async exportAllData() {
            this.exportLoading = true;
            this.exportSuccess = false;
            this.exportError = null;
            
            try {
                // Gather all data
                const securities = await db.securities.getAll();
                const notes = await db.notes.getAll();
                const groups = await db.groups.getAll();
                
                const exportData = {
                    version: '1.0',
                    exportDate: new Date().toISOString(),
                    appVersion: this.appVersion,
                    securities: securities,
                    notes: notes,
                    groups: groups
                };
                
                // Optionally include display settings (exclude PIN)
                if (this.exportIncludeSettings) {
                    const viewModeSetting = await db.settings.get('view_mode');
                    if (viewModeSetting) {
                        exportData.settings = {
                            view_mode: viewModeSetting.value
                        };
                    }
                }
                
                // Create JSON blob
                const json = JSON.stringify(exportData, null, 2);
                const blob = new Blob([json], { type: 'application/json' });
                
                // Download file
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `tickernotes-backup-${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                this.exportSuccess = true;
                setTimeout(() => { this.exportSuccess = false; }, 5000);
                
            } catch (error) {
                console.error('Export error:', error);
                this.exportError = `Export failed: ${error.message}`;
            } finally {
                this.exportLoading = false;
            }
        },
        
        handleJsonFileSelect(event) {
            this.importJsonError = null;
            this.importJsonPreview = null;
            
            const file = event.target.files[0];
            if (!file) return;
            
            this.importJsonFile = file;
            const reader = new FileReader();
            
            reader.onload = async (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    
                    // Validate format
                    if (!data.securities || !data.notes || !data.groups) {
                        throw new Error('Invalid backup file format');
                    }
                    
                    this.importJsonPreview = {
                        securities: data.securities.length,
                        notes: data.notes.length,
                        groups: data.groups.length,
                        data: data
                    };
                    
                } catch (error) {
                    this.importJsonError = `Invalid file: ${error.message}`;
                }
            };
            
            reader.readAsText(file);
        },
        
        async startJsonImport() {
            if (!this.importJsonPreview) return;
            
            this.importJsonLoading = true;
            this.importJsonError = null;
            this.importJsonMessage = 'Starting import...';
            this.importJsonProgress = 0;
            
            try {
                const data = this.importJsonPreview.data;
                let imported = { securities: 0, notes: 0, groups: 0 };
                let skipped = { securities: 0, groups: 0 };
                
                // Import groups first
                this.importJsonMessage = 'Importing groups...';
                const existingGroups = await db.groups.getAll();
                const existingGroupIds = new Set(existingGroups.map(g => g.id));
                
                for (const group of data.groups) {
                    if (existingGroupIds.has(group.id)) {
                        skipped.groups++;
                        continue;
                    }
                    // Create clean copy to avoid DataCloneError
                    const cleanGroup = { ...group };
                    await db.groups.put(cleanGroup);
                    await recordOperation('group_create', { group_id: group.id, data: cleanGroup }, this);
                    imported.groups++;
                }
                
                this.importJsonProgress = 30;
                
                // Import securities and build ID mapping
                this.importJsonMessage = 'Importing securities...';
                const existingSecurities = await db.securities.getAll();
                const existingSymbols = new Set(existingSecurities.map(s => s.symbol.toUpperCase()));
                
                // Build map: old security ID -> current security ID (by symbol)
                const securityIdMap = new Map();
                
                const total = data.securities.length;
                for (let i = 0; i < total; i++) {
                    const security = data.securities[i];
                    
                    if (existingSymbols.has(security.symbol.toUpperCase())) {
                        // Security already exists - map old ID to existing ID
                        const existingSecurity = existingSecurities.find(s => s.symbol.toUpperCase() === security.symbol.toUpperCase());
                        securityIdMap.set(security.id, existingSecurity.id);
                        skipped.securities++;
                        continue;
                    }
                    
                    // Create clean copy to avoid DataCloneError
                    const cleanSecurity = { ...security };
                    await db.securities.put(cleanSecurity);
                    await recordOperation('security_create', { security_id: security.id, data: cleanSecurity }, this);
                    // New security keeps its ID
                    securityIdMap.set(security.id, security.id);
                    imported.securities++;
                    
                    this.importJsonProgress = 30 + Math.floor((i / total) * 40);
                }
                
                // Import notes with remapped security_ids
                this.importJsonMessage = 'Importing notes...';
                const noteTotal = data.notes.length;
                let skippedNotes = 0;
                for (let i = 0; i < noteTotal; i++) {
                    const note = data.notes[i];
                    
                    // Remap security_id to current database ID
                    const newSecurityId = securityIdMap.get(note.security_id);
                    if (!newSecurityId) {
                        // Security doesn't exist (was deleted), skip note
                        skippedNotes++;
                        continue;
                    }
                    
                    // Create clean copy and update security_id
                    const cleanNote = { ...note, security_id: newSecurityId };
                    await db.notes.put(cleanNote);
                    await recordOperation('note_create', { note_id: note.id, data: cleanNote }, this);
                    imported.notes++;
                    
                    this.importJsonProgress = 70 + Math.floor((i / noteTotal) * 30);
                }
                
                // Import settings if included (excluding PIN-related settings)
                if (data.settings && data.settings.view_mode) {
                    this.importJsonMessage = 'Importing settings...';
                    await db.settings.put({ key: 'view_mode', value: data.settings.view_mode });
                    this.viewMode = data.settings.view_mode;
                }
                
                this.importJsonProgress = 100;
                this.importJsonSuccess = true;
                this.importJsonMessage = `Successfully imported ${imported.securities} securities, ${imported.notes} notes, and ${imported.groups} groups${skipped.securities > 0 ? `. Skipped ${skipped.securities} duplicate securities` : ''}`;
                
                // Reload data
                await this.loadGroups();
                await this.loadSecurities();
                
                // Update pending operations count to show sync is needed
                await this.updatePendingOperations();
                
                // Auto-sync if connected to Google Drive
                if (this.syncConnected && this.cloudProvider) {
                    console.log('[Import] Auto-syncing after import...');
                    setTimeout(async () => {
                        await this.manualSync();
                    }, 1000);
                }
                
                setTimeout(() => {
                    this.clearJsonImport();
                }, 5000);
                
            } catch (error) {
                console.error('Import error:', error);
                this.importJsonError = `Import failed: ${error.message}`;
            } finally {
                this.importJsonLoading = false;
            }
        },
        
        clearJsonImport() {
            this.importJsonPreview = null;
            this.importJsonFile = null;
            this.importJsonSuccess = false;
            this.importJsonError = null;
            this.importJsonProgress = 0;
            this.importJsonMessage = '';
            // Clear file input
            const fileInputs = document.querySelectorAll('input[type="file"]');
            fileInputs.forEach(input => { if (input.accept === '.json') input.value = ''; });
        },
        
        async loadAppLogs() {
            this.logsLoading = true;
            try {
                this.appLogs = await getAppLogs(100);
            } catch (error) {
                console.error('Failed to load logs:', error);
            } finally {
                this.logsLoading = false;
            }
        },
        
        async importSECTickers() {
            if (this.stockDataImporting) return;
            
            this.stockDataImporting = true;
            this.stockImportProgress = 0;
            this.stockImportMessage = 'Downloading SEC company tickers...';
            this.stockImportSummary = null;
            
            try {
                // Fetch from our local copy (downloaded via cron)
                const response = await fetch('/data/sec-tickers.json');
                if (!response.ok) {
                    throw new Error(`Failed to fetch SEC data: ${response.status}`);
                }
                
                const data = await response.json();
                this.stockImportProgress = 25;
                this.stockImportMessage = 'Processing SEC data...';
                
                // Convert SEC format to our format
                // SEC format: { "0": { "cik_str": 320193, "ticker": "AAPL", "title": "Apple Inc." }, ... }
                const secStocks = [];
                for (const key in data) {
                    const company = data[key];
                    secStocks.push({
                        symbol: company.ticker,
                        name: company.title,
                        exchange: 'SEC',
                        type: 'stock',
                        cik: company.cik_str
                    });
                }
                
                this.stockImportProgress = 50;
                this.stockImportMessage = `Found ${secStocks.length.toLocaleString()} companies. Merging with existing data...`;
                
                // Get existing symbols to avoid duplicates
                const existing = await db.stock_data.getAll();
                const existingSymbols = new Set(existing.map(s => s.symbol.toUpperCase()));
                console.log(`Found ${existingSymbols.size} existing symbols in database`);
                
                // Only add NEW symbols not already in database
                let added = 0;
                let skipped = 0;
                const total = secStocks.length;
                
                for (let i = 0; i < secStocks.length; i++) {
                    const stock = secStocks[i];
                    
                    if (existingSymbols.has(stock.symbol.toUpperCase())) {
                        skipped++;
                    } else {
                        await db.stock_data.put(stock);
                        added++;
                    }
                    
                    // Update progress every 50 items and yield to UI
                    if (i % 50 === 0 || i === secStocks.length - 1) {
                        this.stockImportProgress = 50 + Math.floor((i / total) * 50);
                        this.stockImportMessage = `Processing ${i + 1} of ${total.toLocaleString()}... (Added ${added}, skipped ${skipped})`;
                        // Yield to allow UI update
                        await new Promise(resolve => setTimeout(resolve, 0));
                    }
                }
                
                // Count actual records
                const finalCount = await db.stock_data.count();
                console.log(`[SEC Import] Total records in database: ${finalCount}`);
                
                const lastUpdate = new Date().toISOString();
                
                // Update metadata in settings (same as JNewman import)
                const stockDataService = new StockDataService();
                await stockDataService.setMetadata({
                    last_update: lastUpdate,
                    count: finalCount,
                    source: 'SEC + JNewman'
                });
                console.log(`[SEC Import] Metadata saved - count: ${finalCount}, date: ${lastUpdate}`);
                
                // Update UI directly (like JNewman import does)
                this.stockDataCount = finalCount;
                this.stockDataDate = lastUpdate;
                this.stockImportProgress = 0;
                this.stockImportMessage = '';
                console.log(`[SEC Import] UI updated - stockDataCount: ${this.stockDataCount}`);
                
                // Show summary
                this.stockImportSummary = `<strong>SEC Import Complete!</strong><br>
                    Added ${added.toLocaleString()} new companies<br>
                    Skipped ${skipped.toLocaleString()} existing symbols<br>
                    Total database: ${finalCount.toLocaleString()} securities`;
                
                await appLog('info', 'SEC tickers imported', { added, skipped, totalCount: finalCount });
                
            } catch (error) {
                console.error('SEC import failed:', error);
                this.stockImportMessage = `Error: ${error.message}`;
                await appLog('error', 'SEC import failed', { error: error.message });
            } finally {
                this.stockDataImporting = false;
            }
        },
        
        async clearStockData() {
            if (!confirm('Clear all stock data? This will remove all imported stock information. Your securities, notes, and other data will NOT be affected.')) {
                return;
            }
            
            try {
                // Clear all stock data
                await db.stock_data.clear();
                
                // Reset counters
                this.stockDataCount = 0;
                this.stockDataDate = null;
                
                alert('Stock data cleared successfully! You can re-import it anytime.');
                await appLog('info', 'Stock data cleared by user');
            } catch (error) {
                console.error('Failed to clear stock data:', error);
                alert('Failed to clear stock data: ' + error.message);
            }
        },
        
        async clearLogs() {
            if (!confirm('Are you sure you want to clear all logs? This cannot be undone.')) {
                return;
            }
            
            this.logsLoading = true;
            try {
                await clearAppLogs();
                this.appLogs = [];
                await appLog('info', 'Application logs cleared by user');
            } catch (error) {
                console.error('Failed to clear logs:', error);
                alert('Failed to clear logs: ' + error.message);
            } finally {
                this.logsLoading = false;
            }
        },
        
        async refreshStockData() {
            if (this.stockDataImporting) {
                return;
            }
            
            this.stockDataImporting = true;
            this.stockImportProgress = 0;
            this.stockImportMessage = 'Starting import...';
            
            try {
                const stockDataService = new StockDataService();
                
                // Progress callback
                const updateProgress = (message, percent) => {
                    this.stockImportMessage = message;
                    this.stockImportProgress = percent;
                };
                
                const result = await stockDataService.downloadLatestData(updateProgress);
                
                console.log('Stock data import result:', result);
                
                // Load stats for sector breakdown
                await this.loadStockDataStats();
                console.log('Stock data stats:', this.stockDataStats);
                
                // Build detailed summary with sector breakdown
                let summary = `<strong>Successfully imported ${result.count.toLocaleString()} stocks!</strong>`;
                
                if (this.stockDataStats && this.stockDataStats.sectors && this.stockDataStats.sectors.length > 0) {
                    summary += '<br><br><strong>Top Sectors:</strong><ul class="mb-0 mt-2">';
                    this.stockDataStats.sectors.forEach(([sector, count]) => {
                        summary += `<li>${sector}: <strong>${count.toLocaleString()}</strong> stocks</li>`;
                    });
                    summary += '</ul>';
                } else {
                    console.log('No sector stats available');
                }
                
                this.stockImportSummary = summary;
                this.stockImportMessage = '';
                this.stockImportProgress = 0;
                this.stockDataCount = result.count;
                this.stockDataDate = result.date;
                
                // Reload securities to show new prices
                await this.loadSecurities();
                
                await appLog('info', 'Stock data refreshed', result);
            } catch (error) {
                console.error('Failed to refresh stock data:', error);
                this.stockImportMessage = `Error: ${error.message}`;
                await appLog('error', 'Stock data refresh failed', { error: error.message });
            } finally {
                this.stockDataImporting = false;
            }
        },
        
        async checkStockDataStatus() {
            try {
                const stockDataService = new StockDataService();
                const metadata = await stockDataService.getMetadata();
                
                if (metadata && metadata.last_update) {
                    // Set individual properties for better Alpine reactivity
                    this.stockDataDate = metadata.last_update;
                    this.stockDataCount = metadata.count || 0;
                } else {
                    this.stockDataCount = 0;
                    this.stockDataDate = null;
                }
            } catch (error) {
                console.error('Failed to check stock data status:', error);
            }
        },
        
        // ========== Cloud Sync Methods ==========
        
        async connectGoogleDrive() {
            try {
                // Initialize provider if not already
                if (!this.cloudProvider) {
                    this.cloudProvider = new GoogleDriveProvider();
                }
                
                // Start OAuth flow
                await this.cloudProvider.authenticate();
                
                // Check if we got an auth code (should be in URL after redirect)
                const urlParams = new URLSearchParams(window.location.search);
                if (urlParams.has('code')) {
                    await this.cloudProvider.handleCallback();
                    this.syncConnected = true;
                    
                    // Update pending operations count
                    await this.updatePendingOperations();
                    
                    // Perform initial sync
                    await this.manualSync();
                    
                    // Clean URL
                    window.history.replaceState({}, document.title, window.location.pathname);
                }
                
                await appLog('info', 'Connected to Google Drive');
            } catch (error) {
                console.error('Failed to connect Google Drive:', error);
                alert('Failed to connect to Google Drive: ' + error.message);
                await appLog('error', 'Google Drive connection failed', { error: error.message });
            }
        },
        
        async disconnectGoogleDrive() {
            if (!confirm('Disconnect from Google Drive? You can reconnect later to resume syncing.')) {
                return;
            }
            
            try {
                if (this.cloudProvider) {
                    await this.cloudProvider.disconnect();
                }
                this.syncConnected = false;
                this.cloudProvider = null;
                this.lastSyncTime = null;
                this.pendingOperations = 0;
                
                // Stop periodic sync checking
                this.stopAutoSyncCheck();
                
                await appLog('info', 'Disconnected from Google Drive');
            } catch (error) {
                console.error('Failed to disconnect:', error);
                await appLog('error', 'Google Drive disconnect failed', { error: error.message });
            }
        },
        
        async nuclearCleanGoogleDrive() {
            // Step 1: Show extreme warning
            const warning = `⚠️ NUCLEAR CLEAN GOOGLE DRIVE ⚠️

This will:
✓ DELETE ALL SYNC DATA from Google Drive (runlog.json, snapshot.json)
✓ Disconnect from Google Drive
✓ Your LOCAL data will NOT be deleted

This is IRREVERSIBLE. Other devices syncing will get a fresh start.

⚠️ Only do this if you want to completely reset sync! ⚠️

Do you want to continue?`;
            
            if (!confirm(warning)) {
                return;
            }
            
            // Step 2: Require typing YES
            const confirmation = prompt('Type YES (all caps) to confirm deletion of Google Drive sync data:');
            
            if (confirmation !== 'YES') {
                alert('Cancelled. You must type YES exactly to proceed.');
                return;
            }
            
            // Step 3: Final confirmation with checkbox acknowledgement
            const finalWarning = `FINAL CONFIRMATION

You typed YES. This is your last chance to cancel.

Click OK to DELETE ALL sync data from Google Drive.
Click Cancel to abort.`;
            
            if (!confirm(finalWarning)) {
                alert('Cancelled. No data was deleted.');
                return;
            }
            
            // Step 4: Perform the nuclear clean
            try {
                console.log('[Nuclear Clean] Starting nuclear clean of Google Drive...');
                
                if (!this.cloudProvider) {
                    alert('Not connected to Google Drive.');
                    return;
                }
                
                // Delete runlog.json
                console.log('[Nuclear Clean] Deleting runlog.json...');
                await this.cloudProvider.deleteRunlog();
                
                // Delete snapshot.json
                console.log('[Nuclear Clean] Deleting snapshot.json...');
                await this.cloudProvider.deleteSnapshot();
                
                // Disconnect
                console.log('[Nuclear Clean] Disconnecting...');
                await this.cloudProvider.disconnect();
                
                this.syncConnected = false;
                this.runlogCount = 0;
                this.cloudProvider = null;
                this.lastSyncTime = null;
                this.pendingOperations = 0;
                
                // Stop periodic sync checking
                this.stopAutoSyncCheck();
                
                await appLog('warning', 'Nuclear clean completed - ALL Google Drive sync data deleted');
                
                alert('✓ Nuclear clean complete!\n\nAll sync data deleted from Google Drive.\nYou are now disconnected.\n\nYour local data is safe.\nReconnect to start fresh sync.');
                
            } catch (error) {
                console.error('[Nuclear Clean] Failed:', error);
                alert('Failed to complete nuclear clean: ' + error.message);
                await appLog('error', 'Nuclear clean failed', { error: error.message });
            }
        },
        
        async resetRunlog() {
            const warning = `⚠️ RESET RUNLOG ⚠️

This will:
✓ Create a snapshot with current data
✓ Delete and recreate the runlog (starts at 0 operations)
✓ All devices will load from snapshot on next sync

⚠️ WARNING: ALL DEVICES MUST BE SYNCED FIRST! ⚠️
This is YOUR responsibility - we do NOT check!

If any device has unsynced changes, they will be LOST.

Do you want to continue?`;
            
            if (!confirm(warning)) {
                return;
            }
            
            const confirmation = prompt('Type RESET (all caps) to confirm:');
            
            if (confirmation !== 'RESET') {
                alert('Cancelled. You must type RESET exactly to proceed.');
                return;
            }
            
            try {
                if (!this.cloudProvider) {
                    alert('Not connected to Google Drive.');
                    return;
                }
                
                console.log('[Reset] Starting runlog reset...');
                alert('Starting reset... This may take a moment.');
                
                // Use SyncService to perform reset
                const syncService = new SyncService();
                syncService.setProvider(this.cloudProvider);
                await syncService.resetRunlog();
                
                // Update UI
                this.runlogCount = 0;
                this.pendingOperations = 0;
                
                await appLog('warning', 'Runlog reset - snapshot created, runlog cleared');
                
                alert('✓ Runlog reset complete!\n\nSnapshot created with current data.\nRunlog now has 0 operations.\n\nAll devices will sync from snapshot on next sync.');
                
            } catch (error) {
                console.error('[Reset] Failed:', error);
                alert('Failed to reset runlog: ' + error.message);
                await appLog('error', 'Runlog reset failed', { error: error.message });
            }
        },
        
        async manualSync() {
            if (this.syncing) {
                return;
            }
            
            try {
                this.syncing = true;
                this.syncStatusMessage = null;
                
                if (typeof SyncService === 'undefined') {
                    console.error('[Sync] SyncService class not found');
                    throw new Error('Sync service not loaded - check browser console for sync.js loading errors');
                }
                
                if (!this.cloudProvider) {
                    throw new Error('Cloud provider not connected');
                }
                
                console.log('[Sync] Starting manual sync...');
                const syncService = new SyncService();
                syncService.setProvider(this.cloudProvider);
                const result = await syncService.fullSync();
                
                // Build status message
                const parts = [];
                if (result.pulled > 0) {
                    parts.push(`Pulled ${result.pulled} operation${result.pulled !== 1 ? 's' : ''}`);
                }
                if (result.pushed > 0) {
                    parts.push(`Pushed ${result.pushed} operation${result.pushed !== 1 ? 's' : ''}`);
                }
                if (parts.length === 0) {
                    this.syncStatusMessage = 'Already in sync - no changes to push or pull';
                } else {
                    this.syncStatusMessage = parts.join(' • ');
                }
                
                console.log(`[Sync] Complete: ${this.syncStatusMessage}`);
                
                // Update UI
                this.lastSyncTime = new Date().toLocaleString();
                await this.updatePendingOperations();
                
                // Reload groups and securities to show synced changes
                await this.loadGroups();
                await this.loadSecurities();
                if (this.currentView === 'notes' && this.currentSecurityId) {
                    await this.loadNotes();
                }
                
                await appLog('info', 'Manual sync completed', { pushed: result.pushed, pulled: result.pulled });
            } catch (error) {
                console.error('Sync failed:', error);
                
                // Handle re-authentication required
                if (error.message && error.message.includes('REAUTH_REQUIRED')) {
                    this.syncConnected = false;
                    this.cloudProvider = null;
                    this.runlogCount = 0;
                    this.pendingOperations = 0;
                    this.stopAutoSyncCheck();
                    
                    this.syncStatusMessage = null;
                    
                    alert('⚠️ Google Drive Authentication Expired\n\nYour Google Drive connection has expired or been revoked.\n\nPossible reasons:\n• Token not used for 6+ months\n• Google password changed\n• App permissions revoked\n\nPlease reconnect to Google Drive to continue syncing.');
                    
                    await appLog('warning', 'Google Drive auth expired - user disconnected', { error: error.message });
                } else {
                    this.syncStatusMessage = 'Sync failed: ' + error.message;
                    alert('Sync failed: ' + error.message);
                    await appLog('error', 'Manual sync failed', { error: error.message });
                }
            } finally {
                this.syncing = false;
            }
        },
        
        async resetSyncState() {
            if (!confirm('This will clear sync history and re-download all data from Google Drive. Continue?')) {
                return;
            }
            
            try {
                await resetSyncState();
                alert('Sync state reset. Click "Sync Now" to re-download all data.');
                this.syncStatusMessage = null;
            } catch (error) {
                console.error('Failed to reset sync state:', error);
                alert('Failed to reset sync state: ' + error.message);
            }
        },
        
        async updatePendingOperations() {
            try {
                const db = await openDB();
                const tx = db.transaction(['local_runlog'], 'readonly');
                const store = tx.objectStore('local_runlog');
                
                // Get all operations and filter by synced status
                const allOps = await new Promise((resolve, reject) => {
                    const request = store.getAll();
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });
                
                const pending = allOps.filter(op => !op.synced);
                this.pendingOperations = pending.length;
                console.log('[Sync] Updated pending operations count:', this.pendingOperations);
            } catch (error) {
                console.error('Failed to count pending operations:', error);
            }
        },
        
        startAutoSyncCheck() {
            // Clear any existing interval
            if (this.syncCheckInterval) {
                clearInterval(this.syncCheckInterval);
            }
            
            const intervalMs = this.syncCheckMinutes * 60 * 1000;
            
            // Check at configured interval
            this.syncCheckInterval = setInterval(async () => {
                if (this.syncConnected && this.cloudProvider && !this.syncing) {
                    await this.checkForRemoteUpdates();
                }
            }, intervalMs);
            
            console.log(`[Sync] Auto-check started: checking every ${this.syncCheckMinutes} minute(s)`);
            
            // Also check when tab becomes visible
            document.addEventListener('visibilitychange', async () => {
                if (!document.hidden && this.syncConnected && this.cloudProvider && !this.syncing) {
                    console.log('[Sync] Tab visible, checking for updates...');
                    await this.checkForRemoteUpdates();
                }
            });
        },
        
        stopAutoSyncCheck() {
            if (this.syncCheckInterval) {
                clearInterval(this.syncCheckInterval);
                this.syncCheckInterval = null;
                console.log('[Sync] Auto-check stopped');
            }
        },
        
        updateSyncCheckInterval() {
            // Persist to localStorage
            localStorage.setItem('sync_check_minutes', this.syncCheckMinutes);
            
            // Restart auto-check with new interval if connected
            if (this.syncConnected) {
                this.stopAutoSyncCheck();
                this.startAutoSyncCheck();
            }
            
            console.log(`[Sync] Check interval updated to ${this.syncCheckMinutes} minute(s)`);
        },
        
        async checkForRemoteUpdates() {
            try {
                console.log('[Sync] Checking for remote updates...');
                
                // Get current local operation count
                const db = await openDB();
                const metadataTx = db.transaction(['sync_metadata'], 'readonly');
                const metadataStore = metadataTx.objectStore('sync_metadata');
                const metadata = await new Promise((resolve, reject) => {
                    const request = metadataStore.get('metadata');
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });
                
                const lastSeenCount = metadata?.last_seen_operations?.length || 0;
                
                // Download runlog to check operation count (without applying)
                const { content } = await this.cloudProvider.downloadRunlogWithVersion();
                const lines = content.split('\n').filter(line => line.trim() !== '');
                const remoteCount = lines.length;
                
                // Update runlog count display
                this.runlogCount = remoteCount;
                
                console.log(`[Sync] Remote: ${remoteCount} operations, Local seen: ${lastSeenCount}`);
                
                if (remoteCount > lastSeenCount) {
                    const remoteAvailable = remoteCount - lastSeenCount;
                    console.log(`[Sync] ${remoteAvailable} new operation(s) available from remote`);
                    
                    // Get LOCAL pending operations (not yet synced)
                    const localTx = db.transaction(['local_runlog'], 'readonly');
                    const localStore = localTx.objectStore('local_runlog');
                    const allOps = await new Promise((resolve, reject) => {
                        const request = localStore.getAll();
                        request.onsuccess = () => resolve(request.result);
                        request.onerror = () => reject(request.error);
                    });
                    const localPending = allOps.filter(op => !op.synced).length;
                    
                    // Set badge to: local pending + remote available
                    this.pendingOperations = localPending + remoteAvailable;
                    console.log(`[Sync] Updated badge: ${localPending} local + ${remoteAvailable} remote = ${this.pendingOperations}`);
                } else {
                    // No remote updates, just show local pending
                    const localTx = db.transaction(['local_runlog'], 'readonly');
                    const localStore = localTx.objectStore('local_runlog');
                    const allOps = await new Promise((resolve, reject) => {
                        const request = localStore.getAll();
                        request.onsuccess = () => resolve(request.result);
                        request.onerror = () => reject(request.error);
                    });
                    const localPending = allOps.filter(op => !op.synced).length;
                    this.pendingOperations = localPending;
                }
            } catch (error) {
                console.warn('[Sync] Failed to check for remote updates:', error);
                
                // Handle re-authentication required in background check
                if (error.message && error.message.includes('REAUTH_REQUIRED')) {
                    console.warn('[Sync] Auth expired during background check - disconnecting');
                    this.syncConnected = false;
                    this.cloudProvider = null;
                    this.runlogCount = 0;
                    this.pendingOperations = 0;
                    this.stopAutoSyncCheck();
                    
                    await appLog('warning', 'Google Drive auth expired during background check', { error: error.message });
                    
                    // Show user-friendly notification (not intrusive alert since this is background)
                    this.syncStatusMessage = '⚠️ Authentication expired - please reconnect to Google Drive';
                }
                // Other errors - silently ignore for background check
            }
        },
        
        async checkSyncStatus() {
            // Check if we have a sync connection
            try {
                console.log('[Sync] Checking sync status...');
                
                // First check localStorage (fastest)
                const localToken = localStorage.getItem('google_access_token');
                const localRefresh = localStorage.getItem('google_refresh_token');
                
                if (localToken && localRefresh) {
                    console.log('[Sync] Found tokens in localStorage');
                    
                    // Get expires_at from IndexedDB
                    const db = await openDB();
                    const tx = db.transaction(['sync_metadata'], 'readonly');
                    const store = tx.objectStore('sync_metadata');
                    
                    const authData = await new Promise((resolve, reject) => {
                        const request = store.get('google_drive_auth');
                        request.onsuccess = () => resolve(request.result);
                        request.onerror = () => reject(request.error);
                    });
                    
                    this.syncConnected = true;
                    console.log('[Sync] ✓ syncConnected set to TRUE');
                    this.cloudProvider = new GoogleDriveProvider();
                    
                    try {
                        await this.cloudProvider.setAuth({
                            access_token: localToken,
                            refresh_token: localRefresh,
                            expires_at: authData?.expires_at || 0  // Pass expires_at if available
                        });
                    } catch (authError) {
                        // If re-auth is required, clear connection status
                        if (authError.message.includes('REAUTH_REQUIRED')) {
                            console.warn('[Sync] Re-authentication required');
                            this.syncConnected = false;
                            this.cloudProvider = null;
                            return;
                        }
                        throw authError;
                    }
                    
                    // Get last sync time from metadata object
                    console.log('[Sync] Reading metadata for last sync time...');
                    const tx2 = db.transaction(['sync_metadata'], 'readonly');
                    const store2 = tx2.objectStore('sync_metadata');
                    
                    // Wrap in Promise since IndexedDB doesn't return promises
                    const metadata = await new Promise((resolve, reject) => {
                        const request = store2.get('metadata');
                        request.onsuccess = () => resolve(request.result);
                        request.onerror = () => reject(request.error);
                    });
                    
                    console.log('[Sync] Metadata:', metadata);
                    if (metadata && metadata.last_sync_timestamp) {
                        this.lastSyncTime = new Date(metadata.last_sync_timestamp).toLocaleString();
                        console.log('[Sync] Last sync time:', this.lastSyncTime);
                    } else {
                        console.log('[Sync] No last_sync_timestamp found in metadata');
                    }
                    
                    await this.updatePendingOperations();
                    
                    // Start periodic sync checking
                    this.startAutoSyncCheck();
                    
                    // Immediately fetch runlog count (don't wait for first timer tick)
                    await this.checkForRemoteUpdates();
                    return;
                }
                
                // Fallback to IndexedDB
                console.log('[Sync] Checking IndexedDB for tokens...');
                const db = await openDB();
                const tx = db.transaction(['sync_metadata'], 'readonly');
                const store = tx.objectStore('sync_metadata');
                const authData = await store.get('google_drive_auth');
                
                console.log('[Sync] IndexedDB auth data:', authData ? 'found' : 'not found');
                
                if (authData && authData.access_token) {
                    console.log('[Sync] Restoring tokens from IndexedDB to localStorage');
                    this.syncConnected = true;
                    this.cloudProvider = new GoogleDriveProvider();
                    await this.cloudProvider.setAuth(authData);
                    
                    // Get last sync time from metadata object (need new transaction after async setAuth)
                    console.log('[Sync] Reading metadata for last sync time...');
                    const db2 = await openDB();
                    const tx2 = db2.transaction(['sync_metadata'], 'readonly');
                    const store2 = tx2.objectStore('sync_metadata');
                    
                    // Wrap in Promise since IndexedDB doesn't return promises
                    const metadata = await new Promise((resolve, reject) => {
                        const request = store2.get('metadata');
                        request.onsuccess = () => resolve(request.result);
                        request.onerror = () => reject(request.error);
                    });
                    
                    console.log('[Sync] Metadata:', metadata);
                    if (metadata && metadata.last_sync_timestamp) {
                        this.lastSyncTime = new Date(metadata.last_sync_timestamp).toLocaleString();
                        console.log('[Sync] Last sync time:', this.lastSyncTime);
                    } else {
                        console.log('[Sync] No last_sync_timestamp found in metadata');
                    }
                    
                    // Update pending count
                    await this.updatePendingOperations();
                    
                    // Start periodic sync checking
                    this.startAutoSyncCheck();
                    
                    // Immediately fetch runlog count (don't wait for first timer tick)
                    await this.checkForRemoteUpdates();
                } else {
                    console.log('[Sync] No OAuth tokens found');
                }
            } catch (error) {
                console.error('Failed to check sync status:', error);
            }
        },
        
        async handleOAuthCallback() {
            // Check if we're returning from OAuth (code in URL)
            const urlParams = new URLSearchParams(window.location.search);
            if (!urlParams.has('code')) {
                return; // No OAuth callback
            }
            
            const code = urlParams.get('code');
            console.log('[OAuth] Handling OAuth callback...');
            
            try {
                // Initialize provider
                this.cloudProvider = new GoogleDriveProvider();
                
                // Handle the callback (exchange code for tokens)
                await this.cloudProvider.handleCallback(code);
                
                console.log('[OAuth] Successfully authenticated with Google Drive');
                
                // Update UI state
                this.syncConnected = true;
                
                // Update pending operations count
                await this.updatePendingOperations();
                
                // Start periodic sync checking
                this.startAutoSyncCheck();
                
                // Perform initial sync (if SyncService is loaded)
                if (typeof SyncService !== 'undefined') {
                    console.log('[OAuth] Starting initial sync...');
                    try {
                        await this.manualSync();
                    } catch (syncError) {
                        console.warn('[OAuth] Initial sync failed, but connection successful:', syncError);
                        // Don't fail the OAuth flow if sync fails
                    }
                } else {
                    console.warn('[OAuth] SyncService not loaded yet, skipping initial sync');
                }
                
                // Clean URL (remove OAuth params)
                window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
                
                await appLog('info', 'Connected to Google Drive via OAuth');
            } catch (error) {
                console.error('[OAuth] Failed to handle OAuth callback:', error);
                alert('Failed to complete Google Drive authentication: ' + error.message);
                
                // Clean URL even on error
                window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
                
                await appLog('error', 'OAuth callback failed', { error: error.message });
            }
        }
    };
}
