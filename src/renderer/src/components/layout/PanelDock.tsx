import { PANEL_WIDTH_MAX, PANEL_WIDTH_MIN } from "@/lib/panels/layout";
import type { PanelLayoutState } from "@/lib/panels/layout";
import type { PanelRuntimeData } from "@/lib/panels/panelData";
import type { PanelContext, PanelRegistry } from "@/lib/panels/registry";
import type { PanelPlatform } from "@/lib/panels/shortcuts";
import { PaneResizer } from "./PaneResizer";
import { PanelAddButton } from "./PanelAddButton";
import { PanelMenu } from "./PanelMenu";
import { PanelHost } from "./PanelHost";
import {
  PanelTabStrip,
  panelTabId,
  panelViewId,
  type PanelTabItem,
} from "./PanelTabStrip";

export function PanelDock({
  layout,
  registry,
  context,
  data,
  platform,
  onActivate,
  onClose,
  onPick,
  onResize,
}: {
  layout: PanelLayoutState;
  registry: PanelRegistry;
  context: PanelContext;
  data: PanelRuntimeData;
  platform: PanelPlatform;
  onActivate: (instanceId: string) => void;
  onClose: (instanceId: string) => void;
  onPick: (panelId: string) => void;
  onResize: (width: number) => void;
}) {
  if (!layout.visible) return null;

  const tabs = layout.open.flatMap((instance) => {
    const descriptor = registry.get(instance.panelId);
    return descriptor ? [{ instance, descriptor }] : [];
  }) satisfies PanelTabItem[];

  // Layout state is persisted input: an active id that no longer resolves must not blank the dock.
  const activeInstanceId = tabs.some(
    (tab) => tab.instance.instanceId === layout.activeInstanceId,
  )
    ? layout.activeInstanceId
    : (tabs[0]?.instance.instanceId ?? null);

  return (
    <aside
      aria-label="面板"
      className="panel-dock"
      data-dock="open"
      data-tabs={tabs.length > 0 ? "open" : "closed"}
    >
      {/* Inside the pane it resizes: an absolutely positioned sibling would anchor to the shell, not the column. */}
      <PaneResizer
        label="调整面板宽度"
        max={PANEL_WIDTH_MAX}
        min={PANEL_WIDTH_MIN}
        onResize={onResize}
        side="right"
        width={layout.width}
      />
      {tabs.length === 0 ? (
        // Nothing is open: the function list is the content, centered, with the + menu for additions.
        // No window-drag here: this band fills the pane, and macOS hit-tests drag regions above the
        // DOM, so a draggable band would swallow the press meant for the pane's resize handle.
        <div className="panel-menu-band">
          <PanelMenu context={context} onPick={onPick} registry={registry} />
        </div>
      ) : (
        <>
          <PanelTabStrip
            activeInstanceId={activeInstanceId}
            onActivate={onActivate}
            onClose={onClose}
            picker={
              <PanelAddButton
                context={context}
                onPick={onPick}
                platform={platform}
                registry={registry}
              />
            }
            tabs={tabs}
          />
          <div className="panel-host">
            {tabs.map((tab) => {
              const active = tab.instance.instanceId === activeInstanceId;
              return (
                <div
                  aria-labelledby={panelTabId(tab.instance.instanceId)}
                  className="panel-host-view"
                  data-active={active}
                  id={panelViewId(tab.instance.instanceId)}
                  key={tab.instance.instanceId}
                  role="tabpanel"
                >
                  <PanelHost
                    context={context}
                    data={data}
                    descriptor={tab.descriptor}
                    instanceId={tab.instance.instanceId}
                    panelId={tab.instance.panelId}
                    scopeId={tab.instance.scopeId}
                  />
                </div>
              );
            })}
          </div>
        </>
      )}
    </aside>
  );
}
