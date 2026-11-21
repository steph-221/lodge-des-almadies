// Réduit une photo avant envoi (1600 px au plus, JPEG) : téléphones modestes et Wi-Fi limité.
export function shrink(file: File, maxSide = 1600, quality = 0.8): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      const s = Math.min(1, maxSide / Math.max(im.width, im.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(im.width * s);
      cv.height = Math.round(im.height * s);
      cv.getContext('2d')!.drawImage(im, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      cv.toBlob((b) => (b ? resolve(b) : reject(new Error('Image illisible.'))), 'image/jpeg', quality);
    };
    im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible.')); };
    im.src = url;
  });
}
