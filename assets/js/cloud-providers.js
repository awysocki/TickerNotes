/**
 * Cloud Provider Interface and Implementations
 * Abstract layer for Google Drive, OneDrive, and Dropbox
 */

/**
 * Base CloudProvider interface
 */
class CloudProvider {
    constructor() {
        if (new.target === CloudProvider) {
            throw new TypeError('Cannot construct CloudProvider instances directly');
        }
    }
    
    async authenticate() {
        throw new Error('Method authenticate() must be implemented');
    }
    
    isAuthenticated() {
        throw new Error('Method isAuthenticated() must be implemented');
    }
    
    disconnect() {
        throw new Error('Method disconnect() must be implemented');
    }
    
    async readSnapshot() {
        throw new Error('Method readSnapshot() must be implemented');
    }
    
    async writeSnapshot(snapshot) {
        throw new Error('Method writeSnapshot() must be implemented');
    }
    
    async readRunlog() {
        throw new Error('Method readRunlog() must be implemented');
    }
    
    async downloadRunlogWithVersion() {
        throw new Error('Method downloadRunlogWithVersion() must be implemented');
    }
    
    async uploadRunlogIfVersionMatches(content, expectedVersion) {
        throw new Error('Method uploadRunlogIfVersionMatches() must be implemented');
    }
    
    async appendToRunlog(operations) {
        throw new Error('Method appendToRunlog() must be implemented');
    }
}

/**
 * Google Drive Provider
 */
class GoogleDriveProvider extends CloudProvider {
    constructor() {
        super();
        this.accessToken = null;
        this.snapshotFileId = null;
        this.runlogFileId = null;
        
        // Google OAuth config
        this.clientId = '885246146260-2s8fejd78m2gkl0g18lnuiukk0pq5411.apps.googleusercontent.com';
        this.clientSecret = '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';
        this.redirectUri = window.location.origin + '/';
        this.scope = 'https://www.googleapis.com/auth/drive.appdata';
        
        // Token refresh tracking
        this.tokenExpiresAt = null;
        this.refreshToken = null;
    }
    
    async ensureValidToken() {
        // Check if token is expired or about to expire (within 5 minutes)
        const now = Date.now();
        if (this.tokenExpiresAt && now >= (this.tokenExpiresAt - 5 * 60 * 1000)) {
            console.log('[OAuth] Token expired or expiring soon, refreshing...');
            await this.refreshAccessToken();
        }
    }
    
    async refreshAccessToken() {
        try {
            const refreshToken = this.refreshToken || localStorage.getItem('google_refresh_token');
            if (!refreshToken) {
                throw new Error('No refresh token available');
            }
            
            console.log('[OAuth] Refreshing access token...');
            const response = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    refresh_token: refreshToken,
                    grant_type: 'refresh_token'
                })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                console.error('[OAuth] Token refresh failed:', data);
                
                // If refresh token is invalid, clear auth and require re-login
                if (data.error === 'invalid_grant') {
                    console.warn('[OAuth] Refresh token invalid - clearing auth');
                    this.disconnect();
                    throw new Error('REAUTH_REQUIRED: Please reconnect to Google Drive');
                }
                
                throw new Error(data.error_description || data.error || 'Failed to refresh token');
            }
            
            // Update tokens
            this.accessToken = data.access_token;
            this.tokenExpiresAt = Date.now() + (data.expires_in * 1000);
            
            // Save to localStorage and IndexedDB
            localStorage.setItem('google_access_token', data.access_token);
            
            const db = await openDB();
            const tx = db.transaction(['sync_metadata'], 'readwrite');
            const store = tx.objectStore('sync_metadata');
            
            const authData = await new Promise((resolve, reject) => {
                const request = store.get('google_drive_auth');
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            
            if (authData) {
                authData.access_token = data.access_token;
                authData.expires_at = this.tokenExpiresAt;
                await new Promise((resolve, reject) => {
                    const request = store.put(authData);
                    request.onsuccess = () => resolve();
                    request.onerror = () => reject(request.error);
                });
            }
            
            console.log('[OAuth] Token refreshed successfully');
            return true;
        } catch (error) {
            console.error('[OAuth] Failed to refresh token:', error);
            throw error;
        }
    }
    
    async authenticate() {
        try {
            // OAuth 2.0 PKCE flow
            const codeVerifier = this.generateCodeVerifier();
            const codeChallenge = await this.generateCodeChallenge(codeVerifier);
            
            // Store verifier for later
            localStorage.setItem('google_code_verifier', codeVerifier);
            
            // Build authorization URL
            const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
            authUrl.searchParams.set('client_id', this.clientId);
            authUrl.searchParams.set('redirect_uri', this.redirectUri);
            authUrl.searchParams.set('response_type', 'code');
            authUrl.searchParams.set('scope', this.scope);
            authUrl.searchParams.set('code_challenge', codeChallenge);
            authUrl.searchParams.set('code_challenge_method', 'S256');
            
            // Redirect to Google OAuth
            window.location.href = authUrl.toString();
        } catch (error) {
            console.error('Google Drive authentication failed:', error);
            throw error;
        }
    }
    
    async handleCallback(code) {
        try {
            const codeVerifier = localStorage.getItem('google_code_verifier');
            if (!codeVerifier) {
                throw new Error('Code verifier not found');
            }
            
            // Exchange code for token
            const response = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    code: code,
                    code_verifier: codeVerifier,
                    grant_type: 'authorization_code',
                    redirect_uri: this.redirectUri
                })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error_description || 'Failed to get access token');
            }
            
            this.accessToken = data.access_token;
            localStorage.setItem('google_access_token', data.access_token);
            localStorage.setItem('google_refresh_token', data.refresh_token);
            localStorage.removeItem('google_code_verifier');
            
            // Save to IndexedDB sync_metadata
            const db = await openDB();
            const tx = db.transaction(['sync_metadata'], 'readwrite');
            const store = tx.objectStore('sync_metadata');
            await new Promise((resolve, reject) => {
                const request = store.put({
                    key: 'google_drive_auth',
                    access_token: data.access_token,
                    refresh_token: data.refresh_token,
                    expires_at: Date.now() + (data.expires_in * 1000)
                });
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
            
            // Initialize app data folder
            await this.initializeAppFolder();
            
            return true;
        } catch (error) {
            console.error('Failed to handle Google OAuth callback:', error);
            throw error;
        }
    }
    
    async initializeAppFolder() {
        try {
            // Ensure we have a valid token before accessing Drive
            await this.ensureValidToken();
            
            // Find or create snapshot file
            this.snapshotFileId = await this.findOrCreateFile('tickernotes_snapshot.json');
            this.runlogFileId = await this.findOrCreateFile('tickernotes_runlog.jsonl');
            
            console.log('Google Drive app folder initialized');
        } catch (error) {
            console.error('Failed to initialize app folder:', error);
            throw error;
        }
    }
    
    async findOrCreateFile(filename) {
        try {
            // Search in appDataFolder
            const searchResponse = await fetch(
                `https://www.googleapis.com/drive/v3/files?q=name='${filename}' and 'appDataFolder' in parents&spaces=appDataFolder`,
                {
                    headers: { 'Authorization': `Bearer ${this.accessToken}` }
                }
            );
            
            const searchData = await searchResponse.json();
            
            if (searchData.files && searchData.files.length > 0) {
                return searchData.files[0].id;
            }
            
            // Create file
            const metadata = {
                name: filename,
                parents: ['appDataFolder']
            };
            
            const createResponse = await fetch(
                'https://www.googleapis.com/drive/v3/files',
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(metadata)
                }
            );
            
            const createData = await createResponse.json();
            return createData.id;
        } catch (error) {
            console.error('Failed to find or create file:', error);
            throw error;
        }
    }
    
    isAuthenticated() {
        const token = localStorage.getItem('google_access_token');
        if (token) {
            this.accessToken = token;
            return true;
        }
        return false;
    }
    
    async setAuth(authData) {
        this.accessToken = authData.access_token;
        this.refreshToken = authData.refresh_token;
        this.tokenExpiresAt = authData.expires_at;
        
        if (authData.access_token) {
            localStorage.setItem('google_access_token', authData.access_token);
        }
        if (authData.refresh_token) {
            this.refreshToken = authData.refresh_token;
            localStorage.setItem('google_refresh_token', authData.refresh_token);
        }
        
        // Initialize file IDs
        await this.initializeAppFolder();
    }
    
    disconnect() {
        this.accessToken = null;
        localStorage.removeItem('google_access_token');
        localStorage.removeItem('google_refresh_token');
        
        // Clear from IndexedDB
        openDB().then(db => {
            const tx = db.transaction(['sync_metadata'], 'readwrite');
            const store = tx.objectStore('sync_metadata');
            store.delete('google_drive_auth');
        });
    }
    
    async deleteRunlog() {
        try {
            await this.ensureValidToken();
            
            if (!this.runlogFileId) {
                console.log('[Nuclear Clean] No runlog file ID found, trying to find it...');
                await this.initializeAppFolder();
            }
            
            if (!this.runlogFileId) {
                console.log('[Nuclear Clean] No runlog file to delete');
                return;
            }
            
            console.log('[Nuclear Clean] Deleting runlog file:', this.runlogFileId);
            
            const response = await fetch(
                `https://www.googleapis.com/drive/v3/files/${this.runlogFileId}`,
                {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`
                    }
                }
            );
            
            if (!response.ok && response.status !== 404) {
                throw new Error('Failed to delete runlog: ' + response.statusText);
            }
            
            console.log('[Nuclear Clean] Runlog deleted successfully');
            this.runlogFileId = null;
            
        } catch (error) {
            console.error('[Nuclear Clean] Failed to delete runlog:', error);
            throw error;
        }
    }
    
    async deleteSnapshot() {
        try {
            await this.ensureValidToken();
            
            if (!this.snapshotFileId) {
                console.log('[Nuclear Clean] No snapshot file ID found, trying to find it...');
                await this.initializeAppFolder();
            }
            
            if (!this.snapshotFileId) {
                console.log('[Nuclear Clean] No snapshot file to delete');
                return;
            }
            
            console.log('[Nuclear Clean] Deleting snapshot file:', this.snapshotFileId);
            
            const response = await fetch(
                `https://www.googleapis.com/drive/v3/files/${this.snapshotFileId}`,
                {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`
                    }
                }
            );
            
            if (!response.ok && response.status !== 404) {
                throw new Error('Failed to delete snapshot: ' + response.statusText);
            }
            
            console.log('[Nuclear Clean] Snapshot deleted successfully');
            this.snapshotFileId = null;
            
        } catch (error) {
            console.error('[Nuclear Clean] Failed to delete snapshot:', error);
            throw error;
        }
    }
    
    async readSnapshot() {
        try {
            await this.ensureValidToken();
            
            if (!this.snapshotFileId) {
                await this.initializeAppFolder();
            }
            
            console.log('[GoogleDrive] Downloading snapshot...');
            const response = await fetch(
                `https://www.googleapis.com/drive/v3/files/${this.snapshotFileId}?alt=media`,
                {
                    headers: { 'Authorization': `Bearer ${this.accessToken}` }
                }
            );
            
            if (!response.ok) {
                if (response.status === 404) {
                    return null; // File not found
                }
                throw new Error('Failed to read snapshot');
            }
            
            return await response.json();
        } catch (error) {
            console.error('Failed to read snapshot:', error);
            throw error;
        }
    }
    
    async writeSnapshot(snapshot) {
        try {            await this.ensureValidToken();
                        if (!this.snapshotFileId) {
                await this.initializeAppFolder();
            }
            
            const response = await fetch(
                `https://www.googleapis.com/upload/drive/v3/files/${this.snapshotFileId}?uploadType=media`,
                {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(snapshot)
                }
            );
            
            if (!response.ok) {
                throw new Error('Failed to write snapshot');
            }
            
            return true;
        } catch (error) {
            console.error('Failed to write snapshot:', error);
            throw error;
        }
    }
    
    async readRunlog() {
        try {
            await this.ensureValidToken();
            
            if (!this.runlogFileId) {
                await this.initializeAppFolder();
            }
            
            const response = await fetch(
                `https://www.googleapis.com/drive/v3/files/${this.runlogFileId}?alt=media`,
                {
                    headers: { 'Authorization': `Bearer ${this.accessToken}` }
                }
            );
            
            if (!response.ok) {
                if (response.status === 404) {
                    return []; // File not found, empty runlog
                }
                throw new Error('Failed to read runlog');
            }
            
            const content = await response.text();
            return this.parseRunlog(content);
        } catch (error) {
            console.error('Failed to read runlog:', error);
            throw error;
        }
    }
    
    async downloadRunlogWithVersion() {
        try {
            if (!this.runlogFileId) {
                await this.initializeAppFolder();
            }
            
            const response = await fetch(
                `https://www.googleapis.com/drive/v3/files/${this.runlogFileId}?alt=media`,
                {
                    headers: { 'Authorization': `Bearer ${this.accessToken}` }
                }
            );
            
            const version = response.headers.get('ETag');
            
            if (!response.ok) {
                if (response.status === 404) {
                    return { content: '', version: null };
                }
                throw new Error('Failed to download runlog');
            }
            
            const content = await response.text();
            return { content, version };
        } catch (error) {
            console.error('Failed to download runlog with version:', error);
            throw error;
        }
    }
    
    async uploadRunlogIfVersionMatches(content, expectedVersion) {
        try {
            if (!this.runlogFileId) {
                await this.initializeAppFolder();
            }
            
            const headers = {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'text/plain'
            };
            
            // Add If-Match header for version check
            if (expectedVersion) {
                headers['If-Match'] = expectedVersion;
            }
            
            const response = await fetch(
                `https://www.googleapis.com/upload/drive/v3/files/${this.runlogFileId}?uploadType=media`,
                {
                    method: 'PATCH',
                    headers,
                    body: content
                }
            );
            
            if (response.status === 412) {
                // Precondition Failed - version mismatch
                return { success: false, conflict: true };
            }
            
            if (!response.ok) {
                throw new Error('Failed to upload runlog');
            }
            
            const newVersion = response.headers.get('ETag');
            return { success: true, newVersion };
        } catch (error) {
            console.error('Failed to upload runlog:', error);
            throw error;
        }
    }
    
    parseRunlog(content) {
        if (!content || content.trim() === '') {
            return [];
        }
        
        const lines = content.split('\n').filter(line => line.trim() !== '');
        const operations = [];
        
        for (const line of lines) {
            try {
                operations.push(JSON.parse(line));
            } catch (error) {
                console.error('Failed to parse runlog line:', error);
            }
        }
        
        return operations;
    }
    
    generateCodeVerifier() {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        return btoa(String.fromCharCode(...array))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }
    
    async generateCodeChallenge(verifier) {
        const encoder = new TextEncoder();
        const data = encoder.encode(verifier);
        const hash = await crypto.subtle.digest('SHA-256', data);
        return btoa(String.fromCharCode(...new Uint8Array(hash)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }
}

/**
 * Microsoft OneDrive Provider
 */
class OneDriveProvider extends CloudProvider {
    constructor() {
        super();
        this.accessToken = null;
        
        // Microsoft OAuth config (replace with your values)
        this.clientId = 'YOUR_MICROSOFT_CLIENT_ID';
        this.redirectUri = window.location.origin;
        this.scope = 'Files.ReadWrite.AppFolder offline_access';
    }
    
    async authenticate() {
        try {
            const authUrl = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
            authUrl.searchParams.set('client_id', this.clientId);
            authUrl.searchParams.set('redirect_uri', this.redirectUri);
            authUrl.searchParams.set('response_type', 'code');
            authUrl.searchParams.set('scope', this.scope);
            authUrl.searchParams.set('response_mode', 'query');
            
            window.location.href = authUrl.toString();
        } catch (error) {
            console.error('OneDrive authentication failed:', error);
            throw error;
        }
    }
    
    isAuthenticated() {
        const token = localStorage.getItem('onedrive_access_token');
        if (token) {
            this.accessToken = token;
            return true;
        }
        return false;
    }
    
    disconnect() {
        this.accessToken = null;
        localStorage.removeItem('onedrive_access_token');
        localStorage.removeItem('onedrive_refresh_token');
    }
    
    async readSnapshot() {
        // Implementation similar to Google Drive
        throw new Error('OneDrive readSnapshot not yet implemented');
    }
    
    async writeSnapshot(snapshot) {
        // Implementation similar to Google Drive
        throw new Error('OneDrive writeSnapshot not yet implemented');
    }
    
    async readRunlog() {
        // Implementation similar to Google Drive
        throw new Error('OneDrive readRunlog not yet implemented');
    }
    
    async downloadRunlogWithVersion() {
        // Implementation similar to Google Drive
        throw new Error('OneDrive downloadRunlogWithVersion not yet implemented');
    }
    
    async uploadRunlogIfVersionMatches(content, expectedVersion) {
        // Implementation similar to Google Drive
        throw new Error('OneDrive uploadRunlogIfVersionMatches not yet implemented');
    }
}

/**
 * Dropbox Provider
 */
class DropboxProvider extends CloudProvider {
    constructor() {
        super();
        this.accessToken = null;
        
        // Dropbox OAuth config (replace with your values)
        this.clientId = 'YOUR_DROPBOX_CLIENT_ID';
        this.redirectUri = window.location.origin;
    }
    
    async authenticate() {
        try {
            const authUrl = new URL('https://www.dropbox.com/oauth2/authorize');
            authUrl.searchParams.set('client_id', this.clientId);
            authUrl.searchParams.set('redirect_uri', this.redirectUri);
            authUrl.searchParams.set('response_type', 'code');
            authUrl.searchParams.set('token_access_type', 'offline');
            
            window.location.href = authUrl.toString();
        } catch (error) {
            console.error('Dropbox authentication failed:', error);
            throw error;
        }
    }
    
    isAuthenticated() {
        const token = localStorage.getItem('dropbox_access_token');
        if (token) {
            this.accessToken = token;
            return true;
        }
        return false;
    }
    
    disconnect() {
        this.accessToken = null;
        localStorage.removeItem('dropbox_access_token');
        localStorage.removeItem('dropbox_refresh_token');
    }
    
    async readSnapshot() {
        // Implementation similar to Google Drive
        throw new Error('Dropbox readSnapshot not yet implemented');
    }
    
    async writeSnapshot(snapshot) {
        // Implementation similar to Google Drive
        throw new Error('Dropbox writeSnapshot not yet implemented');
    }
    
    async readRunlog() {
        // Implementation similar to Google Drive
        throw new Error('Dropbox readRunlog not yet implemented');
    }
    
    async downloadRunlogWithVersion() {
        // Implementation similar to Google Drive
        throw new Error('Dropbox downloadRunlogWithVersion not yet implemented');
    }
    
    async uploadRunlogIfVersionMatches(content, expectedVersion) {
        // Implementation similar to Google Drive
        throw new Error('Dropbox uploadRunlogIfVersionMatches not yet implemented');
    }
}

/**
 * Factory to create provider instances
 */
function createCloudProvider(providerType) {
    switch (providerType) {
        case 'google':
            return new GoogleDriveProvider();
        case 'onedrive':
            return new OneDriveProvider();
        case 'dropbox':
            return new DropboxProvider();
        default:
            throw new Error(`Unknown provider type: ${providerType}`);
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        CloudProvider,
        GoogleDriveProvider,
        OneDriveProvider,
        DropboxProvider,
        createCloudProvider
    };
}
