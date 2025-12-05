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

export const useMediaCache = () => {
  const [loadedUrls, setLoadedUrls] = useState<Set<string>>(new Set());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
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
        if (!token) return null;

        const response = await fetch(src, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) return null;

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
  }, [getAccessToken, getCachedUrl]);

  const preloadMedia = useCallback(async (urls: string[]) => {
    // Load all URLs in parallel
    await Promise.all(urls.map(url => loadMedia(url)));
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
