// MARK: - Brevo-lijsten aanmaken
// Comment NL: Maakt de lijsten voor appupdates aan (bestaande lijsten met dezelfde naam worden hergebruikt)
// en print de JSON voor de Cloudflare-variabele BREVO_TOPIC_LIST_IDS.
// Gebruik: BREVO_API_KEY=xkeysib-... node scripts/create-brevo-lists.mjs
const API = 'https://api.brevo.com/v3/contacts';
const FOLDER = 'PulseOS email updates';
const TOPICS = {
  pulsefx: 'PulseFX updates', pulsevinyl: 'PulseVinyl updates', pulserecipes: 'PulseRecipes updates',
  pulsesidequest: 'PulseSideQuest updates', pulsereflect: 'PulseReflect updates', pulsewiish: 'PulseWiish updates',
  pulselift: 'PulseLift updates', pulsehabits: 'PulseHabits updates', releases: 'New PulseOS apps'
};

const key = process.env.BREVO_API_KEY;
if (!key) {
  console.error('Set BREVO_API_KEY first: BREVO_API_KEY=xkeysib-... node scripts/create-brevo-lists.mjs');
  process.exit(1);
}

async function brevo(path, body) {
  const response = await fetch(`${API}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', accept: 'application/json', 'api-key': key },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Brevo ${path}: ${response.status} ${data.message || ''}`);
  return data;
}

async function all(path, field) {
  const items = [];
  for (let offset = 0; ; offset += 50) {
    const page = await brevo(`${path}?limit=50&offset=${offset}`);
    items.push(...(page[field] || []));
    if (!page[field] || page[field].length < 50) return items;
  }
}

const folders = await all('/folders', 'folders');
const folderId = folders.find(folder => folder.name === FOLDER)?.id ?? (await brevo('/folders', { name: FOLDER })).id;
const lists = await all('/lists', 'lists');
const ids = {};
for (const [topic, name] of Object.entries(TOPICS)) {
  const existing = lists.find(list => list.name === name);
  ids[topic] = existing?.id ?? (await brevo('/lists', { name, folderId })).id;
  console.error(`${existing ? 'Reused ' : 'Created'} ${name} → ${ids[topic]}`);
}
console.error('\nPaste this into Cloudflare Pages as BREVO_TOPIC_LIST_IDS:\n');
console.log(JSON.stringify(ids));
