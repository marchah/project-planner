import { builder } from './builder';

// Side-effect imports: each slice registers its GraphQL types/fields on the shared builder.
// Add a new slice's schema here so it appears in the schema.
import './entities/idea/schema.pothos';
import './entities/plan/schema.pothos';
import './entities/question/schema.pothos';
import './entities/research-job/schema.pothos';
import './features/research/schema.pothos';

export const schema = builder.toSchema();
