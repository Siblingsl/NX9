import { useContextRailUi } from '../../stores/context-rail-ui';
import { RailSubNav } from './primitives/RailSubNav';
import { LibraryTemplatesSubPanel } from './library/LibraryTemplatesSubPanel';
import { LibraryHistorySubPanel } from './library/LibraryHistorySubPanel';
import { LibraryWorkflowSubPanel } from './library/LibraryWorkflowSubPanel';

export function LibraryRailPanel() {
  const librarySub = useContextRailUi((s) => s.librarySub);
  const setLibrarySub = useContextRailUi((s) => s.setLibrarySub);

  return (
    <div className="space-y-3">
      <RailSubNav active={librarySub} onChange={setLibrarySub} />

      {librarySub === 'templates' && <LibraryTemplatesSubPanel />}
      {librarySub === 'history' && <LibraryHistorySubPanel />}
      {librarySub === 'workflow' && <LibraryWorkflowSubPanel />}
    </div>
  );
}
