import { useState, type FormEvent } from 'react';
import { useMutation } from 'urql';
import { Button } from '../../components/ui/button';
import { graphql } from '../../graphql';
import type { Maybe } from '../../lib/types';
import { cn } from '../../lib/utils';
import { payloadError, type IdeaResearch, type OnMessage } from './research';

// Returns the idea so the board's open-question count and the dialog both refetch.
const AnswerQuestionMutation = graphql(`
  mutation AnswerQuestion($id: ID!, $answer: String!) {
    answerQuestion(id: $id, answer: $answer) {
      __typename
      ... on MutationAnswerQuestionSuccess {
        data {
          id
          openQuestionCount
          questions {
            id
            status
            answer
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
      ... on ConflictError {
        message
      }
      ... on ServerError {
        message
      }
    }
  }
`);

type Question = IdeaResearch['questions'][number];

const STATUS_NOTE: Record<string, string> = {
  ANSWERED: ' · answered',
  RESOLVED: ' · in the plan',
};

export function QuestionsSection({
  questions,
  hasPlan,
  onMessage,
}: {
  questions: Question[];
  hasPlan: boolean;
  onMessage: OnMessage;
}) {
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
        <ol className="space-y-3">
          {questions.map((question) => (
            <QuestionCard key={question.id} question={question} onMessage={onMessage} />
          ))}
        </ol>
      )}
    </section>
  );
}

function QuestionCard({ question, onMessage }: { question: Question; onMessage: OnMessage }) {
  const [editing, setEditing] = useState(false);
  const resolved = question.status === 'RESOLVED';
  return (
    <li className={cn('rounded-md border p-3 text-sm', resolved && 'bg-muted/40')}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        Q{question.number} · {question.topic}
        {STATUS_NOTE[question.status] ?? ''}
      </p>
      <p className="mt-1 font-medium">{question.text}</p>
      {question.answer === null || editing ? (
        <>
          <p className="mt-1 text-muted-foreground">{question.why}</p>
          <p className="mt-2">
            <span className="text-muted-foreground">Until answered: </span>
            {question.defaultAnswer}
          </p>
          <AnswerForm
            question={question}
            onDone={() => setEditing(false)}
            onCancel={editing ? () => setEditing(false) : null}
            onMessage={onMessage}
          />
        </>
      ) : (
        <AnswerView question={question} onEdit={resolved ? null : () => setEditing(true)} />
      )}
    </li>
  );
}

function AnswerView({ question, onEdit }: { question: Question; onEdit: Maybe<() => void> }) {
  return (
    <div className="mt-2 space-y-1">
      <p className="whitespace-pre-wrap">
        <span className="text-muted-foreground">Your answer: </span>
        {question.answer}
      </p>
      {question.status === 'RESOLVED' ? (
        <p className="text-muted-foreground">
          {question.appliedNote ? `In the plan: ${question.appliedNote}` : 'Applied to the plan.'}
        </p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-muted-foreground">Goes into the next plan update.</span>
          {onEdit ? (
            <Button variant="ghost" size="sm" onClick={onEdit}>
              Edit answer
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}

// Mounted fresh each time it opens, so the draft starts from the saved answer on purpose.
function AnswerForm({
  question,
  onDone,
  onCancel,
  onMessage,
}: {
  question: Question;
  onDone: () => void;
  onCancel: Maybe<() => void>;
  onMessage: OnMessage;
}) {
  const [answer, setAnswer] = useState(question.answer ?? '');
  const [{ fetching: saving }, answerQuestion] = useMutation(AnswerQuestionMutation);
  const fieldId = `answer-${question.id}`;

  async function save(event: FormEvent) {
    event.preventDefault();
    const result = await answerQuestion({ id: question.id, answer });
    const failure = payloadError(result.data?.answerQuestion, result.error?.message);
    onMessage(failure);
    if (!failure) onDone();
  }

  return (
    <form onSubmit={(event) => void save(event)} className="mt-3 space-y-2">
      <label htmlFor={fieldId} className="sr-only">
        Answer to Q{question.number}
      </label>
      <textarea
        id={fieldId}
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        rows={2}
        maxLength={4_000}
        placeholder="Your answer"
        className="w-full resize-y rounded-md border bg-background p-2 text-sm"
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving || !answer.trim()}>
          {saving ? 'Saving…' : 'Save answer'}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
