import fs from 'node:fs';
import { sendReminder, buildRecap, renderEmail } from '../src/services/reminder.js';
import { closePools } from '../src/db/index.js';

/**
 * Uji/manual trigger pengingat email:
 *   npm run reminder                              -> pratinjau (dry-run, tidak mengirim)
 *   npm run reminder -- --send                    -> benar-benar mengirim email
 *   npm run reminder -- --html=pratinjau.html     -> simpan pratinjau HTML (buka di browser)
 */
const args = process.argv.slice(2);
const send = args.includes('--send');
const htmlArg = args.find((a) => a === '--html' || a.startsWith('--html='));

try {
  if (htmlArg) {
    const path = htmlArg.includes('=') ? htmlArg.split('=').slice(1).join('=') : 'reminder-preview.html';
    const recap = await buildRecap();
    if (!recap) throw new Error('Tidak ada periode input yang terbuka saat ini');
    const { subject, html } = renderEmail(recap);
    fs.writeFileSync(path, html);
    console.log(`Pratinjau HTML disimpan: ${path}`);
    console.log(`Subjek: ${subject}`);
  } else {
    const result = await sendReminder({ dryRun: !send });
    console.log('\n--- hasil ---');
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.sent || result.dryRun ? 0 : 1;
  }
} catch (err) {
  console.error('Gagal:', err.message || err);
  process.exitCode = 1;
} finally {
  await closePools();
}
