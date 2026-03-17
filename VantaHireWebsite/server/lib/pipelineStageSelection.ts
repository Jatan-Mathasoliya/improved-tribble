import type { PipelineStage } from '@shared/schema';

type StageLike = Pick<PipelineStage, 'id' | 'isDefault' | 'organizationId'>;

export function pickInitialPipelineStage<T extends StageLike>(
  stages: readonly T[],
  organizationId?: number | null,
): T | null {
  if (stages.length === 0) {
    return null;
  }

  if (organizationId != null) {
    const orgStages = stages.filter((stage) => stage.organizationId === organizationId);
    const orgDefault = orgStages.find((stage) => stage.isDefault);
    if (orgDefault) {
      return orgDefault;
    }
    if (orgStages.length > 0) {
      return orgStages[0] ?? null;
    }
  }

  const explicitDefault = stages.find((stage) => stage.isDefault);
  return explicitDefault ?? stages[0] ?? null;
}
