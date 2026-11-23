import { useCallback } from 'react';
import { composeMessage, type MessageItem, type MessageType, type MessageVars } from '../data/messages';
import { sizeLabel } from '../data/catalog';
import { formatBRL } from '../lib/format';
import { useCatalog } from '../store/catalog';

export const STORE_NAME = 'ÉKA Semijoias';

/** Builds WhatsApp messages from the owner's templates (Painel → Mensagens). */
export function useMessages() {
  const settings = useCatalog((s) => s.data.settings.messages);
  return useCallback(
    (type: MessageType, vars: MessageVars = {}, opts: { items?: MessageItem[]; templateId?: string; compactIfLong?: boolean } = {}) => composeMessage(settings, type, { loja: STORE_NAME, ...vars }, opts),
    [settings],
  );
}

/** Order lines as template items. */
export const messageItems = (lines: { name: string; finish: string; size?: string | undefined; qty: number; lineCents: number }[]): MessageItem[] =>
  lines.map((l) => ({ name: l.name, finish: l.finish, ...(l.size ? { sizeLabel: sizeLabel(l.size) } : {}), qty: l.qty, lineTotal: formatBRL(l.lineCents) }));
