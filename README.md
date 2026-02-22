# procm

Terminal process manager. View, filter, sort, kill, and restart background processes.

<img width="3052" height="1562" alt="procm-demo" src="https://github.com/user-attachments/assets/ed31cf1a-e089-43e5-b8a4-910748ed3a4d" />


## Install

```sh
bunx procm-cli
```

Or install globally:

```sh
bun install -g procm-cli
```

```sh
npm install -g procm-cli
```

```sh
brew install lovincyrus/tap/procm
```

Then run:

```sh
procm
```

## Keybindings

| Key | Action |
| --- | --- |
| `j` / `k` | Navigate down / up |
| `d` / `u` | Half-page down / up |
| `g` / `G` | Jump to top / bottom |
| `/` | Filter by command, PID, or status |
| `s` | Cycle sort (pid, cpu, mem, status, command) |
| `S` | Flip sort direction |
| `K` | SIGKILL (with confirmation) |
| `t` | SIGTERM (with confirmation) |
| `r` | Restart process (with confirmation) |
| `q` | Quit |

## From source

```sh
git clone https://github.com/lovincyrus/procm.git
cd procm
bun install
bun run start
```

## Tests

```sh
bun test
```

## Requirements

- [Bun](https://bun.sh) runtime
- macOS (uses `ps` for process data)
