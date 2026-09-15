export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message)
  }
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status })
}
