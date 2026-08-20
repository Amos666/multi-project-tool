# Multi-Project Tool

A VSCode extension for managing multiple projects with unified Git operations, per-project command batching (**ProjectsCmd**), one-click workspace-root quick commands (**ShortCutCmd**), and configuration management.

![Version](https://img.shields.io/badge/version-1.0.6-blue) ![License](https://img.shields.io/badge/license-MIT-green) ![VSCode](https://img.shields.io/badge/VSCode-^1.120.0-37AAFF)

## Features

- **Auto-scan workspace** to discover Git repositories (configurable depth)
- **Batch Git operations** across multiple projects at once (Pull / Commit / Branch / Push)
- **ProjectsCmd** — run custom shell commands against every selected Git project, in each project's own directory
- **ShortCutCmd** — one-click quick commands that run once in the workspace root directory, ideal for frequently used scripts
- **Shell-typed commands** — every command is stored with its shell type (Git Bash / CMD / PowerShell / WSL); the shell selector filters the command list by type, and newly created commands are stamped with the currently selected type. Commands created before shell typing exist are treated as Git Bash
- **Multi-line script support** with shared context variables across lines
- **Per-line execution log** in `$ command => executed result: output` format
- **Project list collapse/expand** to maximize working area
- **i18n** (English / 中文)

## Prerequisites

### General
- VSCode `^1.120.0`
- A workspace folder containing multiple project subdirectories

### Git Tab (Batch Git Operations)
Git operations rely on the local `git` CLI:

1. **Install Git** for your OS:
   - Windows: [git-scm.com](https://git-scm.com/download/win) (includes Git Bash)
   - macOS: `brew install git`
   - Linux: `sudo apt install git` / `sudo dnf install git`
2. **Add to PATH** — verify in an integrated terminal:
   ```bash
   git --version
   ```
3. **Add `bash.exe` to PATH** (Windows) — Git Tab internally invokes `bash`. With Git for Windows installed, ensure this path is on your system `PATH`:
   ```
   C:\Program Files\Git\bin
   ```
   Verify:
   ```bash
   bash --version
   ```
4. **Configure SSH key** — all Git operations use SSH remotes. Set up an SSH key for your Git host (GitHub / GitLab / Gitea / self-hosted):
   ```bash
   # Generate a key (no passphrase for automation, or use ssh-agent)
   ssh-keygen -t ed25519 -C "your_email@example.com"

   # Start ssh-agent and add the key
   eval "$(ssh-agent -s)"
   ssh-add ~/.ssh/id_ed25519

   # Copy the public key and add it to your Git host
   cat ~/.ssh/id_ed25519.pub
   ```
   Verify the SSH connection works for your host:
   ```bash
   ssh -T git@github.com     # GitHub
   ssh -T git@gitlab.com     # GitLab
   ```
   Your project remote URLs must use the SSH form (e.g. `git@github.com:owner/repo.git`), not HTTPS.

### ProjectsCmd Tab
Custom commands run through your selected shell:

- **Git Bash** (default): requires `bash.exe` on PATH (same as Git Tab above)
- **CMD**: built-in on Windows
- **PowerShell**: built-in on Windows
- **WSL**: requires WSL installed on Windows

ShortCutCmd uses the same shells with the same requirements.

### Python Text Transform (Pyt Tab)
The Python text-transformation feature requires Python 3:

1. **Install Python** — [python.org](https://www.python.org/downloads/) or `winget install Python.Python.3`
2. **Add to PATH** — verify:
   ```bash
   python --version
   ```
3. Custom Python text-transformation scripts will be invoked via the `python` command.

## Tabs

### Git Tab
Batch Git operations across selected projects.

| Button | Action |
|---|---|
| 📥 Pull | `git pull` on each selected project |
| ✓ Commit | Prompt for commit message, then `git add . && git commit -m "..."` |
| 📊 Change | Show working-tree change count per project |
| 🌿 Branch | Switch to an existing branch, or create a new branch across all selected projects |
| 📤 Push | `git push` on each selected project |

- **Select All** checkbox — bulk select/deselect all Git projects
- **Selected N** counter — shows the number of currently selected projects
- **▼/▶ button** — collapse or expand the project list
- Each project row shows: checkbox, name, current branch, change count

### ProjectsCmd Tab
Run custom shell commands against **multiple Git projects at once**. The command runs once per selected project, inside that project's own directory.

- **Shell selector (type filter)** — every command is stored with the shell type that was selected when it was created. The selector at the top only shows commands of the chosen type (Git Bash / CMD / PowerShell / WSL); newly created commands are stamped with the currently selected type. Commands from older versions without a type are shown under Git Bash
- **+ Category** — group commands into (nested) categories
- **+ Add** — create a reusable command (alias + multi-line content)
- **Multi-line scripts** — each line runs in the same shell context, so variables defined on earlier lines are available to later lines:
  ```bash
  VAR="hello"
  echo $VAR           # outputs: hello
  ```
- **Per-line execution log** — every line is traced:
  ```
  $ VAR="hello" => executed result:
  $ echo $VAR => executed result: hello
  ```
- **Shell badge** — each command row shows the shell type it belongs to
- **Environment variables** — inject custom env vars into every command execution
- **Selected N** counter + **Select All** + collapse/expand (same as Git Tab)
- Running requires **at least one selected project**; the command is executed for each of them

### ShortCutCmd Tab
One-click quick commands that run **once, in the workspace root directory** (the first workspace folder). Designed for frequently used scripts that are not tied to a specific Git project — cache cleanup, environment checks, one-off maintenance scripts, etc.

- **No project selection** — click ▶ on a command and it runs immediately; there is no project list on this tab
- **Fixed working directory** — always the workspace root. If a command needs another directory, `cd` inside the script itself
- **Shell selector (type filter)** — works exactly like ProjectsCmd, but keeps its own independent selection; commands are stamped with the type selected at creation time
- **Same tree layout** — categories, commands, drag & drop, rename, delete — shared with ProjectsCmd
- **Editor Run button** — try the editor content directly without saving first
- **Same per-line log format** as the other tabs

#### ProjectsCmd vs ShortCutCmd

| | ProjectsCmd | ShortCutCmd |
|---|---|---|
| Execution target | Every **selected Git project**, in each project's own directory | Fixed **workspace root directory**, executed once |
| Typical use | Build / test / deploy scripts repeated across many repos | Frequently used quick scripts not tied to any project |
| Project selection | Required (Select All / per-project checkboxes) | Not applicable — no project list |
| Shell type selection | Independent, persisted per tab | Independent, persisted per tab |
| Command data | `customCommandTree` in `.multi-project-tool/config.json` | `.multi-project-tool/shortcutCommands.json` |
| Data compatibility | The two command sets are separate and do not mix | — |

Rule of thumb: if the command must run **per project** → ProjectsCmd; if it runs **once for the workspace** → ShortCutCmd.

### JSON Tab
Manage global parameters and tab visibility.

- Edit JSON parameters used for `${var}` substitution in custom commands
- Show/hide individual tabs (Git / Cmd / Pyt / JSON)
- Reset to defaults

### Pyt Tab
Python-based text transformation utilities. Requires `python` on PATH (see Prerequisites).

## Configuration

All settings live under the `multi-project-tool.*` namespace in VSCode Settings:

| Key | Default | Description |
|---|---|---|
| `showJsonTab` | `true` | Show JSON Tab |
| `showGitTab` | `true` | Show Git Tab |
| `gitDefaultBranch` | `main` | Default branch name |
| `projectScanDepth` | `3` | Max depth to scan for Git projects |
| `defaultShell` | `git-bash` | Shell for custom commands (`git-bash` / `cmd` / `powershell` / `wsl`) |
| `autoRefresh` | `true` | Auto-refresh project list on filesystem changes |
| `logRetention` | `50` | Max log entries kept |
| `concurrency` | `1` | Number of projects to execute commands concurrently (1-10) |
| `commandTimeout` | `300` | Command execution timeout in seconds |
| `customCommands` | `[]` | Saved custom commands (legacy, migrated automatically) |
| `envVariables` | `[]` | Environment variables injected during command execution |
| `commonParameters` | `{}` | Global JSON parameters for command variable substitution |

Workspace-level data (per workspace folder, under `.multi-project-tool/`):

| File | Content |
|---|---|
| `config.json` | Settings, ProjectsCmd command tree, environment variables |
| `shortcutCommands.json` | ShortCutCmd command tree |
| `customPythonTxt.json` | Python text-transform command tree |

## Usage Example

1. Open a workspace folder containing several Git projects:
   ```
   my-workspace/
   ├── backend/      (.git)
   ├── frontend/     (.git)
   └── docs/         (.git)
   ```
2. Click the Multi-Project Tool icon in the Activity Bar.
3. **Git Tab** → check the projects you want to update → click 📥 Pull. All selected repos pull in one action.
4. **ProjectsCmd Tab** → pick the shell type (e.g. Git Bash) → **+ Add** → alias `deploy-all`, content:
   ```bash
   npm run build
   npm run deploy
   ```
   Save → the command is stored as a Git Bash command → select target projects → click ▶. Each selected project runs the script in its own directory, with shared context across lines.
5. **ShortCutCmd Tab** → **+ Add** → alias `clean-all-cache`, content:
   ```bash
   npm cache clean --force
   rm -rf node_modules/.cache
   ```
   Save → click ▶. The script runs once in `my-workspace/` (the workspace root) — no project selection needed.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `[bash.exe] command not found` | Add `C:\Program Files\Git\bin` to system PATH, then restart VSCode |
| Git operations fail with permission denied | Configure SSH key for your Git host and use SSH remote URLs |
| Projects not listed | Check `projectScanDepth` and that subfolders are Git repos |
| Custom commands silently fail | Switch to the selected shell and run the script manually; check the per-line log |
| `python` commands fail | Install Python 3 and ensure `python --version` works in an integrated terminal |
| Config changes don't take effect | Reload the VSCode window (`Ctrl+R` / `Cmd+R`) |
| Command list looks empty after switching shell type | The shell selector is a **type filter** — commands of other types are hidden, not deleted. Switch back to their type to see them |
| Old commands all appear under Git Bash | Commands created before shell typing were migrated to the Git Bash type; edit and recreate them under another type if needed |
| ShortCutCmd runs in the wrong directory | It always runs in the workspace root; add `cd /your/path` as the first line of the script |

## Development

```bash
npm install
npm run compile       # build TypeScript
npm run watch         # watch mode
npm test              # run the unit/integration test suites
```

Press <kbd>F5</kbd> in VSCode to launch an Extension Development Host with the extension loaded.

### Package & Publish

```bash
# Local package
vsce package --no-git-tag-version -o multi-project-tool-1.0.6.vsix

# Publish to Marketplace (requires PAT)
vsce login ghema
vsce publish
```

CI builds run automatically via GitHub Actions — push a `v*` tag to create a Release with the built VSIX attached.

## License

[MIT](LICENSE)
