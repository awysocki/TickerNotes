/**
 * IndexedDB Storage Layer
 * Handles all local data storage using IndexedDB
 */

const DB_NAME = 'TickerNotesDB';
const DB_VERSION = 3;

/**
 * Database schema definition
 */
const DB_STORES = {
    securities: {
        keyPath: 'id',
        indexes: [
            { name: 'symbol', keyPath: 'symbol', unique: false },
            { name: 'group_id', keyPath: 'group_id', unique: false },
            { name: 'is_active', keyPath: 'is_active', unique: false }
        ]
        // Fields: id, symbol, name, group_id, first_quantity, first_purchase_date, first_purchase_price, notes_count, last_note_at, created_at, updated_at, is_active
    },
    notes: {
        keyPath: 'id',
        indexes: [
            { name: 'security_id', keyPath: 'security_id', unique: false },
            { name: 'created_at', keyPath: 'created_at', unique: false }
        ]
    },
    groups: {
        keyPath: 'id',
        indexes: [
            { name: 'name', keyPath: 'name', unique: false }
        ]
    },
    settings: {
        keyPath: 'key'
    },
    local_runlog: {
        keyPath: 'seq',
        indexes: [
            { name: 'ts', keyPath: 'ts', unique: false },
            { name: 'synced', keyPath: 'synced', unique: false }
        ]
    },
    sync_metadata: {
        keyPath: 'key'
    },
    stock_data: {
        keyPath: 'symbol',
        indexes: [
            { name: 'sector', keyPath: 'sector', unique: false },
            { name: 'industry', keyPath: 'industry', unique: false },
            { name: 'exchange', keyPath: 'exchange', unique: false },
            { name: 'type', keyPath: 'type', unique: false }
        ]
    },
    app_logs: {
        keyPath: 'id',
        autoIncrement: true,
        indexes: [
            { name: 'timestamp', keyPath: 'timestamp', unique: false },
            { name: 'level', keyPath: 'level', unique: false }
        ]
    }
};

/**
 * Open and initialize the database
 */
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            // Create object stores
            for (const [storeName, config] of Object.entries(DB_STORES)) {
                // Skip if store already exists
                if (db.objectStoreNames.contains(storeName)) {
                    continue;
                }
                
                const store = db.createObjectStore(storeName, {
                    keyPath: config.keyPath,
                    autoIncrement: config.autoIncrement || false
                });
                
                // Create indexes
                if (config.indexes) {
                    config.indexes.forEach(index => {
                        store.createIndex(index.name, index.keyPath, {
                            unique: index.unique || false
                        });
                    });
                }
            }
        };
    });
}

/**
 * Generic CRUD operations
 */
class DBStore {
    constructor(storeName) {
        this.storeName = storeName;
    }
    
    async getAll() {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(this.storeName, 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    
    async get(key) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(this.storeName, 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(key);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    
    async put(data) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(this.storeName, 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.put(data);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    
    async add(data) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(this.storeName, 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.add(data);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    
    async delete(key) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(this.storeName, 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(key);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    
    async clear() {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(this.storeName, 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.clear();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    
    async getByIndex(indexName, value) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(this.storeName, 'readonly');
            const store = transaction.objectStore(this.storeName);
            const index = store.index(indexName);
            const request = index.getAll(value);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    
    async count() {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(this.storeName, 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.count();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
}

/**
 * Database stores
 */
const db = {
    securities: new DBStore('securities'),
    notes: new DBStore('notes'),
    groups: new DBStore('groups'),
    settings: new DBStore('settings'),
    local_runlog: new DBStore('local_runlog'),
    sync_metadata: new DBStore('sync_metadata'),
    stock_data: new DBStore('stock_data'),
    app_logs: new DBStore('app_logs')
};

/**
 * Initialize database on module load
 */
async function initDB() {
    try {
        await openDB();
        console.log('IndexedDB initialized successfully');
        
        // Initialize device ID if not exists
        const deviceId = await getDeviceId();
        if (!deviceId) {
            const newDeviceId = `browser-${crypto.randomUUID()}`;
            await db.settings.put({ key: 'device_id', value: newDeviceId });
            console.log('Device ID created:', newDeviceId);
        }
        
        // Initialize sync metadata if not exists
        const syncMetadata = await db.sync_metadata.get('metadata');
        if (!syncMetadata) {
            await db.sync_metadata.put({
                key: 'metadata',
                last_sync_timestamp: null,
                last_seen_operations: [],
                device_id: await getDeviceId(),
                cloud_provider: null,
                last_snapshot_timestamp: null
            });
        }
        
        return true;
    } catch (error) {
        console.error('Failed to initialize IndexedDB:', error);
        throw error;
    }
}

/**
 * App Logging System
 * Circular log with max 500 entries
 */
const MAX_LOG_ENTRIES = 500;

async function appLog(level, message, data = null) {
    try {
        const entry = {
            timestamp: new Date().toISOString(),
            level: level, // 'info', 'warn', 'error', 'debug'
            message: message,
            data: data ? JSON.stringify(data) : null
        };
        
        await db.app_logs.add(entry);
        
        // Keep only last MAX_LOG_ENTRIES
        const allLogs = await db.app_logs.getAll();
        if (allLogs.length > MAX_LOG_ENTRIES) {
            const sortedLogs = allLogs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            const toDelete = sortedLogs.slice(0, allLogs.length - MAX_LOG_ENTRIES);
            for (const log of toDelete) {
                await db.app_logs.delete(log.id);
            }
        }
        
        // Also log to console in dev
        console.log(`[${level.toUpperCase()}] ${message}`, data || '');
    } catch (error) {
        console.error('Failed to write app log:', error);
    }
}

async function getAppLogs(limit = 100) {
    try {
        const logs = await db.app_logs.getAll();
        return logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, limit);
    } catch (error) {
        console.error('Failed to read app logs:', error);
        return [];
    }
}

async function clearAppLogs() {
    try {
        await db.app_logs.clear();
    } catch (error) {
        console.error('Failed to clear app logs:', error);
    }
}

/**
 * Get device ID
 */
async function getDeviceId() {
    try {
        const setting = await db.settings.get('device_id');
        return setting ? setting.value : null;
    } catch (error) {
        console.error('Failed to get device ID:', error);
        return null;
    }
}

/**
 * Get sync metadata
 */
async function getSyncMetadata() {
    try {
        const metadata = await db.sync_metadata.get('metadata');
        if (metadata) {
            // Convert last_seen_operations array back to Set
            metadata.last_seen_operations = new Set(metadata.last_seen_operations || []);
        }
        return metadata;
    } catch (error) {
        console.error('Failed to get sync metadata:', error);
        return null;
    }
}

/**
 * Save sync metadata
 */
async function saveSyncMetadata(metadata) {
    try {
        // Convert Set to array for storage
        const toSave = { ...metadata };
        if (toSave.last_seen_operations instanceof Set) {
            toSave.last_seen_operations = Array.from(toSave.last_seen_operations);
        }
        toSave.key = 'metadata';
        await db.sync_metadata.put(toSave);
        return true;
    } catch (error) {
        console.error('Failed to save sync metadata:', error);
        return false;
    }
}

/**
 * Reset sync state (force re-sync all operations)
 */
async function resetSyncState() {
    try {
        const metadata = await db.sync_metadata.get('metadata');
        if (metadata) {
            metadata.last_seen_operations = [];
            metadata.last_sync_timestamp = null;
            await saveSyncMetadata(metadata);
            console.log('[Reset] Sync state cleared - operations will be re-applied on next sync');
        }
        return true;
    } catch (error) {
        console.error('Failed to reset sync state:', error);
        return false;
    }
}

/**
 * Get all unsynced operations from local runlog
 */
async function getUnsyncedOperations() {
    try {
        const allOps = await db.local_runlog.getAll();
        return allOps.filter(op => !op.synced);
    } catch (error) {
        console.error('Failed to get unsynced operations:', error);
        return [];
    }
}

/**
 * Export all data as JSON (for backup/migration)
 */
async function exportData() {
    try {
        const data = {
            version: '1.0',
            exported_at: new Date().toISOString(),
            device_id: await getDeviceId(),
            securities: await db.securities.getAll(),
            notes: await db.notes.getAll(),
            groups: await db.groups.getAll(),
            settings: await db.settings.getAll(),
            sync_metadata: await getSyncMetadata()
        };
        return data;
    } catch (error) {
        console.error('Failed to export data:', error);
        throw error;
    }
}

/**
 * Import data from JSON (for backup/migration)
 */
async function importData(data) {
    try {
        // Clear existing data
        await db.securities.clear();
        await db.notes.clear();
        await db.groups.clear();
        
        // Import data
        for (const security of data.securities || []) {
            await db.securities.put(security);
        }
        for (const note of data.notes || []) {
            await db.notes.put(note);
        }
        for (const group of data.groups || []) {
            await db.groups.put(group);
        }
        
        console.log('Data imported successfully');
        return true;
    } catch (error) {
        console.error('Failed to import data:', error);
        throw error;
    }
}

/**
 * Clear all data (with confirmation)
 */
async function clearAllData() {
    try {
        await db.securities.clear();
        await db.notes.clear();
        await db.groups.clear();
        await db.local_runlog.clear();
        await db.stock_data.clear();
        
        // Reset sync metadata
        await db.sync_metadata.put({
            key: 'metadata',
            last_sync_timestamp: null,
            last_seen_operations: [],
            device_id: await getDeviceId(),
            cloud_provider: null,
            last_snapshot_timestamp: null
        });
        
        console.log('All data cleared');
        return true;
    } catch (error) {
        console.error('Failed to clear data:', error);
        throw error;
    }
}

/**
 * Remove duplicate groups (keeps the one with the most recent created_at date)
 */
async function removeDuplicateGroups() {
    try {
        const allGroups = await db.groups.getAll();
        const groupsByName = {};
        const toDelete = [];
        
        // Group by name (case-insensitive)
        for (const group of allGroups) {
            const normalizedName = group.name.trim().toLowerCase();
            if (!groupsByName[normalizedName]) {
                groupsByName[normalizedName] = [];
            }
            groupsByName[normalizedName].push(group);
        }
        
        // For each name that has duplicates, keep only the newest
        for (const name in groupsByName) {
            const groups = groupsByName[name];
            if (groups.length > 1) {
                // Sort by created_at (newest first)
                groups.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                
                // Mark all except the first (newest) for deletion
                for (let i = 1; i < groups.length; i++) {
                    toDelete.push(groups[i]);
                }
            }
        }
        
        // Delete duplicates
        for (const group of toDelete) {
            console.log(`Deleting duplicate group: ${group.name} (${group.id})`);
            await db.groups.delete(group.id);
            
            // Also update any securities that reference this group to reference the kept group
            const keptGroup = groupsByName[group.name.trim().toLowerCase()][0];
            const securities = await db.securities.getByIndex('group_id', group.id);
            for (const security of securities) {
                security.group_id = keptGroup.id;
                await db.securities.put(security);
            }
        }
        
        console.log(`Removed ${toDelete.length} duplicate groups`);
        return toDelete.length;
    } catch (error) {
        console.error('Failed to remove duplicate groups:', error);
        throw error;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        db,
        initDB,
        getDeviceId,
        getSyncMetadata,
        saveSyncMetadata,
        getUnsyncedOperations,
        exportData,
        importData,
        clearAllData,
        removeDuplicateGroups
    };
}
