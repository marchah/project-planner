import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { useMutation } from 'urql';
import { Button } from '../../components/ui/button';
import { graphql } from '../../graphql';

const CaptureIdeaMutation = graphql(`
  mutation CaptureIdea($text: String!) {
    captureIdea(text: $text) {
      __typename
      ... on MutationCaptureIdeaSuccess {
        data {
          id
        }
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

export function CaptureForm() {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [{ fetching }, captureIdea] = useMutation(CaptureIdeaMutation);

  async function submit() {
    if (!text.trim() || fetching) return;
    setError('');
    const result = await captureIdea({ text });
    const payload = result.data?.captureIdea;
    if (payload?.__typename === 'MutationCaptureIdeaSuccess') {
      setText('');
      return;
    }
    setError(payload && 'message' in payload ? payload.message : (result.error?.message ?? ''));
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submit();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void submit();
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <label htmlFor="new-idea" className="sr-only">
        New idea
      </label>
      <textarea
        id="new-idea"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        rows={2}
        maxLength={20_000}
        placeholder="New idea — describe it however you like; a title is written for it (⌘/Ctrl + Enter to add)"
        className="min-h-16 flex-1 resize-y rounded-md border bg-background p-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      <Button type="submit" disabled={!text.trim() || fetching} className="sm:h-16">
        {fetching ? 'Adding…' : 'Add idea'}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive sm:basis-full">
          {error}
        </p>
      ) : null}
    </form>
  );
}
