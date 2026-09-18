import { describe, expect, it } from 'vitest';
import { SRD_CONTENT } from '../content/srd';
import type { ClassContent, ClassFeatureContent, ResourceTransactionDefinition } from '../models/content';
import {
  SRD_WIZARD,
  WIZARD_ARCANE_RECOVERY_RESOURCE_ID,
  WIZARD_SPELLCASTING_PROVIDER_ID,
} from '../content/srd/wizard';
import { ContentRegistry } from './contentRegistry';

function mutableWizard(): ClassContent {
  return structuredClone(SRD_WIZARD) as unknown as ClassContent;
}

function arcaneFeature(wizard: ClassContent): ClassFeatureContent {
  const feature = wizard.progression.flatMap((row) => row.features).find((candidate) => candidate.name === 'Arcane Recovery');
  if (!feature) throw new Error('Arcane Recovery fixture unavailable.');
  return feature as ClassFeatureContent;
}

function arcaneTransaction(feature: ClassFeatureContent): ResourceTransactionDefinition {
  const transaction = feature.resourceTransactions?.[0];
  if (!transaction) throw new Error('Arcane Recovery transaction fixture unavailable.');
  return transaction;
}

function expectWizardRejected(mutator: (wizard: ClassContent, feature: ClassFeatureContent, transaction: ResourceTransactionDefinition) => void, pattern: RegExp) {
  const wizard = mutableWizard();
  const feature = arcaneFeature(wizard);
  const transaction = arcaneTransaction(feature);
  mutator(wizard, feature, transaction);
  const withoutWizard = SRD_CONTENT.filter((entry) => entry.id !== wizard.id);
  expect(() => new ContentRegistry(withoutWizard, [wizard])).toThrow(pattern);
}

describe('M13C strict resource-transaction content validation', () => {
  it('rejects unsupported transaction kinds', () => {
    expectWizardRejected((_wizard, _feature, transaction) => {
      (transaction as unknown as { kind: string }).kind = 'teleport-resources';
    }, /unsupported resource transaction kind/i);
  });

  it('rejects zero and negative fixed restoration amounts', () => {
    for (const amount of [0, -1]) {
      expectWizardRejected((_wizard, _feature, transaction) => {
        Object.assign(transaction as unknown as Record<string, unknown>, {
          kind: 'restore-resource',
          targetResourceId: WIZARD_ARCANE_RECOVERY_RESOURCE_ID,
          restore: { kind: 'fixed', amount },
        });
      }, /fixed restoration must be a positive whole number/i);
    }
  });

  it('rejects invalid selected restoration maxima', () => {
    for (const maximum of [0, -3]) {
      expectWizardRejected((_wizard, _feature, transaction) => {
        Object.assign(transaction as unknown as Record<string, unknown>, {
          kind: 'restore-resource',
          targetResourceId: WIZARD_ARCANE_RECOVERY_RESOURCE_ID,
          restore: { kind: 'selected', maximum },
        });
      }, /selected restoration limit must be a positive whole number/i);
    }
  });

  it('rejects unsupported budgets and invalid minimum/maximum slot bounds', () => {
    expectWizardRejected((_wizard, _feature, transaction) => {
      if (transaction.kind !== 'restore-spell-slots-with-budget') throw new Error('Expected weighted fixture.');
      (transaction.budget as unknown as { kind: string }).kind = 'full-level';
    }, /unsupported recovery budget formula/i);

    for (const maximumSpellLevel of [0, 10]) {
      expectWizardRejected((_wizard, _feature, transaction) => {
        if (transaction.kind !== 'restore-spell-slots-with-budget') throw new Error('Expected weighted fixture.');
        (transaction as unknown as { maximumSpellLevel: number }).maximumSpellLevel = maximumSpellLevel;
      }, /valid maximum spell-slot level/i);
    }
  });

  it('rejects a weighted transaction whose provider has no eligible slot level', () => {
    expectWizardRejected((wizard) => {
      const provider = wizard.progression.flatMap((row) => row.features).flatMap((feature) => feature.spellcasting ?? []).find((candidate) => candidate.id === WIZARD_SPELLCASTING_PROVIDER_ID);
      if (!provider?.slotPool) throw new Error('Wizard slot-pool fixture unavailable.');
      (provider.slotPool as unknown as { slotLevels: typeof provider.slotPool.slotLevels }).slotLevels = provider.slotPool.slotLevels.filter((slot) => slot.spellLevel >= 6);
      (provider.slotPool as unknown as { progression: typeof provider.slotPool.progression }).progression = provider.slotPool.progression.map((row) => ({
        ...row,
        slots: row.slots.filter((slot) => slot.spellLevel >= 6),
      }));
    }, /no eligible spell-slot levels/i);
  });

  it('rejects missing usage, target, and owner-provider references', () => {
    expectWizardRejected((_wizard, _feature, transaction) => {
      (transaction as unknown as { usageResourceId: string }).usageResourceId = 'homebrew:missing:resource:usage';
    }, /unknown usage resource/i);

    expectWizardRejected((_wizard, _feature, transaction) => {
      Object.assign(transaction as unknown as Record<string, unknown>, {
        kind: 'restore-resource',
        targetResourceId: 'homebrew:missing:resource:target',
        restore: { kind: 'fixed', amount: 1 },
      });
    }, /unknown target resource/i);

    expectWizardRejected((_wizard, _feature, transaction) => {
      if (transaction.kind !== 'restore-spell-slots-with-budget') throw new Error('Expected weighted fixture.');
      (transaction as unknown as { providerId: string }).providerId = 'homebrew:missing:provider:void';
    }, /unknown owner Spellcasting provider/i);
  });

  it('rejects duplicate transaction IDs and duplicate feature resource IDs', () => {
    expectWizardRejected((_wizard, feature, transaction) => {
      (feature.resourceTransactions as unknown as ResourceTransactionDefinition[]).push(structuredClone(transaction));
    }, /duplicate resource transaction id/i);

    expectWizardRejected((_wizard, feature) => {
      const resource = feature.resources?.[0];
      if (!resource) throw new Error('Arcane Recovery resource fixture unavailable.');
      (feature.resources as unknown as Array<typeof resource>).push(structuredClone(resource));
    }, /duplicate class resource id/i);
  });

  it('rejects malformed transaction timing and resource recovery policies', () => {
    expectWizardRejected((_wizard, _feature, transaction) => {
      if (transaction.kind !== 'restore-spell-slots-with-budget') throw new Error('Expected weighted fixture.');
      (transaction as unknown as { timing: string }).timing = 'start-of-turn';
    }, /unsupported transaction timing policy/i);

    expectWizardRejected((_wizard, feature) => {
      const resource = feature.resources?.[0];
      if (!resource) throw new Error('Arcane Recovery resource fixture unavailable.');
      (resource.recovery[0] as unknown as { trigger: string }).trigger = 'dawn';
    }, /invalid recovery metadata/i);
  });
});
