/**
 * @author Virender Dhiman
 * @year 2025
 * @project Freebuff Agent
 * @license MIT
 */
/**
 * Git IPC Handlers
 * Operations: status, diff, commit, push, pull, branch, stash, log, stage/unstage
 */
import { ipcMain } from 'electron'
import { simpleGit, SimpleGit } from 'simple-git'

/** Cache of SimpleGit instances per working directory */
const gitInstances: Map<string, SimpleGit> = new Map()

function getGit(dirPath: string): SimpleGit {
  if (!gitInstances.has(dirPath)) {
    gitInstances.set(dirPath, simpleGit(dirPath))
  }
  return gitInstances.get(dirPath)!
}

export function registerGitHandlers() {
  ipcMain.handle('git:status', async (_event, repoPath: string) => {
    try {
      const git = getGit(repoPath)
      const status = await git.status()
      return {
        branch: status.current,
        tracking: status.tracking,
        ahead: status.ahead,
        behind: status.behind,
        staged: status.staged,
        modified: status.modified,
        not_added: status.not_added,
        deleted: status.deleted,
        renamed: status.renamed,
        isClean: status.isClean(),
      }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('git:diff', async (_event, repoPath: string, filePath?: string) => {
    try {
      const git = getGit(repoPath)
      if (filePath) return await git.diff([filePath])
      return await git.diff()
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('git:diffStaged', async (_event, repoPath: string) => {
    try {
      const git = getGit(repoPath)
      return await git.diff(['--cached'])
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('git:commit', async (_event, repoPath: string, message: string) => {
    try {
      const git = getGit(repoPath)
      await git.add('.')
      const result = await git.commit(message)
      return { success: true, summary: result.summary }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('git:commitStaged', async (_event, repoPath: string, message: string) => {
    try {
      const git = getGit(repoPath)
      const result = await git.commit(message)
      return { success: true, summary: result.summary }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('git:push', async (_event, repoPath: string, branch?: string) => {
    try {
      const git = getGit(repoPath)
      const status = await git.status()
      await git.push('origin', branch || status.current!)
      return { success: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('git:pull', async (_event, repoPath: string) => {
    try {
      const git = getGit(repoPath)
      const result = await git.pull()
      return { success: true, summary: result.summary }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('git:init', async (_event, repoPath: string) => {
    try {
      const git = getGit(repoPath)
      await git.init()
      return { success: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('git:log', async (_event, repoPath: string, count: number = 20) => {
    try {
      const git = getGit(repoPath)
      const log = await git.log({ maxCount: count })
      return log.all.map((entry) => ({
        hash: entry.hash,
        date: entry.date,
        message: entry.message,
        author: entry.author_name,
      }))
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('git:isRepo', async (_event, dirPath: string) => {
    try {
      const git = getGit(dirPath)
      await git.status()
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('git:branches', async (_event, repoPath: string) => {
    try {
      const git = getGit(repoPath)
      const branches = await git.branchLocal()
      return { current: branches.current, branches: branches.all }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('git:createBranch', async (_event, repoPath: string, branchName: string) => {
    try {
      const git = getGit(repoPath)
      await git.checkoutLocalBranch(branchName)
      return { success: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('git:switchBranch', async (_event, repoPath: string, branchName: string) => {
    try {
      const git = getGit(repoPath)
      await git.checkout(branchName)
      return { success: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('git:deleteBranch', async (_event, repoPath: string, branchName: string) => {
    try {
      const git = getGit(repoPath)
      await git.deleteLocalBranch(branchName)
      return { success: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('git:stash', async (_event, repoPath: string) => {
    try {
      const git = getGit(repoPath)
      const result = await git.stash()
      return { success: true, message: result }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('git:stashPop', async (_event, repoPath: string) => {
    try {
      const git = getGit(repoPath)
      await git.stash(['pop'])
      return { success: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('git:stage', async (_event, repoPath: string, files: string[]) => {
    try {
      const git = getGit(repoPath)
      await git.add(files)
      return { success: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('git:unstage', async (_event, repoPath: string, files: string[]) => {
    try {
      const git = getGit(repoPath)
      await git.reset(['HEAD', ...files])
      return { success: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })
}
