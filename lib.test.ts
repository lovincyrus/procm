import { test, expect, describe } from "bun:test"
import {
  parseProcessLine,
  pad,
  rpad,
  cpuColor,
  memColor,
  statLabel,
  statColor,
  sortProcs,
  sortFields,
  c,
  type Process,
} from "./lib"

// ── parseProcessLine ────────────────────────────────────────────────────────────

describe("parseProcessLine", () => {
  test("parses a valid ps output line", () => {
    const line = "  123     1   2.3  0.5 Ss   ??  Thu Feb 20 14:30:00 2026 /usr/sbin/syslogd"
    const p = parseProcessLine(line)
    expect(p).toEqual({
      pid: 123,
      ppid: 1,
      cpu: 2.3,
      mem: 0.5,
      stat: "Ss",
      tty: "??",
      command: "/usr/sbin/syslogd",
    })
  })

  test("parses command with spaces", () => {
    const line = "  200     1   0.0  0.1 Ss   ??  Thu Feb 20 14:30:00 2026 /usr/bin/some command with spaces"
    const p = parseProcessLine(line)
    expect(p).not.toBeNull()
    expect(p!.command).toBe("/usr/bin/some command with spaces")
  })

  test("skips header line", () => {
    const line = "  PID  PPID  %CPU %MEM STAT TT       LSTART                    COMMAND"
    expect(parseProcessLine(line)).toBeNull()
  })

  test("skips empty lines", () => {
    expect(parseProcessLine("")).toBeNull()
  })

  test("includes processes with tty=??", () => {
    const line = "  300     1   1.0  0.2 R+   ??  Thu Feb 20 14:30:00 2026 /usr/bin/daemon"
    const p = parseProcessLine(line)
    expect(p).not.toBeNull()
    expect(p!.pid).toBe(300)
  })

  test("includes sleeping process with a TTY", () => {
    const line = "  400     1   0.0  0.1 S    ttys000  Thu Feb 20 14:30:00 2026 /bin/zsh"
    const p = parseProcessLine(line)
    expect(p).not.toBeNull()
    expect(p!.pid).toBe(400)
  })

  test("excludes running process with a TTY", () => {
    const line = "  500     1   5.2  1.3 R+   ttys000  Thu Feb 20 14:30:00 2026 vim test.txt"
    expect(parseProcessLine(line)).toBeNull()
  })
})

// ── pad / rpad ──────────────────────────────────────────────────────────────────

describe("pad", () => {
  test("right-pads short string", () => {
    expect(pad("foo", 10)).toBe("foo       ")
  })

  test("truncates long string with ~", () => {
    expect(pad("very long string", 5)).toBe("very~")
  })

  test("returns exact length string unchanged", () => {
    expect(pad("hello", 5)).toBe("hello")
  })
})

describe("rpad", () => {
  test("left-pads short string", () => {
    expect(rpad("42", 7)).toBe("     42")
  })

  test("truncates long string with ~", () => {
    expect(rpad("very long string", 5)).toBe("very~")
  })

  test("returns exact length string unchanged", () => {
    expect(rpad("hello", 5)).toBe("hello")
  })
})

// ── cpuColor / memColor ─────────────────────────────────────────────────────────

describe("cpuColor", () => {
  test(">50 returns red", () => {
    expect(cpuColor(51)).toBe(c.red)
  })

  test(">20 returns orange", () => {
    expect(cpuColor(21)).toBe(c.orange)
  })

  test(">5 returns yellow", () => {
    expect(cpuColor(6)).toBe(c.yellow)
  })

  test("<=5 returns green", () => {
    expect(cpuColor(5)).toBe(c.green)
    expect(cpuColor(0)).toBe(c.green)
  })
})

describe("memColor", () => {
  test(">30 returns red", () => {
    expect(memColor(31)).toBe(c.red)
  })

  test(">10 returns orange", () => {
    expect(memColor(11)).toBe(c.orange)
  })

  test(">3 returns yellow", () => {
    expect(memColor(4)).toBe(c.yellow)
  })

  test("<=3 returns green", () => {
    expect(memColor(3)).toBe(c.green)
    expect(memColor(0)).toBe(c.green)
  })
})

// ── statLabel / statColor ───────────────────────────────────────────────────────

describe("statLabel", () => {
  test("R+ → Running", () => {
    expect(statLabel("R+")).toBe("Running")
  })

  test("Ss → Sleeping", () => {
    expect(statLabel("Ss")).toBe("Sleeping")
  })

  test("D → Disk", () => {
    expect(statLabel("D")).toBe("Disk")
  })

  test("T → Stopped", () => {
    expect(statLabel("T")).toBe("Stopped")
  })

  test("Z → Zombie", () => {
    expect(statLabel("Z")).toBe("Zombie")
  })

  test("I → Idle", () => {
    expect(statLabel("I")).toBe("Idle")
  })

  test("unknown status returns raw string", () => {
    expect(statLabel("X+")).toBe("X+")
  })
})

describe("statColor", () => {
  test("R → green", () => {
    expect(statColor("R+")).toBe(c.green)
  })

  test("T → yellow", () => {
    expect(statColor("T")).toBe(c.yellow)
  })

  test("Z → red", () => {
    expect(statColor("Z")).toBe(c.red)
  })

  test("D → orange", () => {
    expect(statColor("D")).toBe(c.orange)
  })

  test("S → dim (default)", () => {
    expect(statColor("Ss")).toBe(c.dim)
  })
})

// ── sortProcs ───────────────────────────────────────────────────────────────────

function makeProc(overrides: Partial<Process> = {}): Process {
  return {
    pid: 1,
    ppid: 0,
    cpu: 0,
    mem: 0,
    stat: "Ss",
    tty: "??",
    command: "/bin/test",
    ...overrides,
  }
}

describe("sortProcs", () => {
  test("sorts by CPU descending (default)", () => {
    const procs = [
      makeProc({ pid: 1, cpu: 5 }),
      makeProc({ pid: 2, cpu: 50 }),
      makeProc({ pid: 3, cpu: 20 }),
    ]
    const sorted = sortProcs(procs, "cpu", false)
    expect(sorted.map((p) => p.cpu)).toEqual([50, 20, 5])
  })

  test("sorts by PID ascending", () => {
    const procs = [
      makeProc({ pid: 300 }),
      makeProc({ pid: 100 }),
      makeProc({ pid: 200 }),
    ]
    const sorted = sortProcs(procs, "pid", true)
    expect(sorted.map((p) => p.pid)).toEqual([100, 200, 300])
  })

  test("sorts by command alphabetically ascending", () => {
    const procs = [
      makeProc({ command: "zsh" }),
      makeProc({ command: "bash" }),
      makeProc({ command: "fish" }),
    ]
    const sorted = sortProcs(procs, "command", true)
    expect(sorted.map((p) => p.command)).toEqual(["bash", "fish", "zsh"])
  })

  test("flipping sort direction reverses order", () => {
    const procs = [
      makeProc({ pid: 1, cpu: 5 }),
      makeProc({ pid: 2, cpu: 50 }),
      makeProc({ pid: 3, cpu: 20 }),
    ]
    const asc = sortProcs([...procs], "cpu", true)
    const desc = sortProcs([...procs], "cpu", false)
    expect(asc.map((p) => p.cpu)).toEqual([5, 20, 50])
    expect(desc.map((p) => p.cpu)).toEqual([50, 20, 5])
  })
})

// ── sortFields ──────────────────────────────────────────────────────────────────

describe("sortFields", () => {
  test("contains all expected fields", () => {
    expect(sortFields).toEqual(["pid", "cpu", "mem", "status", "command"])
  })
})
