import { graphql, type ResultOf } from '../../graphql';
import type { Maybe } from '../../lib/types';

export const IdeaResearchFragment = graphql(`
  fragment IdeaResearch on Idea {
    id
    status
    research {
      id
      kind
      status
      attempt
      error
      outcome
      notBefore
      startedAt
      finishedAt
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
      answer
      status
      appliedNote
    }
    decisions {
      id
      text
      source
      appliedAt
      createdAt
    }
  }
`);

export type IdeaResearch = ResultOf<typeof IdeaResearchFragment>;
export type OnMessage = (message: string) => void;

export function isResearchActive(research: Maybe<{ status: string }>): boolean {
  return research?.status === 'QUEUED' || research?.status === 'RUNNING';
}

/** The message to show for a mutation result: empty on success. */
export function payloadError(
  payload: { __typename: string; message?: string } | undefined,
  fallback: string | undefined,
): string {
  if (payload && !payload.__typename.endsWith('Success')) return payload.message ?? 'Failed';
  return payload ? '' : (fallback ?? 'Failed');
}
