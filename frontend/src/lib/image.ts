// Photos are resized in the browser before upload: ≤1600px on the long side, JPEG (~300–500 KB).

export const MAX_DIMENSION = 1600;

/** Scales width/height down (never up) so the longer side is at most `max`. */
export const fitWithin = (width: number, height: number, max = MAX_DIMENSION) => {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
};

export const resizeToJpeg = async (file: Blob, quality = 0.85): Promise<Blob> => {
  // imageOrientation applies the camera's EXIF rotation.
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const { width, height } = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not process the photo'))),
      'image/jpeg',
      quality,
    ),
  );
};
