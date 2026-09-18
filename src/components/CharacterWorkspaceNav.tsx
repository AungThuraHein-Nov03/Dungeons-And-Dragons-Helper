import { Link } from 'react-router-dom';

export type CharacterWorkspaceView = 'character' | 'play' | 'inventory';

interface CharacterWorkspaceNavProps {
  characterId: string;
  currentView: CharacterWorkspaceView;
}

const VIEW_LABELS: Record<CharacterWorkspaceView, string> = {
  character: 'CHARACTER',
  play: 'PLAY',
  inventory: 'INVENTORY',
};

export function CharacterWorkspaceNav({ characterId, currentView }: CharacterWorkspaceNavProps) {
  const views: Array<{ view: CharacterWorkspaceView; to: string; label: string }> = [
    { view: 'character', to: `/characters/${characterId}/character`, label: '← CHARACTER' },
    { view: 'play', to: `/characters/${characterId}`, label: 'PLAY' },
    { view: 'inventory', to: `/characters/${characterId}/inventory`, label: 'INVENTORY →' },
  ];

  return (
    <div className="workspace-nav-wrap">
      <nav className="workspace-nav" aria-label="Character workspace views">
        {views.map(({ view, to, label }) => (
          <Link
            key={view}
            className={`workspace-nav__link${currentView === view ? ' workspace-nav__link--active' : ''}`}
            to={to}
            aria-label={view === 'play' ? 'Character Sheet' : view === 'inventory' ? 'Inventory' : 'Character'}
            aria-current={currentView === view ? 'page' : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      <span className="workspace-nav__indicator">{VIEW_LABELS[currentView]} view</span>
    </div>
  );
}
