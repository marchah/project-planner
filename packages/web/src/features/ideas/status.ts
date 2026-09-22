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

/** The body minus a leading line that merely repeats the title (the usual shape of a capture). */
export function noteExcerpt(title: string, body: string): string {
  const [first = '', ...rest] = body.split('\n');
  return first.trim() === title.trim() ? rest.join('\n').trim() : body;
}
