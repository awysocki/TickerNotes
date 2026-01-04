/**
 * Stock Data Import
 * Imports stock/security data from GitHub into local IndexedDB
 */

/**
 * Import stock data from GitHub
 */
async function importStockData(progressCallback) {
    try {
        // Fetch data from GitHub
        progressCallback('Fetching stock data from GitHub...', 0);
        const response = await fetch(STOCK_DATA_URL);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch data: ${response.status} ${response.statusText}`);
        }
        
        const stocks = await response.json();
        
        if (!Array.isArray(stocks)) {
            throw new Error('Invalid data format received');
        }
        
        progressCallback(`Found ${stocks.length} stocks. Starting import...`, 5);
        
        let imported = 0;
        let skipped = 0;
        const total = stocks.length;
        
        // Import in batches for better performance
        const batchSize = 500;
        for (let i = 0; i < stocks.length; i += batchSize) {
            const batch = stocks.slice(i, i + batchSize);
            const stockDataBatch = [];
            
            for (const stock of batch) {
                // Validate required fields
                if (!stock.symbol || !stock.name) {
                    skipped++;
                    continue;
                }
                
                // Parse and store stock data
                const stockData = {
                    symbol: stock.symbol.trim(),
                    name: stock.name.trim(),
                    last_sale: parsePrice(stock.lastsale),
                    net_change: parseNumber(stock.netchange),
                    pct_change: parsePercent(stock.pctchange),
                    volume: parseVolume(stock.volume),
                    market_cap: parseNumber(stock.marketCap),
                    country: stock.country || null,
                    ipo_year: stock.ipoyear && stock.ipoyear !== 'N/A' ? stock.ipoyear : null,
                    sector: stock.sector || null,
                    industry: stock.industry || null,
                    exchange: 'ALL',
                    type: 'stock',
                    updated_at: new Date().toISOString()
                };
                
                stockDataBatch.push(stockData);
                imported++;
            }
            
            // Bulk insert the batch
            if (stockDataBatch.length > 0) {
                await db.stock_data.bulkPut(stockDataBatch);
            }
            
            // Update progress
            const progress = 10 + Math.floor((i / total) * 85);
            progressCallback(`Imported ${imported} of ${total} stocks...`, progress);
        }
        
        progressCallback(`Import complete! Imported ${imported} stocks${skipped > 0 ? `, skipped ${skipped}` : ''}`, 100);
        
        // Store last import timestamp
        localStorage.setItem('stockDataLastImport', new Date().toISOString());
        
        return {
            success: true,
            imported,
            skipped,
            total: stocks.length
        };
        
    } catch (error) {
        console.error('Import error:', error);
        throw error;
    }
}

/**
 * Parse price string (e.g., "$123.45" -> 123.45)
 */
function parsePrice(value) {
    if (!value || value === 'N/A') return null;
    return parseFloat(String(value).replace(/[$,]/g, '')) || null;
}

/**
 * Parse number (handles commas)
 */
function parseNumber(value) {
    if (!value || value === 'N/A') return null;
    return parseFloat(String(value).replace(/,/g, '')) || null;
}

/**
 * Parse percentage (e.g., "5.2%" -> 5.2)
 */
function parsePercent(value) {
    if (!value || value === 'N/A') return null;
    return parseFloat(String(value).replace('%', '')) || null;
}

/**
 * Parse volume (integer)
 */
function parseVolume(value) {
    if (!value || value === 'N/A') return null;
    return parseInt(String(value).replace(/,/g, '')) || null;
}

/**
 * Get stock data statistics
 */
async function getStockDataStats() {
    try {
        const allStocks = await db.stock_data.getAll();
        
        // Count by sector
        const sectorCounts = {};
        allStocks.forEach(stock => {
            const sector = stock.sector || 'Uncategorized';
            sectorCounts[sector] = (sectorCounts[sector] || 0) + 1;
        });
        
        // Sort sectors by count
        const sortedSectors = Object.entries(sectorCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);
        
        // Get last import timestamp
        const lastImport = localStorage.getItem('stockDataLastImport');
        
        return {
            total: allStocks.length,
            sectors: sortedSectors,
            lastImport: lastImport ? new Date(lastImport) : null
        };
    } catch (error) {
        console.error('Stats error:', error);
        return null;
    }
}

/**
 * Check if stock data needs update (daily limit)
 */
function needsUpdate() {
    const lastImport = localStorage.getItem('stockDataLastImport');
    if (!lastImport) return true;
    
    const lastDate = new Date(lastImport);
    const now = new Date();
    const hoursSinceUpdate = (now - lastDate) / (1000 * 60 * 60);
    
    // Allow update once per day (24 hours)
    return hoursSinceUpdate >= 24;
}

/**
 * Format relative time (e.g., "2 days ago", "3 months ago")
 */
function formatRelativeTime(date) {
    const now = new Date();
    const diffMs = now - date;
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
}


