import { useMutation } from 'urql';
import { Button } from '../../components/ui/button';
import { graphql, readFragment, type FragmentOf } from '../../graphql';
import { Markdown } from './Markdown';
import { IdeaResearchFragment, type IdeaResearch } from './research';
import { formatDate, formatTime } from './status';

const StartResearchMutation = graphql(`
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

// Returns the idea so urql's document cache refetches every query showing it.
const ShelveIdeaMutation = graphql(`
  mutation ShelveIdea($id: ID!) {
    updateIdea(id: $id, status: SHELVED) {
      __typename
      ... on MutationUpdateIdeaSuccess {
        data {
          id
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

type Plan = NonNullable<IdeaResearch['latestPlan']>;
type Question = IdeaResearch['questions'][number];
type OnMessage = (message: string) => void;

function payloadError(
  payload: { __typename: string; message?: string } | undefined,
  fallback: string | undefined,
): string {
  if (payload && !payload.__typename.endsWith('Success')) return payload.message ?? 'Failed';
  return payload ? '' : (fallback ?? 'Failed');
}

export function ResearchSection({
  idea: ideaRef,
  enabled,
  onMessage,
}: {
  idea: FragmentOf<typeof IdeaResearchFragment>;
  enabled: boolean;
  onMessage: OnMessage;
}) {
  const idea = readFragment(IdeaResearchFragment, ideaRef);
  const plan = idea.latestPlan;

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
        <ResearchStatus idea={idea} enabled={enabled} onMessage={onMessage} />
        {plan ? (
          <PlanBody ideaId={idea.id} ideaStatus={idea.status} plan={plan} onMessage={onMessage} />
        ) : null}
      </section>
      <QuestionList questions={idea.questions} hasPlan={Boolean(plan)} />
      {plan ? <ResearchNotes plan={plan} /> : null}
    </>
  );
}

function ResearchStatus({
  idea,
  enabled,
  onMessage,
}: {
  idea: IdeaResearch;
  enabled: boolean;
  onMessage: OnMessage;
}) {
  const [{ fetching: starting }, startResearch] = useMutation(StartResearchMutation);
  const research = idea.research;

  async function onStart() {
    const result = await startResearch({ ideaId: idea.id });
    onMessage(payloadError(result.data?.startResearch, result.error?.message));
  }

  const start = (label: string) =>
    enabled ? (
      <Button variant="outline" size="sm" disabled={starting} onClick={() => void onStart()}>
        {starting ? 'Queuing…' : label}
      </Button>
    ) : null;

  if (research?.status === 'RUNNING') {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <span className="size-2 animate-pulse rounded-full bg-sky-500" aria-hidden="true" />
        Researching since {formatTime(research.startedAt ?? research.notBefore)}. This usually takes
        a few minutes.
      </p>
    );
  }
  if (research?.status === 'QUEUED') {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {research.attempt > 1 || research.error
          ? `${research.error ?? 'The last attempt failed'}. Retrying at ${formatTime(research.notBefore)}.`
          : 'Queued for research.'}
      </p>
    );
  }
  if (research?.status === 'FAILED') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/40 p-3 text-sm">
        <span className="text-destructive">
          Research failed: {research.error ?? 'unknown error'}
        </span>
        {start('Try again')}
      </div>
    );
  }
  if (!idea.latestPlan) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        <span>{enabled ? 'No research yet.' : "Research isn't set up on this board."}</span>
        {start('Research this idea')}
      </div>
    );
  }
  return <div className="flex justify-end">{start('Research again')}</div>;
}

function PlanBody({
  ideaId,
  ideaStatus,
  plan,
  onMessage,
}: {
  ideaId: string;
  ideaStatus: string;
  plan: Plan;
  onMessage: OnMessage;
}) {
  return (
    <>
      {plan.suggestion === 'SHELVED' && ideaStatus !== 'SHELVED' ? (
        <ShelveBanner ideaId={ideaId} reason={plan.shelveReason} onMessage={onMessage} />
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
              {item.version ? <span className="text-muted-foreground"> {item.version}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

function ShelveBanner({
  ideaId,
  reason,
  onMessage,
}: {
  ideaId: string;
  reason: Plan['shelveReason'];
  onMessage: OnMessage;
}) {
  const [{ fetching: shelving }, shelve] = useMutation(ShelveIdeaMutation);

  async function onShelve() {
    const result = await shelve({ id: ideaId });
    onMessage(payloadError(result.data?.updateIdea, result.error?.message));
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-amber-100 p-3 text-sm text-amber-950">
      <div className="min-w-0 flex-1">
        <strong>Research suggests shelving this.</strong>
        {reason ? <Markdown>{reason}</Markdown> : null}
      </div>
      <Button size="sm" variant="outline" disabled={shelving} onClick={() => void onShelve()}>
        Shelve
      </Button>
    </div>
  );
}

function QuestionList({ questions, hasPlan }: { questions: Question[]; hasPlan: boolean }) {
  const open = questions.filter((question) => question.status === 'OPEN').length;
  return (
    <section aria-labelledby="questions-section" className="space-y-2">
      <h3 id="questions-section" className="font-semibold">
        Questions{open > 0 ? ` (${String(open)} open)` : ''}
      </h3>
      {questions.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          {hasPlan ? 'No open questions.' : 'Questions arrive with the plan.'}
        </p>
      ) : (
        <>
          <ol className="space-y-3">
            {questions.map((question) => (
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
          <p className="text-xs text-muted-foreground">
            Answering questions comes next; for now, talk them through in the idea&apos;s Slack
            thread.
          </p>
        </>
      )}
    </section>
  );
}

function ResearchNotes({ plan }: { plan: Plan }) {
  if (!plan.researchMd && plan.sources.length === 0) return null;
  return (
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
  );
}
