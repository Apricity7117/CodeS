export function formatLiveOverlayDuration(durationMs: number): string {
  const totalSeconds = Math.max(1, Math.round(durationMs / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const parts: string[] = []

  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0 || hours > 0) parts.push(`${minutes}m`)

  const displaySeconds = seconds > 0 || parts.length === 0 ? seconds : 0
  parts.push(`${displaySeconds}s`)
  return parts.join(' ')
}
