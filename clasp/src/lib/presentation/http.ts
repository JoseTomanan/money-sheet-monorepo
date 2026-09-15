import { dispatch, type ApiResponse, type DispatchDeps } from "../application/dispatch";

export function handleGet(
  parameters: Record<string, string | undefined>,
  deps: DispatchDeps,
): ApiResponse {
  return dispatch(
    {
      action: parameters.action ?? "",
      secret: parameters.secret,
      body: parameters,
    },
    deps,
  );
}

export function handlePost(contents: string, deps: DispatchDeps): ApiResponse {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(contents) as Record<string, unknown>;
  } catch (error) {
    const message = String(error);
    return { ok: false, error: message, code: "internal", message };
  }

  return dispatch(
    {
      action: String(body.action ?? ""),
      secret: body.secret === undefined ? undefined : String(body.secret),
      body,
    },
    deps,
  );
}
