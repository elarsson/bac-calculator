async function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('image load failed'));
    i.src = src;
  });
}

function require2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d unavailable');
  return ctx;
}

/** Square center-crop and scale to `size`. Returns a JPEG data URL. */
export async function resizeSquareJpeg(file: File, size: number, quality = 0.85): Promise<string> {
  const img = await loadImage(await readAsDataUrl(file));
  const minDim = Math.min(img.width, img.height);
  const sx = (img.width - minDim) / 2;
  const sy = (img.height - minDim) / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  require2d(canvas).drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
  return canvas.toDataURL('image/jpeg', quality);
}

/** Scale so the longer side is `maxDim`, preserving aspect ratio. */
export async function resizeMaxDimJpeg(file: File, maxDim: number, quality = 0.82): Promise<string> {
  const img = await loadImage(await readAsDataUrl(file));
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  require2d(canvas).drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}
