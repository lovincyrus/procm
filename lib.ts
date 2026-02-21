// ── Types ──────────────────────────────────────────────────────────────────────

export interface Process {
  pid: number
  ppid: number
  cpu: number
  mem: number
  stat: string
  tty: string
  command: string
}

// ── Process data ───────────────────────────────────────────────────────────────

export const PS_REGEX =
  /^\s*(\d+)\s+(\d+)\s+([\d.]+)\s+([\d.]+)\s+(\S+)\s+(\S+)\s+\w+\s+\w+\s+\d+\s+[\d:]+\s+\d+\s+(.+)$/

export function parseProcessLine(line: string): Process | null {
  if (line.length === 0) return null
  const m = PS_REGEX.exec(line)
  if (!m) return null

  const stat = m[5]
  const tty = m[6]
  // Daemon filter: no TTY or sleeping/idle
  const ch0 = stat.charCodeAt(0)
  if (tty !== "??" && ch0 !== 83 && ch0 !== 115 && ch0 !== 73) return null // S=83,s=115,I=73

  return {
    pid: +m[1],
    ppid: +m[2],
    cpu: +m[3],
    mem: +m[4],
    stat,
    tty,
    command: m[7],
  }
}

// ── Colors ─────────────────────────────────────────────────────────────────────

export const c = {
  bg: "#1a1b26",
  bgAlt: "#24283b",
  bgHl: "#364a82",
  border: "#565f89",
  text: "#c0caf5",
  dim: "#565f89",
  muted: "#a9b1d6",
  green: "#9ece6a",
  red: "#f7768e",
  yellow: "#e0af68",
  blue: "#7aa2f7",
  cyan: "#7dcfff",
  magenta: "#bb9af7",
  orange: "#ff9e64",
}

// ── Helpers ────────────────────────────────────────────────────────────────────

export function pad(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "~" : s.padEnd(n)
}

export function rpad(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "~" : s.padStart(n)
}

export function cpuColor(v: number) {
  if (v > 50) return c.red
  if (v > 20) return c.orange
  if (v > 5) return c.yellow
  return c.green
}

export function memColor(v: number) {
  if (v > 30) return c.red
  if (v > 10) return c.orange
  if (v > 3) return c.yellow
  return c.green
}

export function statLabel(s: string) {
  switch (s.charCodeAt(0)) {
    case 82: return "Running"  // R
    case 83: return "Sleeping" // S
    case 68: return "Disk"     // D
    case 84: return "Stopped"  // T
    case 90: return "Zombie"   // Z
    case 73: return "Idle"     // I
    default: return s
  }
}

export function statColor(s: string) {
  switch (s.charCodeAt(0)) {
    case 82: return c.green   // R
    case 84: return c.yellow  // T
    case 90: return c.red     // Z
    case 68: return c.orange  // D
    default: return c.dim
  }
}

// ── Sort ────────────────────────────────────────────────────────────────────────

export type SortField = "pid" | "cpu" | "mem" | "status" | "command"
export const sortFields: SortField[] = ["pid", "cpu", "mem", "status", "command"]

export function sortProcs(procs: Process[], sortBy: SortField, sortAsc: boolean) {
  return procs.sort((a, b) => {
    let v = 0
    switch (sortBy) {
      case "pid":     v = a.pid - b.pid; break
      case "cpu":     v = a.cpu - b.cpu; break
      case "mem":     v = a.mem - b.mem; break
      case "status":  v = a.stat.localeCompare(b.stat); break
      case "command": v = a.command.localeCompare(b.command); break
    }
    return sortAsc ? v : -v
  })
}
