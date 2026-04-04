import { randomUUID } from "crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "$lib/server/db";
import {
  conversations,
  conversationTaskStates,
  memoryProjectTaskLinks,
  memoryProjects,
  taskCheckpoints,
} from "$lib/server/db/schema";
import type {
  FocusContinuityItem,
  FocusContinuityStatus,
  TaskCheckpoint,
  TaskContinuitySummary,
  TaskMemoryItem,
  TaskState,
} from "$lib/types";
import { parseJsonStringArray } from "$lib/server/utils/json";
import { clipNullableText, normalizeWhitespace } from "$lib/server/utils/text";
import { scoreMatch } from "$lib/server/services/working-set";
import {
  canUseContextSummarizer,
  requestStructuredControlModel,
} from "./control-model";
import { recordMemoryEvent } from "$lib/server/services/memory-events";
import { mapTaskCheckpoint, mapTaskState } from "./mappers";

const PROJECT_MATCH_MIN_SCORE = 16;
const PROJECT_AMBIGUITY_GAP = 6;
const PROJECT_NAME_MAX = 120;
const PROJECT_SUMMARY_MAX = 360;

function clipNullable(
  value: string | null | undefined,
  maxLength: number,
): string | null {
  return clipNullableText(value, maxLength);
}

function clipRequired(text: string, maxLength: number): string {
  return clipNullable(text, maxLength) ?? text.slice(0, maxLength);
}

function isPlaceholderObjective(objective: string): boolean {
  const normalized = normalizeWhitespace(objective).toLowerCase();
  return !normalized || normalized === "new task";
}

function overlapScore(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  const rightSet = new Set(right);
  let overlap = 0;
  for (const value of left) {
    if (rightSet.has(value)) overlap += 1;
  }
  return overlap;
}

function projectStatusForLastActive(
  lastActiveAt: number | null,
  now = Date.now(),
): FocusContinuityStatus {
  if (!lastActiveAt) return "archived";
  const ageDays = Math.floor((now - lastActiveAt) / 86_400_000);
  if (ageDays >= 45) return "archived";
  if (ageDays >= 14) return "dormant";
  return "active";
}

type ProjectCandidate = {
  projectId: string;
  name: string;
  summary: string | null;
  status: FocusContinuityStatus;
  lastActiveAt: number | null;
  artifactIds: string[];
  score: number;
};

async function listProjectCandidates(
  userId: string,
): Promise<ProjectCandidate[]> {
  const rows = await db
    .select({
      project: memoryProjects,
      task: conversationTaskStates,
    })
    .from(memoryProjects)
    .leftJoin(
      memoryProjectTaskLinks,
      eq(memoryProjects.projectId, memoryProjectTaskLinks.projectId),
    )
    .leftJoin(
      conversationTaskStates,
      eq(memoryProjectTaskLinks.taskId, conversationTaskStates.taskId),
    )
    .where(eq(memoryProjects.userId, userId))
    .orderBy(desc(memoryProjects.updatedAt));

  const grouped = new Map<string, ProjectCandidate>();
  for (const row of rows) {
    const projectId = row.project.projectId;
    const existing = grouped.get(projectId) ?? {
      projectId,
      name: row.project.name,
      summary: row.project.summary ?? null,
      status: row.project.status as FocusContinuityStatus,
      lastActiveAt: row.project.lastActiveAt
        ? row.project.lastActiveAt.getTime()
        : null,
      artifactIds: [],
      score: 0,
    };
    if (row.task?.activeArtifactIdsJson) {
      existing.artifactIds.push(
        ...parseJsonStringArray(row.task.activeArtifactIdsJson),
      );
    }
    grouped.set(projectId, existing);
  }

  return Array.from(grouped.values()).map((project) => ({
    ...project,
    artifactIds: Array.from(new Set(project.artifactIds)),
  }));
}

async function chooseProjectCandidate(params: {
  userId: string;
  taskState: TaskState;
  projectCandidates: ProjectCandidate[];
}): Promise<ProjectCandidate | null> {
  if (params.projectCandidates.length === 0) return null;

  const ranked = params.projectCandidates
    .map((candidate) => {
      const textScore =
        scoreMatch(
          params.taskState.objective,
          `${candidate.name}\n${candidate.summary ?? ""}`,
        ) * 10;
      const artifactScore =
        overlapScore(
          params.taskState.activeArtifactIds,
          candidate.artifactIds,
        ) * 18;
      const statusScore =
        candidate.status === "active"
          ? 3
          : candidate.status === "dormant"
            ? 1
            : 0;
      return {
        ...candidate,
        score: textScore + artifactScore + statusScore,
      };
    })
    .sort((left, right) => right.score - left.score);

  const best = ranked[0];
  if (!best || best.score < PROJECT_MATCH_MIN_SCORE) return null;
  const second = ranked[1];
  if (!second || best.score - second.score >= PROJECT_AMBIGUITY_GAP) {
    return best;
  }

  if (!canUseContextSummarizer()) return best;

  type ProjectRoutePayload = {
    projectId?: string;
    confidence?: number;
  };

  try {
    const routed = await requestStructuredControlModel<ProjectRoutePayload>({
      system:
        "Select the best long-term project bucket for the current task. Return strict JSON with projectId and confidence. Prefer continuity only when the task clearly matches an existing project.",
      user: [
        `Current task objective: ${params.taskState.objective}`,
        params.taskState.nextSteps.length > 0
          ? `Next steps: ${params.taskState.nextSteps.join(" | ")}`
          : null,
        params.taskState.factsToPreserve.length > 0
          ? `Facts: ${params.taskState.factsToPreserve.join(" | ")}`
          : null,
        `Candidate projects: ${JSON.stringify(
          ranked.slice(0, 5).map((candidate) => ({
            projectId: candidate.projectId,
            name: candidate.name,
            summary: candidate.summary,
            score: candidate.score,
          })),
          null,
          2,
        )}`,
      ]
        .filter((value): value is string => Boolean(value))
        .join("\n\n"),
      maxTokens: 220,
      temperature: 0.0,
    });

    if (
      routed &&
      typeof routed.confidence === "number" &&
      routed.confidence >= 64 &&
      typeof routed.projectId === "string"
    ) {
      return (
        ranked.find((candidate) => candidate.projectId === routed.projectId) ??
        best
      );
    }
  } catch (error) {
    console.error("[PROJECT_MEMORY] Project router failed:", error);
  }

  return best;
}

async function getLatestStableCheckpoint(
  taskId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ content: taskCheckpoints.content })
    .from(taskCheckpoints)
    .where(
      and(
        eq(taskCheckpoints.taskId, taskId),
        eq(taskCheckpoints.checkpointType, "stable"),
      ),
    )
    .orderBy(desc(taskCheckpoints.updatedAt))
    .limit(1);

  return row?.content ?? null;
}

function buildProjectEventKey(parts: Array<string | number>): string {
  return parts.join(":");
}

export async function listTaskMemoryItems(
  userId: string,
): Promise<TaskMemoryItem[]> {
  const rows = await db
    .select({
      task: conversationTaskStates,
      conversationTitle: conversations.title,
    })
    .from(conversationTaskStates)
    .leftJoin(
      conversations,
      eq(conversationTaskStates.conversationId, conversations.id),
    )
    .where(eq(conversationTaskStates.userId, userId))
    .orderBy(desc(conversationTaskStates.updatedAt));

  if (rows.length === 0) {
    return [];
  }

  const taskIds = rows.map((row) => row.task.taskId);
  const checkpointRows = await db
    .select()
    .from(taskCheckpoints)
    .where(
      and(
        eq(taskCheckpoints.userId, userId),
        inArray(taskCheckpoints.taskId, taskIds),
      ),
    )
    .orderBy(desc(taskCheckpoints.updatedAt));

  const latestCheckpointByTask = new Map<string, TaskCheckpoint>();
  const latestStableCheckpointByTask = new Map<string, TaskCheckpoint>();

  for (const row of checkpointRows) {
    const checkpoint = mapTaskCheckpoint(row);
    if (!latestCheckpointByTask.has(checkpoint.taskId)) {
      latestCheckpointByTask.set(checkpoint.taskId, checkpoint);
    }
    if (
      checkpoint.checkpointType === "stable" &&
      !latestStableCheckpointByTask.has(checkpoint.taskId)
    ) {
      latestStableCheckpointByTask.set(checkpoint.taskId, checkpoint);
    }
  }

  return rows.map((row) => {
    const task = mapTaskState(row.task);
    const checkpoint =
      latestStableCheckpointByTask.get(task.taskId) ??
      latestCheckpointByTask.get(task.taskId) ??
      null;

    return {
      taskId: task.taskId,
      conversationId: task.conversationId,
      conversationTitle: row.conversationTitle ?? null,
      objective: task.objective,
      status: task.status,
      locked: task.locked,
      updatedAt: task.updatedAt,
      lastCheckpointAt: task.lastCheckpointAt,
      checkpointSummary: checkpoint
        ? clipRequired(checkpoint.content, 240)
        : null,
    };
  });
}

export async function forgetTaskMemory(
  userId: string,
  taskId: string,
): Promise<boolean> {
  const [existing] = await db
    .select({ taskId: conversationTaskStates.taskId })
    .from(conversationTaskStates)
    .where(
      and(
        eq(conversationTaskStates.userId, userId),
        eq(conversationTaskStates.taskId, taskId),
      ),
    )
    .limit(1);
  if (!existing) return false;

  await db
    .delete(conversationTaskStates)
    .where(
      and(
        eq(conversationTaskStates.userId, userId),
        eq(conversationTaskStates.taskId, taskId),
      ),
    );

  return true;
}

export async function syncTaskContinuityFromTaskState(params: {
  userId: string;
  taskState: TaskState;
}): Promise<string | null> {
  if (isPlaceholderObjective(params.taskState.objective)) return null;

  const [existingLink, checkpointContent, candidates] = await Promise.all([
    db
      .select({ projectId: memoryProjectTaskLinks.projectId })
      .from(memoryProjectTaskLinks)
      .where(
        and(
          eq(memoryProjectTaskLinks.userId, params.userId),
          eq(memoryProjectTaskLinks.taskId, params.taskState.taskId),
        ),
      )
      .limit(1),
    getLatestStableCheckpoint(params.taskState.taskId),
    listProjectCandidates(params.userId),
  ]);

  const summary =
    clipNullable(checkpointContent, PROJECT_SUMMARY_MAX) ??
    clipNullable(params.taskState.nextSteps.join(" "), PROJECT_SUMMARY_MAX) ??
    clipNullable(params.taskState.objective, PROJECT_SUMMARY_MAX) ??
    params.taskState.objective;

  let projectId = existingLink[0]?.projectId ?? null;
  if (!projectId) {
    const chosen = await chooseProjectCandidate({
      userId: params.userId,
      taskState: params.taskState,
      projectCandidates: candidates,
    });
    projectId = chosen?.projectId ?? null;
  }

  const now = new Date();
  const previousProject =
    projectId
      ? candidates.find((candidate) => candidate.projectId === projectId) ?? null
      : null;
  let continuityEvent:
    | {
        eventType: "project_started" | "project_resumed";
        eventKey: string;
      }
    | null = null;

  if (!projectId) {
    projectId = randomUUID();
    await db.insert(memoryProjects).values({
      projectId,
      userId: params.userId,
      name: clipRequired(params.taskState.objective, PROJECT_NAME_MAX),
      summary,
      status: "active",
      lastActiveAt: now,
      updatedAt: now,
    });
    continuityEvent = {
      eventType: "project_started",
      eventKey: buildProjectEventKey([
        "project_started",
        projectId,
        params.taskState.taskId,
      ]),
    };
  } else {
    await db
      .update(memoryProjects)
      .set({
        name: clipRequired(params.taskState.objective, PROJECT_NAME_MAX),
        summary,
        status: "active",
        lastActiveAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(memoryProjects.userId, params.userId),
          eq(memoryProjects.projectId, projectId),
        ),
      );
    if (previousProject && previousProject.status !== "active") {
      continuityEvent = {
        eventType: "project_resumed",
        eventKey: buildProjectEventKey([
          "project_resumed",
          projectId,
          params.taskState.taskId,
          now.getTime(),
        ]),
      };
    }
  }

  await db
    .insert(memoryProjectTaskLinks)
    .values({
      id: randomUUID(),
      projectId,
      taskId: params.taskState.taskId,
      userId: params.userId,
      conversationId: params.taskState.conversationId,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: memoryProjectTaskLinks.taskId,
      set: {
        projectId,
        conversationId: params.taskState.conversationId,
        updatedAt: now,
      },
    });

  await db
    .update(conversations)
    .set({
      updatedAt: now,
    })
    .where(eq(conversations.id, params.taskState.conversationId));

  if (continuityEvent) {
    await recordMemoryEvent({
      eventKey: continuityEvent.eventKey,
      userId: params.userId,
      conversationId: params.taskState.conversationId,
      domain: "task",
      eventType: continuityEvent.eventType,
      subjectId: projectId,
      relatedId: params.taskState.taskId,
      observedAt: now,
      payload: {
        projectId,
        taskId: params.taskState.taskId,
        objective: params.taskState.objective,
        status: "active",
      },
    }).catch((error) =>
      console.error("[PROJECT_MEMORY] Failed to record continuity event:", error),
    );
  }

  return projectId;
}

export async function listFocusContinuityItems(
  userId: string,
): Promise<FocusContinuityItem[]> {
  const rows = await db
    .select({
      project: memoryProjects,
      link: memoryProjectTaskLinks,
      conversationTitle: conversations.title,
    })
    .from(memoryProjects)
    .leftJoin(
      memoryProjectTaskLinks,
      eq(memoryProjects.projectId, memoryProjectTaskLinks.projectId),
    )
    .leftJoin(
      conversations,
      eq(memoryProjectTaskLinks.conversationId, conversations.id),
    )
    .where(eq(memoryProjects.userId, userId))
    .orderBy(desc(memoryProjects.updatedAt));

  if (rows.length === 0) return [];

  const grouped = new Map<string, FocusContinuityItem>();
  for (const row of rows) {
    const existing = grouped.get(row.project.projectId) ?? {
      continuityId: row.project.projectId,
      name: row.project.name,
      summary: row.project.summary ?? null,
      status: row.project.status as FocusContinuityStatus,
      lastActiveAt: row.project.lastActiveAt
        ? row.project.lastActiveAt.getTime()
        : null,
      updatedAt: row.project.updatedAt.getTime(),
      linkedTaskCount: 0,
      conversationTitles: [],
    };
    if (row.link?.taskId) {
      existing.linkedTaskCount += 1;
    }
    if (
      row.conversationTitle &&
      !existing.conversationTitles.includes(row.conversationTitle)
    ) {
      existing.conversationTitles.push(row.conversationTitle);
    }
    grouped.set(row.project.projectId, existing);
  }

  return Array.from(grouped.values()).map((item) => ({
    ...item,
    conversationTitles: item.conversationTitles.slice(0, 3),
  }));
}

async function getContinuitySummaryForTask(params: {
  userId: string;
  conversationId: string;
  taskId?: string | null;
}): Promise<TaskContinuitySummary | null> {
  let taskId = params.taskId ?? null;

  if (!taskId) {
    const [taskRow] = await db
      .select({ taskId: conversationTaskStates.taskId })
      .from(conversationTaskStates)
      .where(
        and(
          eq(conversationTaskStates.userId, params.userId),
          eq(conversationTaskStates.conversationId, params.conversationId),
        ),
      )
      .orderBy(desc(conversationTaskStates.updatedAt))
      .limit(1);
    taskId = taskRow?.taskId ?? null;
  }

  if (!taskId) return null;

  const [projectRow, linkedCountRow] = await Promise.all([
    db
      .select({
        projectId: memoryProjects.projectId,
        name: memoryProjects.name,
        summary: memoryProjects.summary,
        status: memoryProjects.status,
        lastActiveAt: memoryProjects.lastActiveAt,
        updatedAt: memoryProjects.updatedAt,
      })
      .from(memoryProjectTaskLinks)
      .innerJoin(
        memoryProjects,
        eq(memoryProjectTaskLinks.projectId, memoryProjects.projectId),
      )
      .where(
        and(
          eq(memoryProjectTaskLinks.userId, params.userId),
          eq(memoryProjectTaskLinks.taskId, taskId),
        ),
      )
      .limit(1),
    db
      .select({
        projectId: memoryProjectTaskLinks.projectId,
        taskId: memoryProjectTaskLinks.taskId,
      })
      .from(memoryProjectTaskLinks)
      .where(eq(memoryProjectTaskLinks.userId, params.userId)),
  ]);

  const project = projectRow[0];
  if (!project) return null;

  const linkedTaskCount = linkedCountRow.filter(
    (row) => row.projectId === project.projectId,
  ).length;

  return {
    continuityId: project.projectId,
    name: project.name,
    summary: project.summary ?? null,
    status: project.status as FocusContinuityStatus,
    linkedTaskCount,
    lastActiveAt: project.lastActiveAt ? project.lastActiveAt.getTime() : null,
    updatedAt: project.updatedAt.getTime(),
  };
}

export async function getTaskContinuitySummary(params: {
  userId: string;
  conversationId: string;
  taskId?: string | null;
}): Promise<TaskContinuitySummary | null> {
  return getContinuitySummaryForTask(params);
}

export async function attachContinuityToTaskState<T extends TaskState | null>(
  userId: string,
  taskState: T,
): Promise<T> {
  if (!taskState) {
    return taskState;
  }

  const continuity = await getTaskContinuitySummary({
    userId,
    conversationId: taskState.conversationId,
    taskId: taskState.taskId,
  }).catch(() => null);

  return {
    ...taskState,
    continuity,
  } as T;
}

export async function forgetFocusContinuity(
  userId: string,
  continuityId: string,
): Promise<boolean> {
  const [existing] = await db
    .select({ projectId: memoryProjects.projectId })
    .from(memoryProjects)
    .where(
      and(
        eq(memoryProjects.userId, userId),
        eq(memoryProjects.projectId, continuityId),
      ),
    )
    .limit(1);

  if (!existing) return false;

  await db
    .delete(memoryProjects)
    .where(
      and(
        eq(memoryProjects.userId, userId),
        eq(memoryProjects.projectId, continuityId),
      ),
    );
  return true;
}

export const syncProjectMemoryFromTaskState = syncTaskContinuityFromTaskState;
export const listProjectMemoryItems = listFocusContinuityItems;
export const forgetProjectMemory = forgetFocusContinuity;

export async function deleteAllProjectMemory(userId: string): Promise<void> {
  await db.delete(memoryProjects).where(eq(memoryProjects.userId, userId));
}

export async function updateProjectMemoryStatuses(
  userId: string,
): Promise<void> {
  const rows = await db
    .select()
    .from(memoryProjects)
    .where(eq(memoryProjects.userId, userId));

  for (const row of rows) {
    const nextStatus = projectStatusForLastActive(
      row.lastActiveAt ? row.lastActiveAt.getTime() : null,
    );
    if (nextStatus === row.status) continue;
    await db
      .update(memoryProjects)
      .set({
        status: nextStatus,
        updatedAt: new Date(),
      })
      .where(eq(memoryProjects.projectId, row.projectId));
    if (nextStatus !== "active") {
      await recordMemoryEvent({
        eventKey: buildProjectEventKey([
          "project_paused",
          row.projectId,
          row.updatedAt.getTime(),
          nextStatus,
        ]),
        userId,
        domain: "task",
        eventType: "project_paused",
        subjectId: row.projectId,
        observedAt: new Date(),
        payload: {
          projectId: row.projectId,
          previousStatus: row.status,
          nextStatus,
          projectName: row.name,
        },
      }).catch((error) =>
        console.error("[PROJECT_MEMORY] Failed to record status event:", error),
      );
    }
  }
}

export async function pruneOrphanProjectMemory(userId: string): Promise<void> {
  const rows = await db
    .select({
      projectId: memoryProjects.projectId,
      taskId: memoryProjectTaskLinks.taskId,
    })
    .from(memoryProjects)
    .leftJoin(
      memoryProjectTaskLinks,
      eq(memoryProjects.projectId, memoryProjectTaskLinks.projectId),
    )
    .where(eq(memoryProjects.userId, userId));

  const orphanIds = new Set<string>();
  const linkedIds = new Set<string>();
  for (const row of rows) {
    orphanIds.add(row.projectId);
    if (row.taskId) linkedIds.add(row.projectId);
  }

  const idsToDelete = Array.from(orphanIds).filter(
    (projectId) => !linkedIds.has(projectId),
  );
  if (idsToDelete.length === 0) return;

  await db
    .delete(memoryProjects)
    .where(
      and(
        eq(memoryProjects.userId, userId),
        inArray(memoryProjects.projectId, idsToDelete),
      ),
    );
}
