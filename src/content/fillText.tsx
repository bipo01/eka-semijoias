import { Fragment, type ReactNode } from 'react';
import { renderTemplate, type MessageVars, type VariableName } from '../data/messages';

/*
 * Editable texts with a value in the middle ("Confira o valor de {total} e pague.") follow the
 * rules of the WhatsApp templates (src/data/messages.ts): {variavel}, optional [ … ] parts, empty
 * values disappear with their part. fillText renders them as React nodes, so each value keeps its
 * own look (an amount in tabular figures); fillString gives plain text (WhatsApp links, toasts).
 */

const OPEN = '';
const CLOSE = '';
const SLOT = new RegExp(`${OPEN}(\\d+)${CLOSE}`);

type Values = Partial<Record<VariableName, ReactNode>>;

const isEmpty = (v: ReactNode) => v === null || v === undefined || v === false || (typeof v === 'string' && v.trim() === '');

/** Plain text of an editable template. */
export function fillString(template: string, vars: MessageVars): string {
  return renderTemplate(template, vars);
}

/**
 * An editable template as React nodes. `emphasis` makes a phrase of the text stand out wherever the
 * owner kept it (e.g. "Pix Copia e Cola" in bold).
 */
export function fillText(template: string, vars: Values = {}, emphasis?: { phrase: string; render: (phrase: string) => ReactNode }): ReactNode {
  const values: ReactNode[] = [];
  const slots: MessageVars = {};
  for (const [name, value] of Object.entries(vars) as [VariableName, ReactNode][]) {
    if (isEmpty(value)) slots[name] = '';
    else {
      values.push(value);
      slots[name] = `${OPEN}${values.length - 1}${CLOSE}`;
    }
  }
  const parts = renderTemplate(template, slots).split(SLOT);
  return parts.map((part, i) => {
    if (i % 2 === 1) return <Fragment key={i}>{values[Number(part)]}</Fragment>;
    if (!emphasis || !part.includes(emphasis.phrase)) return part ? <Fragment key={i}>{part}</Fragment> : null;
    const chunks = part.split(emphasis.phrase);
    return (
      <Fragment key={i}>
        {chunks.map((chunk, j) => (
          <Fragment key={j}>
            {chunk}
            {j < chunks.length - 1 && emphasis.render(emphasis.phrase)}
          </Fragment>
        ))}
      </Fragment>
    );
  });
}
