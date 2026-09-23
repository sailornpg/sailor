import type { PanelContext, PanelRegistry } from "@/lib/panels/registry";

/**
 * The dock's function list, shown only while nothing is open: once tabs exist the add-menu covers
 * the picker role, so a second always-on list would just duplicate it. Unavailable entries stay
 * visible with their真实 reason, so the dock is never blank and never fakes capability.
 */
export function PanelMenu({
  registry,
  context,
  onPick,
}: {
  registry: PanelRegistry;
  context: PanelContext;
  onPick: (panelId: string) => void;
}) {
  return (
    <nav aria-label="功能列表" className="panel-menu">
      <div className="panel-menu-list">
        {registry.resolve(context).map((entry) => {
          const Icon = entry.descriptor.icon;
          return (
            <button
              aria-label={entry.descriptor.title}
              className="panel-menu-item no-drag"
              data-panel-id={entry.descriptor.id}
              disabled={!entry.available}
              key={entry.descriptor.id}
              onClick={() => onPick(entry.descriptor.id)}
              title={entry.reason ?? entry.descriptor.title}
              type="button"
            >
              <Icon size={15} />
              <span className="panel-menu-text">
                <span className="panel-menu-title">
                  {entry.descriptor.title}
                </span>
                {entry.reason && (
                  <span className="panel-menu-reason">{entry.reason}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
