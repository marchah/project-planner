import { graphql, type ResultOf } from '../../graphql';
import type { Maybe } from '../../lib/types';

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

export type IdeaResearch = ResultOf<typeof IdeaResearchFragment>;

export function isResearchActive(research: Maybe<{ status: string }>): boolean {
  return research?.status === 'QUEUED' || research?.status === 'RUNNING';
}
