import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { applications, applicationStageHistory, jobs, pipelineStages } from '@shared/schema';
import { db } from '../db';
import { normalizeStageName } from './pipelineStageUtils';

export type DuplicateStageGroup = {
  name: string;
  canonicalId: number;
  duplicateStageIds: number[];
  duplicateOrgStageIds: number[];
};

export type MergeDuplicateStagesResult = {
  orgId: number;
  dryRun: boolean;
  duplicateGroups: DuplicateStageGroup[];
  totals: {
    applicationsToMove?: number;
    historyFromToUpdate?: number;
    historyToToUpdate?: number;
    orgStagesToDelete?: number;
    applicationsUpdated?: number;
    historyFromUpdated?: number;
    historyToUpdated?: number;
    stagesDeleted?: number;
  };
  message?: string;
};

export async function mergeDuplicatePipelineStagesForOrg(
  orgId: number,
  options?: { dryRun?: boolean }
): Promise<MergeDuplicateStagesResult> {
  const dryRun = options?.dryRun ?? false;

  const stages = await db
    .select({
      id: pipelineStages.id,
      name: pipelineStages.name,
      order: pipelineStages.order,
      organizationId: pipelineStages.organizationId,
      isDefault: pipelineStages.isDefault,
    })
    .from(pipelineStages)
    .where(or(
      eq(pipelineStages.organizationId, orgId),
      and(isNull(pipelineStages.organizationId), eq(pipelineStages.isDefault, true))
    ));

  type StageRow = typeof stages[number];

  const stageGroups = new Map<string, StageRow[]>();
  for (const stage of stages) {
    const key = normalizeStageName(stage.name);
    const existing = stageGroups.get(key);
    if (existing) {
      existing.push(stage);
    } else {
      stageGroups.set(key, [stage]);
    }
  }

  const duplicateGroups: DuplicateStageGroup[] = [];
  const allDuplicateStageIds = new Set<number>();
  const allDuplicateOrgStageIds = new Set<number>();

  const sortByOrder = (a: StageRow, b: StageRow) => (a.order - b.order) || (a.id - b.id);

  for (const [, group] of stageGroups.entries()) {
    if (group.length < 2) continue;

    const orgStages = group.filter((stage: StageRow) => stage.organizationId === orgId);
    const defaultStages = group.filter((stage: StageRow) => stage.organizationId == null && stage.isDefault);
    if (orgStages.length === 0 && defaultStages.length === 0) continue;

    const canonical = (orgStages.length ? [...orgStages].sort(sortByOrder)[0] : [...defaultStages].sort(sortByOrder)[0]);
    const duplicateStageIds = group
      .filter((stage: StageRow) => stage.id !== canonical.id)
      .map((stage: StageRow) => stage.id);
    if (duplicateStageIds.length === 0) continue;

    const duplicateOrgStageIds = group
      .filter((stage: StageRow) => stage.organizationId === orgId && stage.id !== canonical.id)
      .map((stage: StageRow) => stage.id);

    duplicateStageIds.forEach((id) => allDuplicateStageIds.add(id));
    duplicateOrgStageIds.forEach((id) => allDuplicateOrgStageIds.add(id));

    duplicateGroups.push({
      name: group[0].name,
      canonicalId: canonical.id,
      duplicateStageIds,
      duplicateOrgStageIds,
    });
  }

  if (duplicateGroups.length === 0) {
    return {
      orgId,
      dryRun,
      duplicateGroups: [],
      totals: dryRun
        ? { applicationsToMove: 0, historyFromToUpdate: 0, historyToToUpdate: 0, orgStagesToDelete: 0 }
        : { applicationsUpdated: 0, historyFromUpdated: 0, historyToUpdated: 0, stagesDeleted: 0 },
      message: 'No duplicate stages found.',
    };
  }

  const duplicateStageIdsAll = Array.from(allDuplicateStageIds);
  const duplicateOrgStageIdsAll = Array.from(allDuplicateOrgStageIds);

  if (dryRun) {
    const [appsToMove] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(applications)
      .innerJoin(jobs, eq(applications.jobId, jobs.id))
      .where(and(eq(jobs.organizationId, orgId), inArray(applications.currentStage, duplicateStageIdsAll)));

    const [historyFrom] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(applicationStageHistory)
      .innerJoin(applications, eq(applicationStageHistory.applicationId, applications.id))
      .innerJoin(jobs, eq(applications.jobId, jobs.id))
      .where(and(eq(jobs.organizationId, orgId), inArray(applicationStageHistory.fromStage, duplicateStageIdsAll)));

    const [historyTo] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(applicationStageHistory)
      .innerJoin(applications, eq(applicationStageHistory.applicationId, applications.id))
      .innerJoin(jobs, eq(applications.jobId, jobs.id))
      .where(and(eq(jobs.organizationId, orgId), inArray(applicationStageHistory.toStage, duplicateStageIdsAll)));

    return {
      orgId,
      dryRun: true,
      duplicateGroups,
      totals: {
        applicationsToMove: appsToMove?.count ?? 0,
        historyFromToUpdate: historyFrom?.count ?? 0,
        historyToToUpdate: historyTo?.count ?? 0,
        orgStagesToDelete: duplicateOrgStageIdsAll.length,
      },
    };
  }

  let applicationsUpdated = 0;
  let historyFromUpdated = 0;
  let historyToUpdated = 0;
  let stagesDeleted = 0;

  for (const group of duplicateGroups) {
    if (group.duplicateStageIds.length === 0) continue;

    const stageIds = group.duplicateStageIds.map((id) => sql`${id}`);
    const stageIdList = sql.join(stageIds, sql`, `);

    const appsResult = await db.execute(sql`
      UPDATE applications a
      SET current_stage = ${group.canonicalId}
      FROM jobs j
      WHERE a.job_id = j.id
        AND j.organization_id = ${orgId}
        AND a.current_stage IN (${stageIdList})
    `);
    applicationsUpdated += appsResult.rowCount ?? 0;

    const historyFromResult = await db.execute(sql`
      UPDATE application_stage_history ash
      SET from_stage = ${group.canonicalId}
      FROM applications a
      JOIN jobs j ON a.job_id = j.id
      WHERE ash.application_id = a.id
        AND j.organization_id = ${orgId}
        AND ash.from_stage IN (${stageIdList})
    `);
    historyFromUpdated += historyFromResult.rowCount ?? 0;

    const historyToResult = await db.execute(sql`
      UPDATE application_stage_history ash
      SET to_stage = ${group.canonicalId}
      FROM applications a
      JOIN jobs j ON a.job_id = j.id
      WHERE ash.application_id = a.id
        AND j.organization_id = ${orgId}
        AND ash.to_stage IN (${stageIdList})
    `);
    historyToUpdated += historyToResult.rowCount ?? 0;
  }

  if (duplicateOrgStageIdsAll.length > 0) {
    const deleteResult = await db
      .delete(pipelineStages)
      .where(inArray(pipelineStages.id, duplicateOrgStageIdsAll));
    stagesDeleted = deleteResult.rowCount ?? 0;
  }

  return {
    orgId,
    dryRun: false,
    duplicateGroups,
    totals: {
      applicationsUpdated,
      historyFromUpdated,
      historyToUpdated,
      stagesDeleted,
    },
  };
}
