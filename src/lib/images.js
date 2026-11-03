const load = (file) => new Promise((res, rej) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => { res({ img, url }); };
  img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('This photo could not be opened. Try taking it again.')); };
  img.src = url;
});
export const fileToImages = async (file, { aiMax = 1024, aiQuality = 0.7 } = {}) => {
  const { img, url } = await load(file);
  const draw = (max, q) => {
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', q);
  };
  const out = { full: draw(aiMax, aiQuality), thumb: draw(360, 0.72), large: draw(1000, 0.75) };
  URL.revokeObjectURL(url);
  return out;
};
export const decodeBarcodeFromFile = async (file) => {
  const { BrowserMultiFormatReader } = await import('@zxing/library');
  const { full } = await fileToImages(file, { aiMax: 1600, aiQuality: 0.9 });
  const reader = new BrowserMultiFormatReader();
  const r = await reader.decodeFromImageUrl(full);
  return r.getText();
};

// A centred square for profile photos.
export const fileToSquare = async (file, size = 320) => {
  const { img, url } = await load(file);
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  c.getContext('2d').drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
  URL.revokeObjectURL(url);
  return c.toDataURL('image/jpeg', 0.82);
};
