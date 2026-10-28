import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CharacterForm } from '../components/CharacterForm';
import { CharacterQuickRoll } from '../components/CharacterQuickRoll';
import { CharacterReferenceView } from '../components/CharacterReferenceView';
import { srdId } from '../content/srd/source';
import { createFixedHpProgression } from '../rules/health';
import { deriveCharacterState } from '../rules/deriveCharacter';
import { contentRegistry } from '../services/contentRegistry';
import { fighterCharacter } from './fixtures';

const ROGUE_ID = srdId('class', 'rogue');

function rogueCharacter(skillExpertise: ('perception' | 'stealth')[] = []) {
  const fighterProgression = fighterCharacter().classProgressions[0];
  fighterProgression.weaponMasterySelections = [];
  return fighterCharacter({
    preserveV10Choices: true,
    classProgressions: [
      fighterProgression,
      {
        classId: ROGUE_ID,
        level: 1,
        skillProficiencies: ['stealth'],
        skillExpertise,
        weaponMasterySelections: [],
        hpProgression: createFixedHpProgression(1, false),
      },
    ],
  });
}

describe('Character v10 historical choice reconciliation', () => {
  it('requires explicit Rogue Expertise choices and saves them under the owning progression', async () => {
    const user = userEvent.setup();
    const character = rogueCharacter();
    const onSubmit = vi.fn();

    render(<CharacterForm initialCharacter={character} submitLabel="Save Changes" onSubmit={onSubmit} />);

    expect(screen.getByRole('heading', { name: 'Historical choice reconciliation' })).toBeInTheDocument();
    expect(screen.getByText(/Choose exactly 2 Rogue Expertise skills/i)).toBeInTheDocument();

    await user.click(screen.getByLabelText('Rogue Expertise: Stealth'));
    await user.click(screen.getByLabelText('Rogue Expertise: Perception'));
    for (const weapon of ['Battleaxe', 'Club', 'Dagger', 'Scimitar']) {
      await user.click(screen.getByLabelText(`Fighter Weapon Mastery: ${weapon}`));
    }
    for (const weapon of ['Light Crossbow', 'Shortsword']) {
      await user.click(screen.getByLabelText(`Rogue Weapon Mastery: ${weapon}`));
    }
    await user.click(screen.getByLabelText('Additional language: Elvish'));
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(onSubmit).toHaveBeenCalledOnce();
    const saved = onSubmit.mock.calls[0][0];
    expect(saved.classProgressions.find((entry: { classId: string }) => entry.classId === ROGUE_ID)?.skillExpertise)
      .toEqual(['perception', 'stealth']);
    expect(saved.classProgressions.find((entry: { classId: string }) => entry.classId === ROGUE_ID)?.weaponMasterySelections)
      .toHaveLength(2);
    expect(saved.languageChoices).toEqual(['elvish']);
  });

  it('shows the same Expertise marker and +10 modifier in Character and PLAY skill views', async () => {
    const user = userEvent.setup();
    const character = rogueCharacter(['perception', 'stealth']);
    const derived = deriveCharacterState(character, contentRegistry);
    expect(derived.ok).toBe(true);
    if (!derived.ok) return;

    const reference = render(<CharacterReferenceView
      character={character}
      state={derived.value}
      rollMode="normal"
      onRollModeChange={vi.fn()}
      cover="none"
      onCoverChange={vi.fn()}
      conditions={[]}
      onRoll={vi.fn()}
      onMutation={vi.fn()}
    />);
    const referenceStealth = screen.getByText('Stealth').closest('article');
    expect(referenceStealth).not.toBeNull();
    expect(within(referenceStealth!).getByLabelText('Expertise')).toBeInTheDocument();
    expect(within(referenceStealth!).getByText('+10')).toBeInTheDocument();
    reference.unmount();

    render(<CharacterQuickRoll
      character={character}
      state={derived.value}
      cover="none"
      conditions={[]}
      activeEffectIds={[]}
      rollMode="normal"
      onRollModeChange={vi.fn()}
      onRoll={vi.fn()}
    />);
    await user.click(screen.getByRole('button', { name: 'Next Character Roll category' }));
    const playStealth = screen.getByRole('button', { name: /Stealth.*\+10/i });
    expect(within(playStealth).getByLabelText('Expertise')).toBeInTheDocument();
  });
});
