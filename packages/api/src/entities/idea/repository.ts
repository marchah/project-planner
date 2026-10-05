import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { ideas } from '../../db/schema';
import type { Db } from '../../db/client';
import type { Maybe } from '../../common/types';
import { IdeaStatus, type Idea, type IdeaPatch, type IdeaRepository, type NewIdea } from './types';

export function ideaRepositoryFactory({ db }: { db: Db }): IdeaRepository {
  async function findIdeaById(id: string): Promise<Maybe<Idea>> {
    const rows = await db.select().from(ideas).where(eq(ideas.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async function listIdeas(): Promise<Idea[]> {
    return db.select().from(ideas).orderBy(desc(ideas.createdAt), desc(ideas.id));
  }

  async function createIdea(idea: NewIdea): Promise<Idea> {
    const now = new Date();
    const row: Idea = {
      id: randomUUID(),
      status: IdeaStatus.CAPTURED,
      autoRefresh: true,
      createdAt: now,
      updatedAt: now,
      ...idea,
    };
    await db.insert(ideas).values(row);
    return row;
  }

  async function updateIdea(id: string, patch: IdeaPatch): Promise<Maybe<Idea>> {
    const rows = await db
      .update(ideas)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(ideas.id, id))
      .returning();
    return rows[0] ?? null;
  }

  async function deleteIdea(id: string): Promise<Maybe<Idea>> {
    const rows = await db.delete(ideas).where(eq(ideas.id, id)).returning();
    return rows[0] ?? null;
  }

  return { findIdeaById, listIdeas, createIdea, updateIdea, deleteIdea };
}
