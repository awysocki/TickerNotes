/**
 * Sync Engine
 * Handles synchronization with cloud storage providers
 */

/**
 * Sync service class
 */
class SyncService {
    constructor() {
        this.provider = null;
        this.syncing = false;
        this.lastSyncTime = null;
        this.autoSyncEnabled = false;
        this.autoSyncInterval = null;
    }
    
    /**
     * Set cloud provider
     */
    setProvider(provider) {
        this.provider = provider;
    }
    
    /**
     * Check if connected to cloud storage
     */
    isConnected() {
        return this.provider !== null && this.provider.isAuthenticated();
    }
    
    /**
     * Full sync: download changes, apply, upload local changes
     */
    async fullSync() {
        if (this.syncing) {
            throw new Error('Sync already in progress');
        }
        
        if (!this.isConnected()) {
            throw new Error('Not connected to cloud storage');
        }
        
        try {
            this.syncing = true;
            console.log('[Sync] Starting full sync...');
            const startTime = Date.now();
            
            // 1. Pull changes (download & apply)
            const pullResult = await this.pullChanges();
            console.log(`[Sync] Pull phase: ${pullResult.applied} operations applied`);
            
            // 2. Push changes (upload local operations)
            const pushResult = await this.pushChanges();
            console.log(`[Sync] Push phase: ${pushResult.uploaded} operations uploaded`);
            
            // 3. Update last sync timestamp
            const metadata = await getSyncMetadata();
            metadata.last_sync_timestamp = new Date().toISOString();
            await saveSyncMetadata(metadata);
            
            // 4. Create snapshot periodically (weekly or after significant changes)
            if (await this.shouldCreateSnapshot()) {
                console.log('[Sync] Creating periodic snapshot...');
                await this.createSnapshot();
            }
            
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            console.log(`[Sync] Complete in ${duration}s (pulled: ${pullResult.applied}, pushed: ${pushResult.uploaded})`);
            
            return { 
                pulled: pullResult.applied, 
                pushed: pushResult.uploaded 
            };
        } catch (error) {
            console.error('[Sync] Failed:', error);
            throw error;
        } finally {
            this.syncing = false;
        }
    }
    
    /**
     * Pull changes from cloud and apply
     */
    async pullChanges() {
        try {
            console.log('Pulling changes from cloud...');
            
            // 1. Get sync metadata to check if first sync
            const metadata = await getSyncMetadata();
            const alreadySeen = metadata.last_seen_operations || new Set();
            const isFirstSync = alreadySeen.size === 0;
            
            // 2. If first sync, try to load snapshot first (cold start optimization)
            let snapshotLastSeq = 0;
            if (isFirstSync) {
                console.log('[Sync] First sync detected - checking for snapshot...');
                try {
                    const snapshot = await this.loadSnapshot();
                    if (snapshot) {
                        snapshotLastSeq = snapshot.last_sequence || 0;
                        console.log(`[Sync] Snapshot loaded! Starting from sequence ${snapshotLastSeq}`);
                        
                        // Mark all operations up to snapshot as seen
                        // (Simplified: we'll just skip operations by sequence number)
                    }
                } catch (error) {
                    console.warn('[Sync] Failed to load snapshot, will sync all operations:', error);
                }
            }
            
            // 3. Download cloud runlog
            const cloudRunlog = await this.provider.readRunlog();
            console.log(`Downloaded ${cloudRunlog.length} operations from cloud`);
            
            // 4. Filter: Which operations have we NOT seen before?
            const newOps = cloudRunlog.filter(op => {
                const opId = `${op.device}-${op.seq}`;
                // Skip if already seen
                if (alreadySeen.has(opId)) return false;
                // Skip if before snapshot sequence (snapshot already has this data)
                if (snapshotLastSeq > 0 && op.seq <= snapshotLastSeq) return false;
                return true;
            });
            
            if (snapshotLastSeq > 0) {
                console.log(`Found ${newOps.length} new operations to apply (after snapshot seq ${snapshotLastSeq})`);
            } else {
                console.log(`Found ${newOps.length} new operations to apply`);
            }
            
            if (newOps.length === 0) {
                return { applied: 0 };
            }
            
            // Log details of operations being pulled
            const groupOps = newOps.filter(op => op.op && (op.op.includes('group') || op.op.includes('Group')));
            const securityOps = newOps.filter(op => op.op && (op.op.includes('security') || op.op.includes('Security')));
            if (groupOps.length > 0) {
                console.log(`[Sync] Found ${groupOps.length} group operations:`, groupOps.map(op => ({ op: op.op, data: op.data })));
            }
            if (securityOps.length > 0) {
                console.log(`[Sync] Found ${securityOps.length} security operations:`, securityOps.map(op => ({ op: op.op, symbol: op.data?.symbol, group_id: op.data?.group_id })));
            }
            
            // 5. Sort by timestamp (chronological order)
            newOps.sort((a, b) => {
                // Primary: Sort by timestamp
                if (a.ts !== b.ts) return a.ts < b.ts ? -1 : 1;
                
                // Tiebreaker: Sort by device ID
                if (a.device !== b.device) return a.device < b.device ? -1 : 1;
                
                // Same device, same timestamp: Use sequence
                return a.seq - b.seq;
            });
            
            // 6. Apply each operation
            const opCounts = {};
            for (const op of newOps) {
                try {
                    await applyOperation(op);
                    alreadySeen.add(`${op.device}-${op.seq}`);
                    
                    // Count operation types for logging
                    const key = `${op.type}_${op.entity}`;
                    opCounts[key] = (opCounts[key] || 0) + 1;
                } catch (error) {
                    console.error('Failed to apply operation:', op, error);
                    // Continue with next operation
                }
            }
            
            // 7. Save updated metadata
            metadata.last_seen_operations = alreadySeen;
            await saveSyncMetadata(metadata);
            
            // Log operation breakdown
            if (Object.keys(opCounts).length > 0) {
                const breakdown = Object.entries(opCounts)
                    .map(([key, count]) => `${count} ${key}`)
                    .join(', ');
                console.log(`[Sync] Applied ${newOps.length} operations: ${breakdown}`);
            }
            return { applied: newOps.length };
        } catch (error) {
            console.error('Failed to pull changes:', error);
            throw error;
        }
    }
    
    /**
     * Push local changes to cloud
     */
    async pushChanges() {
        try {
            console.log('Pushing changes to cloud...');
            
            // 1. Get unsynced operations
            const localOps = await getUnsyncedOperations();
            
            if (localOps.length === 0) {
                console.log('[Sync] No local changes to push');
                return { uploaded: 0 };
            }
            
            // Count operation types for logging
            const opCounts = {};
            for (const op of localOps) {
                const key = op.op;
                opCounts[key] = (opCounts[key] || 0) + 1;
            }
            const breakdown = Object.entries(opCounts)
                .map(([key, count]) => `${count} ${key}`)
                .join(', ');
            console.log(`[Sync] Uploading ${localOps.length} operations: ${breakdown}`);
            
            // Log details of group and security operations being pushed
            const groupOps = localOps.filter(op => op.op && (op.op.includes('group') || op.op.includes('Group')));
            const securityOps = localOps.filter(op => op.op && (op.op.includes('security') || op.op.includes('Security')));
            if (groupOps.length > 0) {
                console.log(`[Sync] Pushing ${groupOps.length} group operations:`, groupOps.map(op => ({ op: op.op, data: op.data })));
            }
            if (securityOps.length > 0) {
                console.log(`[Sync] Pushing ${securityOps.length} security operations:`, securityOps.map(op => ({ op: op.op, symbol: op.data?.symbol, group_id: op.data?.group_id })));
            }
            
            // 2. Append to cloud runlog with retry
            const result = await this.appendToRunlogWithRetry(localOps);
            
            if (!result.success) {
                throw new Error('Failed to upload operations after retries');
            }
            
            // 3. Mark operations as synced
            await markOperationsSynced(localOps);
            
            // 4. Add to last_seen_operations
            const metadata = await getSyncMetadata();
            const alreadySeen = metadata.last_seen_operations || new Set();
            for (const op of localOps) {
                alreadySeen.add(`${op.device}-${op.seq}`);
            }
            metadata.last_seen_operations = alreadySeen;
            await saveSyncMetadata(metadata);
            
            console.log(`[Sync] Pushed ${localOps.length} operations to Google Drive`);
            return { uploaded: localOps.length };
        } catch (error) {
            console.error('Failed to push changes:', error);
            throw error;
        }
    }
    
    /**
     * Append to cloud runlog with optimistic locking and retry
     */
    async appendToRunlogWithRetry(operations, maxRetries = 5) {
        let attempts = 0;
        
        while (attempts < maxRetries) {
            try {
                attempts++;
                console.log(`Append attempt ${attempts}/${maxRetries}`);
                
                // 1. Download current runlog with version
                const { content: currentRunlog, version: currentVersion } = 
                    await this.provider.downloadRunlogWithVersion();
                
                // 2. Parse existing operations
                const existingOps = this.parseRunlog(currentRunlog);
                
                // 3. Filter out operations already in cloud (deduplication)
                const deviceId = await getDeviceId();
                const newOps = operations.filter(op => {
                    const opId = `${op.device}-${op.seq}`;
                    return !existingOps.some(existing => 
                        `${existing.device}-${existing.seq}` === opId
                    );
                });
                
                if (newOps.length === 0) {
                    console.log('All operations already in cloud');
                    return { success: true, message: 'All operations already synced' };
                }
                
                // 4. Append new operations to content
                const newLines = newOps.map(op => JSON.stringify(op)).join('\n');
                const updatedContent = currentRunlog ? 
                    currentRunlog + '\n' + newLines : newLines;
                
                // 5. Upload with version check (conditional write)
                const result = await this.provider.uploadRunlogIfVersionMatches(
                    updatedContent,
                    currentVersion
                );
                
                if (result.success) {
                    console.log('Successfully uploaded operations');
                    return { success: true, uploaded: newOps.length };
                } else if (result.conflict) {
                    // File was modified by another device - retry
                    console.log(`Conflict detected on attempt ${attempts}, retrying...`);
                    
                    // Exponential backoff
                    const delay = Math.pow(2, attempts) * 100;
                    await this.sleep(delay);
                    continue;
                } else {
                    throw new Error('Upload failed with unknown error');
                }
                
            } catch (error) {
                console.error(`Append attempt ${attempts} failed:`, error);
                
                if (attempts >= maxRetries) {
                    throw new Error(`Failed to append after ${maxRetries} retries: ${error.message}`);
                }
                
                // Exponential backoff
                const delay = Math.pow(2, attempts) * 100;
                await this.sleep(delay);
            }
        }
        
        throw new Error('Failed to append after max retries');
    }
    
    /**
     * Parse JSONL runlog content
     */
    parseRunlog(content) {
        if (!content || content.trim() === '') {
            return [];
        }
        
        const lines = content.split('\n').filter(line => line.trim() !== '');
        const operations = [];
        
        for (const line of lines) {
            try {
                const op = JSON.parse(line);
                operations.push(op);
            } catch (error) {
                console.error('Failed to parse runlog line:', line, error);
                // Skip invalid lines
            }
        }
        
        return operations;
    }
    
    /**
     * Create snapshot from current data
     */
    async createSnapshot() {
        try {
            console.log('Creating snapshot...');
            
            const deviceId = await getDeviceId();
            const metadata = await getSyncMetadata();
            
            // Get highest sequence from last_seen_operations
            const lastSeenOps = Array.from(metadata.last_seen_operations || []);
            let lastSequence = 0;
            for (const opId of lastSeenOps) {
                const seq = parseInt(opId.split('-').pop());
                if (seq > lastSequence) lastSequence = seq;
            }
            
            const snapshot = {
                version: '1.0',
                created_at: new Date().toISOString(),
                device_id: deviceId,
                last_sequence: lastSequence,
                data: {
                    securities: await db.securities.getAll(),
                    notes: await db.notes.getAll(),
                    groups: await db.groups.getAll(),
                    settings: await db.settings.getAll()
                }
            };
            
            // Log detailed snapshot data for debugging
            console.log('[Snapshot] Creating snapshot with:');
            console.log(`[Snapshot] Groups (${snapshot.data.groups.length}):`, snapshot.data.groups.map(g => ({ id: g.id, name: g.name })));
            console.log(`[Snapshot] Securities (${snapshot.data.securities.length}):`, snapshot.data.securities.map(s => ({ id: s.id, symbol: s.symbol, group_id: s.group_id })));
            console.log(`[Snapshot] Notes (${snapshot.data.notes.length}):`, snapshot.data.notes.length);
            
            // Upload snapshot
            await this.provider.writeSnapshot(snapshot);
            
            // Update metadata
            metadata.last_snapshot_timestamp = new Date().toISOString();
            await saveSyncMetadata(metadata);
            
            console.log('Snapshot created successfully');
            return snapshot;
        } catch (error) {
            console.error('Failed to create snapshot:', error);
            throw error;
        }
    }
    
    /**
     * Load snapshot from cloud
     */
    async loadSnapshot() {
        try {
            console.log('Loading snapshot from cloud...');
            
            const snapshot = await this.provider.readSnapshot();
            
            if (!snapshot) {
                console.log('No snapshot found in cloud');
                return null;
            }
            
            // Clear existing data
            await db.securities.clear();
            await db.notes.clear();
            await db.groups.clear();
            
            // Load snapshot data
            for (const security of snapshot.data.securities || []) {
                await db.securities.put(security);
            }
            for (const note of snapshot.data.notes || []) {
                await db.notes.put(note);
            }
            for (const group of snapshot.data.groups || []) {
                await db.groups.put(group);
            }
            
            // Update sync metadata
            const metadata = await getSyncMetadata();
            metadata.last_snapshot_timestamp = snapshot.created_at;
            await saveSyncMetadata(metadata);
            
            console.log('Snapshot loaded successfully');
            return snapshot;
        } catch (error) {
            console.error('Failed to load snapshot:', error);
            throw error;
        }
    }
    
    /**
     * Check if snapshot creation is needed
     * Creates snapshot weekly or after 50+ new operations
     */
    async shouldCreateSnapshot() {
        try {
            const metadata = await getSyncMetadata();
            const lastSnapshot = metadata.last_snapshot_timestamp;
            
            // No snapshot yet - create one
            if (!lastSnapshot) {
                console.log('[Snapshot] No snapshot exists, should create');
                return true;
            }
            
            // Check if 7 days since last snapshot
            const daysSinceSnapshot = (Date.now() - new Date(lastSnapshot).getTime()) / (1000 * 60 * 60 * 24);
            if (daysSinceSnapshot >= 7) {
                console.log(`[Snapshot] ${daysSinceSnapshot.toFixed(1)} days since last snapshot, should create`);
                return true;
            }
            
            // Check if 50+ operations since last snapshot
            const operations = await db.local_runlog.getAll();
            const opsSinceSnapshot = operations.filter(op => op.created_at > lastSnapshot);
            if (opsSinceSnapshot.length >= 50) {
                console.log(`[Snapshot] ${opsSinceSnapshot.length} operations since last snapshot, should create`);
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('[Snapshot] Error checking if should create:', error);
            return false; // Don't create on error
        }
    }
    
    /**
     * Get runlog operation count
     */
    async getRunlogCount() {
        try {
            if (!this.isConnected()) {
                return 0;
            }
            const cloudRunlog = await this.provider.readRunlog();
            return cloudRunlog.length;
        } catch (error) {
            console.error('[Sync] Error getting runlog count:', error);
            return 0;
        }
    }
    
    /**
     * Reset runlog: Create snapshot, delete runlog, create new empty runlog
     * WARNING: All devices must sync before this operation!
     */
    async resetRunlog() {
        try {
            if (!this.isConnected()) {
                throw new Error('Not connected to cloud storage');
            }
            
            console.log('[Sync] RESETTING RUNLOG - Creating snapshot first...');
            
            // 1. Create snapshot with current state
            await this.createSnapshot();
            console.log('[Sync] Snapshot created successfully');
            
            // 2. Delete old runlog file
            await this.provider.deleteRunlog();
            console.log('[Sync] Old runlog deleted');
            
            // 3. Reinitialize app folder (will create new empty runlog file)
            await this.provider.initializeAppFolder();
            console.log('[Sync] New empty runlog created');
            
            // 4. Clear local sync metadata so next sync treats it like first sync
            const metadata = await getSyncMetadata();
            metadata.last_seen_operations = new Set();
            await db.sync_metadata.put(metadata);
            console.log('[Sync] Local sync metadata reset');
            
            console.log('[Sync] RUNLOG RESET COMPLETE');
            return true;
        } catch (error) {
            console.error('[Sync] Error resetting runlog:', error);
            throw error;
        }
    }
    
    /**
     * Enable auto-sync
     */
    enableAutoSync(intervalMinutes = 15) {
        this.autoSyncEnabled = true;
        
        // Clear existing interval
        if (this.autoSyncInterval) {
            clearInterval(this.autoSyncInterval);
        }
        
        // Set new interval
        this.autoSyncInterval = setInterval(async () => {
            if (navigator.onLine && this.isConnected() && !this.syncing) {
                try {
                    console.log('Auto-sync triggered');
                    await this.fullSync();
                } catch (error) {
                    console.error('Auto-sync failed:', error);
                }
            }
        }, intervalMinutes * 60 * 1000);
        
        console.log(`Auto-sync enabled (every ${intervalMinutes} minutes)`);
    }
    
    /**
     * Disable auto-sync
     */
    disableAutoSync() {
        this.autoSyncEnabled = false;
        if (this.autoSyncInterval) {
            clearInterval(this.autoSyncInterval);
            this.autoSyncInterval = null;
        }
        console.log('Auto-sync disabled');
    }
    
    /**
     * Sleep utility
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Get sync status
     */
    async getSyncStatus() {
        try {
            const metadata = await getSyncMetadata();
            const pendingOps = await getPendingOperationsCount();
            
            return {
                connected: this.isConnected(),
                syncing: this.syncing,
                lastSync: metadata.last_sync_timestamp,
                pendingOperations: pendingOps,
                provider: metadata.cloud_provider,
                autoSyncEnabled: this.autoSyncEnabled
            };
        } catch (error) {
            console.error('Failed to get sync status:', error);
            return {
                connected: false,
                syncing: false,
                lastSync: null,
                pendingOperations: 0,
                provider: null,
                autoSyncEnabled: false
            };
        }
    }
}

// Create singleton instance
const syncService = new SyncService();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        SyncService,
        syncService
    };
}
