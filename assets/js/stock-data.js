/**
 * Stock Data Service
 * Handles fetching and managing stock price data from GitHub
 */

const STOCK_DATA_URL = 'https://raw.githubusercontent.com/JNewman-cell/Improved-US-Stock-Symbols/main/all/all_full_tickers.json';

class StockDataService {
    constructor() {
        this.updating = false;
        this.lastUpdateCheck = null;
    }
    
    /**
     * Check if stock data needs updating
     */
    async needsUpdate() {
        try {
            const metadata = await this.getMetadata();
            
            if (!metadata || !metadata.last_update) {
                return true; // No data yet
            }
            
            const lastUpdate = new Date(metadata.last_update);
            const daysSince = this.getDaysSinceUpdate(lastUpdate);
            
            return daysSince > 0; // Update if more than 0 days old
        } catch (error) {
            console.error('Failed to check update status:', error);
            return false;
        }
    }
    
    /**
     * Get days since last update
     */
    getDaysSinceUpdate(lastUpdateDate = null) {
        try {
            if (!lastUpdateDate) {
                const metadata = this.getMetadataSync();
                if (!metadata || !metadata.last_update) {
                    return 999; // Very old
                }
                lastUpdateDate = new Date(metadata.last_update);
            }
            
            const now = new Date();
            const diffMs = now - lastUpdateDate;
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            
            return diffDays;
        } catch (error) {
            console.error('Failed to calculate days since update:', error);
            return 999;
        }
    }
    
    /**
     * Download and process stock data from GitHub
     */
    async downloadLatestData(progressCallback = null) {
        if (this.updating) {
            throw new Error('Update already in progress');
        }
        
        try {
            this.updating = true;
            console.log('Downloading stock data from GitHub...');
            
            if (progressCallback) progressCallback('Downloading stock data...', 10);
            
            const startTime = Date.now();
            
            // 1. Fetch stock data from GitHub
            const response = await fetch(STOCK_DATA_URL);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
            }
            
            if (progressCallback) progressCallback('Processing stock data...', 30);
            
            const stocksArray = await response.json();
            console.log(`Downloaded ${stocksArray.length} stocks`);
            
            // Debug: Check first stock to see actual data structure
            if (stocksArray.length > 0) {
                console.log('Sample raw stock data:', stocksArray[0]);
            }
            
            if (progressCallback) progressCallback('Parsing stock data...', 40);
            
            // 2. Process and clean data
            const processedStocks = stocksArray.map(stock => ({
                symbol: stock.symbol,
                name: stock.name || '',
                last_sale: this.parsePrice(stock.lastsale),
                net_change: parseFloat(stock.netchange?.replace(/,/g, '') || '0'),
                pct_change: this.parsePercent(stock.pctchange),
                volume: parseInt(stock.volume?.replace(/,/g, '') || '0'),
                market_cap: stock.marketcap?.replace(/[$,]/g, '') || '0',
                country: stock.country || '',
                ipo_year: stock.ipoyear || null,
                industry: stock.industry || '',
                sector: stock.sector || '',
                exchange: stock.exchange || '',
                updated_at: new Date().toISOString()
            }));
            
            if (progressCallback) progressCallback('Storing stock data...', 60);
            
            // 3. Store in IndexedDB (bulk insert)
            await this.storeStockData(processedStocks, progressCallback);
            
            if (progressCallback) progressCallback('Updating your securities...', 80);
            
            // 4. Update user securities with new prices
            await this.updateUserSecuritiesPrices(processedStocks, progressCallback);
            
            if (progressCallback) progressCallback('Finalizing...', 95);
            
            // 5. Record metadata
            const parseTime = Date.now() - startTime;
            const metadata = {
                last_update: new Date().toISOString(),
                source: 'JNewman-cell/Improved-US-Stock-Symbols',
                count: processedStocks.length,
                file_size: response.headers.get('content-length') || 0,
                parse_time_ms: parseTime,
                update_success: true
            };
            
            await this.setMetadata(metadata);
            
            console.log(`Stock data updated successfully (${parseTime}ms)`);
            
            if (progressCallback) progressCallback('Complete!', 100);
            
            return {
                status: 'success',
                date: metadata.last_update,
                count: metadata.count,
                size: metadata.file_size
            };
        } catch (error) {
            console.error('Failed to download stock data:', error);
            
            // Record failed update
            await this.setMetadata({
                last_update_attempt: new Date().toISOString(),
                update_success: false,
                error: error.message
            });
            
            throw error;
        } finally {
            this.updating = false;
        }
    }
    
    /**
     * Store stock data in IndexedDB
     */
    async storeStockData(stocks, progressCallback = null) {
        try {
            console.log(`Storing ${stocks.length} stocks in IndexedDB...`);
            
            // Clear existing stock data
            await db.stock_data.clear();
            
            // Bulk insert with progress updates
            const total = stocks.length;
            for (let i = 0; i < total; i++) {
                await db.stock_data.put(stocks[i]);
                
                // Update progress every 1000 stocks (60-75%)
                if (progressCallback && i % 1000 === 0) {
                    const progress = 60 + Math.floor((i / total) * 15);
                    progressCallback(`Storing ${i + 1}/${total} stocks...`, progress);
                }
            }
            
            console.log('Stock data stored successfully');
        } catch (error) {
            console.error('Failed to store stock data:', error);
            throw error;
        }
    }
    
    /**
     * Update user securities with new price data
     */
    async updateUserSecuritiesPrices(stockData, progressCallback = null) {
        try {
            console.log('Updating user securities with new prices...');
            
            const userSecurities = await db.securities.getAll();
            const total = userSecurities.length;
            
            // Create lookup map for quick access
            const priceMap = new Map(stockData.map(s => [s.symbol, s]));
            
            // Debug: Check a sample security
            if (userSecurities.length > 0) {
                const firstSecurity = userSecurities[0];
                const priceData = priceMap.get(firstSecurity.symbol);
                console.log('=== PRICE UPDATE DEBUG ===');
                console.log('Symbol:', firstSecurity.symbol);
                console.log('Found in price data:', !!priceData);
                if (priceData) {
                    console.log('Price data last_sale:', priceData.last_sale);
                    console.log('Price data net_change:', priceData.net_change);
                    console.log('Price data pct_change:', priceData.pct_change);
                }
                console.log('Security BEFORE update - last_sale:', firstSecurity.last_sale);
                console.log('Security BEFORE update - net_change:', firstSecurity.net_change);
            }
            
            let updated = 0;
            for (let i = 0; i < userSecurities.length; i++) {
                const security = userSecurities[i];
                const priceData = priceMap.get(security.symbol);
                if (priceData) {
                    security.last_sale = priceData.last_sale;
                    security.net_change = priceData.net_change;
                    security.pct_change = priceData.pct_change;
                    security.market_cap = priceData.market_cap;
                    await db.securities.put(security);
                    updated++;
                    
                    // Update progress every 5 securities (75-90%)
                    if (progressCallback && i % 5 === 0 && total > 0) {
                        const progress = 75 + Math.floor((i / total) * 15);
                        progressCallback(`Updating security ${i + 1}/${total}...`, progress);
                    }
                    
                    // Debug first update
                    if (updated === 1) {
                        console.log('First security AFTER setting values:');
                        console.log('  last_sale:', security.last_sale);
                        console.log('  net_change:', security.net_change);
                        
                        // Verify it was saved by reading it back
                        const savedSecurity = await db.securities.get(security.id);
                        console.log('First security AFTER db.put (read back):');
                        console.log('  last_sale:', savedSecurity.last_sale);
                        console.log('  net_change:', savedSecurity.net_change);
                    }
                }
            }
            
            console.log(`Updated ${updated} user securities`);
        } catch (error) {
            console.error('Failed to update user securities:', error);
            // Don't throw - this is not critical
        }
    }
    
    /**
     * Search stocks by symbol or name
     */
    async searchStocks(query) {
        try {
            if (!query || query.length < 1) {
                return [];
            }
            
            const allStocks = await db.stock_data.getAll();
            const searchTerm = query.toLowerCase();
            
            // Search by symbol or name
            const results = allStocks.filter(stock => 
                stock.symbol.toLowerCase().includes(searchTerm) ||
                stock.name.toLowerCase().includes(searchTerm)
            );
            
            // Sort by relevance (exact match first)
            results.sort((a, b) => {
                const aSymbolMatch = a.symbol.toLowerCase() === searchTerm;
                const bSymbolMatch = b.symbol.toLowerCase() === searchTerm;
                
                if (aSymbolMatch && !bSymbolMatch) return -1;
                if (!aSymbolMatch && bSymbolMatch) return 1;
                
                return a.symbol.localeCompare(b.symbol);
            });
            
            return results.slice(0, 50); // Limit to 50 results
        } catch (error) {
            console.error('Failed to search stocks:', error);
            return [];
        }
    }
    
    /**
     * Get stock by symbol
     */
    async getStockPrice(symbol) {
        try {
            return await db.stock_data.get(symbol);
        } catch (error) {
            console.error('Failed to get stock price:', error);
            return null;
        }
    }
    
    /**
     * Get metadata
     */
    async getMetadata() {
        try {
            const setting = await db.settings.get('stock_data_metadata');
            return setting ? setting.value : null;
        } catch (error) {
            console.error('Failed to get stock data metadata:', error);
            return null;
        }
    }
    
    /**
     * Get metadata synchronously (for UI binding)
     */
    getMetadataSync() {
        // This is a simplified version for sync access
        // In real app, would use reactive state management
        const cached = this._cachedMetadata;
        return cached || null;
    }
    
    /**
     * Set metadata
     */
    async setMetadata(metadata) {
        try {
            // Merge with existing metadata
            const existing = await this.getMetadata() || {};
            const updated = { ...existing, ...metadata };
            
            await db.settings.put({
                key: 'stock_data_metadata',
                value: updated
            });
            
            this._cachedMetadata = updated;
        } catch (error) {
            console.error('Failed to set stock data metadata:', error);
            throw error;
        }
    }
    
    /**
     * Get update status for UI
     */
    async getUpdateStatus() {
        try {
            const metadata = await this.getMetadata();
            
            if (!metadata || !metadata.last_update) {
                return {
                    status: 'never',
                    message: 'Stock data not downloaded yet',
                    daysSince: 999,
                    canUpdate: true
                };
            }
            
            const lastUpdate = new Date(metadata.last_update);
            const daysSince = this.getDaysSinceUpdate(lastUpdate);
            
            let status, message;
            
            if (daysSince === 0) {
                status = 'current';
                message = 'Stock data is current';
            } else if (daysSince === 1) {
                status = 'stale';
                message = 'Stock data is 1 day old';
            } else {
                status = 'stale';
                message = `Stock data is ${daysSince} days old`;
            }
            
            return {
                status,
                message,
                daysSince,
                lastUpdate: metadata.last_update,
                count: metadata.count || 0,
                canUpdate: !this.updating
            };
        } catch (error) {
            console.error('Failed to get update status:', error);
            return {
                status: 'error',
                message: 'Error checking stock data status',
                daysSince: 999,
                canUpdate: true
            };
        }
    }
    
    /**
     * Parse price string to float
     */
    parsePrice(priceStr) {
        if (!priceStr) return 0;
        const cleaned = priceStr.replace(/[$,]/g, '');
        return parseFloat(cleaned) || 0;
    }
    
    /**
     * Parse percentage string to float
     */
    parsePercent(percentStr) {
        if (!percentStr) return 0;
        const cleaned = percentStr.replace('%', '');
        return parseFloat(cleaned) || 0;
    }
    
    /**
     * Check for updates on app startup
     */
    async checkForUpdates() {
        try {
            this.lastUpdateCheck = new Date();
            const needsUpdate = await this.needsUpdate();
            
            return {
                needsUpdate,
                status: await this.getUpdateStatus()
            };
        } catch (error) {
            console.error('Failed to check for updates:', error);
            return {
                needsUpdate: false,
                status: { status: 'error', message: error.message }
            };
        }
    }
    
    /**
     * Auto-update if enabled in settings
     */
    async autoUpdate() {
        try {
            // Check if auto-update is enabled
            const autoUpdateSetting = await db.settings.get('auto_update_stock_data');
            const autoUpdate = autoUpdateSetting ? autoUpdateSetting.value : true; // Default: enabled
            
            if (!autoUpdate) {
                console.log('Auto-update disabled');
                return false;
            }
            
            // Check if update needed
            const needsUpdate = await this.needsUpdate();
            
            if (needsUpdate && navigator.onLine) {
                console.log('Auto-updating stock data...');
                await this.downloadLatestData();
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('Auto-update failed:', error);
            return false;
        }
    }
}

// Create singleton instance
const stockDataService = new StockDataService();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        StockDataService,
        stockDataService
    };
}
