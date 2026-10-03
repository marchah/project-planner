import { useState } from 'react';
import { useMutation } from 'urql';
import { graphql } from '../../graphql';
import type { Maybe } from '../../lib/types';
import { payloadError, type OnMessage } from './research';
import { formatDate, formatTime } from './status';

const SetAutoRefreshMutation = graphql(`
  mutation SetAutoRefresh($id: ID!, $autoRefresh: Boolean!) {
    updateIdea(id: $id, autoRefresh: $autoRefresh) {
      __typename
      ... on MutationUpdateIdeaSuccess {
        data {
          id
          autoRefresh
          nextScheduledRefresh
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

// Keyed by the saved value: it flips at once, and remounts when the saved value comes back.
export function ScheduleToggle({
  ideaId,
  autoRefresh,
  next,
  onMessage,
}: {
  ideaId: string;
  autoRefresh: boolean;
  next: Maybe<string>;
  onMessage: OnMessage;
}) {
  const [checked, setChecked] = useState(autoRefresh);
  const [{ fetching: saving }, setAutoRefresh] = useMutation(SetAutoRefreshMutation);

  async function toggle(value: boolean) {
    setChecked(value);
    const result = await setAutoRefresh({ id: ideaId, autoRefresh: value });
    const failure = payloadError(result.data?.updateIdea, result.error?.message);
    onMessage(failure);
    if (failure) setChecked(autoRefresh);
  }

  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      <input
        type="checkbox"
        checked={checked}
        disabled={saving}
        onChange={(event) => void toggle(event.target.checked)}
        className="size-4"
      />
      <span>
        Re-check this plan on schedule
        {checked && next ? ` · next ${formatDate(next)}, ${formatTime(next)}` : null}
      </span>
    </label>
  );
}
