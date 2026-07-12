const $ = (selector) => document.querySelector(selector);
const form = $('#link-form');
const fields = ['label', 'countryCode', 'phone', 'message'].reduce((acc, id) => ({ ...acc, [id]: $(`#${id}`) }), {});
let currentUrl = '';
let currentQrUrl = '';
let editingId = null;
const isStaticDeployment = window.location.hostname.endsWith('.github.io');
const qrOptions = { margin: 4, errorCorrectionLevel: 'L', color: { dark: '#000000', light: '#ffffff' } };

function isPublicHost(hostname = window.location.hostname) {
  const host = hostname.toLowerCase();
  const privateIpv4 = /^(?:10|127)\.|^192\.168\.|^172\.(?:1[6-9]|2\d|3[0-1])\./;
  return Boolean(host) && host !== 'localhost' && host !== '::1' && !host.endsWith('.local') && !privateIpv4.test(host);
}

function qrTarget(link) {
  // A phone cannot reach localhost or a private network address. In those
  // environments encode WhatsApp directly; use our compact redirect only
  // after the app is deployed to a publicly reachable domain.
  if (typeof link === 'string') return link;
  return !isStaticDeployment && isPublicHost() && link.slug ? `${window.location.origin}/chatlink/${link.slug}` : link.url;
}

function setTheme(isDark) {
  document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
  localStorage.setItem('chatlink-theme', isDark ? 'dark' : 'light');
  const toggle = $('#theme-toggle');
  toggle.setAttribute('aria-pressed', String(isDark));
  toggle.setAttribute('aria-label', `Switch to ${isDark ? 'light' : 'dark'} mode`);
  toggle.querySelector('.theme-icon').textContent = isDark ? '☀' : '☾';
  toggle.querySelector('.theme-label').textContent = isDark ? 'Light mode' : 'Dark mode';
  document.querySelector('meta[name="theme-color"]').content = isDark ? '#112019' : '#075E54';
}
const storedTheme = localStorage.getItem('chatlink-theme');
setTheme(storedTheme ? storedTheme === 'dark' : document.documentElement.dataset.theme === 'dark');
$('#theme-toggle').addEventListener('click', () => setTheme(document.documentElement.dataset.theme !== 'dark'));

function formData() { return Object.fromEntries(Object.entries(fields).map(([key, el]) => [key, el.value])); }
function cleaned() { const v = formData(); return { ...v, countryCode: v.countryCode.replace(/\D/g, ''), phone: v.phone.replace(/\D/g, '') }; }
function urlFor(data) { return data.countryCode && data.phone && data.message.trim() ? `https://wa.me/${data.countryCode}${data.phone}?text=${encodeURIComponent(data.message.trim())}` : 'https://wa.me/…?text=…'; }
function updatePreview() { const data = cleaned(); $('#url-preview').textContent = urlFor(data); $('#message-count').textContent = `${data.message.length.toLocaleString()} / 500`; }
Object.values(fields).forEach((el) => el.addEventListener('input', updatePreview));

function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2200); }
async function copy(text) { try { await navigator.clipboard.writeText(text); toast('Copied to clipboard'); } catch { toast('Copy failed — please select the link manually'); } }
function download(content, filename, type) { const blob = new Blob([content], { type }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href); }
function qrUrl(format) { return `/api/qr?format=${format}&url=${encodeURIComponent(currentQrUrl || currentUrl)}`; }

async function renderQr() {
  const display = $('#qr-display');
  if (!isStaticDeployment) {
    display.innerHTML = `<img src="${qrUrl('svg')}" width="135" height="135" alt="QR code for this WhatsApp link" />`;
    return;
  }
  if (!window.QRCode) throw new Error('QR generator could not be loaded. Check your internet connection and try again.');
  display.innerHTML = await QRCode.toString(currentQrUrl, { ...qrOptions, type: 'svg', width: 360 });
  display.querySelector('svg').setAttribute('aria-label', 'QR code for this WhatsApp link');
}

async function downloadQr(format) {
  if (!isStaticDeployment) {
    const a = document.createElement('a'); a.href = qrUrl(format); a.download = `whatsapp-link-qr.${format}`; a.click();
    return;
  }
  if (!window.QRCode) return toast('QR generator could not be loaded.');
  if (format === 'png') return download(await QRCode.toDataURL(currentQrUrl, { ...qrOptions, width: 1800 }), 'whatsapp-link-qr.png', 'image/png');
  return download(await QRCode.toString(currentQrUrl, { ...qrOptions, type: 'svg', width: 1200 }), 'whatsapp-link-qr.svg', 'image/svg+xml');
}

async function showResult(link) {
  const url = typeof link === 'string' ? link : link.url;
  currentUrl = url; currentQrUrl = qrTarget(link);
  $('#result').classList.remove('hidden'); $('#result-url').textContent = url; $('#result-url').href = url; $('#open-whatsapp').href = url;
  $('#qr-caption').textContent = isPublicHost() && typeof link !== 'string'
    ? 'Short QR · opens your WhatsApp link'
    : 'Direct WhatsApp QR · deploy for a shorter code';
  await renderQr();
  $('#result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function validate(data) { if (!data.countryCode || data.countryCode.length > 4) return 'Enter a valid country code.'; if (data.phone.length < 6 || data.phone.length > 15) return 'Enter a valid phone number (6–15 digits).'; if (!data.message.trim()) return 'Write the message you would like to pre-fill.'; if (data.message.length > 500) return 'Keep the message to 500 characters or fewer.'; return ''; }

form.addEventListener('submit', async (event) => {
  event.preventDefault(); const data = cleaned(); const error = validate(data); $('#form-error').textContent = error; if (error) return;
  if (isStaticDeployment) {
    try { await showResult(urlFor(data)); toast('Link generated in your browser'); } catch (err) { $('#form-error').textContent = err.message || 'Could not generate the QR code.'; }
    return;
  }
  const targetId = form.dataset.editingId || editingId;
  const isEditing = targetId !== undefined && targetId !== null && targetId !== '';
  const method = isEditing ? 'PUT' : 'POST'; const endpoint = isEditing ? `/api/links/${targetId}` : '/api/links';
  try { const response = await fetch(endpoint, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); const saved = await response.json(); if (!response.ok) throw new Error(saved.error); await showResult(saved); toast(isEditing ? 'Link updated' : 'Link saved locally'); editingId = null; delete form.dataset.editingId; $('.generate span').textContent = 'Generate link'; loadHistory(); } catch (err) { $('#form-error').textContent = err.message || 'Something went wrong.'; }
});

$('#copy-result').addEventListener('click', () => copy(currentUrl));
$('#download-png').addEventListener('click', () => downloadQr('png'));
$('#download-svg').addEventListener('click', () => downloadQr('svg'));

function escapeHtml(value) { return value.replace(/[&<>'"]/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' })[char]); }
function dateText(iso) { return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso)); }
function dateTimeText(iso) { return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(iso)); }
async function loadHistory() {
  if (isStaticDeployment) {
    $('#history-table').classList.add('hidden');
    $('#empty-state').classList.remove('hidden');
    $('#empty-state p').innerHTML = 'Links are generated in your browser.<br><small>GitHub Pages does not store link history.</small>';
    return;
  }
  try { const response = await fetch('/api/links'); const items = await response.json(); const table = $('#history-table'); const empty = $('#empty-state'); $('#history-count').textContent = items.length ? `${items.length} saved` : ''; empty.classList.toggle('hidden', !!items.length); table.classList.toggle('hidden', !items.length);
    table.querySelector('tbody').innerHTML = items.map(item => `<tr><td><span class="link-title">${escapeHtml(item.label || 'Untitled link')}</span><span class="link-number">+${item.countryCode} ${item.phone}</span></td><td class="message-cell" title="${escapeHtml(item.message)}">${escapeHtml(item.message)}</td><td class="date-cell">${dateText(item.createdAt)}</td><td class="date-cell">${dateTimeText(item.updatedAt || item.createdAt)}</td><td><div class="row-actions"><button class="icon-button" data-copy="${item.id}" title="Copy link">Copy</button><button class="icon-button" data-qr="${item.id}" title="Show QR">QR</button><button class="icon-button" data-edit="${item.id}" title="Edit link">Edit</button><button class="icon-button delete" data-delete="${item.id}" title="Delete link">Delete</button></div></td></tr>`).join('');
    table.querySelector('tbody').onclick = async (event) => { const button = event.target.closest('button'); if (!button) return; const actionId = button.dataset.copy || button.dataset.qr || button.dataset.edit || button.dataset.delete; const id = Number(actionId); const item = items.find(x => x.id === id); if (!item) return; if (button.dataset.copy) copy(item.url); if (button.dataset.qr) showResult(item); if (button.dataset.edit) { Object.entries(fields).forEach(([key, el]) => el.value = item[key] || ''); editingId = item.id; form.dataset.editingId = String(item.id); $('.generate span').textContent = 'Save changes'; updatePreview(); window.scrollTo({ top: 0, behavior: 'smooth' }); } if (button.dataset.delete && confirm(`Delete “${item.label || 'this link'}”?`)) { await fetch(`/api/links/${id}`, { method: 'DELETE' }); toast('Link deleted'); loadHistory(); } };
  } catch { $('#empty-state p').innerHTML = 'History could not be loaded.<br><small>Start the local server to enable saved links.</small>'; }
}
updatePreview(); loadHistory();
