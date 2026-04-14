export const TASK_QUEUES = ["my_tasks", "given", "team", "recurring"] as const;
export type TaskQueue = (typeof TASK_QUEUES)[number];

export const MY_TASKS_TABS = [
  "assigned",
  "created",
  "supporting",
  "review",
] as const;
export type MyTasksTab = (typeof MY_TASKS_TABS)[number];

export const LEGACY_TASK_QUEUE_MAP: Record<string, TaskQueue> = {
  all: "my_tasks",
  my: "my_tasks",
  support: "my_tasks",
  review: "my_tasks",
};

export function normalizeTaskQueue(raw: string | null): TaskQueue {
  if (raw && LEGACY_TASK_QUEUE_MAP[raw]) return LEGACY_TASK_QUEUE_MAP[raw];
  if (raw != null && (TASK_QUEUES as readonly string[]).includes(raw)) {
    return raw as TaskQueue;
  }
  return "my_tasks";
}

export function normalizeMyTasksTab(raw: string | null | undefined): MyTasksTab {
  if (raw != null && (MY_TASKS_TABS as readonly string[]).includes(raw)) {
    return raw as MyTasksTab;
  }
  return "assigned";
}

/** Legacy ?queue=support|review → default my-tab when landing on My tasks. */
export function legacyQueueToDefaultMyTab(
  rawQueue: string | null,
): MyTasksTab | undefined {
  if (rawQueue === "review") return "review";
  if (rawQueue === "support") return "supporting";
  return undefined;
}
