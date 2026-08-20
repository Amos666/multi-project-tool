# Multi-Project Tool

A VSCode extension for managing multiple projects with unified Git operations, custom command batching, and configuration management.

![Version](https://img.shields.io/badge/version-1.0.0-blue) ![License](https://img.shields.io/badge/license-MIT-green) ![VSCode](https://img.shields.io/badge/VSCode-^1.120.0-37AAFF)

## Features

- **Auto-scan workspace** to discover Git repositories (configurable depth)
- **Batch Git operations** across multiple projects at once (Pull / Commit / Branch / Push)
- **Custom command batching** with shell selection (Git Bash / CMD / PowerShell / WSL)
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

### Custom Commands (Cmd Tab)
Custom commands run through your selected shell:

- **Git Bash** (default): requires `bash.exe` on PATH (same as Git Tab above)
- **CMD**: built-in on Windows
- **PowerShell**: built-in on Windows
- **WSL**: requires WSL installed on Windows

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

### Cmd Tab
Run custom shell commands against multiple projects at once.

- **Shell selector** — choose Git Bash / CMD / PowerShell / WSL
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
- **Environment variables** — inject custom env vars into every command execution
- **Selected N** counter + **Select All** + collapse/expand (same as Git Tab)

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
| `customCommands` | `[]` | Saved custom commands |
| `envVariables` | `[]` | Environment variables injected during command execution |
| `commonParameters` | `{}` | Global JSON parameters for command variable substitution |

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
4. **Cmd Tab** → **+ Add** → alias `deploy-all`, content:
   ```bash
   npm run build
   npm run deploy
   ```
   Save → select target projects → click the command. Each project runs the script in its own directory, with shared context across lines.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `[bash.exe] command not found` | Add `C:\Program Files\Git\bin` to system PATH, then restart VSCode |
| Git operations fail with permission denied | Configure SSH key for your Git host and use SSH remote URLs |
| Projects not listed | Check `projectScanDepth` and that subfolders are Git repos |
| Custom commands silently fail | Switch to the selected shell and run the script manually; check the per-line log |
| `python` commands fail | Install Python 3 and ensure `python --version` works in an integrated terminal |
| Config changes don't take effect | Reload the VSCode window (`Ctrl+R` / `Cmd+R`) |

## Development

```bash
npm install
npm run compile       # build TypeScript
npm run watch         # watch mode
```

Press <kbd>F5</kbd> in VSCode to launch an Extension Development Host with the extension loaded.

### Package & Publish

```bash
# Local package
vsce package --no-git-tag-version -o multi-project-tool-1.0.0.vsix

# Publish to Marketplace (requires PAT)
vsce login ghema
vsce publish
```

CI builds run automatically via GitHub Actions — push a `v*` tag to create a Release with the built VSIX attached.

## License

[MIT](LICENSE)
