/**
 * Centralized API Configuration for Curricula 2.0
 * Serverul Express servește și frontend-ul, deci API-ul e mereu pe același origin.
 */
const API_CONFIG = {
    get baseUrl() {
        return window.location.origin + '/api';
    }
};

// Export to window for global access
window.API_CONFIG = API_CONFIG;
