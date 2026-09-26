// Images are downscaled and re-encoded in the page before they become data URLs. In wasm the
// vision encoder runs on the CPU, so the downscale is aggressive: 512 px keeps an image under
// ~256 mtmd tokens and keeps the encoder out of the wall time that matters.
//
// The decision endpoint takes a `data:image/...;base64,...` URL, the chat endpoint takes the raw
// bytes as a content part, so a prepared image carries both - the same pixels, one encode.

const MAX_MB = 20;
const KEEP_BYTES = 256 * 1024; // small and already within the edge limit: re-encoding would only lose quality
const KEEP_TYPES = /^image\/(png|jpeg|webp)$/;

export interface PreparedImage {
  id: string;
  name: string;
  size: number;
  // for /v1/decision content parts
  url: string;
  mime: string;
  // for chat completion content parts
  bytes: ArrayBuffer;
  note: string;
  error?: string;
}

export function toBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < view.length; i += 0x8000) {
    s += String.fromCharCode(...view.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

export const dataUrl = (mime: string, bytes: ArrayBuffer) =>
  `data:${mime};base64,${toBase64(bytes)}`;

export const formatBytes = (bytes: number) =>
  bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export async function prepareImage(
  file: File,
  maxEdge: number
): Promise<PreparedImage> {
  const base = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: file.name || 'pasted image',
    size: file.size,
    url: '',
    mime: file.type || 'image/png',
    bytes: new ArrayBuffer(0),
    note: '',
  };
  if (file.size > MAX_MB * 1024 * 1024) {
    return { ...base, error: `too large (max ${MAX_MB} MB)` };
  }
  const original = async (note: string) => {
    const bytes = await file.arrayBuffer(); // a fresh copy: the File is not re-readable in every browser
    const mime = file.type || 'image/png';
    return { ...base, url: dataUrl(mime, bytes), mime, bytes, note };
  };

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return original(
      `image · ${formatBytes(file.size)} · not scaled (the model may still decode it)`
    );
  }
  const { width: sw, height: sh } = bitmap;
  const scale = Math.min(1, maxEdge / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  if (scale === 1 && file.size <= KEEP_BYTES && KEEP_TYPES.test(file.type)) {
    bitmap.close();
    return original(`image · ${sw}×${sh} · ${formatBytes(file.size)} · not re-encoded`);
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return original(`image · ${sw}×${sh} · ${formatBytes(file.size)} · not scaled`);
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#fff'; // JPEG has no alpha channel; a vision encoder has no use for one
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', file.type === 'image/png' ? 0.9 : 0.85)
  );
  if (!blob) {
    return original(`image · ${sw}×${sh} · ${formatBytes(file.size)} · not scaled`);
  }
  const bytes = await blob.arrayBuffer();
  const quality = Math.round((file.type === 'image/png' ? 0.9 : 0.85) * 100);
  return {
    ...base,
    url: dataUrl('image/jpeg', bytes),
    mime: 'image/jpeg',
    bytes,
    note: `image · ${sw}×${sh} → ${w}×${h} jpeg q${quality} · ${formatBytes(bytes.byteLength)}`,
  };
}

// Request previews replace base64 blobs, which are far too large to print.
export function shrinkPayload(value: unknown): unknown {
  if (typeof value === 'string') {
    if (value.startsWith('data:') && value.length > 128) {
      return `${value.slice(0, value.indexOf(','))},<${formatBytes(value.length * 0.75)}>`;
    }
    if (value.length > 512 && /^[A-Za-z0-9+/=]+$/.test(value.slice(0, 64))) {
      return `<base64, ${formatBytes(value.length * 0.75)}>`;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(shrinkPayload);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, shrinkPayload(v)])
    );
  }
  return value;
}
