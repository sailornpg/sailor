import { createContext, useContext, type ReactNode } from "react";
import { ConversationMapAui } from "@/components/assistant-ui/elements/conversation-map.aui";
import { ParticleSailboat } from "@/components/home/ParticleSailboat";
import {
  Thread,
  type ThreadComponents,
} from "@/components/assistant-ui/elements/thread.aui";
import type { WorkspaceChats } from "@/lib/WorkspaceChats";
import type {
  ModelSelection,
  ProjectSummary,
  SettingsSnapshot,
} from "@shared/contracts";
import type { WorkspaceChatSummary } from "@shared/workspaces";
import { SailorComposer } from "../composer/SailorComposer";
import { SailorToolCall, SailorToolCalls } from "../tools/SailorToolCall";

interface SailorThreadProps {
  chatId: string;
  project?: ProjectSummary;
  registry: WorkspaceChats;
  summary?: WorkspaceChatSummary;
  settings: SettingsSnapshot;
  onSelectModel: (selection: ModelSelection) => Promise<void>;
  onOpenSettings: () => void;
  onRetrySave: () => void;
}

const SailorThreadContext = createContext<SailorThreadProps | null>(null);

function useSailorThreadConfig() {
  const value = useContext(SailorThreadContext);
  if (!value)
    throw new Error("Sailor thread slot rendered without configuration");
  return value;
}

function SailorWelcome() {
  const { project } = useSailorThreadConfig();
  return (
    <div className="sailor-thread-welcome">
      <ParticleSailboat />
      <h1>呀嘞呀嘞……那就交给我吧。</h1>
      <p>{project?.name ?? "工作区"}</p>
    </div>
  );
}

function SailorComposerSlot() {
  return <SailorComposer {...useSailorThreadConfig()} />;
}

function SailorConversationMap() {
  return <ConversationMapAui side="right" />;
}

const THREAD_COMPONENTS: ThreadComponents = {
  ViewportNavigation: SailorConversationMap,
  Welcome: SailorWelcome,
  Composer: SailorComposerSlot,
  ToolFallback: SailorToolCall,
  ToolGroup: SailorToolCalls,
};

export function SailorThread(props: SailorThreadProps): ReactNode {
  return (
    <SailorThreadContext.Provider value={props}>
      <Thread autoFocus={false} components={THREAD_COMPONENTS} />
    </SailorThreadContext.Provider>
  );
}
