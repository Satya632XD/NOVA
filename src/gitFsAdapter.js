import FS from '@isomorphic-git/lightning-fs';

// Initialize LightningFS backed by IndexedDB
const lfs = new FS('nova-git-fs', { wipe: false });
export const gitFs = lfs.promises;

/**
 * Bridges isomorphic-git with NOVA's internal FileSystem
 */
export class GitFsBridge {
  constructor(virtualFs) {
    this.virtualFs = virtualFs;
    this.fs = gitFs;
  }

  // Ensures project files are mirrored into isomorphic-git's working tree
  async syncToGitWorkingTree(projectDir, virtualFiles) {
    for (const file of virtualFiles) {
      if (file.path.startsWith('.git')) continue;
      const fullPath = `${projectDir}/${file.path}`.replace(/\/+/g, '/');
      const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
      
      if (dir) {
        await this.fs.mkdir(dir, { recursive: true }).catch(() => {});
      }
      
      const content = typeof file.content === 'string' ? file.content : new Uint8Array(file.content || []);
      await this.fs.writeFile(fullPath, content);
    }
  }

  // Reads working tree back into NOVA editor filesystem
  async syncFromGitWorkingTree(projectDir) {
    const files = [];
    const readDirRecursive = async (currentDir, relPath = '') => {
      const entries = await this.fs.readdir(currentDir);
      for (const entry of entries) {
        if (entry === '.git') continue;
        const entryPath = `${currentDir}/${entry}`;
        const relativeEntryPath = relPath ? `${relPath}/${entry}` : entry;
        const stat = await this.fs.stat(entryPath);
        
        if (stat.isDirectory()) {
          await readDirRecursive(entryPath, relativeEntryPath);
        } else {
          const content = await this.fs.readFile(entryPath, 'utf8');
          files.push({ path: relativeEntryPath, content });
        }
      }
    };

    await readDirRecursive(projectDir);
    return files;
  }
}
