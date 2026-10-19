import express from 'express';
import cookieParser from 'cookie-parser';
import cron from 'node-cron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import authRoutes from './routes/auth.routes.js';
import metaRoutes from './routes/meta.routes.js';   
import ideaRoutes from './routes/ideas.routes.js';
import targetRoutes from './routes/targets.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import reportRoutes from './routes/report.routes.js';
import emailRoutes from './routes/emails.routes.js';
import { notFound } from './utils/http.js';
import { sendReminder } from './services/reminder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api', metaRoutes);
app.use('/api', ideaRoutes);
app.use('/api/targets', targetRoutes);
app.use('/api', dashboardRoutes);
app.use('/api', reportRoutes);
app.use('/api', emailRoutes);

app.use('/api', notFound);

/* Serve build Angular (produksi intranet: satu proses, satu port) */
// Check multiple locations for frontend dist:
// 1. Docker: /app/backend/dist/cr-dashboard/browser (from COPY frontend/dist ./dist)
// 2. Docker alt: /app/dist (if copied there instead)
// 3. Local dev: ../../frontend/dist/cr-dashboard/browser
const distDirDocker = path.resolve(__dirname, '../dist/cr-dashboard/browser');
const distDirDockerAlt = path.resolve(__dirname, '../../../dist');
const distDirLocal = path.resolve(__dirname, '../../frontend/dist/cr-dashboard/browser');

let distDir = null;
if (fs.existsSync(distDirDocker)) {
  distDir = distDirDocker;
} else if (fs.existsSync(distDirDockerAlt)) {
  distDir = distDirDockerAlt;
} else if (fs.existsSync(distDirLocal)) {
  distDir = distDirLocal;
}

console.log(`[SPA] Looking for frontend at: ${distDir}`);
console.log(`[SPA] Found: ${distDir ? 'YES' : 'NO - API only mode'}`);

if (distDir) {
  app.use(express.static(distDir));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
} else {
  console.log('[SPA] WARNING: No frontend found. Only API routes available.');
}

/* Error handler */
app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ message: err.status ? err.message : 'Terjadi kesalahan pada server' });
});

app.listen(config.port, () => {
  console.log(`CR Monitor API berjalan di http://localhost:${config.port} (db: ${config.dbClient})`);
});

/* Pengingat email otomatis: default pukul 08:00 tanggal 12 setiap bulan (Asia/Jakarta). */
if (config.reminder.cron && cron.validate(config.reminder.cron)) {
  cron.schedule(config.reminder.cron, async () => {
    try {
      const result = await sendReminder();
      console.log('[reminder] dijalankan:', new Date().toISOString(), JSON.stringify({
        sent: result.sent,
        reason: result.reason,
        recipients: result.recipients?.length ?? 0
      }));
    } catch (err) {
      console.error('[reminder] gagal:', err.message || err);
    }
  }, { timezone: config.reminder.timezone });
  console.log(`[reminder] Email pengingat terjadwal: "${config.reminder.cron}" (${config.reminder.timezone})`);
} else if (config.reminder.cron) {
  console.warn(`[reminder] Jadwal tidak valid: "${config.reminder.cron}" — pengingat email nonaktif.`);
}
