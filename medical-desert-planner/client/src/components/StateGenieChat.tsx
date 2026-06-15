import { GenieChatInput, GenieChatMessageList, useGenieChat } from '@databricks/appkit-ui/react';

/**
 * Genie chat scoped to a selected state. The action brief is already opened for a
 * specific state, so we prepend that state to every question before sending it to
 * Genie — this lets a user ask "tell me about this state" and have Genie resolve
 * which state they mean. The prefix is visible in the sent message for transparency.
 */
export function StateGenieChat({ state }: { state: string }) {
  const chat = useGenieChat({ alias: 'default', persistInUrl: false });
  const busy = chat.status === 'streaming' || chat.status === 'loading-history';

  function handleSend(content: string) {
    const trimmed = content.trim();
    if (!trimmed) return;
    chat.sendMessage(`For the Indian state of ${state}: ${trimmed}`);
  }

  return (
    <div className="flex h-full flex-col gap-2">
      {chat.messages.length === 0 && chat.status === 'idle' ? (
        <div className="flex flex-1 items-center justify-center px-4 text-center text-xs text-muted-foreground">
          Ask Genie about {state} — e.g. “tell me about this state”, “which districts have the fewest facilities?”
        </div>
      ) : (
        <GenieChatMessageList
          messages={chat.messages}
          status={chat.status}
          hasPreviousPage={chat.hasPreviousPage}
          onFetchPreviousPage={chat.fetchPreviousPage}
          className="flex-1"
        />
      )}
      <GenieChatInput onSend={handleSend} disabled={busy} placeholder={`Ask about COPD care in ${state}…`} />
    </div>
  );
}
