/**
 * Operation Logging System
 * Handles recording all data mutations as operations for sync
 */

// Operation sequence counter (device-local)
let operationSequence = 0;

/**
 * Initialize operation sequence from local runlog
 */
async function initOperationLog() {
    try {
        const operations = await db.local_runlog.getAll();
        if (operations.length > 0) {
            // Get highest sequence number
            operationSequence = Math.max(...operations.map(op => op.seq)) + 1;
        } else {
            operationSequence = 0;
        }
        console.log('Operation log initialized, next seq:', operationSequence);
    } catch (error) {
        console.error('Failed to initialize operation log:', error);
        operationSequence = 0;
    }
}

/**
 * Record an operation to the local runlog
 * @param {string} operationType - Type of operation
 * @param {object} data - Operation data
 * @param {object} alpineContext - Optional Alpine.js context for updating UI
 */
async function recordOperation(operationType, data, alpineContext = null) {
    try {
        const deviceId = await getDeviceId();
        if (!deviceId) {
            throw new Error('Device ID not found');
        }
        
        const operation = {
            seq: operationSequence++,
            ts: new Date().toISOString(),
            device: deviceId,
            op: operationType,
            data: data,
            synced: false,
            created_at: new Date().toISOString()
        };
        
        await db.local_runlog.put(operation);
        console.log('Operation recorded:', operationType, operation.seq);
        
        // Update pending operations count if Alpine context provided
        if (alpineContext && typeof alpineContext.updatePendingOperations === 'function') {
            await alpineContext.updatePendingOperations();
        }
        
        return operation;
    } catch (error) {
        console.error('Failed to record operation:', error);
        throw error;
    }
}

/**
 * Apply an operation to local IndexedDB
 */
async function applyOperation(operation) {
    try {
        const { op, data } = operation;
        
        console.log(`[ApplyOp] Type: ${op}, Data:`, data);
        
        switch (op) {
            // Securities operations
            case 'add_security':
            case 'security_create':
                const securityData = data.data || data;
                console.log(`[ApplyOp] Inserting security:`, { id: securityData.id, symbol: securityData.symbol, group_id: securityData.group_id, name: securityData.name });
                await db.securities.put(securityData);
                console.log(`[ApplyOp] Security inserted successfully`);
                break;
                
            case 'update_security':
            case 'security_update':
                const existingSec = await db.securities.get(data.security_id || data.id);
                if (existingSec) {
                    await db.securities.put({ ...existingSec, ...(data.data || data) });
                }
                break;
                
            case 'delete_security':
            case 'security_delete':
                await db.securities.delete(data.security_id || data.id);
                // Also delete associated notes
                const notes = await db.notes.getByIndex('security_id', data.security_id || data.id);
                for (const note of notes) {
                    await db.notes.delete(note.id);
                }
                break;
                
            case 'toggle_security_active':
                const secToToggle = await db.securities.get(data.id);
                if (secToToggle) {
                    await db.securities.put({ ...secToToggle, is_active: data.is_active });
                }
                break;
                
            case 'update_purchase':
                const secToPurchase = await db.securities.get(data.id);
                if (secToPurchase) {
                    await db.securities.put({
                        ...secToPurchase,
                        first_purchase_date: data.first_purchase_date,
                        first_purchase_price: data.first_purchase_price,
                        first_quantity: data.first_quantity
                    });
                }
                break;
                
            // Notes operations
            case 'add_note':
            case 'note_create':
                const noteData = data.data || data;
                console.log(`[ApplyOp] Inserting note:`, noteData);
                await db.notes.put(noteData);
                break;
                
            case 'update_note':
            case 'note_update':
                const existingNote = await db.notes.get(data.note_id || data.id);
                if (existingNote) {
                    await db.notes.put({ ...existingNote, ...(data.data || data) });
                } else {
                    console.warn(`Cannot update note ${data.note_id || data.id}: not found (may have been deleted)`);
                }
                break;
                
            case 'delete_note':
            case 'note_delete':
                await db.notes.delete(data.note_id || data.id);
                break;
                
            case 'toggle_primary_note':  // TEMPORARY backward compatibility
                const noteToToggle = await db.notes.get(data.id);
                if (noteToToggle) {
                    await db.notes.put({ ...noteToToggle, is_primary: data.is_primary });
                }
                break;
                
            // Groups operations
            case 'add_group':
            case 'create_group':  // TEMPORARY backward compatibility
            case 'group_create':
                const groupData = data.data || data;
                console.log(`[ApplyOp] Inserting group:`, groupData);
                await db.groups.put(groupData);
                break;
                
            case 'update_group':
            case 'group_update':
                const existingGroup = await db.groups.get(data.group_id || data.id);
                if (existingGroup) {
                    await db.groups.put({ ...existingGroup, ...(data.data || data) });
                }
                break;
                
            case 'delete_group':
            case 'group_delete':
                await db.groups.delete(data.group_id || data.id);
                // Update securities in this group to have no group
                const securities = await db.securities.getByIndex('group_id', data.group_id || data.id);
                for (const security of securities) {
                    await db.securities.put({ ...security, group_id: null });
                }
                break;
                
            case 'move_security_to_group':
            case 'update_security_group':
                const secToMove = await db.securities.get(data.security_id || data.id);
                if (secToMove) {
                    await db.securities.put({ ...secToMove, group_id: data.group_id });
                }
                break;
                
            // Settings operations
            case 'update_setting':
                await db.settings.put({ key: data.key, value: data.value });
                break;
                
            // Bulk operations
            case 'bulk_move_securities':
                for (const securityId of data.security_ids) {
                    const sec = await db.securities.get(securityId);
                    if (sec) {
                        await db.securities.put({ ...sec, group_id: data.group_id });
                    }
                }
                break;
                
            case 'bulk_delete_securities':
                for (const securityId of data.security_ids) {
                    await db.securities.delete(securityId);
                    // Also delete associated notes
                    const secNotes = await db.notes.getByIndex('security_id', securityId);
                    for (const note of secNotes) {
                        await db.notes.delete(note.id);
                    }
                }
                break;
                
            default:
                console.warn('Unknown operation type:', op);
        }
        
        console.log('Operation applied:', op, data.id || data.key);
    } catch (error) {
        console.error('Failed to apply operation:', error, operation);
        throw error;
    }
}

/**
 * Execute and record a mutation operation
 * This combines applying locally and recording for sync
 */
async function executeMutation(operationType, data) {
    try {
        // Create operation record
        const operation = await recordOperation(operationType, data);
        
        // Apply to local data
        await applyOperation(operation);
        
        return operation;
    } catch (error) {
        console.error('Failed to execute mutation:', error);
        throw error;
    }
}

/**
 * Helper functions for common operations
 */
const Operations = {
    // Securities
    async addSecurity(security) {
        return await executeMutation('add_security', {
            id: security.id || `sec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            symbol: security.symbol,
            name: security.name,
            group_id: security.group_id || null,
            is_active: security.is_active !== undefined ? security.is_active : true,
            first_purchase_date: security.first_purchase_date || null,
            first_purchase_price: security.first_purchase_price || null,
            first_quantity: security.first_quantity || null,
            created_at: new Date().toISOString()
        });
    },
    
    async updateSecurity(id, updates) {
        return await executeMutation('update_security', {
            id,
            ...updates,
            updated_at: new Date().toISOString()
        });
    },
    
    async deleteSecurity(id) {
        return await executeMutation('delete_security', { id });
    },
    
    async toggleSecurityActive(id, isActive) {
        return await executeMutation('toggle_security_active', {
            id,
            is_active: isActive
        });
    },
    
    async updatePurchase(id, purchaseData) {
        return await executeMutation('update_purchase', {
            id,
            first_purchase_date: purchaseData.first_purchase_date,
            first_purchase_price: purchaseData.first_purchase_price,
            first_quantity: purchaseData.first_quantity
        });
    },
    
    // Notes
    async addNote(note) {
        return await executeMutation('add_note', {
            id: note.id || `note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            security_id: note.security_id,
            content: note.content,
            created_at: new Date().toISOString()
        });
    },
    
    async updateNote(id, content) {
        return await executeMutation('update_note', {
            id,
            content,
            updated_at: new Date().toISOString()
        });
    },
    
    async deleteNote(id) {
        return await executeMutation('delete_note', { id });
    },
    
    // Groups
    async addGroup(group) {
        return await executeMutation('add_group', {
            id: group.id || `grp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: group.name,
            created_at: new Date().toISOString()
        });
    },
    
    async updateGroup(id, name) {
        return await executeMutation('update_group', {
            id,
            name,
            updated_at: new Date().toISOString()
        });
    },
    
    async deleteGroup(id) {
        return await executeMutation('delete_group', { id });
    },
    
    async moveSecurityToGroup(securityId, groupId) {
        return await executeMutation('move_security_to_group', {
            security_id: securityId,
            group_id: groupId
        });
    },
    
    // Settings
    async updateSetting(key, value) {
        return await executeMutation('update_setting', { key, value });
    },
    
    // Bulk operations
    async bulkMoveSecurities(securityIds, groupId) {
        return await executeMutation('bulk_move_securities', {
            security_ids: securityIds,
            group_id: groupId
        });
    },
    
    async bulkDeleteSecurities(securityIds) {
        return await executeMutation('bulk_delete_securities', {
            security_ids: securityIds
        });
    }
};

/**
 * Mark operations as synced
 */
async function markOperationsSynced(operations) {
    try {
        for (const op of operations) {
            await db.local_runlog.put({
                ...op,
                synced: true,
                synced_at: new Date().toISOString()
            });
        }
        console.log(`Marked ${operations.length} operations as synced`);
    } catch (error) {
        console.error('Failed to mark operations as synced:', error);
        throw error;
    }
}

/**
 * Delete synced operations (optional cleanup)
 */
async function deleteSyncedOperations(olderThan = 30) {
    try {
        const allOps = await db.local_runlog.getAll();
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - olderThan);
        
        let deleted = 0;
        for (const op of allOps) {
            if (op.synced && op.synced_at && new Date(op.synced_at) < cutoff) {
                await db.local_runlog.delete(op.seq);
                deleted++;
            }
        }
        
        console.log(`Deleted ${deleted} old synced operations`);
        return deleted;
    } catch (error) {
        console.error('Failed to delete synced operations:', error);
        throw error;
    }
}

/**
 * Get pending operations count
 */
async function getPendingOperationsCount() {
    try {
        const operations = await getUnsyncedOperations();
        return operations.length;
    } catch (error) {
        console.error('Failed to get pending operations count:', error);
        return 0;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        initOperationLog,
        recordOperation,
        applyOperation,
        executeMutation,
        Operations,
        markOperationsSynced,
        deleteSyncedOperations,
        getPendingOperationsCount
    };
}
