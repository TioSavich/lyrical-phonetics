/**
 * Shared prose pre-split. If the input has no newlines but contains
 * sentence terminators, split on them so structural analyses (sections,
 * meter clauses, anaphora) have something to bite on.
 */
export function presplitProse(text: string): string {
  if (text.includes('\n')) return text;
  return text.replace(/([.!?…])(\s+)/g, '$1\n');
}
