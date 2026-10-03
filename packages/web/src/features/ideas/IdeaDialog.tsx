import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from 'urql';
import { Button } from '../../components/ui/button';
import { graphql, type ResultOf } from '../../graphql';
import { cn } from '../../lib/utils';
import type { Maybe } from '../../lib/types';
import { IdeaResearchFragment, isResearchActive } from './research';
import { ResearchSection } from './ResearchSection';
import { STATUS_META, STATUS_ORDER, formatDate, sourceLabel, type IdeaStatus } from './status';
import { usePolling } from './usePolling';

const IdeaQuery = graphql(
  `
    query IdeaDetail($id: ID!) {
      researchEnabled
      scheduledRefreshEnabled
      idea(id: $id) {
        __typename
        ... on QueryIdeaSuccess {
          data {
            id
            title
            body
            status
            source
            sourceUrl
            createdAt
            updatedAt
            research {
              id
              status
            }
            ...IdeaResearch
          }
        }
        ... on NotFoundError {
          message
        }
        ... on ServerError {
          message
        }
      }
    }
  `,
  [IdeaResearchFragment],
);

const UpdateIdeaMutation = graphql(`
  mutation UpdateIdea($id: ID!, $title: String, $body: String, $status: IdeaStatus) {
    updateIdea(id: $id, title: $title, body: $body, status: $status) {
      __typename
      ... on MutationUpdateIdeaSuccess {
        data {
          id
          title
          body
          status
          updatedAt
        }
      }
      ... on NotFoundError {
        message
      }
      ... on ValidationError {
        message
      }
      ... on ServerError {
        message
      }
    }
  }
`);

const GenerateIdeaTitleMutation = graphql(`
  mutation GenerateIdeaTitle($id: ID!) {
    generateIdeaTitle(id: $id) {
      __typename
      ... on MutationGenerateIdeaTitleSuccess {
        data {
          id
          title
          updatedAt
        }
      }
      ... on NotFoundError {
        message
      }
      ... on ServiceUnavailableError {
        message
      }
      ... on ServerError {
        message
      }
    }
  }
`);

const DeleteIdeaMutation = graphql(`
  mutation DeleteIdea($id: ID!) {
    deleteIdea(id: $id) {
      __typename
      ... on MutationDeleteIdeaSuccess {
        data {
          id
        }
      }
      ... on NotFoundError {
        message
      }
      ... on ServerError {
        message
      }
    }
  }
`);

type MutationPayload = { __typename: string; message?: string } | undefined;

function failureMessage(payload: MutationPayload, fallback: string | undefined): string {
  if (payload && !payload.__typename.endsWith('Success')) return payload.message ?? 'Failed';
  return payload ? '' : (fallback ?? 'Failed');
}

export function IdeaDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [{ data, fetching, error }, reexecute] = useQuery({ query: IdeaQuery, variables: { id } });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const result = data?.idea;
  const idea = result?.__typename === 'QueryIdeaSuccess' ? result.data : undefined;
  const loadError = error?.message ?? (result && 'message' in result ? result.message : undefined);
  const refresh = useCallback(() => reexecute({ requestPolicy: 'network-only' }), [reexecute]);
  usePolling(isResearchActive(idea?.research ?? null), refresh);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="idea-title"
      className="m-auto w-[min(48rem,calc(100vw-2rem))] max-h-[calc(100vh-4rem)] rounded-xl border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/40"
    >
      {idea ? (
        <IdeaDetail
          key={idea.id}
          idea={idea}
          researchEnabled={data?.researchEnabled ?? false}
          scheduleEnabled={data?.scheduledRefreshEnabled ?? false}
          onClose={() => dialogRef.current?.close()}
        />
      ) : (
        <div className="flex items-start justify-between gap-4 p-6">
          <p id="idea-title" className={loadError ? 'text-destructive' : 'text-muted-foreground'}>
            {fetching ? 'Loading…' : (loadError ?? 'Not found')}
          </p>
          <Button variant="ghost" size="sm" onClick={() => dialogRef.current?.close()}>
            Close
          </Button>
        </div>
      )}
    </dialog>
  );
}

type Idea = Extract<ResultOf<typeof IdeaQuery>['idea'], { __typename: 'QueryIdeaSuccess' }>['data'];

function IdeaDetail({
  idea,
  researchEnabled,
  scheduleEnabled,
  onClose,
}: {
  idea: Idea;
  researchEnabled: boolean;
  scheduleEnabled: boolean;
  onClose: () => void;
}) {
  const [message, setMessage] = useState('');
  const [{ fetching: deleting }, deleteIdea] = useMutation(DeleteIdeaMutation);

  async function remove() {
    const name = idea.title ? `"${idea.title}"` : 'this idea';
    if (!window.confirm(`Delete ${name}? This cannot be undone.`)) return;
    const result = await deleteIdea({ id: idea.id });
    const failure = failureMessage(result.data?.deleteIdea, result.error?.message);
    if (failure) setMessage(failure);
    else onClose();
  }

  return (
    <article className="flex flex-col">
      <IdeaHeader idea={idea} onClose={onClose} onMessage={setMessage} />
      <div className="space-y-6 overflow-y-auto p-6">
        {message ? (
          <p role="alert" className="text-sm text-destructive">
            {message}
          </p>
        ) : null}
        <IdeaText idea={idea} onMessage={setMessage} />
        <ResearchSection
          idea={idea}
          enabled={researchEnabled}
          scheduleEnabled={scheduleEnabled}
          onMessage={setMessage}
        />
        <footer className="flex justify-end border-t pt-4">
          <Button variant="ghost" size="sm" disabled={deleting} onClick={() => void remove()}>
            <span className="text-destructive">{deleting ? 'Deleting…' : 'Delete idea'}</span>
          </Button>
        </footer>
      </div>
    </article>
  );
}

function IdeaHeader({
  idea,
  onClose,
  onMessage,
}: {
  idea: Idea;
  onClose: () => void;
  onMessage: (message: string) => void;
}) {
  const [{ fetching: saving }, updateIdea] = useMutation(UpdateIdeaMutation);
  const meta = STATUS_META[idea.status];

  async function changeStatus(status: IdeaStatus) {
    const result = await updateIdea({ id: idea.id, status });
    onMessage(failureMessage(result.data?.updateIdea, result.error?.message));
  }

  return (
    <header className={cn('flex items-start justify-between gap-4 p-6', meta.note)}>
      <div className="space-y-1 text-stone-900">
        <h2
          id="idea-title"
          className={cn('text-xl font-bold leading-tight', !idea.title && 'text-stone-600')}
        >
          {idea.title ?? 'Untitled idea'}
        </h2>
        <p className="text-sm text-stone-700">
          Captured from <SourceLink source={idea.source} url={idea.sourceUrl} /> ·{' '}
          {formatDate(idea.createdAt)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <label htmlFor="idea-status" className="sr-only">
          Status
        </label>
        <select
          id="idea-status"
          value={idea.status}
          disabled={saving}
          onChange={(event) => void changeStatus(event.target.value as IdeaStatus)}
          className="h-8 rounded-md border border-stone-400 bg-white/70 px-2 text-sm text-stone-900"
        >
          {STATUS_ORDER.map((status) => (
            <option key={status} value={status}>
              {STATUS_META[status].label}
            </option>
          ))}
        </select>
        <Button variant="ghost" size="sm" onClick={onClose} className="text-stone-900">
          Close
        </Button>
      </div>
    </header>
  );
}

function SourceLink({ source, url }: { source: string; url: Maybe<string> }) {
  if (!url) return <>{sourceLabel(source)}</>;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="underline">
      {sourceLabel(source)}
    </a>
  );
}

function IdeaText({ idea, onMessage }: { idea: Idea; onMessage: (message: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [{ fetching: titling }, generateIdeaTitle] = useMutation(GenerateIdeaTitleMutation);

  async function generateTitle() {
    const result = await generateIdeaTitle({ id: idea.id });
    onMessage(failureMessage(result.data?.generateIdeaTitle, result.error?.message));
  }

  return (
    <section aria-labelledby="idea-section" className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 id="idea-section" className="font-semibold">
          Idea
        </h3>
        {!editing ? (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={titling}
              onClick={() => void generateTitle()}
            >
              {titling ? 'Writing title…' : idea.title ? 'Regenerate title' : 'Generate title'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              Edit
            </Button>
          </div>
        ) : null}
      </div>
      {editing ? (
        <IdeaEditForm
          ideaId={idea.id}
          initialTitle={idea.title ?? ''}
          initialBody={idea.body}
          onDone={() => setEditing(false)}
          onMessage={onMessage}
        />
      ) : (
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{idea.body}</p>
      )}
    </section>
  );
}

// Mounted fresh each time editing starts, so the draft starts from the saved idea on purpose.
function IdeaEditForm({
  ideaId,
  initialTitle,
  initialBody,
  onDone,
  onMessage,
}: {
  ideaId: string;
  initialTitle: string;
  initialBody: string;
  onDone: () => void;
  onMessage: (message: string) => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [{ fetching: saving }, updateIdea] = useMutation(UpdateIdeaMutation);

  async function save(event: FormEvent) {
    event.preventDefault();
    const result = await updateIdea({ id: ideaId, title, body });
    const failure = failureMessage(result.data?.updateIdea, result.error?.message);
    onMessage(failure);
    if (!failure) onDone();
  }

  return (
    <form onSubmit={(event) => void save(event)} className="space-y-2">
      <label htmlFor="edit-title" className="text-sm text-muted-foreground">
        Title
      </label>
      <input
        id="edit-title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        maxLength={200}
        placeholder="Leave empty for an untitled idea"
        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
      />
      <label htmlFor="edit-body" className="text-sm text-muted-foreground">
        Description
      </label>
      <textarea
        id="edit-body"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={8}
        maxLength={20_000}
        className="w-full resize-y rounded-md border bg-background p-3 text-sm"
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving || !body.trim()}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
