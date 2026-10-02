import { useCallback, useState } from 'react';
import { useQuery } from 'urql';
import { graphql } from '../../graphql';
import { cn } from '../../lib/utils';
import { isResearchActive } from './ResearchSection';
import { ARCHIVED_STATUSES, STATUS_META, formatDate } from './status';
import { usePolling } from './usePolling';

export const BoardQuery = graphql(`
  query Board {
    ideas {
      id
      title
      body
      status
      createdAt
      openQuestionCount
      research {
        id
        status
        error
      }
    }
  }
`);

// urql's document cache refetches a query when a mutation returns a type the query's last result
// contained. An empty list contains no types, so declare Idea or the first capture never shows.
const BOARD_CONTEXT = { additionalTypenames: ['Idea'] };

// Alternating tilt makes the grid read as a board of notes, not a table of cards.
const TILTS = ['-rotate-1', 'rotate-1', 'rotate-0', '-rotate-2', 'rotate-2'];

export function Board({ onOpen }: { onOpen: (id: string) => void }) {
  const [{ data, fetching, error }, reexecute] = useQuery({
    query: BoardQuery,
    context: BOARD_CONTEXT,
  });
  const [showArchived, setShowArchived] = useState(false);
  const refresh = useCallback(() => reexecute({ requestPolicy: 'network-only' }), [reexecute]);
  usePolling(data?.ideas.some((idea) => isResearchActive(idea.research)) ?? false, refresh);

  if (fetching && !data) return <p className="text-muted-foreground">Loading ideas…</p>;
  if (error) return <p className="text-destructive">Failed to load ideas: {error.message}</p>;

  const all = data?.ideas ?? [];
  const archivedCount = all.filter((idea) => ARCHIVED_STATUSES.has(idea.status)).length;
  const visible = showArchived ? all : all.filter((idea) => !ARCHIVED_STATUSES.has(idea.status));

  return (
    <section aria-label="Ideas" className="space-y-4">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {visible.length} {visible.length === 1 ? 'idea' : 'ideas'}
        </span>
        {archivedCount > 0 ? (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
            />
            Show shelved &amp; done ({archivedCount})
          </label>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-center text-muted-foreground">
          No ideas yet. Add one above, or post it in Slack.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] sm:gap-6">
          {visible.map((idea, index) => {
            const meta = STATUS_META[idea.status];
            return (
              <li key={idea.id}>
                <button
                  type="button"
                  onClick={() => onOpen(idea.id)}
                  className={cn(
                    'relative flex aspect-square w-full flex-col overflow-hidden p-3 text-left text-stone-900 shadow-md transition hover:rotate-0 hover:scale-[1.03] hover:shadow-lg focus-visible:rotate-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-4',
                    meta.note,
                    TILTS[index % TILTS.length],
                  )}
                >
                  {idea.title ? (
                    <span className="line-clamp-3 font-semibold leading-snug">{idea.title}</span>
                  ) : null}
                  <span
                    className={cn(
                      'whitespace-pre-line text-sm text-stone-700',
                      idea.title
                        ? 'mt-1.5 line-clamp-2 sm:line-clamp-5'
                        : 'line-clamp-5 text-stone-900 sm:line-clamp-8',
                    )}
                  >
                    {idea.body}
                  </span>
                  <span className="mt-auto flex items-center justify-between pt-2 text-xs text-stone-600">
                    <span className="flex items-center gap-1">
                      <span className={cn('rounded px-1.5 py-0.5 font-medium', meta.chip)}>
                        {meta.label}
                      </span>
                      {isResearchActive(idea.research) ? (
                        <span
                          className="size-2 animate-pulse rounded-full bg-sky-600"
                          title="Researching"
                          aria-label="Researching"
                        />
                      ) : null}
                      {idea.openQuestionCount > 0 ? (
                        <span
                          className="rounded bg-white/70 px-1.5 py-0.5 font-medium"
                          title={`${String(idea.openQuestionCount)} open questions`}
                        >
                          {idea.openQuestionCount} ?
                        </span>
                      ) : null}
                    </span>
                    <span>{formatDate(idea.createdAt)}</span>
                  </span>
                  {idea.research?.status === 'FAILED' ? (
                    <span
                      className="absolute right-0 top-0 size-0 border-l-[1.25rem] border-t-[1.25rem] border-l-transparent border-t-red-600"
                      title={`Research failed: ${idea.research.error ?? 'unknown error'}`}
                      aria-label="Research failed"
                    />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
