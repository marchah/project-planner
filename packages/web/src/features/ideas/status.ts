import type { ResultOf } from '../../graphql';
import type { BoardQuery } from './Board';

export type IdeaStatus = ResultOf<typeof BoardQuery>['ideas'][number]['status'];

// Literal class strings so Tailwind's scanner keeps them.
export const STATUS_META: Record<IdeaStatus, { label: string; note: string; chip: string }> = {
  CAPTURED: { label: 'Captured', note: 'bg-yellow-200', chip: 'bg-yellow-300 text-yellow-950' },
  RESEARCHING: { label: 'Researching', note: 'bg-sky-200', chip: 'bg-sky-300 text-sky-950' },
  PLANNED: { label: 'Planned', note: 'bg-lime-200', chip: 'bg-lime-300 text-lime-950' },
  BUILDING: { label: 'Building', note: 'bg-orange-200', chip: 'bg-orange-300 text-orange-950' },
  SHELVED: { label: 'Shelved', note: 'bg-stone-200', chip: 'bg-stone-300 text-stone-900' },
  DONE: { label: 'Done', note: 'bg-teal-200', chip: 'bg-teal-300 text-teal-950' },
};

export const STATUS_ORDER: IdeaStatus[] = [
  'CAPTURED',
  'RESEARCHING',
  'PLANNED',
  'BUILDING',
  'SHELVED',
  'DONE',
];

export const ARCHIVED_STATUSES: ReadonlySet<IdeaStatus> = new Set(['SHELVED', 'DONE']);

const SOURCE_LABEL: Record<string, string> = { WEB: 'the board', SLACK: 'Slack', API: 'the API' };

export function sourceLabel(source: string): string {
  return SOURCE_LABEL[source] ?? source;
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(iso));
}

export interface NoteText {
  /** Shown bold: the title, or the part of the first line it was cut from. */
  lead: string;
  /** The rest of that first line, when the title was truncated from it. */
  continuation: string;
  /** Whatever the note shows after the first line. */
  rest: string;
}

/** Splits a note's text so nothing the title already shows is repeated: a first line equal to the
 * title is dropped, and a title truncated from the first line reads straight into the remainder. */
export function noteText(title: string, body: string): NoteText {
  const [first = '', ...others] = body.split('\n');
  const line = first.trim();
  const shown = title.trim();
  const rest = others.join('\n').trim();
  if (line === shown) return { lead: shown, continuation: '', rest };
  const prefix = shown.endsWith('…') ? shown.slice(0, -1).trimEnd() : '';
  if (prefix && line.startsWith(prefix)) {
    return { lead: prefix, continuation: line.slice(prefix.length).trim(), rest };
  }
  return { lead: shown, continuation: '', rest: body.trim() };
}
