export const SOCKET_EVENT = {
  NOTIFICATION_NEW: "NOTIFICATION_NEW",
} as const;

export type SocketEvent = (typeof SOCKET_EVENT)[keyof typeof SOCKET_EVENT];
