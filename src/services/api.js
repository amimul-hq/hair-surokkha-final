import axios from 'axios';

// Base API URL uses relative path /api so it works locally and on Netlify
const API_BASE = '/api';

const apiClient = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Interceptor to inject Admin JWT token if present in localStorage
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('regrow_admin_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

// =========================================================================
// Client-Side In-Memory Cache & In-Flight Request Deduplication
// - Avoids repetitive API requests on internal page navigation
// - Delivers instant (0ms) page switches for customers
// - Deduplicates concurrent calls from multiple components (e.g. Navbar + Home)
// - Automatically invalidates cache whenever Admin creates/edits/deletes items
// =========================================================================
const apiCache = new Map();
const inFlightRequests = new Map();
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes cache lifetime

const getCachedOrFetch = async (cacheKey, fetchFn, ttlMs = DEFAULT_TTL_MS, force = false) => {
  const now = Date.now();
  const cached = apiCache.get(cacheKey);

  if (!force && cached && (now - cached.timestamp < ttlMs)) {
    return cached.data;
  }

  // Deduplicate concurrent in-flight requests for the same endpoint
  if (!force && inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey);
  }

  const requestPromise = (async () => {
    try {
      const data = await fetchFn();
      apiCache.set(cacheKey, { data, timestamp: Date.now() });
      return data;
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, requestPromise);
  return requestPromise;
};

export const clearApiCache = (keyPrefix = '') => {
  if (typeof window !== 'undefined') {
    try {
      if (window.sessionStorage) {
        window.sessionStorage.removeItem('hair_shurokkha_website_data_cache');
      }
      window.dispatchEvent(new CustomEvent('website-data-invalidated', { detail: { keyPrefix } }));
    } catch (e) {
      // Non-blocking browser storage/event handling
    }
  }

  if (!keyPrefix) {
    apiCache.clear();
  } else {
    for (const key of apiCache.keys()) {
      if (key.startsWith(keyPrefix)) {
        apiCache.delete(key);
      }
    }
  }
};

export const api = {
  // Public Cache Utilities
  clearCache: clearApiCache,

  // Centralized Public Website Data API (One fetch from the shared persistent document)
  getWebsiteData: async (force = false) => {
    return getCachedOrFetch('website-data', async () => {
      const res = await apiClient.get('/website-data');
      return res.data;
    }, 0, force);
  },

  // Public APIs with Caching (Backed by centralized cache)
  getSiteConfig: async (force = false) => {
    return getCachedOrFetch('site-config', async () => {
      const res = await apiClient.get('/site-config');
      return res.data;
    }, 5 * 60 * 1000, force);
  },

  getCategories: async (force = false) => {
    return getCachedOrFetch('categories', async () => {
      const res = await apiClient.get('/categories');
      return res.data;
    }, 5 * 60 * 1000, force);
  },

  getProducts: async (params = {}, force = false) => {
    const cacheKey = `products_${JSON.stringify(params)}`;
    return getCachedOrFetch(cacheKey, async () => {
      const res = await apiClient.get('/products', { params });
      return res.data;
    }, 3 * 60 * 1000, force);
  },

  getProductBySlug: async (slug, force = false) => {
    const cacheKey = `product_${slug}`;
    return getCachedOrFetch(cacheKey, async () => {
      const res = await apiClient.get(`/products/${slug}`);
      return res.data;
    }, 3 * 60 * 1000, force);
  },

  createOrder: async (orderPayload) => {
    const res = await apiClient.post('/orders', orderPayload);
    return res.data;
  },

  getOrderById: async (orderId) => {
    const res = await apiClient.get(`/orders/${orderId}`);
    return res.data;
  },

  // Admin APIs
  adminLogin: async (credentials) => {
    const res = await apiClient.post('/admin/login', credentials);
    return res.data;
  },

  getAdminMe: async () => {
    const res = await apiClient.get('/admin/me');
    return res.data;
  },

  getAdminDashboard: async () => {
    const res = await apiClient.get('/admin/dashboard');
    return res.data;
  },

  // Centralized Admin Website Data (Optimistic concurrency whole-document editing)
  getAdminWebsiteData: async () => {
    const res = await apiClient.get('/admin/website-data');
    return res.data;
  },

  updateAdminWebsiteData: async (websiteDataPayload, version) => {
    const res = await apiClient.put('/admin/website-data', {
      ...websiteDataPayload,
      version
    });
    clearApiCache('website-data');
    clearApiCache('site-config');
    clearApiCache('categories');
    clearApiCache('products');
    clearApiCache('product_');
    return res.data;
  },

  // Admin Products (auto-clears cache on mutations)
  getAdminProducts: async () => {
    const res = await apiClient.get('/admin/products');
    return res.data;
  },

  createAdminProduct: async (productData) => {
    const res = await apiClient.post('/admin/products', productData);
    clearApiCache('website-data');
    clearApiCache('products');
    clearApiCache('product_');
    return res.data;
  },

  updateAdminProduct: async (id, productData) => {
    const res = await apiClient.put(`/admin/products/${id}`, productData);
    clearApiCache('website-data');
    clearApiCache('products');
    clearApiCache('product_');
    return res.data;
  },

  deleteAdminProduct: async (id) => {
    const res = await apiClient.delete(`/admin/products/${id}`);
    clearApiCache('website-data');
    clearApiCache('products');
    clearApiCache('product_');
    return res.data;
  },

  // Admin Categories (auto-clears cache on mutations)
  getAdminCategories: async () => {
    const res = await apiClient.get('/admin/categories');
    return res.data;
  },

  createAdminCategory: async (categoryData) => {
    const res = await apiClient.post('/admin/categories', categoryData);
    clearApiCache('website-data');
    clearApiCache('categories');
    return res.data;
  },

  updateAdminCategory: async (id, categoryData) => {
    const res = await apiClient.put(`/admin/categories/${id}`, categoryData);
    clearApiCache('website-data');
    clearApiCache('categories');
    return res.data;
  },

  deleteAdminCategory: async (id) => {
    const res = await apiClient.delete(`/admin/categories/${id}`);
    clearApiCache('website-data');
    clearApiCache('categories');
    return res.data;
  },

  // Admin Orders
  getAdminOrders: async (params = {}) => {
    const res = await apiClient.get('/admin/orders', { params });
    return res.data;
  },

  getAdminOrderById: async (id) => {
    const res = await apiClient.get(`/admin/orders/${id}`);
    return res.data;
  },

  updateAdminOrderStatus: async (id, statusData) => {
    const res = await apiClient.put(`/admin/orders/${id}/status`, statusData);
    return res.data;
  },

  createAdminOrder: async (orderData) => {
    const res = await apiClient.post('/admin/orders', orderData);
    return res.data;
  },

  deleteAdminOrder: async (id) => {
    const res = await apiClient.delete(`/admin/orders/${id}`);
    return res.data;
  },

  // Admin Site Config (Homepage & CMS Editor)
  getAdminSiteConfig: async () => {
    const res = await apiClient.get('/admin/site-config');
    return res.data;
  },

  updateAdminSiteConfig: async (configData) => {
    const res = await apiClient.put('/admin/site-config', configData);
    clearApiCache('website-data');
    clearApiCache('site-config');
    return res.data;
  },

  // Admin Meta CAPI Logs
  verifyMetaConnection: async () => {
    const res = await apiClient.get('/admin/meta/verify-connection');
    return res.data;
  },

  getAdminMetaLogs: async (params = {}) => {
    const res = await apiClient.get('/admin/meta/logs', { params });
    return res.data;
  },

  getAdminMetaLogById: async (id) => {
    const res = await apiClient.get(`/admin/meta/logs/${id}`);
    return res.data;
  },

  retryAdminMetaLog: async (id) => {
    const res = await apiClient.post(`/admin/meta/logs/${id}/retry`);
    return res.data;
  },

  clearAdminMetaLogs: async (olderThanDays = null) => {
    const res = await apiClient.delete('/admin/meta/logs', {
      params: olderThanDays ? { olderThanDays } : {}
    });
    return res.data;
  },

  // Image Upload
  uploadImage: async (imagePayload) => {
    const res = await apiClient.post('/upload', imagePayload);
    return res.data;
  }
};

export default api;

