export type EntryState = { chatId: string; phase: 'welcome' | 'transition' | 'chat'; armed: boolean };
export type EntryInput = { chatId: string; hasMessages: boolean; hasUser: boolean; loading: boolean; reduced: boolean; completed?: boolean };

export function nextEntryState(previous: EntryState | null, input: EntryInput): EntryState {
  if (!previous || previous.chatId !== input.chatId) {
    return { chatId: input.chatId, phase: input.hasMessages ? 'chat' : 'welcome', armed: !input.loading && !input.hasMessages };
  }
  if (previous.phase === 'chat') return previous;
  if (previous.phase === 'transition') {
    return input.completed || input.reduced ? { ...previous, phase: 'chat', armed: false } : previous;
  }
  if (input.hasMessages) {
    return { chatId: input.chatId, phase: previous.armed && input.hasUser && !input.reduced ? 'transition' : 'chat', armed: false };
  }
  return { ...previous, armed: !input.loading };
}
