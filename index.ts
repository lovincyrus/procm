#!/usr/bin/env bun
import {
  createCliRenderer,
  BoxRenderable,
  TextRenderable,
  TextAttributes,
  type KeyEvent,
} from "@opentui/core"
import {
  type Process,
  parseProcessLine,
  c,
  pad,
  rpad,
  cpuColor,
  memColor,
  statLabel,
  statColor,
  sortFields,
  type SortField,
  sortProcs,
} from "./lib"

// ── Process data ───────────────────────────────────────────────────────────────

async function getProcesses(): Promise<Process[]> {
  const proc = Bun.spawn(
    ["ps", "-eo", "pid,ppid,pcpu,pmem,stat,tty,lstart,command"],
    { stdout: "pipe", stderr: "ignore" },
  )
  const text = await new Response(proc.stdout).text()
  const lines = text.split("\n")

  const processes: Process[] = []
  const selfPid = process.pid

  for (let i = 1; i < lines.length; i++) {
    const p = parseProcessLine(lines[i])
    if (p && p.pid !== selfPid) processes.push(p)
  }

  return processes
}

// ── Columns ────────────────────────────────────────────────────────────────────

const cols = [
  { label: "PID",     w: 7,  right: true,  val: (p: Process) => String(p.pid),       color: (_: Process) => c.cyan },
  { label: "PPID",    w: 7,  right: true,  val: (p: Process) => String(p.ppid),      color: (_: Process) => c.dim },
  { label: "CPU%",    w: 7,  right: true,  val: (p: Process) => p.cpu.toFixed(1),    color: (p: Process) => cpuColor(p.cpu) },
  { label: "MEM%",    w: 7,  right: true,  val: (p: Process) => p.mem.toFixed(1),    color: (p: Process) => memColor(p.mem) },
  { label: "STATUS",  w: 10, right: false, val: (p: Process) => statLabel(p.stat),   color: (p: Process) => statColor(p.stat) },
  { label: "COMMAND", w: 0,  right: false, val: (p: Process) => p.command,           color: (_: Process) => c.text },
]

// ── Sort state ─────────────────────────────────────────────────────────────────

let sortBy: SortField = "cpu"
let sortAsc = false

// ── Main ───────────────────────────────────────────────────────────────────────

interface RowHandle {
  box: BoxRenderable
  cells: TextRenderable[]
}

async function main() {
  const renderer = await createCliRenderer({ exitOnCtrlC: true })

  let displayed: Process[] = []
  let selected = 0
  let scrollOffset = 0
  let filter = ""
  let filtering = false
  let confirm: { pid: number; cmd: string; action: string } | null = null
  let refreshing = false
  let destroyed = false

  // Chrome rows: title(1) + sort(1) + header(1) + filter(1) + footer(1) = 5
  const CHROME = 5
  let viewportH = renderer.height - CHROME

  // ── Layout ─────────────────────────────────────────────────────────────────

  const root = renderer.root
  root.backgroundColor = c.bg
  root.flexDirection = "column"

  // Title bar
  const titleBar = new BoxRenderable(renderer, {
    id: "title-bar",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    height: 1,
    paddingLeft: 1,
    paddingRight: 1,
    backgroundColor: c.blue,
  })
  const titleText = new TextRenderable(renderer, {
    id: "title",
    content: " PROCM ",
    fg: c.bg,
    attributes: TextAttributes.BOLD,
  })
  const statsText = new TextRenderable(renderer, {
    id: "stats",
    content: "",
    fg: c.bg,
  })
  titleBar.add(titleText)
  titleBar.add(statsText)

  // Sort bar
  const sortBar = new BoxRenderable(renderer, {
    id: "sort-bar",
    height: 1,
    paddingLeft: 1,
    backgroundColor: c.bgAlt,
  })
  const sortText = new TextRenderable(renderer, {
    id: "sort-text",
    content: "",
    fg: c.muted,
  })
  sortBar.add(sortText)

  // Column headers
  const headerRow = new BoxRenderable(renderer, {
    id: "hdr",
    flexDirection: "row",
    height: 1,
    paddingLeft: 1,
    paddingRight: 1,
    backgroundColor: c.bgAlt,
    gap: 1,
  })
  for (const col of cols) {
    headerRow.add(
      new TextRenderable(renderer, {
        id: `hdr-${col.label}`,
        content: col.w > 0
          ? (col.right ? rpad(col.label, col.w) : pad(col.label, col.w))
          : col.label,
        fg: c.yellow,
        attributes: TextAttributes.BOLD,
        ...(col.w > 0 ? { width: col.w } : { flexGrow: 1 }),
      }),
    )
  }

  // Virtual list area (plain Box, not ScrollBox)
  const listBox = new BoxRenderable(renderer, {
    id: "list",
    flexGrow: 1,
    flexDirection: "column",
    backgroundColor: c.bg,
  })

  // Filter bar
  const filterBar = new BoxRenderable(renderer, {
    id: "filter-bar",
    height: 1,
    paddingLeft: 1,
    backgroundColor: c.bgAlt,
  })
  const filterText = new TextRenderable(renderer, {
    id: "filter-text",
    content: "",
    fg: c.text,
  })
  filterBar.add(filterText)

  // Confirm bar
  const confirmBar = new BoxRenderable(renderer, {
    id: "confirm-bar",
    height: 1,
    paddingLeft: 1,
    backgroundColor: c.red,
    visible: false,
  })
  const confirmText = new TextRenderable(renderer, {
    id: "confirm-text",
    content: "",
    fg: c.bg,
    attributes: TextAttributes.BOLD,
  })
  confirmBar.add(confirmText)

  // Footer
  const footerBar = new BoxRenderable(renderer, {
    id: "footer",
    flexDirection: "row",
    height: 1,
    paddingLeft: 1,
    backgroundColor: c.bgAlt,
    gap: 2,
  })

  for (const [key, label] of [
    ["j/k", "Nav"],
    ["/", "Filter"],
    ["s", "Sort"],
    ["K", "Kill"],
    ["t", "Term"],
    ["r", "Restart"],
    ["q", "Quit"],
  ]) {
    const kb = new BoxRenderable(renderer, {
      id: `kb-${key}`,
      flexDirection: "row",
    })
    kb.add(
      new TextRenderable(renderer, {
        id: `kk-${key}`,
        content: ` ${key} `,
        fg: c.bg,
        bg: c.border,
        attributes: TextAttributes.BOLD,
      }),
    )
    kb.add(
      new TextRenderable(renderer, {
        id: `kl-${key}`,
        content: ` ${label}`,
        fg: c.dim,
      }),
    )
    footerBar.add(kb)
  }

  root.add(titleBar)
  root.add(sortBar)
  root.add(headerRow)
  root.add(listBox)
  root.add(filterBar)
  root.add(confirmBar)
  root.add(footerBar)

  // ── Virtual row pool (viewport-sized) ─────────────────────────────────────

  const rowPool: RowHandle[] = []

  function createRow(i: number): RowHandle {
    const box = new BoxRenderable(renderer, {
      id: `r-${i}`,
      flexDirection: "row",
      height: 1,
      paddingLeft: 1,
      paddingRight: 1,
      backgroundColor: c.bg,
      gap: 1,
    })
    const cells: TextRenderable[] = []
    for (const col of cols) {
      const cell = new TextRenderable(renderer, {
        id: `c-${i}-${col.label}`,
        content: "",
        fg: c.text,
        ...(col.w > 0 ? { width: col.w } : { flexGrow: 1 }),
      })
      box.add(cell)
      cells.push(cell)
    }
    listBox.add(box)
    return { box, cells }
  }

  function ensurePoolSize(n: number) {
    while (rowPool.length < n) {
      rowPool.push(createRow(rowPool.length))
    }
  }

  // Pre-allocate rows for initial viewport
  ensurePoolSize(viewportH)

  // ── Scroll helpers ────────────────────────────────────────────────────────

  function clampScroll() {
    const maxOffset = Math.max(0, displayed.length - viewportH)
    if (scrollOffset > maxOffset) scrollOffset = maxOffset
    if (scrollOffset < 0) scrollOffset = 0
  }

  function ensureVisible() {
    if (selected < scrollOffset) scrollOffset = selected
    else if (selected >= scrollOffset + viewportH)
      scrollOffset = selected - viewportH + 1
    clampScroll()
  }

  // ── Render helpers ─────────────────────────────────────────────────────────

  function updateUI() {
    const arrow = sortAsc ? "▲" : "▼"
    sortText.content = `Sort: ${sortBy.toUpperCase()} ${arrow}  (s to cycle, S to flip)`

    if (filtering) {
      filterText.content = `Filter: ${filter}█`
      filterText.fg = c.yellow
    } else if (filter) {
      filterText.content = `Filter: ${filter}  (/ to edit, Esc to clear)`
      filterText.fg = c.muted
    } else {
      filterText.content = ""
    }

    const pos = displayed.length > 0
      ? `${selected + 1}/${displayed.length}`
      : "0"
    statsText.content = `${pos}  |  ${new Date().toLocaleTimeString()}`
  }

  function renderRows() {
    ensureVisible()
    const visibleCount = Math.min(viewportH, displayed.length - scrollOffset)
    ensurePoolSize(viewportH)

    for (let vi = 0; vi < viewportH; vi++) {
      const row = rowPool[vi]
      if (vi >= visibleCount) {
        row.box.visible = false
        continue
      }

      const di = scrollOffset + vi // data index
      const p = displayed[di]
      const sel = di === selected
      const bg = sel ? c.bgHl : di % 2 === 0 ? c.bg : c.bgAlt

      row.box.visible = true
      row.box.backgroundColor = bg

      for (let j = 0; j < cols.length; j++) {
        const col = cols[j]
        const raw = col.val(p)
        const txt = col.w > 0
          ? (col.right ? rpad(raw, col.w) : pad(raw, col.w))
          : raw

        row.cells[j].content = txt
        row.cells[j].fg = sel ? "#ffffff" : col.color(p)
        row.cells[j].attributes = sel ? TextAttributes.BOLD : 0
      }
    }
  }

  async function refresh() {
    if (refreshing || destroyed) return
    refreshing = true
    try {
      const procs = await getProcesses()
      const sorted = sortProcs(procs, sortBy, sortAsc)

      if (filter) {
        const f = filter.toLowerCase()
        displayed = sorted.filter(
          (p) =>
            p.command.toLowerCase().includes(f) ||
            String(p.pid).includes(f) ||
            statLabel(p.stat).toLowerCase().includes(f),
        )
      } else {
        displayed = sorted
      }

      if (selected >= displayed.length) {
        selected = Math.max(0, displayed.length - 1)
      }

      updateUI()
      renderRows()
    } finally {
      refreshing = false
    }
  }

  // ── Keyboard ───────────────────────────────────────────────────────────────

  renderer.keyInput.on("keypress", async (key: KeyEvent) => {
    // Confirm mode
    if (confirm) {
      if (key.name === "y") {
        try {
          const sig = confirm.action === "kill" ? "-9" : "-15"
          Bun.spawn(["kill", sig, String(confirm.pid)], {
            stdout: "ignore",
            stderr: "ignore",
          })
          if (confirm.action === "restart") {
            await Bun.sleep(500)
            Bun.spawn(["sh", "-c", confirm.cmd], {
              stdout: "ignore",
              stderr: "ignore",
              stdin: "ignore",
            })
          }
        } catch {}
        confirm = null
        confirmBar.visible = false
        await refresh()
      } else {
        confirm = null
        confirmBar.visible = false
      }
      return
    }

    // Filter mode
    if (filtering) {
      if (key.name === "return") {
        filtering = false
        updateUI()
        await refresh()
      } else if (key.name === "escape") {
        filtering = false
        filter = ""
        updateUI()
        await refresh()
      } else if (key.name === "backspace") {
        filter = filter.slice(0, -1)
        updateUI()
        await refresh()
      } else if (key.sequence?.length === 1 && !key.ctrl && !key.meta) {
        filter += key.sequence
        updateUI()
        await refresh()
      }
      return
    }

    // Normal mode
    switch (key.name) {
      case "q":
        destroyed = true
        renderer.destroy()
        process.exit(0)
        break

      case "j":
      case "down":
        if (selected < displayed.length - 1) {
          selected++
          updateUI()
          renderRows()
        }
        break

      case "k":
      case "up":
        if (selected > 0) {
          selected--
          updateUI()
          renderRows()
        }
        break

      case "d":
        selected = Math.min(displayed.length - 1, selected + Math.floor(viewportH / 2))
        updateUI()
        renderRows()
        break

      case "u":
        selected = Math.max(0, selected - Math.floor(viewportH / 2))
        updateUI()
        renderRows()
        break

      case "g":
        selected = 0
        updateUI()
        renderRows()
        break

      case "G":
        selected = Math.max(0, displayed.length - 1)
        updateUI()
        renderRows()
        break

      case "/":
        filtering = true
        updateUI()
        break

      case "s": {
        const i = sortFields.indexOf(sortBy)
        sortBy = sortFields[(i + 1) % sortFields.length]
        sortAsc = sortBy === "pid" || sortBy === "command"
        await refresh()
        break
      }

      case "S":
        sortAsc = !sortAsc
        await refresh()
        break

      case "K": {
        const p = displayed[selected]
        if (p) {
          confirm = { pid: p.pid, cmd: p.command, action: "kill" }
          confirmText.content = `SIGKILL PID ${p.pid} (${p.command.slice(0, 50)})? [y/n]`
          confirmBar.visible = true
        }
        break
      }

      case "t": {
        const p = displayed[selected]
        if (p) {
          confirm = { pid: p.pid, cmd: p.command, action: "term" }
          confirmText.content = `SIGTERM PID ${p.pid} (${p.command.slice(0, 50)})? [y/n]`
          confirmBar.visible = true
        }
        break
      }

      case "r": {
        const p = displayed[selected]
        if (p) {
          confirm = { pid: p.pid, cmd: p.command, action: "restart" }
          confirmText.content = `Restart PID ${p.pid} (${p.command.slice(0, 50)})? [y/n]`
          confirmBar.visible = true
        }
        break
      }
    }
  })

  // ── Start ──────────────────────────────────────────────────────────────────

  renderer.on("destroy", () => { destroyed = true })

  await refresh()
  setInterval(async () => {
    if (!filtering && !confirm && !destroyed) await refresh()
  }, 2000)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
