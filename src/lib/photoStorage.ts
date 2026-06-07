import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

const PHOTOS_DIR_NAME = 'sighting-photos';
const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.7;

function getPhotosDir(): Directory {
  const dir = new Directory(Paths.document, PHOTOS_DIR_NAME);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/**
 * Downscales a freshly picked photo and moves it into the app's persistent
 * document storage. expo-image-picker saves into the cache directory, which
 * Android Auto Backup excludes — relocating (and shrinking) the file here is
 * what lets sighting photos survive a device restore within the backup quota.
 * No-op on web, where the picker returns blob/data URIs and nothing persists anyway.
 */
export async function persistSightingPhoto(sourceUri: string): Promise<string> {
  if (Platform.OS === 'web') return sourceUri;

  const original = await ImageManipulator.manipulate(sourceUri).renderAsync();
  const needsResize = original.width > MAX_DIMENSION || original.height > MAX_DIMENSION;
  const final = needsResize
    ? await ImageManipulator.manipulate(sourceUri)
        .resize(original.width >= original.height ? { width: MAX_DIMENSION } : { height: MAX_DIMENSION })
        .renderAsync()
    : original;
  const saved = await final.saveAsync({ compress: JPEG_QUALITY, format: SaveFormat.JPEG });

  const dest = new File(getPhotosDir(), `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`);
  await new File(saved.uri).move(dest);
  return dest.uri;
}

/** Deletes a persisted sighting photo file, if it exists. Safe no-op for remote/data URIs. */
export function deleteSightingPhoto(uri: string): void {
  if (!uri.startsWith('file://')) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {}
}
