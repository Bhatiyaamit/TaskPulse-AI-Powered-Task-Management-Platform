export const TASK_QUEUES = ["my_tasks", "given", "team", "recurring"] as const;
export type TaskQueue = (typeof TASK_QUEUES)[number];

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
