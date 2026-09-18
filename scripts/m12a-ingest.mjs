/* global fetch, console */
import { mkdir, writeFile } from 'node:fs/promises';

const CANTILUX_COMMIT = 'df536fe94c92cff49cc531f7283f6995b881fefa';
const RSCHAEFF_COMMIT = 'be1ccac53d77717bb96353263f7799fa6fddc7c5';
const CANTILUX_BASE = `https://raw.githubusercontent.com/Cantilux/dnd-srd-json/${CANTILUX_COMMIT}/data`;
const RSCHAEFF_URL = `https://raw.githubusercontent.com/rschaeff/srd/${RSCHAEFF_COMMIT}/spells.json`;
const ANCHORS = new Set(['fire-bolt', 'sacred-flame', 'cure-wounds', 'guiding-bolt', 'burning-hands', 'detect-magic']);
const EXPECTED_COUNT = 339;

function slugify(name) {
  return name
    .normalize('NFKD')
    .replace(/[’']/g, '-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function getJson(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'dnd3-m12a-ingest' } });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
}

async function mapConcurrent(items, limit, fn) {
  const result = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      result[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return result;
}

function quote(value) {
  return JSON.stringify(value);
}

function parseComponents(text, spellName) {
  const materialIndex = text.indexOf('M (');
  const flagText = materialIndex >= 0 ? text.slice(0, materialIndex).replace(/,\s*$/, '') : text;
  const flags = new Set(flagText.split(',').map((part) => part.trim()).filter(Boolean));
  const material = flags.has('M') || materialIndex >= 0;
  let materialText;
  if (materialIndex >= 0) {
    const start = materialIndex + 3;
    if (!text.endsWith(')')) throw new Error(`Malformed material components for ${spellName}: ${text}`);
    materialText = text.slice(start, -1).trim();
  }
  if (material && !materialText) throw new Error(`Missing material text for ${spellName}: ${text}`);
  return { verbal: flags.has('V'), somatic: flags.has('S'), material, materialText };
}

function bodyFromResource(resource) {
  const marker = `Duration: ${resource.duration}`;
  const index = resource.content.indexOf(marker);
  if (index < 0) throw new Error(`Could not locate duration marker in ${resource.name}`);
  const body = resource.content.slice(index + marker.length).trim();
  if (!body) throw new Error(`Empty description body for ${resource.name}`);
  return body;
}

function renderManifest(items) {
  const rows = items.map((item) => `  { slug: ${quote(item.id)}, name: ${quote(item.name)} },`).join('\n');
  return `// Generated for Milestone 12A from the authoritative SRD 5.2.1 spell inventory.\n// Names/IDs were cross-checked against two independent transcriptions of the Wizards of the Coast SRD 5.2.1 PDF.\nexport const SRD_5_2_1_SPELL_MANIFEST = [\n${rows}\n] as const;\n`;
}

function renderReferenceSpell(resource) {
  const components = parseComponents(resource.components, resource.name);
  const school = resource.school.toLowerCase();
  const spellLists = resource.classes.map((name) => ({ id: name.toLowerCase(), name }));
  const componentObject = components.material
    ? `{ verbal: ${components.verbal}, somatic: ${components.somatic}, material: true, materialText: ${quote(components.materialText)} }`
    : `{ verbal: ${components.verbal}, somatic: ${components.somatic}, material: false }`;
  const lists = `[${spellLists.map((entry) => `{ id: ${quote(entry.id)}, name: ${quote(entry.name)} }`).join(', ')}]`;
  const description = bodyFromResource(resource);
  const concentration = /^Concentration\b/i.test(resource.duration);
  const ritual = /\bRitual\b/i.test(resource.casting_time);
  return `  {\n    id: spellId(${quote(resource.id)}),\n    kind: 'spell',\n    name: ${quote(resource.name)},\n    source: SRD_5_2_1_SOURCE,\n    level: ${resource.level},\n    school: ${quote(school)},\n    castingTime: ${quote(resource.casting_time)},\n    range: ${quote(resource.range)},\n    components: ${componentObject},\n    duration: ${quote(resource.duration)},\n    concentration: ${concentration},\n    ritual: ${ritual},\n    description: ${quote(description)},\n    spellLists: ${lists},\n    mechanics: [],\n    referenceEffects: [REFERENCE_ONLY],\n  },`;
}

function renderReferenceCatalog(resources) {
  return `// Generated for Milestone 12A. Do not hand-edit individual entries.\n// Static metadata/reference text is transcribed from SRD 5.2.1; complex mechanics intentionally remain reference-only.\nimport type { SpellContent, SpellReferenceEffect } from '../../models/content';\nimport { SRD_5_2_1_SOURCE, srdId } from './source';\n\nconst spellId = (slug: string) => srdId('spell', slug);\nconst REFERENCE_ONLY = {\n  id: 'reference-only',\n  name: 'Reference Only',\n  description: 'This spell’s rules are preserved as reference text. M12A does not automate spell-specific targets, areas, conditions, ongoing effects, summons, transformations, reactions, resource transactions, or other encounter state.',\n} as const satisfies SpellReferenceEffect;\n\nexport const SRD_REFERENCE_SPELLS = [\n${resources.map(renderReferenceSpell).join('\n')}\n] as const satisfies readonly SpellContent[];\n`;
}

const collection = await getJson(`${CANTILUX_BASE}/collections/spells.json`);
if (collection.count !== EXPECTED_COUNT || collection.itemIds?.length !== EXPECTED_COUNT || collection.items?.length !== EXPECTED_COUNT) {
  throw new Error(`Cantilux spell inventory mismatch: count=${collection.count}, itemIds=${collection.itemIds?.length}, items=${collection.items?.length}`);
}
if (new Set(collection.itemIds).size !== EXPECTED_COUNT) throw new Error('Duplicate IDs in Cantilux spell inventory.');
if (collection.items.some((item, index) => item.id !== collection.itemIds[index])) throw new Error('Cantilux spell item ordering mismatch.');

const rschaeff = await getJson(RSCHAEFF_URL);
if (!Array.isArray(rschaeff) || rschaeff.length !== EXPECTED_COUNT) throw new Error(`rschaeff spell inventory mismatch: ${rschaeff?.length}`);
const rschaeffBySlug = new Map(rschaeff.map((spell) => [slugify(spell.name), spell]));
const rschaeffSlugs = new Set(rschaeffBySlug.keys());
const cantiluxSlugs = new Set(collection.itemIds);
const onlyCantilux = [...cantiluxSlugs].filter((slug) => !rschaeffSlugs.has(slug));
const onlyRschaeff = [...rschaeffSlugs].filter((slug) => !cantiluxSlugs.has(slug));
if (onlyCantilux.length || onlyRschaeff.length) {
  throw new Error(`Transcription manifest mismatch. Cantilux-only=${onlyCantilux.join(', ')}; rschaeff-only=${onlyRschaeff.join(', ')}`);
}

const resources = await mapConcurrent(collection.itemIds, 16, (id) => getJson(`${CANTILUX_BASE}/resources/spells/${id}.json`));
for (let i = 0; i < resources.length; i += 1) {
  const resource = resources[i];
  const expected = collection.items[i];
  const secondary = rschaeffBySlug.get(resource.id);
  if (resource.id !== expected.id || resource.name !== expected.name) throw new Error(`Resource identity mismatch at ${expected.id}`);
  if (!secondary) throw new Error(`Missing secondary transcription for ${resource.name}`);
  if (!Array.isArray(resource.classes) || resource.classes.length === 0) resource.classes = secondary.classes;
  const primaryClasses = [...resource.classes].map((name) => name.toLowerCase()).sort();
  const secondaryClasses = [...secondary.classes].map((name) => name.toLowerCase()).sort();
  if (JSON.stringify(primaryClasses) !== JSON.stringify(secondaryClasses)) throw new Error(`Class-list transcription mismatch for ${resource.name}: ${primaryClasses.join(',')} vs ${secondaryClasses.join(',')}`);
  if (resource.level !== secondary.level) throw new Error(`Level transcription mismatch for ${resource.name}: ${resource.level} vs ${secondary.level}`);
  if (resource.school.toLowerCase() !== secondary.school.toLowerCase()) throw new Error(`School transcription mismatch for ${resource.name}: ${resource.school} vs ${secondary.school}`);
  if (!resource.components) {
    const componentMatch = resource.content.match(/Components?:\s*(.*?)\s+Duration:/);
    if (componentMatch) resource.components = componentMatch[1].trim();
  }
  if (!Number.isInteger(resource.level) || resource.level < 0 || resource.level > 9) throw new Error(`Invalid level for ${resource.name}`);
  if (!resource.school || !resource.casting_time || !resource.range || !resource.components || !resource.duration || !Array.isArray(resource.classes) || resource.classes.length === 0) throw new Error(`Missing static metadata for ${resource.name}: ${JSON.stringify({ school: resource.school, casting_time: resource.casting_time, range: resource.range, components: resource.components, duration: resource.duration, classes: resource.classes, secondaryClasses: secondary.classes })}`);
  bodyFromResource(resource);
  parseComponents(resource.components, resource.name);
}

const anchorResources = resources.filter((resource) => ANCHORS.has(resource.id));
if (anchorResources.length !== ANCHORS.size) throw new Error(`Expected ${ANCHORS.size} anchors; found ${anchorResources.length}`);
const referenceResources = resources.filter((resource) => !ANCHORS.has(resource.id));
if (referenceResources.length !== 333) throw new Error(`Expected 333 reference spells; found ${referenceResources.length}`);

await mkdir('src/content/srd', { recursive: true });
await writeFile('src/content/srd/spellManifest.ts', renderManifest(collection.items), 'utf8');
await writeFile('src/content/srd/spellsReference.generated.ts', renderReferenceCatalog(referenceResources), 'utf8');
console.log(`M12A ingestion generated ${collection.items.length} manifest entries and ${referenceResources.length} reference SpellContent entries; ${anchorResources.length} M10 anchors preserved separately.`);
