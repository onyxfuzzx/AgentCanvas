import type { AreaCatalog, Preview, Review } from './model';
import type { TaskSnapshot } from '../tasks/model';
export function samePreview(
  a: Preview | null | undefined,
  b: Preview | null | undefined,
) {
  return Boolean(
    a &&
    b &&
    a.head === b.head &&
    a.targetHead === b.targetHead &&
    a.target === b.target &&
    a.tree === b.tree,
  );
}
export function checksReady(review: Review) {
  return (
    !review.status.trim() &&
    review.checks.length > 0 &&
    review.checks.every((c) => c.head === review.head && c.state === 'passed')
  );
}
/** Native integration can return an uncertain operation journal rather than throw. */
export function integrationCommit(catalog: AreaCatalog, areaId: string) {
  const area = catalog.areas.find((a) => a.id === areaId);
  return area?.operation.kind === 'integrate' &&
    area.operation.state === 'complete'
    ? (area.integrated ?? undefined)
    : undefined;
}
export function findingsForCommit(review: Review) {
  const prefix = `Commit ${review.head}\n`;
  return {
    current: review.findings.startsWith(prefix),
    text: review.findings.startsWith(prefix)
      ? review.findings.slice(prefix.length)
      : review.findings,
  };
}
export function independentReviews(
  areaId: string,
  review: Review,
  snapshot?: TaskSnapshot,
) {
  const tasks = snapshot?.board.tasks ?? [];
  return (snapshot?.board.orchestration?.reviews ?? []).flatMap((binding) => {
    const builder = tasks.find((t) => t.id === binding.builder);
    const reviewer = tasks.find((t) => t.id === binding.reviewer);
    if (!builder || !reviewer || builder.checkoutRef !== areaId) return [];
    const current =
      binding.head === review.head &&
      Boolean(binding.builderAttempt) &&
      binding.builderAttempt === builder.attempts.at(-1)?.id;
    const independent =
      reviewer.assignedTo !== builder.assignedTo &&
      reviewer.reviewOf === builder.id &&
      reviewer.checkoutRef === areaId;
    return [
      {
        builder,
        reviewer,
        head: binding.head,
        current,
        accepted:
          current &&
          independent &&
          reviewer.state === 'done' &&
          reviewer.attempts.at(-1)?.state === 'completed',
      },
    ];
  });
}
