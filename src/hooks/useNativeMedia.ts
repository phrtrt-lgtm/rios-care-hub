import { Camera, CameraResultType, CameraSource, Photo } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

export interface NativeMediaResult {
  webPath: string;
  format: string;
  blob?: Blob;
}

/**
 * Hook to handle native media capture (camera/gallery) with Capacitor
 */
export function useNativeMedia() {
  const isNative = Capacitor.isNativePlatform();

  /**
   * Request camera permissions
   */
  const requestCameraPermissions = async (): Promise<boolean> => {
    if (!isNative) return true; // Web doesn't need explicit permissions
    
    try {
      const permissions = await Camera.requestPermissions({ permissions: ['camera', 'photos'] });
      console.log('Camera permissions:', permissions);
      return permissions.camera === 'granted' || permissions.photos === 'granted';
    } catch (error) {
      console.error('Error requesting camera permissions:', error);
      return false;
    }
  };

  /**
   * Take a photo using the native camera
   */
  const takePhoto = async (): Promise<NativeMediaResult | null> => {
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
        saveToGallery: false,
      });

      if (image.webPath) {
        return {
          webPath: image.webPath,
          format: image.format || 'jpeg',
        };
      }
      return null;
    } catch (error: any) {
      console.error('Error taking photo:', error);
      if (error.message?.includes('cancelled') || error.message?.includes('canceled')) {
        return null; // User cancelled
      }
      throw error;
    }
  };

  /**
   * Pick images from gallery
   */
  const pickImages = async (limit: number = 10): Promise<NativeMediaResult[]> => {
    try {
      const images = await Camera.pickImages({
        quality: 90,
        limit,
      });

      return images.photos.map(photo => ({
        webPath: photo.webPath || '',
        format: photo.format || 'jpeg',
      })).filter(p => p.webPath);
    } catch (error: any) {
      console.error('Error picking images:', error);
      if (error.message?.includes('cancelled') || error.message?.includes('canceled')) {
        return [];
      }
      throw error;
    }
  };

  /**
   * Pick a single image from gallery
   */
  const pickImage = async (): Promise<NativeMediaResult | null> => {
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Photos,
      });

      if (image.webPath) {
        return {
          webPath: image.webPath,
          format: image.format || 'jpeg',
        };
      }
      return null;
    } catch (error: any) {
      console.error('Error picking image:', error);
      if (error.message?.includes('cancelled') || error.message?.includes('canceled')) {
        return null;
      }
      throw error;
    }
  };

  /**
   * Convert a webPath to a File object
   */
  const webPathToFile = async (webPath: string, fileName: string, mimeType: string = 'image/jpeg'): Promise<File> => {
    const response = await fetch(webPath);
    const blob = await response.blob();
    return new File([blob], fileName, { type: mimeType });
  };

  return {
    isNative,
    requestCameraPermissions,
    takePhoto,
    pickImages,
    pickImage,
    webPathToFile,
  };
}
