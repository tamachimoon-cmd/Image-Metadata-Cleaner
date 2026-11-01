/** Metadata detection and conversion orchestration. No personal values are parsed or transmitted. */
export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_PIXELS = 25_000_000;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const MIME = Object.freeze({ jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' });
const EXT = Object.freeze({ jpeg: '.jpg', png: '.png', webp: '.webp' });
const encoderTypes = new Set(Object.values(MIME));

function ascii(bytes, start, length) {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}
export function sniffFormat(data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes.length >= 8 && PNG_SIGNATURE.every((n, i) => bytes[i] === n)) return 'png';
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'webp';
  return null;
}
/** Detect classes of ancillary chunks without exposing their contents. */
export function detectMetadata(data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const format = sniffFormat(bytes);
  if (!format) throw new Error('Formato inválido. Use JPEG, PNG ou WebP.');
  const labels = new Set();
  let animated = false;
  if (format === 'jpeg') {
    let p = 2;
    while (p < bytes.length) {
      if (bytes[p++] !== 0xff) break;
      while (bytes[p] === 0xff) p++;
      const marker = bytes[p++];
      if (marker === 0xd9 || marker === 0xda || marker === undefined) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (p + 2 > bytes.length) break;
      const length = (bytes[p] << 8) | bytes[p + 1];
      if (length < 2 || p + length > bytes.length) break;
      const payload = p + 2;
      if (marker === 0xe1) {
        labels.add(ascii(bytes, payload, 6) === 'Exif\0\0' ? 'EXIF (pode conter localização)' : 'XMP / APP1');
      } else if (marker === 0xed) labels.add('IPTC / APP13');
      else if (marker === 0xe2 && ascii(bytes, payload, 11) === 'ICC_PROFILE') labels.add('Perfil ICC');
      else if (marker === 0xfe) labels.add('Comentário JPEG');
      p += length;
    }
  } else if (format === 'png') {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let p = 8;
    const map = { tEXt: 'Texto PNG', iTXt: 'Texto PNG', zTXt: 'Texto PNG', eXIf: 'EXIF (pode conter localização)', iCCP: 'Perfil ICC', tIME: 'Data PNG' };
    while (p + 12 <= bytes.length) {
      const length = view.getUint32(p, false);
      const type = ascii(bytes, p + 4, 4);
      if (length > bytes.length - p - 12) break;
      if (map[type]) labels.add(map[type]);
      if (type === 'acTL') animated = true;
      p += 12 + length;
      if (type === 'IEND') break;
    }
  } else {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const declaredSize = view.getUint32(4, true) + 8;
    let p = 12;
    const end = Math.min(bytes.length, declaredSize);
    const map = { EXIF: 'EXIF (pode conter localização)', 'XMP ': 'XMP', ICCP: 'Perfil ICC' };
    while (p + 8 <= end) {
      const type = ascii(bytes, p, 4);
      const length = view.getUint32(p + 4, true);
      if (length > end - p - 8) break;
      if (map[type]) labels.add(map[type]);
      if (type === 'ANIM' || type === 'ANMF') animated = true;
      p += 8 + length + (length % 2);
    }
  }
  return { format, labels: [...labels], hasMetadata: labels.size > 0, animated };
}
export function outputName(original, format) {
  const stem = String(original || 'imagem').replace(/\.(jpe?g|png|webp)$/i, '').replace(/[\\/\x00-\x1f\x7f]/g, '_').slice(0, 120) || 'imagem';
  return stem + '-limpa' + EXT[format];
}
/** decode/encode are injected so the pipeline can be tested without a DOM. */
export async function cleanImage(file, { decode, encode, quality = 0.9 } = {}) {
  if (!file || typeof file.arrayBuffer !== 'function' || !Number.isFinite(file.size)) throw new Error('Arquivo inválido.');
  if (file.size <= 0 || file.size > MAX_FILE_BYTES) throw new Error('O arquivo deve ter até 15 MB.');
  if (typeof decode !== 'function' || typeof encode !== 'function') throw new Error('Processador indisponível.');
  if (!Number.isFinite(quality) || quality < 0.5 || quality > 1) throw new Error('Qualidade inválida.');
  const source = new Uint8Array(await file.arrayBuffer());
  if (source.byteLength !== file.size) throw new Error('Não foi possível ler o arquivo completo.');
  const before = detectMetadata(source);
  if (before.animated) throw new Error('Imagens animadas não são aceitas para evitar perda de quadros.');
  if (file.type && file.type !== 'application/octet-stream' && file.type !== MIME[before.format]) {
    throw new Error('O tipo declarado não corresponde ao conteúdo da imagem.');
  }
  let decoded;
  try {
    decoded = await decode(file, before.format);
    if (!decoded || !Number.isSafeInteger(decoded.width) || !Number.isSafeInteger(decoded.height) ||
        decoded.width < 1 || decoded.height < 1 || decoded.width * decoded.height > MAX_PIXELS) {
      throw new Error('Dimensões inválidas ou acima de 25 megapixels.');
    }
    const blob = await encode(decoded, MIME[before.format], quality);
    if (!blob || typeof blob.arrayBuffer !== 'function' || !encoderTypes.has(blob.type) || blob.size === 0) {
      throw new Error('O navegador não conseguiu gerar uma imagem válida.');
    }
    const after = detectMetadata(new Uint8Array(await blob.arrayBuffer()));
    if (after.hasMetadata) throw new Error('O arquivo exportado ainda contém metadados. Exportação interrompida.');
    if (after.animated) throw new Error('O arquivo exportado não é uma imagem estática.');
    if (blob.type !== MIME[after.format]) throw new Error('Tipo de saída inconsistente.');
    return { blob, name: outputName(file.name, after.format), before, after, originalSize: file.size, cleanedSize: blob.size, width: decoded.width, height: decoded.height };
  } finally {
    if (decoded && typeof decoded.close === 'function') decoded.close();
  }
}
