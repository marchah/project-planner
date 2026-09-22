/* eslint-disable */
/* prettier-ignore */

export type introspection_types = {
    'Boolean': unknown;
    'ConflictError': { kind: 'OBJECT'; name: 'ConflictError'; fields: { 'message': { name: 'message'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'String'; ofType: null; }; } }; 'status': { name: 'status'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'Int'; ofType: null; }; } }; }; };
    'DateTime': unknown;
    'ID': unknown;
    'Idea': { kind: 'OBJECT'; name: 'Idea'; fields: { 'body': { name: 'body'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'String'; ofType: null; }; } }; 'createdAt': { name: 'createdAt'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'DateTime'; ofType: null; }; } }; 'id': { name: 'id'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'ID'; ofType: null; }; } }; 'source': { name: 'source'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'ENUM'; name: 'IdeaSource'; ofType: null; }; } }; 'sourceUrl': { name: 'sourceUrl'; type: { kind: 'SCALAR'; name: 'String'; ofType: null; } }; 'status': { name: 'status'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'ENUM'; name: 'IdeaStatus'; ofType: null; }; } }; 'title': { name: 'title'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'String'; ofType: null; }; } }; 'updatedAt': { name: 'updatedAt'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'DateTime'; ofType: null; }; } }; }; };
    'IdeaSource': { name: 'IdeaSource'; enumValues: 'API' | 'SLACK' | 'WEB'; };
    'IdeaStatus': { name: 'IdeaStatus'; enumValues: 'BUILDING' | 'CAPTURED' | 'DONE' | 'PLANNED' | 'RESEARCHING' | 'SHELVED'; };
    'Int': unknown;
    'Mutation': { kind: 'OBJECT'; name: 'Mutation'; fields: { 'captureIdea': { name: 'captureIdea'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'UNION'; name: 'MutationCaptureIdeaResult'; ofType: null; }; } }; 'deleteIdea': { name: 'deleteIdea'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'UNION'; name: 'MutationDeleteIdeaResult'; ofType: null; }; } }; 'updateIdea': { name: 'updateIdea'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'UNION'; name: 'MutationUpdateIdeaResult'; ofType: null; }; } }; }; };
    'MutationCaptureIdeaResult': { kind: 'UNION'; name: 'MutationCaptureIdeaResult'; fields: {}; possibleTypes: 'MutationCaptureIdeaSuccess' | 'ServerError' | 'ValidationError'; };
    'MutationCaptureIdeaSuccess': { kind: 'OBJECT'; name: 'MutationCaptureIdeaSuccess'; fields: { 'data': { name: 'data'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'OBJECT'; name: 'Idea'; ofType: null; }; } }; }; };
    'MutationDeleteIdeaResult': { kind: 'UNION'; name: 'MutationDeleteIdeaResult'; fields: {}; possibleTypes: 'MutationDeleteIdeaSuccess' | 'NotFoundError' | 'ServerError'; };
    'MutationDeleteIdeaSuccess': { kind: 'OBJECT'; name: 'MutationDeleteIdeaSuccess'; fields: { 'data': { name: 'data'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'OBJECT'; name: 'Idea'; ofType: null; }; } }; }; };
    'MutationUpdateIdeaResult': { kind: 'UNION'; name: 'MutationUpdateIdeaResult'; fields: {}; possibleTypes: 'MutationUpdateIdeaSuccess' | 'NotFoundError' | 'ServerError' | 'ValidationError'; };
    'MutationUpdateIdeaSuccess': { kind: 'OBJECT'; name: 'MutationUpdateIdeaSuccess'; fields: { 'data': { name: 'data'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'OBJECT'; name: 'Idea'; ofType: null; }; } }; }; };
    'NotFoundError': { kind: 'OBJECT'; name: 'NotFoundError'; fields: { 'message': { name: 'message'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'String'; ofType: null; }; } }; 'status': { name: 'status'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'Int'; ofType: null; }; } }; }; };
    'Query': { kind: 'OBJECT'; name: 'Query'; fields: { 'idea': { name: 'idea'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'UNION'; name: 'QueryIdeaResult'; ofType: null; }; } }; 'ideas': { name: 'ideas'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'LIST'; name: never; ofType: { kind: 'NON_NULL'; name: never; ofType: { kind: 'OBJECT'; name: 'Idea'; ofType: null; }; }; }; } }; }; };
    'QueryIdeaResult': { kind: 'UNION'; name: 'QueryIdeaResult'; fields: {}; possibleTypes: 'NotFoundError' | 'QueryIdeaSuccess' | 'ServerError'; };
    'QueryIdeaSuccess': { kind: 'OBJECT'; name: 'QueryIdeaSuccess'; fields: { 'data': { name: 'data'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'OBJECT'; name: 'Idea'; ofType: null; }; } }; }; };
    'ServerError': { kind: 'OBJECT'; name: 'ServerError'; fields: { 'message': { name: 'message'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'String'; ofType: null; }; } }; 'status': { name: 'status'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'Int'; ofType: null; }; } }; }; };
    'String': unknown;
    'ValidationError': { kind: 'OBJECT'; name: 'ValidationError'; fields: { 'message': { name: 'message'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'String'; ofType: null; }; } }; 'status': { name: 'status'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'Int'; ofType: null; }; } }; }; };
};

/** An IntrospectionQuery representation of your schema.
 *
 * @remarks
 * This is an introspection of your schema saved as a file by GraphQLSP.
 * It will automatically be used by `gql.tada` to infer the types of your GraphQL documents.
 * If you need to reuse this data or update your `scalars`, update `tadaOutputLocation` to
 * instead save to a .ts instead of a .d.ts file.
 */
export type introspection = {
  name: never;
  query: 'Query';
  mutation: 'Mutation';
  subscription: never;
  types: introspection_types;
};

import * as gqlTada from 'gql.tada';

declare module 'gql.tada' {
  interface setupSchema {
    introspection: introspection
  }
}