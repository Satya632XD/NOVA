import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import { gitFs } from './gitFsAdapter.js';
import { GitAuth } from './gitAuth.js';

// Mobile-compatible CORS proxy for GitHub Git HTTP transport
const DEFAULT_CORS_PROXY = 'https://cors.isomorphic-git.org';

export const GitService = {
  corsProxy: DEFAULT_CORS_PROXY,

  async init(dir) {
    await git.init({ fs: gitFs, dir, defaultBranch: 'main' });
  },

  async isRepo(dir) {
    try {
      await git.resolveRef({ fs: gitFs, dir, ref: 'HEAD' });
      return true;
    } catch (err) {
      try {
        const entries = await gitFs.readdir(`${dir}/.git`);
        return entries.length > 0;
      } catch {
        return false;
      }
    }
  },

  async getCurrentBranch(dir) {
    try {
      return await git.currentBranch({ fs: gitFs, dir, fullname: false }) || 'main';
    } catch {
      return 'main';
    }
  },

  async getStatus(dir) {
    // 0: [filepath, headStatus, workdirStatus, stageStatus]
    const matrix = await git.statusMatrix({ fs: gitFs, dir });
    const staged = [];
    const unstaged = [];

    for (const [filepath, head, workdir, stage] of matrix) {
      if (filepath.startsWith('.git/')) continue;

      // Untracked / New
      if (head === 0 && workdir === 2 && stage === 0) {
        unstaged.push({ path: filepath, status: 'U', type: 'untracked' });
      }
      // Modified, unstaged
      else if (head === 1 && workdir === 2 && stage === 1) {
        unstaged.push({ path: filepath, status: 'M', type: 'modified' });
      }
      // Modified and staged
      else if (head === 1 && workdir === 2 && stage === 2) {
        staged.push({ path: filepath, status: 'M', type: 'modified' });
      }
      // Added and staged
      else if (head === 0 && workdir === 2 && stage === 2) {
        staged.push({ path: filepath, status: 'A', type: 'added' });
      }
      // Deleted, unstaged
      else if (head === 1 && workdir === 0 && stage === 1) {
        unstaged.push({ path: filepath, status: 'D', type: 'deleted' });
      }
      // Deleted, staged
      else if (head === 1 && workdir === 0 && stage === 0) {
        staged.push({ path: filepath, status: 'D', type: 'deleted' });
      }
      // Modified both in index and workdir
      else if (head === 1 && workdir === 2 && stage === 3) {
        staged.push({ path: filepath, status: 'M', type: 'staged-modified' });
        unstaged.push({ path: filepath, status: 'M', type: 'workdir-modified' });
      }
    }

    return { staged, unstaged };
  },

  async stage(dir, filepath) {
    await git.add({ fs: gitFs, dir, filepath });
  },

  async stageAll(dir) {
    const { unstaged } = await this.getStatus(dir);
    for (const file of unstaged) {
      if (file.status === 'D') {
        await git.remove({ fs: gitFs, dir, filepath: file.path });
      } else {
        await git.add({ fs: gitFs, dir, filepath: file.path });
      }
    }
  },

  async unstage(dir, filepath) {
    await git.resetIndex({ fs: gitFs, dir, filepath });
  },

  async unstageAll(dir) {
    const { staged } = await this.getStatus(dir);
    for (const file of staged) {
      await git.resetIndex({ fs: gitFs, dir, filepath: file.path });
    }
  },

  async commit(dir, message) {
    if (!message || !message.trim()) {
      throw new Error('Commit message cannot be empty.');
    }
    const author = GitAuth.getAuthor();
    return await git.commit({
      fs: gitFs,
      dir,
      message: message.trim(),
      author: {
        name: author.name,
        email: author.email,
        timestamp: Math.floor(Date.now() / 1000)
      }
    });
  },

  async getBranches(dir) {
    return await git.listBranches({ fs: gitFs, dir });
  },

  async createBranch(dir, ref) {
    await git.branch({ fs: gitFs, dir, ref, checkout: true });
  },

  async checkout(dir, ref) {
    await git.checkout({ fs: gitFs, dir, ref });
  },

  async setRemote(dir, url, remote = 'origin') {
    const remotes = await git.listRemotes({ fs: gitFs, dir });
    if (remotes.some(r => r.remote === remote)) {
      await git.deleteRemote({ fs: gitFs, dir, remote });
    }
    await git.addRemote({ fs: gitFs, dir, remote, url });
  },

  async getRemoteUrl(dir, remote = 'origin') {
    const remotes = await git.listRemotes({ fs: gitFs, dir });
    const match = remotes.find(r => r.remote === remote);
    return match ? match.url : null;
  },

  async push(dir, { remote = 'origin', branch = null, onProgress = () => {} } = {}) {
    if (!GitAuth.hasToken()) {
      throw new Error('AUTH_REQUIRED: Please configure your GitHub Personal Access Token in Source Control settings.');
    }

    const currentBranch = branch || await this.getCurrentBranch(dir);

    try {
      const response = await git.push({
        fs: gitFs,
        http,
        dir,
        remote,
        ref: currentBranch,
        corsProxy: this.corsProxy,
        onAuth: GitAuth.getAuthCallback(),
        onProgress: (evt) => {
          if (evt.total) {
            onProgress(Math.round((evt.loaded / evt.total) * 100), evt.phase);
          }
        }
      });

      if (!response.ok) {
        throw new Error('Push was rejected by GitHub. Pull remote changes or verify your branch permissions.');
      }
      return response;
    } catch (err) {
      throw this._normalizeGitError(err);
    }
  },

  async pull(dir, { remote = 'origin', onProgress = () => {} } = {}) {
    const author = GitAuth.getAuthor();
    try {
      await git.pull({
        fs: gitFs,
        http,
        dir,
        remote,
        ref: await this.getCurrentBranch(dir),
        singleBranch: true,
        corsProxy: this.corsProxy,
        author,
        onAuth: GitAuth.getAuthCallback(),
        onProgress: (evt) => {
          if (evt.total) {
            onProgress(Math.round((evt.loaded / evt.total) * 100), evt.phase);
          }
        }
      });
    } catch (err) {
      throw this._normalizeGitError(err);
    }
  },

  async clone(url, targetDir, { onProgress = () => {} } = {}) {
    try {
      await git.clone({
        fs: gitFs,
        http,
        dir: targetDir,
        url,
        corsProxy: this.corsProxy,
        onAuth: GitAuth.getAuthCallback(),
        onProgress: (evt) => {
          if (evt.total) {
            onProgress(Math.round((evt.loaded / evt.total) * 100), evt.phase);
          }
        }
      });
    } catch (err) {
      throw this._normalizeGitError(err);
    }
  },

  async getDiff(dir, filepath) {
    try {
      const headCommitOid = await git.resolveRef({ fs: gitFs, dir, ref: 'HEAD' });
      const { blob } = await git.readBlob({ fs: gitFs, dir, oid: headCommitOid, filepath });
      const oldContent = new TextDecoder().decode(blob);
      let newContent = '';
      try {
        newContent = await gitFs.readFile(`${dir}/${filepath}`, 'utf8');
      } catch {
        newContent = '(file deleted)';
      }
      return { oldContent, newContent };
    } catch {
      // New file diff
      const newContent = await gitFs.readFile(`${dir}/${filepath}`, 'utf8').catch(() => '');
      return { oldContent: '', newContent };
    }
  },

  _normalizeGitError(err) {
    const msg = err.message || err.toString();
    if (msg.includes('401') || msg.includes('403') || msg.includes('Authentication failed')) {
      return new Error('Authentication failed: Invalid GitHub Token or insufficient repository permissions (require `repo` scope).');
    }
    if (msg.includes('Push rejected') || msg.includes('NonFastForward')) {
      return new Error('Push failed: GitHub rejected the update because remote contains commits not present locally. Run Pull first.');
    }
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || !navigator.onLine) {
      return new Error('Network error: Unable to reach GitHub. Check your mobile data or Wi-Fi connection.');
    }
    if (msg.includes('Merge conflict') || msg.includes('MergeConflict')) {
      return new Error('Merge conflict detected: Remote changes conflict with local edits. Resolve files manually.');
    }
    return new Error(msg);
  }
};
