import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

interface CachedMedia {
  blobUrl: string;
  timestamp: number;
}

// Global cache that persists across component mounts
const mediaCache = new Map<string, CachedMedia>();
const loadingPromises = new Map<string, Promise<string | null>>();

// Cache expiration time (30 minutes)
const CACHE_EXPIRATION = 30 * 60 * 1000;

// Get cached session token
let cachedToken: string | null = null;
let tokenTimestamp = 0;
const TOKEN_CACHE_DURATION = 2 * 60 * 1000; // 2 minutes

// Invalidate cached token on auth state changes (login/logout)
supabase.auth.onAuthStateChange((_event, session) => {
  if (session?.access_token) {
    cachedToken = session.access_token;
    tokenTimestamp = Date.now();
  } else {
    cachedToken = null;
    tokenTimestamp = 0;
  }
});

const getAccessToken = async (): Promise<string | null> => {
  const now = Date.now();
  if (cachedToken && now - tokenTimestamp < TOKEN_CACHE_DURATION) {
    return cachedToken;
  }
  
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    cachedToken = session.access_token;
    tokenTimestamp = now;
    return cachedToken;
  }
  return null;
};

export const useMediaCache = () => {
  const [loadedUrls, setLoadedUrls] = useState<Set<string>>(new Set());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const getCachedUrl = useCallback((src: string): string | null => {
    const cached = mediaCache.get(src);
    if (cached && Date.now() - cached.timestamp < CACHE_EXPIRATION) {
      return cached.blobUrl;
    }
    // Clean up expired cache
    if (cached) {
      URL.revokeObjectURL(cached.blobUrl);
      mediaCache.delete(src);
    }
    return null;
  }, []);

  const loadMedia = useCallback(async (src: string): Promise<string | null> => {
    // Check cache first
    const cached = getCachedUrl(src);
    if (cached) {
      if (mountedRef.current) {
        setLoadedUrls(prev => new Set(prev).add(src));
      }
      return cached;
    }

    // Check if already loading
    const existingPromise = loadingPromises.get(src);
    if (existingPromise) {
      return existingPromise;
    }

    // Start loading
    const loadPromise = (async () => {
      try {
        const token = await getAccessToken();
        if (!token) {
          console.warn("No auth token available for media loading");
          return null;
        }

        const response = await fetch(src, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          console.warn(`Failed to load media: ${response.status} ${response.statusText}`);
          return null;
        }

        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);

        // Store in cache
        mediaCache.set(src, {
          blobUrl,
          timestamp: Date.now(),
        });

        if (mountedRef.current) {
          setLoadedUrls(prev => new Set(prev).add(src));
        }

        return blobUrl;
      } catch (error) {
        console.error("Error loading media:", error);
        return null;
      } finally {
        loadingPromises.delete(src);
      }
    })();

    loadingPromises.set(src, loadPromise);
    return loadPromise;
  }, [getCachedUrl]);

  const preloadMedia = useCallback(async (urls: string[]) => {
    // Load all URLs in parallel with concurrency limit
    const CONCURRENCY_LIMIT = 4;
    const results: (string | null)[] = [];
    
    for (let i = 0; i < urls.length; i += CONCURRENCY_LIMIT) {
      const batch = urls.slice(i, i + CONCURRENCY_LIMIT);
      const batchResults = await Promise.all(batch.map(url => loadMedia(url)));
      results.push(...batchResults);
    }
    
    return results;
  }, [loadMedia]);

  const isLoaded = useCallback((src: string): boolean => {
    return loadedUrls.has(src) || !!getCachedUrl(src);
  }, [loadedUrls, getCachedUrl]);

  return {
    loadMedia,
    preloadMedia,
    getCachedUrl,
    isLoaded,
  };
};

// Utility to generate video thumbnail from blob
export const generateVideoThumbnail = (videoUrl: string): Promise<string | null> => {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.preload = 'metadata';

    video.onloadeddata = () => {
      video.currentTime = 0.1; // Seek to 0.1 second for thumbnail
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 320;
        canvas.height = video.videoHeight || 180;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.7);
          resolve(thumbnailUrl);
        } else {
          resolve(null);
        }
      } catch {
        resolve(null);
      } finally {
        video.src = '';
        video.load();
      }
    };

    video.onerror = () => {
      resolve(null);
    };

    // Timeout after 5 seconds
    setTimeout(() => resolve(null), 5000);

    video.src = videoUrl;
    video.load();
  });
};

// Export a preload function for use outside of React components
export const preloadMediaUrls = async (urls: string[]): Promise<void> => {
  const token = await getAccessToken();
  if (!token) return;
  
  const CONCURRENCY_LIMIT = 4;
  
  for (let i = 0; i < urls.length; i += CONCURRENCY_LIMIT) {
    const batch = urls.slice(i, i + CONCURRENCY_LIMIT);
    await Promise.all(batch.map(async (src) => {
      // Skip if already cached
      const cached = mediaCache.get(src);
      if (cached && Date.now() - cached.timestamp < CACHE_EXPIRATION) {
        return;
      }
      
      try {
        const response = await fetch(src, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        
        if (response.ok) {
          const blob = await response.blob();
          const blobUrl = URL.createObjectURL(blob);
          mediaCache.set(src, { blobUrl, timestamp: Date.now() });
        }
      } catch (error) {
        console.error("Preload error:", error);
      }
    }));
  }
};
