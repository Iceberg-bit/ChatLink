import express from 'express';
import { PrismaClient } from '@prisma/client';
import QRCode from 'qrcode';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Load .env variables manually for environment compatibility (e.g. on Render)
try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    for (const line of envConfig.split('\n')) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let val = match[2] || '';
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
        if (!process.env[key]) process.env[key] = val.trim();
      }
    }
  }
} catch (e) {
  console.warn('Could not load .env file:', e);
}

const app = express();
const prisma = new PrismaClient();
const port = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(express.json());
app.use(express.static('public'));

function normalize(data) {
  const label = String(data.label || '').trim().slice(0, 80);
  const countryCode = String(data.countryCode || '').replace(/\D/g, '');
  const phone = String(data.phone || '').replace(/\D/g, '');
  const message = String(data.message || '').trim();
  if (!countryCode || countryCode.length > 4) throw new Error('Enter a valid country code.');
  if (phone.length < 6 || phone.length > 15) throw new Error('Enter a valid phone number (6–15 digits).');
  if (!message || message.length > 500) throw new Error('Enter a message of up to 500 characters.');
  const url = `https://wa.me/${countryCode}${phone}?text=${encodeURIComponent(message)}`;
  return { label: label || null, countryCode, phone, message, url };
}

function appBaseUrl(req) { return `${req.protocol}://${req.get('host')}`; }
function createSlug() { return randomBytes(6).toString('base64url'); }

app.get('/api/links', async (_req, res) => {
  const links = await prisma.generatedLink.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(links);
});

app.get('/chatlink/:slug', async (req, res) => {
  const link = await prisma.generatedLink.findUnique({ where: { slug: req.params.slug } });
  if (!link) return res.status(404).send('ChatLink not found.');
  res.redirect(302, link.url);
});

app.get('/api/qr', async (req, res) => {
  const url = String(req.query.url || '');
  const format = req.query.format === 'png' ? 'png' : 'svg';
  let hostname = '';
  try { hostname = new URL(url).hostname; } catch { return res.status(400).send('Invalid QR URL'); }
  if (!['wa.me', req.hostname].includes(hostname) || url.length > 2500) return res.status(400).send('Invalid QR URL');

  const options = { margin: 2, errorCorrectionLevel: 'L', color: { dark: '#000000', light: '#ffffff' } };
  if (format === 'png') {
    res.type('png').send(await QRCode.toBuffer(url, { ...options, width: 1800 }));
  } else {
    res.type('image/svg+xml').send(await QRCode.toString(url, { ...options, type: 'svg' }));
  }
});

app.post('/api/links', async (req, res) => {
  try {
    const data = normalize(req.body);
    const slug = createSlug();
    const shortUrl = `${appBaseUrl(req)}/chatlink/${slug}`;
    const link = await prisma.generatedLink.create({ data: { ...data, qrUrl: data.url, shortUrl, slug } });
    res.status(201).json(link);
  } catch (error) {
    res.status(400).json({ error: error.message || 'Could not save this link.' });
  }
});

app.put('/api/links/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const data = normalize(req.body);
    const existing = await prisma.generatedLink.findUnique({ where: { id } });
    if (!existing) throw new Error('Link not found.');
    const slug = existing.slug || createSlug();
    const shortUrl = `${appBaseUrl(req)}/chatlink/${slug}`;
    const link = await prisma.generatedLink.update({ where: { id }, data: { ...data, qrUrl: data.url, shortUrl, slug } });
    res.json(link);
  } catch (error) {
    res.status(400).json({ error: error.message || 'Could not update this link.' });
  }
});

app.delete('/api/links/:id', async (req, res) => {
  try {
    await prisma.generatedLink.delete({ where: { id: Number(req.params.id) } });
    res.status(204).end();
  } catch {
    res.status(404).json({ error: 'Link not found.' });
  }
});

app.listen(port, () => console.log(`WhatsApp Link Generator running at http://localhost:${port}`));
