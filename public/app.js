import { cleanImage, MAX_FILE_BYTES } from '/src/metadata.js';

const picker = document.querySelector('#picker');
const dropzone = document.querySelector('#dropzone');
const list = document.querySelector('#results');
const quality = document.querySelector('#quality');
const qualityValue = document.querySelector('#quality-value');
const status = document.querySelector('#status');
const empty = document.querySelector('#empty');
const summary = document.querySelector('#summary');
const reset = document.querySelector('#reset');
const queue = [];
let busy = false;

function formatBytes(n) {
  if (n < 1024) return n + ' B';
  return (n / 1024 / (n < 1024 * 1024 ? 1 : 1024)).toFixed(1) + ' ' + (n < 1024 * 1024 ? 'KB' : 'MB');
}
function setStatus(message) { status.textContent = message; }
async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { image: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    return { image, width: image.naturalWidth, height: image.naturalHeight };
  } finally { URL.revokeObjectURL(url); }
}
async function encode(decoded, type, compression) {
  const canvas = document.createElement('canvas');
  canvas.width = decoded.width;
  canvas.height = decoded.height;
  const context = canvas.getContext('2d', { alpha: type !== 'image/jpeg' });
  if (!context) throw new Error('Canvas indisponível neste navegador.');
  if (type === 'image/jpeg') {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.drawImage(decoded.image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve, reject) => canvas.toBlob(
    value => value ? resolve(value) : reject(new Error('Falha ao exportar imagem.')), type, compression
  ));
  canvas.width = 0;
  canvas.height = 0;
  return blob;
}
function make(tag, className, value) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (value !== undefined) el.textContent = value;
  return el;
}
function row(file) {
  const card = make('article', 'result-card');
  const head = make('div', 'result-head');
  const title = make('strong', 'file-name', file.name);
  const badge = make('span', 'badge pending', 'Na fila');
  head.append(title, badge);
  const details = make('p', 'result-details', formatBytes(file.size));
  const body = make('div', 'result-body');
  card.append(head, details, body);
  list.prepend(card);
  return { badge, details, body };
}
function release() {
  for (const item of queue) if (item.url) URL.revokeObjectURL(item.url);
  queue.length = 0;
  list.replaceChildren();
  empty.hidden = false;
  summary.textContent = 'Nenhuma imagem processada';
  setStatus('Aguardando imagens. Tudo é processado no seu navegador.');
}
function updateSummary() {
  const successful = queue.filter(x => x.url).length;
  const failed = queue.filter(x => x.failed).length;
  summary.textContent = successful + ' concluída(s) · ' + failed + ' erro(s)';
  empty.hidden = queue.length > 0;
}
async function processOne(item) {
  const { file, ui } = item;
  ui.badge.className = 'badge processing';
  ui.badge.textContent = 'Processando';
  try {
    const result = await cleanImage(file, { decode, encode, quality: Number(quality.value) / 100 });
    const url = URL.createObjectURL(result.blob);
    item.url = url;
    ui.badge.className = 'badge success';
    ui.badge.textContent = 'Limpa e verificada';
    const found = result.before.labels.length ? result.before.labels.join(' · ') : 'Nenhum metadado detectado';
    ui.details.textContent = result.width + ' × ' + result.height + ' px · ' + formatBytes(result.originalSize) + ' → ' + formatBytes(result.cleanedSize);
    ui.body.append(make('p', 'metadata-note', 'Antes: ' + found + '. Depois: nenhum metadado detectado.'));
    const actions = make('div', 'actions');
    const preview = make('img', 'thumbnail');
    preview.src = url;
    preview.alt = 'Prévia da imagem limpa ' + file.name;
    const link = make('a', 'download', 'Baixar imagem limpa ↗');
    link.href = url;
    link.download = result.name;
    actions.append(preview, link);
    ui.body.append(actions);
  } catch (error) {
    item.failed = true;
    ui.badge.className = 'badge error';
    ui.badge.textContent = 'Não processada';
    ui.body.append(make('p', 'error-text', error instanceof Error ? error.message : 'Erro desconhecido.'));
  }
  updateSummary();
}
async function addFiles(files) {
  if (busy) { setStatus('Aguarde o processamento atual.'); return; }
  const incoming = [...files];
  if (!incoming.length) return;
  busy = true;
  picker.disabled = true;
  reset.disabled = true;
  try {
    for (const file of incoming.slice(0, 20)) {
      const item = { file, ui: row(file) };
      queue.push(item);
      setStatus('Processando ' + file.name + '...');
      await processOne(item);
    }
    setStatus(incoming.length > 20 ? 'Limite de 20 imagens por lote. Envie as restantes em outro lote.' : 'Concluído. As imagens não saíram do navegador.');
  } finally {
    busy = false;
    picker.disabled = false;
    reset.disabled = false;
    picker.value = '';
  }
}
picker.addEventListener('change', event => addFiles(event.target.files));
dropzone.addEventListener('dragover', event => { event.preventDefault(); dropzone.classList.add('dragover'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', event => {
  event.preventDefault();
  dropzone.classList.remove('dragover');
  addFiles(event.dataTransfer.files);
});
quality.addEventListener('input', () => { qualityValue.textContent = quality.value + '%'; });
reset.addEventListener('click', release);
window.addEventListener('pagehide', () => {
  for (const item of queue) if (item.url) URL.revokeObjectURL(item.url);
});
setStatus('Pronto para JPEG, PNG e WebP. Limite: ' + Math.floor(MAX_FILE_BYTES / (1024 * 1024)) + ' MB por arquivo.');
