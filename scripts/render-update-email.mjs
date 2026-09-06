// MARK: - Update-mail opmaken
// Comment NL: Maakt alleen lokale HTML en tekst van gecontroleerde releasenotities; verstuurt geen berichten.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

const [source, output] = process.argv.slice(2);
if (!source || !output) throw new Error('Usage: node scripts/render-update-email.mjs release.json output.html');
const release = JSON.parse(await readFile(source, 'utf8'));
const names = { pulsefx: 'PulseFX', pulsevinyl: 'PulseVinyl', pulserecipes: 'PulseRecipes', pulsesidequest: 'PulseSideQuest', pulsereflect: 'PulseReflect', pulsewiish: 'PulseWiish', pulselift: 'PulseLift', pulsehabits: 'PulseHabits' };
if (!names[release.app] || typeof release.version !== 'string' || !release.version.trim()) throw new Error('App and version are required');
if (!Array.isArray(release.changes) || !release.changes.length || release.changes.some(change => typeof change !== 'string' || !change.trim())) throw new Error('Provide at least one release note');
const url = new URL(release.appStoreUrl);
if (url.protocol !== 'https:' || url.hostname !== 'apps.apple.com' || url.username || url.password) throw new Error('Use the official App Store link');
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const name = names[release.app];
const subject = `${name} ${release.version} — what’s new`;
const intro = release.intro || `A new update for ${name} is ready. Here’s what changed.`;
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(subject)}</title></head>
<body style="margin:0;padding:32px 16px;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#16171a;">
<div style="max-width:560px;margin:auto;background:#fff;border-radius:20px;overflow:hidden;">
<div style="padding:36px;">
${release.example ? '<p style="font-size:12px;color:#666;">EXAMPLE · Based on an earlier release. Not a new announcement.</p>' : ''}
<p style="font-size:13px;letter-spacing:3px;font-weight:bold;">PULSE<span style="color:#007aff;">OS</span></p>
<p style="margin-top:36px;color:#666;font-size:13px;">${escape(name)} · VERSION ${escape(release.version)}</p>
<h1 style="font-size:34px;line-height:1.1;letter-spacing:-1px;margin:12px 0 20px;">A little better.<br>A little more ${escape(name)}.</h1>
<p style="font-size:16px;line-height:1.7;color:#555;">${escape(intro)}</p>
<h2 style="font-size:20px;margin-top:30px;">What’s new</h2>
<ul style="padding-left:20px;font-size:16px;line-height:1.7;">${release.changes.map(change => `<li style="margin-bottom:10px;">${escape(change)}</li>`).join('')}</ul>
<p style="margin:32px 0;"><a href="${escape(url.href)}" style="display:inline-block;padding:15px 24px;background:#16171a;color:#fff;border-radius:10px;text-decoration:none;font-weight:bold;">View update on the App Store ↗</a></p>
<p style="font-size:15px;line-height:1.7;color:#555;">Thanks for making ${escape(name)} part of your day.<br>Kuno · PulseOS</p>
</div>
<div style="padding:24px 36px;border-top:1px solid #eee;font-size:12px;line-height:1.7;color:#777;">You received this because you signed up for ${escape(name)} updates.<br><a href="{{ unsubscribe }}" style="color:#777;">Unsubscribe</a> · <a href="https://pulseos.eu/privacy/" style="color:#777;">Privacy</a></div>
</div></body></html>`;
await mkdir(dirname(resolve(output)), { recursive: true });
await writeFile(output, html);
await writeFile(output.replace(/\.html$/, '') + '.txt', `${release.example ? 'EXAMPLE — earlier release, not a new announcement.\n\n' : ''}${subject}\n\n${intro}\n\n${release.changes.map(change => '- ' + change).join('\n')}\n\nView update: ${url.href}\n\nUnsubscribe: {{ unsubscribe }}\n`);
console.log(`Email preview created for ${name}; nothing sent.`);
