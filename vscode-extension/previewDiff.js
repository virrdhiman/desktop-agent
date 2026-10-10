const crypto = require('crypto')

function contentHash(text) {
  return crypto.createHash('sha256').update(text).digest('hex')
}

function splitLines(text) {
  return String(text).split('\n')
}

function joinLines(lines) {
  return lines.join('\n')
}

function lineDiffHunks(before, after) {
  const oldLines = splitLines(before)
  const newLines = splitLines(after)
  let prefix = 0
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix += 1
  let oldEnd = oldLines.length
  let newEnd = newLines.length
  while (oldEnd > prefix && newEnd > prefix && oldLines[oldEnd - 1] === newLines[newEnd - 1]) {
    oldEnd -= 1
    newEnd -= 1
  }
  const oldCount = oldEnd - prefix
  const newCount = newEnd - prefix
  if (!oldCount && !newCount) return []
  const makeHunk = (oldStart, oldStop, newStart, newStop) => ({
    oldStart, oldEnd: oldStop, newStart, newEnd: newStop, oldLines, newLines,
  })
  if (!oldCount || !newCount || oldCount * newCount > 200_000) {
    return [makeHunk(prefix, oldEnd, prefix, newEnd)]
  }

  const width = newCount + 1
  const matrix = new Uint32Array((oldCount + 1) * width)
  for (let old = oldCount - 1; old >= 0; old--) {
    for (let next = newCount - 1; next >= 0; next--) {
      matrix[old * width + next] = oldLines[prefix + old] === newLines[prefix + next]
        ? matrix[(old + 1) * width + next + 1] + 1
        : Math.max(matrix[(old + 1) * width + next], matrix[old * width + next + 1])
    }
  }
  const hunks = []
  let old = 0
  let next = 0
  let current = null
  while (old < oldCount || next < newCount) {
    if (old < oldCount && next < newCount && oldLines[prefix + old] === newLines[prefix + next]) {
      if (current) hunks.push(current)
      current = null
      old += 1
      next += 1
    } else {
      if (!current) current = makeHunk(prefix + old, prefix + old, prefix + next, prefix + next)
      if (old < oldCount && (next === newCount || matrix[(old + 1) * width + next] >= matrix[old * width + next + 1])) old += 1
      else next += 1
      current.oldEnd = prefix + old
      current.newEnd = prefix + next
    }
  }
  if (current) hunks.push(current)
  return hunks
}

function discardHunk(before, after, index) {
  const hunk = lineDiffHunks(before, after)[index]
  if (!hunk) return null
  const lines = splitLines(after)
  lines.splice(hunk.newStart, hunk.newEnd - hunk.newStart, ...splitLines(before).slice(hunk.oldStart, hunk.oldEnd))
  return joinLines(lines)
}

function diffStats(before, after) {
  const hunks = lineDiffHunks(before, after)
  return {
    hunks: hunks.length,
    additions: hunks.reduce((sum, hunk) => sum + hunk.newEnd - hunk.newStart, 0),
    deletions: hunks.reduce((sum, hunk) => sum + hunk.oldEnd - hunk.oldStart, 0),
  }
}

function compatibleUrl(baseUrl, endpoint) {
  return `${baseUrl.replace(/\/+$/, '').replace(/\/v1$/, '')}/v1/${endpoint}`
}

module.exports = { lineDiffHunks, discardHunk, diffStats, compatibleUrl, contentHash }
