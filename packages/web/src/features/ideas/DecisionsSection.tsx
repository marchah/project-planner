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
            <li key={decision.id} className="rounded-md border p-3 text-sm">
              <p className="whitespace-pre-wrap">{decision.text}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatDate(decision.createdAt)} ·{' '}
                {decision.source === 'ASSISTANT' ? 'recorded by an assistant' : 'on the board'} ·{' '}
                {decision.appliedAt ? 'in the plan' : 'goes into the next plan update'}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
      <DecisionForm ideaId={ideaId} onMessage={onMessage} />
    </section>
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
