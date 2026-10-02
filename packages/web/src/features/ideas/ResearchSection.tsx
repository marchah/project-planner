import { useMutation } from 'urql';
import { Button } from '../../components/ui/button';
import { graphql, readFragment, type FragmentOf, type ResultOf } from '../../graphql';
import type { Maybe } from '../../lib/types';
import { Markdown } from './Markdown';
import { formatDate } from './status';

export const StartResearchMutation = graphql(`
  mutation StartResearch($ideaId: ID!) {
    startResearch(ideaId: $ideaId) {
      __typename
      ... on MutationStartResearchSuccess {
        data {
          id
          status
          research {
            id
            status
          }
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

const UpdateStatusMutation = graphql(`
  mutation ShelveIdea($id: ID!) {
    updateIdea(id: $id, status: SHELVED) {
      __typename
    }
  }
`);

export const IdeaResearchFragment = graphql(`
  fragment IdeaResearch on Idea {
    id
    status
    research {
      id
      status
      attempt
      error
      notBefore
      startedAt
    }
    latestPlan {
      id
      version
      summary
      planMd
      researchMd
      suggestion
      shelveReason
      createdAt
      stack {
        name
        version
        role
      }
      sources {
        url
        title
        firstParty
      }
    }
    questions {
      id
      number
      topic
      text
      why
      defaultAnswer
      status
    }
  }
`);

type IdeaResearch = ResultOf<typeof IdeaResearchFragment>;
type Research = IdeaResearch['research'];

export function isResearchActive(research: Maybe<{ status: string }>): boolean {
  return research?.status === 'QUEUED' || research?.status === 'RUNNING';
}

const time = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));

function ResearchStatus({
  research,
  hasPlan,
  enabled,
  starting,
  onStart,
}: {
  research: Research;
  hasPlan: boolean;
  enabled: boolean;
  starting: boolean;
  onStart: () => void;
}) {
  const start = (label: string) =>
    enabled ? (
      <Button variant="outline" size="sm" disabled={starting} onClick={onStart}>
        {starting ? 'Queuing…' : label}
      </Button>
    ) : null;

  if (research?.status === 'RUNNING') {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <span className="size-2 animate-pulse rounded-full bg-sky-500" aria-hidden="true" />
        Researching since {time(research.startedAt ?? research.notBefore)}. This usually takes a few
        minutes.
      </p>
    );
  }
  if (research?.status === 'QUEUED') {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {research.attempt > 1
          ? `Attempt ${String(research.attempt - 1)} failed (${research.error ?? 'unknown error'}). Retrying at ${time(research.notBefore)}.`
          : 'Queued for research.'}
      </p>
    );
  }
  if (research?.status === 'FAILED') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/40 p-3 text-sm">
        <span className="text-destructive">
          Research failed after {research.attempt} attempts: {research.error ?? 'unknown error'}
        </span>
        {start('Try again')}
      </div>
    );
  }
  if (!hasPlan) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        <span>{enabled ? 'No research yet.' : "Research isn't set up on this board."}</span>
        {start('Research this idea')}
      </div>
    );
  }
  return <div className="flex justify-end">{start('Research again')}</div>;
}

export function ResearchSection({
  idea: ideaRef,
  enabled,
  onMessage,
}: {
  idea: FragmentOf<typeof IdeaResearchFragment>;
  enabled: boolean;
  onMessage: (message: string) => void;
}) {
  const view = readFragment(IdeaResearchFragment, ideaRef);
  const ideaId = view.id;
  const ideaStatus = view.status;
  const [{ fetching: starting }, startResearch] = useMutation(StartResearchMutation);
  const [{ fetching: shelving }, shelve] = useMutation(UpdateStatusMutation);
  const plan = view.latestPlan;
  const openQuestions = view.questions.filter((q) => q.status === 'OPEN');

  async function onStart() {
    const result = await startResearch({ ideaId });
    const payload = result.data?.startResearch;
    if (payload && payload.__typename !== 'MutationStartResearchSuccess' && 'message' in payload) {
      onMessage(payload.message);
    } else if (result.error) onMessage(result.error.message);
  }

  return (
    <>
      <section aria-labelledby="plan-section" className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 id="plan-section" className="font-semibold">
            Plan
          </h3>
          {plan ? (
            <span className="text-xs text-muted-foreground">
              v{plan.version} · {formatDate(plan.createdAt)}
            </span>
          ) : null}
        </div>
        <ResearchStatus
          research={view.research}
          hasPlan={Boolean(plan)}
          enabled={enabled}
          starting={starting}
          onStart={() => void onStart()}
        />
        {plan ? (
          <>
            {plan.suggestion === 'SHELVED' && ideaStatus !== 'SHELVED' ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-amber-100 p-3 text-sm text-amber-950">
                <div className="min-w-0 flex-1">
                  <strong>Research suggests shelving this.</strong>
                  {plan.shelveReason ? <Markdown>{plan.shelveReason}</Markdown> : null}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={shelving}
                  onClick={() => void shelve({ id: ideaId })}
                >
                  Shelve
                </Button>
              </div>
            ) : null}
            <p className="text-sm font-medium">{plan.summary}</p>
            <Markdown>{plan.planMd}</Markdown>
            {plan.stack.length > 0 ? (
              <ul aria-label="Stack" className="flex flex-wrap gap-1.5">
                {plan.stack.map((item) => (
                  <li
                    key={item.name}
                    title={item.role}
                    className="rounded-full border px-2 py-0.5 text-xs"
                  >
                    {item.name}
                    {item.version ? (
                      <span className="text-muted-foreground"> {item.version}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </section>

      <section aria-labelledby="questions-section" className="space-y-2">
        <h3 id="questions-section" className="font-semibold">
          Questions{openQuestions.length > 0 ? ` (${String(openQuestions.length)} open)` : ''}
        </h3>
        {view.questions.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            {plan ? 'No open questions.' : 'Questions arrive with the plan.'}
          </p>
        ) : (
          <ol className="space-y-3">
            {view.questions.map((question) => (
              <li key={question.id} className="rounded-md border p-3 text-sm">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Q{question.number} · {question.topic}
                </p>
                <p className="mt-1 font-medium">{question.text}</p>
                <p className="mt-1 text-muted-foreground">{question.why}</p>
                <p className="mt-2">
                  <span className="text-muted-foreground">Until answered: </span>
                  {question.defaultAnswer}
                </p>
              </li>
            ))}
          </ol>
        )}
        {view.questions.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            Answering questions comes next; for now, talk them through in the idea's Slack thread.
          </p>
        ) : null}
      </section>

      {plan && (plan.researchMd || plan.sources.length > 0) ? (
        <details className="rounded-md border p-3 text-sm">
          <summary className="cursor-pointer font-semibold">Research notes and sources</summary>
          <div className="mt-3 space-y-3">
            {plan.researchMd ? <Markdown>{plan.researchMd}</Markdown> : null}
            {plan.sources.length > 0 ? (
              <ul className="space-y-1">
                {plan.sources.map((source) => (
                  <li key={source.url}>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2"
                    >
                      {source.title || source.url}
                    </a>
                    {source.firstParty ? (
                      <span className="text-xs text-muted-foreground"> · first-party</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </details>
      ) : null}
    </>
  );
}
