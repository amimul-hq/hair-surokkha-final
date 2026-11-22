import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';
import { initMetaPixel, captureAttribution } from '../utils/metaPixel';

const WebsiteDataContext = createContext(null);

export function WebsiteDataProvider({ children }) {
  const [websiteData, setWebsiteData] = useState(null);
  const hasDataRef = useRef(false);

  const [loading, setLoading] = useState(() => !websiteData);
  const [error, setError] = useState(null);
  const isFetchingRef = useRef(false);

  // Fetch one shared public document for all storefront components.
  const fetchWebsiteData = useCallback(async (force = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      if (!hasDataRef.current) {
        setLoading(true);
      }

      const res = await api.getWebsiteData(force);
      if (res && res.success && res.data) {
        hasDataRef.current = true;
        setWebsiteData(res.data);
        setError(null);

        // Initialize Meta Pixel once data arrives
        const meta = res.data.metaSettings;
        if (meta?.pixelId && meta?.isPixelEnabled !== false) {
          initMetaPixel(meta.pixelId);
        }
      }
    } catch (err) {
      console.warn('Failed to load centralized website data:', err);
      setError(err);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    // Capture any Facebook attribution cookies or UTM query params immediately
    captureAttribution();
    fetchWebsiteData();

    // Listen for data invalidation events triggered by admin updates
    const handleInvalidation = () => {
      fetchWebsiteData(true);
    };
    const handleVisibility = () => { if (!document.hidden) handleInvalidation(); };
    const timer = setInterval(() => { if (!document.hidden) handleInvalidation(); }, 15000);
    if (typeof window !== 'undefined') {
      window.addEventListener('website-data-invalidated', handleInvalidation);
      window.addEventListener('focus', handleInvalidation);
      document.addEventListener('visibilitychange', handleVisibility);
    }
    return () => {
      clearInterval(timer);
      if (typeof window !== 'undefined') {
        window.removeEventListener('website-data-invalidated', handleInvalidation);
        window.removeEventListener('focus', handleInvalidation);
        document.removeEventListener('visibilitychange', handleVisibility);
      }
    };
  }, [fetchWebsiteData]);

  // Derived state (memoized helpers for instant storefront access)
  const allCategories = websiteData?.categories || [];
  const categories = allCategories
    .filter(c => c.isActive !== false)
    .sort((a, b) => (Number(a.displayOrder) || 0) - (Number(b.displayOrder) || 0));

  const allProducts = websiteData?.products || [];
  const products = allProducts
    .filter(p => p.isActive !== false)
    .sort((a, b) => (Number(a.displayOrder ?? a.carouselOrder) || 0) - (Number(b.displayOrder ?? b.carouselOrder) || 0));

  const config = websiteData || null;
  const version = websiteData?.version || 1;

  // Instant in-memory helper functions (no network calls needed!)
  const getProductBySlug = useCallback((slug) => {
    if (!slug) return null;
    return allProducts.find(p => p.slug === slug || String(p._id) === String(slug)) || null;
  }, [allProducts]);

  const getCategoryBySlug = useCallback((slug) => {
    if (!slug) return null;
    return allCategories.find(c => c.slug === slug || String(c._id) === String(slug)) || null;
  }, [allCategories]);

  const getProductsByCategory = useCallback((catName) => {
    if (!catName || catName === 'All' || catName === 'All Products') {
      return products;
    }
    return products.filter(p => p.category && p.category.toLowerCase() === catName.toLowerCase());
  }, [products]);

  const contextValue = {
    websiteData,
    config,
    categories,
    allCategories,
    products,
    allProducts,
    loading,
    error,
    version,
    refreshWebsiteData: () => fetchWebsiteData(true),
    refreshConfig: () => fetchWebsiteData(true), // Alias for backward compatibility
    getProductBySlug,
    getCategoryBySlug,
    getProductsByCategory
  };

  return (
    <WebsiteDataContext.Provider value={contextValue}>
      {children}
    </WebsiteDataContext.Provider>
  );
}

export function useWebsiteData() {
  const context = useContext(WebsiteDataContext);
  if (!context) {
    throw new Error('useWebsiteData must be used within a WebsiteDataProvider');
  }
  return context;
}

// Backward compatibility alias for components calling useConfig()
export function useConfig() {
  const context = useContext(WebsiteDataContext);
  if (!context) {
    throw new Error('useConfig must be used within a WebsiteDataProvider');
  }
  return {
    config: context.config,
    loading: context.loading,
    error: context.error,
    refreshConfig: context.refreshConfig
  };
}

