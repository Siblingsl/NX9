/** Seed skills — official packages live on disk under skills/.
 *  Boot no longer rewrites thin stubs. Reset reloads from SEED_SKILLS only when present.
 *  Regenerate builtins: node scripts/generate-builtin-skills.mjs
 */
export interface SeedSkill {
  id: string;
  content: string;
  metadata?: {
    name: string;
    title: string;
    description: string;
    version: string;
    entry: string;
    author?: string;
    status?: string;
    tags?: string[];
    nx9?: {
      promptId?: string;
      category?: string;
      priority?: string;
      lane?: 'builtin' | 'library';
    };
  };
}

/** Intentionally empty: skills/ on disk is the authority (awesome-skills layout). */
export const SEED_SKILLS: SeedSkill[] = [];
