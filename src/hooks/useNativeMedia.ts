import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

export interface NativeMediaResult {
  webPath: string;
  format: string;
  mimeType: string;
  blob?: Blob;
  isVideo?: boolean;
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
          mimeType: `image/${image.format || 'jpeg'}`,
          isVideo: false,
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
  const pickImages = async (limit: number = 30): Promise<NativeMediaResult[]> => {
    try {
      const images = await Camera.pickImages({
        quality: 90,
        limit,
      });

      return images.photos.map(photo => ({
        webPath: photo.webPath || '',
        format: photo.format || 'jpeg',
        mimeType: `image/${photo.format || 'jpeg'}`,
        isVideo: false,
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
          mimeType: `image/${image.format || 'jpeg'}`,
          isVideo: false,
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
   * Pick videos from gallery using file picker
   */
  const pickVideos = async (limit: number = 10): Promise<NativeMediaResult[]> => {
    try {
      // Dynamically import FilePicker only when needed
      const { FilePicker } = await import('@capawesome/capacitor-file-picker');
      
      const result = await FilePicker.pickVideos({
        limit,
        readData: false,
      });

      return result.files.map(file => ({
        webPath: file.path || '',
        format: file.mimeType?.split('/')[1] || 'mp4',
        mimeType: file.mimeType || 'video/mp4',
        isVideo: true,
      })).filter(f => f.webPath);
    } catch (error: any) {
      console.error('Error picking videos:', error);
      if (error.message?.includes('cancelled') || error.message?.includes('canceled') || error.message?.includes('pickVideos aborted')) {
        return [];
      }
      throw error;
    }
  };

  /**
   * Pick media (images and videos) from gallery
   */
  const pickMedia = async (limit: number = 30): Promise<NativeMediaResult[]> => {
    try {
      // Dynamically import FilePicker only when needed
      const { FilePicker } = await import('@capawesome/capacitor-file-picker');
      
      const result = await FilePicker.pickMedia({
        limit,
        readData: false,
      });

      return result.files.map(file => {
        const isVideo = file.mimeType?.startsWith('video/') || false;
        return {
          webPath: file.path || '',
          format: file.mimeType?.split('/')[1] || (isVideo ? 'mp4' : 'jpeg'),
          mimeType: file.mimeType || (isVideo ? 'video/mp4' : 'image/jpeg'),
          isVideo,
        };
      }).filter(f => f.webPath);
    } catch (error: any) {
      console.error('Error picking media:', error);
      if (error.message?.includes('cancelled') || error.message?.includes('canceled') || error.message?.includes('pickMedia aborted')) {
        return [];
      }
      throw error;
    }
  };

  /**
   * Record a video using the camera app
   * Opens the native camera app in video mode
   */
  const recordVideo = async (): Promise<NativeMediaResult | null> => {
    try {
      // Use file picker to allow recording or picking video
      const { FilePicker } = await import('@capawesome/capacitor-file-picker');
      
      // Pick files with video types - on Android this will allow camera recording
      const result = await FilePicker.pickFiles({
        types: ['video/*'],
        limit: 1,
        readData: false,
      });

      if (result.files.length > 0) {
        const file = result.files[0];
        return {
          webPath: file.path || '',
          format: file.mimeType?.split('/')[1] || 'mp4',
          mimeType: file.mimeType || 'video/mp4',
          isVideo: true,
        };
      }
      return null;
    } catch (error: any) {
      console.error('Error recording video:', error);
      if (error.message?.includes('cancelled') || error.message?.includes('canceled') || error.message?.includes('aborted')) {
        return null;
      }
      throw error;
    }
  };

  /**
   * Convert a webPath/file path to a File object
   */
  const webPathToFile = async (webPath: string, fileName: string, mimeType: string = 'image/jpeg'): Promise<File> => {
    try {
      // For native paths, we need to use Capacitor Filesystem
      if (isNative && (webPath.startsWith('file://') || webPath.startsWith('content://'))) {
        const { Filesystem } = await import('@capacitor/filesystem');
        
        // Read the file as base64
        const fileData = await Filesystem.readFile({
          path: webPath,
        });
        
        // Convert base64 to blob
        const base64Data = fileData.data as string;
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: mimeType });
        
        return new File([blob], fileName, { type: mimeType });
      }
      
      // For web paths (http/https/blob)
      const response = await fetch(webPath);
      const blob = await response.blob();
      return new File([blob], fileName, { type: mimeType });
    } catch (error) {
      console.error('Error converting path to file:', error);
      // Fallback: try simple fetch
      const response = await fetch(webPath);
      const blob = await response.blob();
      return new File([blob], fileName, { type: mimeType });
    }
  };

  return {
    isNative,
    requestCameraPermissions,
    takePhoto,
    pickImages,
    pickImage,
    pickVideos,
    pickMedia,
    recordVideo,
    webPathToFile,
  };
}
