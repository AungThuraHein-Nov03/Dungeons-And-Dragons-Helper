import { Link, useParams } from 'react-router-dom';
import { CompendiumNav } from '../components/CompendiumNav';
import { SourceBadge } from '../components/SourceBadge';
import type { AbilityKey, SkillId } from '../models/character';
import type { ClassContent, WeaponProficiencyRule } from '../models/content';
import { SKILL_DEFINITIONS } from '../rules/skills';
import { contentRegistry } from '../services/contentRegistry';

const ABILITY_LABELS: Record<AbilityKey, string> = {
  strength: 'Strength', dexterity: 'Dexterity', constitution: 'Constitution', intelligence: 'Intelligence', wisdom: 'Wisdom', charisma: 'Charisma',
};

function primaryAbilityLabel(mode: 'one-of' | 'all-of', abilities: readonly AbilityKey[]): string {
  return abilities.map((ability) => ABILITY_LABELS[ability]).join(mode === 'one-of' ? ' or ' : ' and ');
}

function weaponRuleLabel(rule: WeaponProficiencyRule): string {
  if (rule.kind === 'category') return `${rule.category} weapons`;
  return `${rule.category} weapons with ${rule.anyOfProperties.join(' or ')}`;
}

function skillLabel(skill: SkillId): string { return SKILL_DEFINITIONS[skill].name; }

function resourceMaximumLabel(resource: ClassContent['resources'][number]): string {
  if (resource.maximum.kind === 'ability-modifier') {
    return `${ABILITY_LABELS[resource.maximum.ability]} modifier (minimum ${resource.maximum.minimum})${resource.maximum.minimumLevel ? ` from L${resource.maximum.minimumLevel}` : ''}`;
  }
  return resource.maximum.values.map((row) => `L${row.level} ${row.uses}`).join(', ');
}

function resourceRecoveryLabel(resource: ClassContent['resources'][number]): string {
  return resource.recovery.map((rule) => `${rule.trigger}${rule.minimumLevel ? ` from L${rule.minimumLevel}` : ''}: ${rule.mode === 'all' ? 'all' : `+${rule.amount}`}`).join('; ');
}

export function ClassDetailPage() {
  const { contentId = '' } = useParams();
  const entry = contentRegistry.findClass(decodeURIComponent(contentId));
  if (!entry) return <section className="empty-state panel"><h1>Class not found</h1><Link className="text-link" to="/compendium/classes">Back to Classes</Link></section>;
  const subclasses = contentRegistry.findSubclassesForClass(entry.id);
  const spellcastingProviders = entry.progression.flatMap((row) => row.features.flatMap((feature) => feature.spellcasting ?? []));

  return (
    <div className="stack-page">
      <CompendiumNav />
      <header className="content-detail-hero panel"><div><SourceBadge source={entry.source} /><h1>{entry.name}</h1><p>D{entry.hitDie} Hit Die · Primary {entry.primaryAbility.abilities.length > 1 ? 'abilities' : 'ability'}: {primaryAbilityLabel(entry.primaryAbility.mode, entry.primaryAbility.abilities)}</p></div></header>
      <section className="detail-grid">
        <div className="panel detail-card"><span className="eyebrow">Training</span><h2>Core proficiencies</h2><dl className="detail-list"><div><dt>Saving Throws</dt><dd>{entry.savingThrowProficiencies.map((ability) => ABILITY_LABELS[ability]).join(', ')}</dd></div><div><dt>Weapons</dt><dd>{entry.weaponProficiencies.map(weaponRuleLabel).join('; ') || 'None'}</dd></div><div><dt>Armor</dt><dd>{entry.armorTraining.join(', ') || 'None'}</dd></div><div><dt>Tools</dt><dd>{entry.toolProficiencies.map((tool) => tool.name).join(', ') || 'None'}</dd></div><div><dt>Skills</dt><dd>Choose {entry.skillChoices.choose}: {entry.skillChoices.from.map(skillLabel).join(', ')}</dd></div></dl></div>
        <div className="panel detail-card"><span className="eyebrow">Starting Equipment</span><h2>SRD options</h2>{entry.startingEquipment.map((option) => <p key={option.id}><strong>{option.id}:</strong> {option.items.map((item) => `${item.quantity ? `${item.quantity} ` : ''}${item.label}`).join(', ') || 'No items'}{option.currency ? `${option.items.length ? ', and ' : ''}${option.currency.amount} ${option.currency.unit.toUpperCase()}` : ''}</p>)}</div>
        <div className="panel detail-card"><span className="eyebrow">Subclasses</span><h2>Bundled options</h2>{subclasses.length ? subclasses.map((subclass) => <p key={subclass.id}><Link className="text-link" to={`/compendium/subclasses/${encodeURIComponent(subclass.id)}`}>{subclass.name}</Link> · level {subclass.acquisitionLevel}</p>) : <p>No bundled subclass.</p>}</div>
        <div className="panel detail-card"><span className="eyebrow">Resources</span><h2>Tracked class resources</h2>{entry.resources.length ? entry.resources.map((resource) => <p key={resource.id}><strong>{resource.name}:</strong> {resourceMaximumLabel(resource)} · {resourceRecoveryLabel(resource)}</p>) : <p>No tracked class resources.</p>}</div>
        <div className="panel detail-card"><span className="eyebrow">Spellcasting</span><h2>Class providers</h2>{spellcastingProviders.length ? spellcastingProviders.map((provider) => <p key={provider.id}><strong>{provider.name}:</strong> {ABILITY_LABELS[provider.spellcastingAbility.ability]} · {provider.spellManagement.kind === 'prepared-from-list' ? `prepared from ${provider.spellManagement.spellListId} list` : 'granted spells'}{provider.slotPool ? ` · ${provider.slotPool.name}` : ''}</p>) : <p>No class-granted Spellcasting provider.</p>}</div>
      </section>
      <section className="panel progression-panel"><div className="section-heading"><span className="eyebrow">Levels 1–20</span><h2>{entry.name} progression</h2></div><div className="table-scroll"><table className="content-table"><thead><tr><th>Level</th><th>PB</th><th>Features</th><th>Masteries</th></tr></thead><tbody>{entry.progression.map((row) => <tr key={row.level}><td>{row.level}</td><td>+{row.proficiencyBonus}</td><td>{row.features.map((feature) => feature.name).join(', ') || '—'}</td><td>{row.weaponMasteryChoices ?? '—'}</td></tr>)}</tbody></table></div></section>
      <Link className="text-link" to="/compendium/classes">← Back to Classes</Link>
    </div>
  );
}
