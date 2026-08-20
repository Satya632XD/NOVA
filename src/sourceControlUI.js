import { GitService } from './gitService.js';
import { GitAuth } from './gitAuth.js';
import { GitFsBridge } from './gitFsAdapter.js';

export class SourceControlUI {
  constructor({ containerEl, virtualFs, onProjectReload }) {
    this.container = containerEl;
    this.virtualFs = virtualFs;
    this.onProjectReload = onProjectReload;
    this.currentProjectDir = '/workspace';
    this.fsBridge = new GitFsBridge(virtualFs);
    this.isLoading = false;
  }

  async render() {
    const isRepo = await GitService.isRepo(this.currentProjectDir);
    
    if (!isRepo) {
      this.renderInitView();
      return;
    }

    const branch = await GitService.getCurrentBranch(this.currentProjectDir);
    const branches = await GitService.getBranches(this.currentProjectDir);
    const { staged, unstaged } = await GitService.getStatus(this.currentProjectDir);
    const remoteUrl = await GitService.getRemoteUrl(this.currentProjectDir) || '';

    this.container.innerHTML = `
      <div class="git-panel">
        <div class="git-header">
          <h3>SOURCE CONTROL</h3>
          <button class="icon-btn" id="git-settings-btn" title="GitHub Settings">⚙️</button>
        </div>

        <div class="git-branch-bar">
          <span>Branch:</span>
          <select id="git-branch-select" class="git-select">
            ${branches.map(b => `<option value="${b}" ${b === branch ? 'selected' : ''}>${b}</option>`).join('')}
            <option value="__create_new__">+ New Branch...</option>
          </select>
        </div>

        <div class="git-progress" id="git-progress" style="display: none;">
          <div class="progress-bar" id="git-progress-bar"></div>
          <span class="progress-label" id="git-progress-label">Syncing...</span>
        </div>

        <div class="git-status-alert" id="git-alert" style="display: none;"></div>

        <div class="git-changes-container">
          <!-- Staged Section -->
          <div class="git-section-header">
            <span>STAGED CHANGES (${staged.length})</span>
            ${staged.length > 0 ? '<button class="text-btn" id="git-unstage-all-btn">Unstage All</button>' : ''}
          </div>
          <div class="git-file-list">
            ${staged.map(f => `
              <div class="git-file-row" data-path="${f.path}">
                <span class="git-badge badge-${f.status.toLowerCase()}">${f.status}</span>
                <span class="git-filename" title="${f.path}">${f.path}</span>
                <button class="action-btn unstage-btn" data-path="${f.path}" title="Unstage">−</button>
              </div>
            `).join('')}
            ${staged.length === 0 ? '<div class="git-empty">No staged changes</div>' : ''}
          </div>

          <!-- Unstaged Changes Section -->
          <div class="git-section-header">
            <span>CHANGES (${unstaged.length})</span>
            ${unstaged.length > 0 ? '<button class="text-btn" id="git-stage-all-btn">Stage All</button>' : ''}
          </div>
          <div class="git-file-list">
            ${unstaged.map(f => `
              <div class="git-file-row" data-path="${f.path}">
                <span class="git-badge badge-${f.status.toLowerCase()}">${f.status}</span>
                <span class="git-filename" title="${f.path}">${f.path}</span>
                <button class="action-btn stage-btn" data-path="${f.path}" title="Stage">+</button>
              </div>
            `).join('')}
            ${unstaged.length === 0 ? '<div class="git-empty">Working tree clean</div>' : ''}
          </div>
        </div>

        <!-- Commit Form -->
        <div class="git-commit-box">
          <textarea id="git-commit-message" placeholder="Commit message (e.g., Fix mobile layout)" rows="2"></textarea>
          <button class="btn btn-primary" id="git-commit-btn" ${staged.length === 0 ? 'disabled' : ''}>
            ✓ Commit
          </button>
        </div>

        <!-- Sync Actions -->
        <div class="git-sync-actions">
          <button class="btn btn-secondary" id="git-pull-btn">↓ Pull</button>
          <button class="btn btn-secondary" id="git-push-btn">☁ Push</button>
        </div>

        <div class="git-remote-info">
          <small>Remote: <strong>${remoteUrl || 'No remote configured'}</strong></small>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  renderInitView() {
    this.container.innerHTML = `
      <div class="git-empty-panel">
        <h3>Source Control</h3>
        <p>This project is not yet a Git repository.</p>
        <button class="btn btn-primary" id="git-init-btn">Initialize Repository</button>
        <hr class="git-divider"/>
        <button class="btn btn-secondary" id="git-clone-open-btn">Clone from GitHub</button>
      </div>
    `;

    this.container.querySelector('#git-init-btn')?.addEventListener('click', async () => {
      await GitService.init(this.currentProjectDir);
      await this.fsBridge.syncToGitWorkingTree(this.currentProjectDir, this.virtualFs.getAllFiles());
      this.render();
    });

    this.container.querySelector('#git-clone-open-btn')?.addEventListener('click', () => {
      this.showCloneModal();
    });
  }

  bindEvents() {
    // Stage individual
    this.container.querySelectorAll('.stage-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await GitService.stage(this.currentProjectDir, btn.dataset.path);
        this.render();
      });
    });

    // Unstage individual
    this.container.querySelectorAll('.unstage-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await GitService.unstage(this.currentProjectDir, btn.dataset.path);
        this.render();
      });
    });

    // Stage All / Unstage All
    this.container.querySelector('#git-stage-all-btn')?.addEventListener('click', async () => {
      await GitService.stageAll(this.currentProjectDir);
      this.render();
    });

    this.container.querySelector('#git-unstage-all-btn')?.addEventListener('click', async () => {
      await GitService.unstageAll(this.currentProjectDir);
      this.render();
    });

    // Commit
    this.container.querySelector('#git-commit-btn')?.addEventListener('click', async () => {
      const msgInput = this.container.querySelector('#git-commit-message');
      try {
        await GitService.commit(this.currentProjectDir, msgInput.value);
        this.showAlert('Commit successful!', 'success');
        this.render();
      } catch (err) {
        this.showAlert(err.message, 'error');
      }
    });

    // Push
    this.container.querySelector('#git-push-btn')?.addEventListener('click', async () => {
      this.showProgress(0, 'Pushing commits to GitHub...');
      try {
        await GitService.push(this.currentProjectDir, {
          onProgress: (pct, phase) => this.showProgress(pct, `${phase || 'Pushing'} (${pct}%)`)
        });
        this.showAlert('Push successful! Changes live on GitHub.', 'success');
      } catch (err) {
        this.showAlert(err.message, 'error');
      } finally {
        this.hideProgress();
      }
    });

    // Pull
    this.container.querySelector('#git-pull-btn')?.addEventListener('click', async () => {
      this.showProgress(0, 'Pulling changes from GitHub...');
      try {
        await GitService.pull(this.currentProjectDir, {
          onProgress: (pct, phase) => this.showProgress(pct, `${phase || 'Pulling'} (${pct}%)`)
        });
        const syncedFiles = await this.fsBridge.syncFromGitWorkingTree(this.currentProjectDir);
        this.virtualFs.loadFiles(syncedFiles);
        if (this.onProjectReload) this.onProjectReload();
        this.showAlert('Pull successful. Working directory updated.', 'success');
        this.render();
      } catch (err) {
        this.showAlert(err.message, 'error');
      } finally {
        this.hideProgress();
      }
    });

    // Branch selection
    this.container.querySelector('#git-branch-select')?.addEventListener('change', async (e) => {
      const val = e.target.value;
      if (val === '__create_new__') {
        const newBranchName = prompt('Enter new branch name:');
        if (newBranchName && newBranchName.trim()) {
          await GitService.createBranch(this.currentProjectDir, newBranchName.trim());
          this.render();
        } else {
          this.render();
        }
      } else {
        await GitService.checkout(this.currentProjectDir, val);
        const syncedFiles = await this.fsBridge.syncFromGitWorkingTree(this.currentProjectDir);
        this.virtualFs.loadFiles(syncedFiles);
        if (this.onProjectReload) this.onProjectReload();
        this.render();
      }
    });

    // Settings Modal
    this.container.querySelector('#git-settings-btn')?.addEventListener('click', () => {
      this.showSettingsModal();
    });

    // Diff inspection on row tap
    this.container.querySelectorAll('.git-file-row').forEach(row => {
      row.addEventListener('click', async () => {
        const filepath = row.dataset.path;
        const { oldContent, newContent } = await GitService.getDiff(this.currentProjectDir, filepath);
        this.showDiffModal(filepath, oldContent, newContent);
      });
    });
  }

  showSettingsModal() {
    const creds = GitAuth.getCredentials();
    const modal = document.createElement('div');
    modal.className = 'git-modal-overlay';
    modal.innerHTML = `
      <div class="git-modal">
        <h4>GitHub & Remote Settings</h4>
        <label>GitHub Personal Access Token</label>
        <input type="password" id="git-token-input" value="${creds.token}" placeholder="ghp_xxxxxxxxxxxx" />
        <small class="hint">Token is stored only on this device and used for Git push/pull.</small>

        <label>Author Name</label>
        <input type="text" id="git-name-input" value="${creds.name}" />

        <label>Author Email</label>
        <input type="email" id="git-email-input" value="${creds.email}" />

        <label>Remote Origin URL</label>
        <input type="text" id="git-remote-input" placeholder="https://github.com/username/repo.git" />

        <div class="modal-buttons">
          <button class="btn btn-secondary" id="git-modal-cancel">Cancel</button>
          <button class="btn btn-primary" id="git-modal-save">Save</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    GitService.getRemoteUrl(this.currentProjectDir).then(url => {
      if (url) modal.querySelector('#git-remote-input').value = url;
    });

    modal.querySelector('#git-modal-cancel').onclick = () => modal.remove();
    modal.querySelector('#git-modal-save').onclick = async () => {
      GitAuth.setCredentials({
        token: modal.querySelector('#git-token-input').value,
        name: modal.querySelector('#git-name-input').value,
        email: modal.querySelector('#git-email-input').value,
      });
      const remoteUrl = modal.querySelector('#git-remote-input').value.trim();
      if (remoteUrl) {
        await GitService.setRemote(this.currentProjectDir, remoteUrl);
      }
      modal.remove();
      this.render();
    };
  }

  showCloneModal() {
    const modal = document.createElement('div');
    modal.className = 'git-modal-overlay';
    modal.innerHTML = `
      <div class="git-modal">
        <h4>Clone GitHub Repository</h4>
        <label>Repository HTTPS URL</label>
        <input type="text" id="git-clone-url" placeholder="https://github.com/username/repo.git" />
        <div class="git-progress" id="clone-progress" style="display: none; margin-top: 10px;">
          <div class="progress-bar" id="clone-progress-bar"></div>
          <span class="progress-label" id="clone-progress-label">Cloning...</span>
        </div>
        <div class="modal-buttons" style="margin-top: 15px;">
          <button class="btn btn-secondary" id="git-clone-cancel">Cancel</button>
          <button class="btn btn-primary" id="git-clone-exec">Clone</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('#git-clone-cancel').onclick = () => modal.remove();
    modal.querySelector('#git-clone-exec').onclick = async () => {
      const url = modal.querySelector('#git-clone-url').value.trim();
      if (!url) return;

      const pBar = modal.querySelector('#clone-progress-bar');
      const pLabel = modal.querySelector('#clone-progress-label');
      modal.querySelector('#clone-progress').style.display = 'block';

      try {
        await GitService.clone(url, this.currentProjectDir, {
          onProgress: (pct, phase) => {
            pBar.style.width = `${pct}%`;
            pLabel.textContent = `${phase || 'Cloning'} (${pct}%)`;
          }
        });
        const syncedFiles = await this.fsBridge.syncFromGitWorkingTree(this.currentProjectDir);
        this.virtualFs.loadFiles(syncedFiles);
        if (this.onProjectReload) this.onProjectReload();
        modal.remove();
        this.render();
      } catch (err) {
        alert(err.message);
        modal.querySelector('#clone-progress').style.display = 'none';
      }
    };
  }

  showDiffModal(filepath, oldContent, newContent) {
    const modal = document.createElement('div');
    modal.className = 'git-modal-overlay';
    modal.innerHTML = `
      <div class="git-modal git-diff-modal">
        <h4>Diff: ${filepath}</h4>
        <div class="git-diff-viewer">
          <pre><code>${this._renderSimpleDiff(oldContent, newContent)}</code></pre>
        </div>
        <div class="modal-buttons">
          <button class="btn btn-secondary" id="diff-close">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#diff-close').onclick = () => modal.remove();
  }

  _renderSimpleDiff(oldText, newText) {
    const oldLines = oldText ? oldText.split('\n') : [];
    const newLines = newText ? newText.split('\n') : [];
    const diffLines = [];
    
    // Line-by-line visual delta
    let i = 0;
    while (i < oldLines.length || i < newLines.length) {
      if (oldLines[i] !== undefined && newLines[i] !== undefined) {
        if (oldLines[i] === newLines[i]) {
          diffLines.push(`  ${escapeHtml(oldLines[i])}`);
        } else {
          diffLines.push(`<span class="diff-del">- ${escapeHtml(oldLines[i])}</span>`);
          diffLines.push(`<span class="diff-add">+ ${escapeHtml(newLines[i])}</span>`);
        }
      } else if (oldLines[i] !== undefined) {
        diffLines.push(`<span class="diff-del">- ${escapeHtml(oldLines[i])}</span>`);
      } else if (newLines[i] !== undefined) {
        diffLines.push(`<span class="diff-add">+ ${escapeHtml(newLines[i])}</span>`);
      }
      i++;
    }
    return diffLines.join('\n');
  }

  showProgress(percentage, text) {
    const el = this.container.querySelector('#git-progress');
    const bar = this.container.querySelector('#git-progress-bar');
    const label = this.container.querySelector('#git-progress-label');
    if (el && bar && label) {
      el.style.display = 'block';
      bar.style.width = `${percentage}%`;
      label.textContent = text;
    }
  }

  hideProgress() {
    const el = this.container.querySelector('#git-progress');
    if (el) el.style.display = 'none';
  }

  showAlert(message, type = 'info') {
    const alertEl = this.container.querySelector('#git-alert');
    if (alertEl) {
      alertEl.className = `git-status-alert alert-${type}`;
      alertEl.textContent = message;
      alertEl.style.display = 'block';
      setTimeout(() => { alertEl.style.display = 'none'; }, 6000);
    }
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
