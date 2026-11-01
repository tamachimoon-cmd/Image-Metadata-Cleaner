import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanImage, detectMetadata, sniffFormat, outputName, MAX_FILE_BYTES } from '../src/metadata.js';

const encoder = new TextEncoder();
const jpeg = (...segments) => Uint8Array.from([0xff, 0xd8, ...segments.flat(), 0xff, 0xd9]);
const segment = (marker, payload) => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 255, ...payload];
const ascii = s => [...encoder.encode(s)];
const u32be = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u32le = n => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
const pngChunk = (name, data = []) => [...u32be(data.length), ...ascii(name), ...data, 0, 0, 0, 0];
const png = (...chunks) => Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, ...chunks.flat(), ...pngChunk('IEND')]);
const webpChunk = (name, data = []) => [...ascii(name), ...u32le(data.length), ...data, ...(data.length % 2 ? [0] : [])];
const webp = (...chunks) => {
  const body = chunks.flat();
  return Uint8Array.from([...ascii('RIFF'), ...u32le(body.length + 4), ...ascii('WEBP'), ...body]);
};
const cleanJpeg = jpeg(segment(0xe0, ascii('JFIF\0')));
const cleanPng = png(pngChunk('IHDR', new Array(13).fill(0)));
const cleanWebp = webp(webpChunk('VP8 ', [1, 2, 3, 4]));
const file = (bytes, name = 'foto.jpg', type = 'image/jpeg', size = bytes.byteLength) => ({ name, type, size, async arrayBuffer() { return bytes.slice().buffer; } });
const decode = async () => ({ width: 500, height: 400, close() {} });
const encode = async (_, type) => new Blob([type === 'image/png' ? cleanPng : type === 'image/webp' ? cleanWebp : cleanJpeg], { type });

test('reconhece assinaturas JPEG, PNG e WebP e recusa bytes desconhecidos', () => {
  assert.equal(sniffFormat(cleanJpeg), 'jpeg');
  assert.equal(sniffFormat(cleanPng), 'png');
  assert.equal(sniffFormat(cleanWebp), 'webp');
  assert.equal(sniffFormat(encoder.encode('<svg></svg>')), null);
  assert.equal(sniffFormat(new Uint8Array()), null);
});
test('detecta EXIF, XMP, IPTC, ICC e comentário em JPEG', () => {
  const bytes = jpeg(segment(0xe1, ascii('Exif\0\0')),
    segment(0xe1, ascii('http://ns.adobe.com/xap/1.0/')),
    segment(0xed, ascii('Photoshop 3.0')),
    segment(0xe2, ascii('ICC_PROFILE')),
    segment(0xfe, ascii('comentario')));
  assert.deepEqual(detectMetadata(bytes).labels, [
    'EXIF (pode conter localização)', 'XMP / APP1', 'IPTC / APP13', 'Perfil ICC', 'Comentário JPEG'
  ]);
});
test('não confunde cabeçalho JFIF com metadados pessoais', () => {
  assert.equal(detectMetadata(cleanJpeg).hasMetadata, false);
});
test('detecta chunks PNG e APNG sem ler valores', () => {
  const bytes = png(pngChunk('IHDR', [0]), pngChunk('tEXt', ascii('autor')), pngChunk('eXIf', [1]), pngChunk('iCCP', [2]), pngChunk('tIME', [3]), pngChunk('acTL', [4]));
  const found = detectMetadata(bytes);
  assert.equal(found.animated, true);
  assert.deepEqual(found.labels, ['Texto PNG', 'EXIF (pode conter localização)', 'Perfil ICC', 'Data PNG']);
});
test('detecta EXIF, XMP e animação em WebP', () => {
  const found = detectMetadata(webp(webpChunk('EXIF', [1]), webpChunk('XMP ', [2]), webpChunk('ANIM', [3])));
  assert.equal(found.animated, true);
  assert.deepEqual(found.labels, ['EXIF (pode conter localização)', 'XMP']);
});
test('parsers param com segmentos truncados sem exceção', () => {
  assert.deepEqual(detectMetadata(jpeg([0xff, 0xe1, 0xff, 0xff])).labels, []);
  assert.deepEqual(detectMetadata(png([0xff, 0xff, 0xff, 0xff, ...ascii('tEXt')])).labels, []);
  assert.deepEqual(detectMetadata(webp([ ...ascii('EXIF'), 0xff, 0xff, 0xff, 0xff ])).labels, []);
});
test('nome do arquivo limpo respeita formato e sanitiza caminhos', () => {
  assert.equal(outputName('imagem.JPEG', 'jpeg'), 'imagem-limpa.jpg');
  assert.equal(outputName('../fotos\\x.png', 'png'), '.._fotos_x-limpa.png');
  assert.equal(outputName('imagem', 'webp'), 'imagem-limpa.webp');
});
test('pipeline reconstrói imagem, valida saída e libera download', async () => {
  let closed = false;
  const result = await cleanImage(file(jpeg(segment(0xe1, ascii('Exif\0\0')))), {
    decode: async () => ({ width: 100, height: 100, close() { closed = true; } }), encode
  });
  assert.equal(result.before.hasMetadata, true);
  assert.equal(result.after.hasMetadata, false);
  assert.equal(result.name, 'foto-limpa.jpg');
  assert.equal(result.width, 100);
  assert.equal(closed, true);
});
test('pipeline suporta PNG e WebP', async () => {
  for (const [bytes, name, type] of [[cleanPng, 'a.png', 'image/png'], [cleanWebp, 'b.webp', 'image/webp']]) {
    const result = await cleanImage(file(bytes, name, type), { decode, encode });
    assert.equal(result.blob.type, type);
    assert.equal(result.after.hasMetadata, false);
  }
});
test('pipeline rejeita arquivos vazios, grandes, animados e tipo falsificado', async () => {
  await assert.rejects(cleanImage(file(new Uint8Array()), { decode, encode }), /15 MB/);
  await assert.rejects(cleanImage(file(cleanJpeg, 'large.jpg', 'image/jpeg', MAX_FILE_BYTES + 1), { decode, encode }), /15 MB/);
  await assert.rejects(cleanImage(file(cleanPng, 'wrong.jpg', 'image/jpeg'), { decode, encode }), /não corresponde/);
  await assert.rejects(cleanImage(file(png(pngChunk('acTL', [1])), 'animated.png', 'image/png'), { decode, encode }), /animadas/);
});
test('pipeline bloqueia imagens grandes demais e libera recursos', async () => {
  let closed = false;
  await assert.rejects(cleanImage(file(cleanJpeg), { decode: async () => ({ width: 10000, height: 10000, close() { closed = true; } }), encode }), /25 megapixels/);
  assert.equal(closed, true);
});
test('pipeline rejeita re-encode com metadados remanescentes', async () => {
  const dirty = jpeg(segment(0xe1, ascii('Exif\0\0')));
  await assert.rejects(cleanImage(file(cleanJpeg), { decode, encode: async () => new Blob([dirty], { type: 'image/jpeg' }) }), /ainda contém metadados/);
});
test('pipeline rejeita qualidade inválida e retorno de encoder inválido', async () => {
  await assert.rejects(cleanImage(file(cleanJpeg), { decode, encode, quality: 1.2 }), /Qualidade inválida/);
  await assert.rejects(cleanImage(file(cleanJpeg), { decode, encode: async () => null }), /imagem válida/);
});
test('pipeline rejeita assinatura desconhecida e leitura parcial', async () => {
  await assert.rejects(cleanImage(file(encoder.encode('not an image'), 'test.jpg'), { decode, encode }), /Formato inválido/);
  await assert.rejects(cleanImage(file(cleanJpeg, 'test.jpg', 'image/jpeg', cleanJpeg.length + 1), { decode, encode }), /arquivo completo/);
});
