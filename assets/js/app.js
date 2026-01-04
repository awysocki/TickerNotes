/**
 * App JavaScript utilities
 * Common functions used across the application
 */

// API helper function
async function apiRequest(url, options = {}) {
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            'X-App-Version': '1.0.0',
            ...options.headers
        }
    };
    
    const response = await fetch(url, { ...options, ...defaultOptions });
    const data = await response.json();
    
    if (!response.ok) {
        throw new Error(data.error || 'Request failed');
    }
    
    return data;
}

// Format date helper
function formatDate(dateString) {
    if (!dateString) return '';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        if (diffHours === 0) {
            const diffMins = Math.floor(diffMs / (1000 * 60));
            return diffMins <= 1 ? 'Just now' : `${diffMins} minutes ago`;
        }
        return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
    }
    
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) {
        const weeks = Math.floor(diffDays / 7);
        return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
    }
    
    return date.toLocaleDateString();
}

// Format date time helper
function formatDateTime(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleString();
}

// Debounce helper
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Show toast notification (using Bootstrap)
function showToast(message, type = 'info') {
    // Create toast element
    const toastEl = document.createElement('div');
    toastEl.className = `toast align-items-center text-white bg-${type} border-0`;
    toastEl.setAttribute('role', 'alert');
    toastEl.setAttribute('aria-live', 'assertive');
    toastEl.setAttribute('aria-atomic', 'true');
    
    toastEl.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">${message}</div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>
    `;
    
    // Add to container
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
        document.body.appendChild(container);
    }
    
    container.appendChild(toastEl);
    
    // Show toast
    const toast = new bootstrap.Toast(toastEl);
    toast.show();
    
    // Remove after hidden
    toastEl.addEventListener('hidden.bs.toast', () => {
        toastEl.remove();
    });
}

// PWA install prompt
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    
    // Show custom install prompt
    showInstallPrompt();
});

function showInstallPrompt() {
    const prompt = document.createElement('div');
    prompt.className = 'pwa-install-prompt show';
    prompt.innerHTML = `
        <div class="d-flex align-items-center justify-content-between">
            <div>
                <strong>Install TickerNotes</strong>
                <p class="mb-0 small">Install our app for a better experience</p>
            </div>
            <div class="ms-3">
                <button class="btn btn-primary btn-sm" id="install-btn">Install</button>
                <button class="btn btn-secondary btn-sm ms-2" id="dismiss-btn">Dismiss</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(prompt);
    
    document.getElementById('install-btn').addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            await deferredPrompt.userChoice;
            deferredPrompt = null;
        }
        prompt.remove();
    });
    
    document.getElementById('dismiss-btn').addEventListener('click', () => {
        prompt.remove();
    });
}

// Online/Offline detection
window.addEventListener('online', () => {
    showToast('Connection restored', 'success');
});

window.addEventListener('offline', () => {
    showToast('No internet connection', 'warning');
});

// Export functions for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        apiRequest,
        formatDate,
        formatDateTime,
        debounce,
        showToast
    };
}
