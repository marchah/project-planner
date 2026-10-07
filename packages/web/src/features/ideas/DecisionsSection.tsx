import { useState, type FormEvent } from 'react';
import { useMutation } from 'urql';
import { Button } from '../../components/ui/button';
import { graphql } from '../../graphql';
import { payloadError, type IdeaResearch, type OnMessage } from './research';
import { formatDate } from './status';

const RecordDecisionMutation = graphql(`
  mutation RecordDecision($ideaId: ID!, $text: String!) {
    recordDecision(ideaId: $ideaId, text: $text) {
      __typename
      ... on MutationRecordDecisionSuccess {
        data {
          id
          decisions {
            id
          }
          research {
            id
            kind
            status
            notBefore
          }
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

const DeleteDecisionMutation = graphql(`
  mutation DeleteDecision($id: ID!) {
    deleteDecision(id: $id) {
      __typename
      ... on MutationDeleteDecisionSuccess {
        data {
          id
          decisions {
            id
          }
          research {
            id
            kind
            status
            notBefore
          }
        }
      }
      ... on NotFoundError {
        message
      }
      ... on ConflictError {
        message
      }
      ... on ServerError {
        message
      }
    }
  }
`);

type Decision = IdeaResearch['decisions'][number];

export function DecisionsSection({
  ideaId,
  decisions,
  onMessage,
}: {
  ideaId: string;
  decisions: Decision[];
  onMessage: OnMessage;
}) {
  return (
    <section aria-labelledby="decisions-section" className="space-y-2">
      <h3 id="decisions-section" className="font-semibold">
        Decisions
      </h3>
      <p className="text-sm text-muted-foreground">
        Anything you have settled that the questions don&apos;t cover. Plan updates follow it.
      </p>
      {decisions.length > 0 ? (
        <ul className="space-y-2">
          {decisions.map((decision) => (
            <DecisionItem key={decision.id} decision={decision} onMessage={onMessage} />
          ))}
        </ul>
      ) : null}
      <DecisionForm ideaId={ideaId} onMessage={onMessage} />
    </section>
  );
}

function DecisionItem({ decision, onMessage }: { decision: Decision; onMessage: OnMessage }) {
  const [{ fetching: removing }, deleteDecision] = useMutation(DeleteDecisionMutation);

  async function remove() {
    if (!window.confirm(`Remove this decision?\n\n${decision.text}`)) return;
    const result = await deleteDecision({ id: decision.id });
    onMessage(payloadError(result.data?.deleteDecision, result.error?.message));
  }

  return (
    <li className="flex items-start justify-between gap-2 rounded-md border p-3 text-sm">
      <div className="min-w-0">
        <p className="whitespace-pre-wrap">{decision.text}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {formatDate(decision.createdAt)} ·{' '}
          {decision.source === 'ASSISTANT' ? 'recorded by an assistant' : 'on the board'} ·{' '}
          {decision.appliedAt ? 'in the plan' : 'goes into the next plan update'}
        </p>
      </div>
      {decision.appliedAt ? null : (
        <Button variant="ghost" size="sm" disabled={removing} onClick={() => void remove()}>
          {removing ? 'Removing…' : 'Remove'}
        </Button>
      )}
    </li>
  );
}

function DecisionForm({ ideaId, onMessage }: { ideaId: string; onMessage: OnMessage }) {
  const [text, setText] = useState('');
  const [{ fetching: saving }, recordDecision] = useMutation(RecordDecisionMutation);

  async function save(event: FormEvent) {
    event.preventDefault();
    const result = await recordDecision({ ideaId, text });
    const failure = payloadError(result.data?.recordDecision, result.error?.message);
    onMessage(failure);
    if (!failure) setText('');
  }

  return (
    <form onSubmit={(event) => void save(event)} className="space-y-2">
      <label htmlFor="new-decision" className="sr-only">
        New decision
      </label>
      <textarea
        id="new-decision"
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={2}
        maxLength={2_000}
        placeholder="e.g. Use Postgres; no mobile app for now"
        className="w-full resize-y rounded-md border bg-background p-2 text-sm"
      />
      <Button type="submit" size="sm" variant="outline" disabled={saving || !text.trim()}>
        {saving ? 'Saving…' : 'Record decision'}
      </Button>
    </form>
  );
}
