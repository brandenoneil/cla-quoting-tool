/** Safely parse a fetch Response body as JSON; surfaces empty or non-JSON failures. */
export async function parseApiResponse<T extends Record<string, unknown> = Record<string, unknown>>(
  res: Response
): Promise<T> {
  const text = await res.text()
  if (!text) {
    if (!res.ok) throw new Error(`Request failed (${res.status})`)
    return {} as T
  }

  let json: T
  try {
    json = JSON.parse(text) as T
  } catch {
    throw new Error(text.slice(0, 300) || `Request failed (${res.status})`)
  }

  if (!res.ok) {
    const message = typeof json.error === 'string' ? json.error : `Request failed (${res.status})`
    throw new Error(message)
  }

  return json
}
