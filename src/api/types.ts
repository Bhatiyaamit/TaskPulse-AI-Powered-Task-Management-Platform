export type ApiSuccess<TData, TMeta = unknown> = {
  success: true;
  message: string;
  data: TData;
  meta?: TMeta;
};

export type ApiFailure = {
  success: false;
  message: string;
  error: {
    code: string;
    details?: unknown;
  };
};

export type ApiResponse<TData, TMeta = unknown> = ApiSuccess<TData, TMeta> | ApiFailure;

