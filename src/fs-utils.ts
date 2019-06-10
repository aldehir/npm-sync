import fs from 'fs'
import path from 'path'
import util from 'util'

const exists = util.promisify(fs.exists)
const mkdir = util.promisify(fs.mkdir)

export function ascending(filepath: string) {
  let paths: string[] = []

  let current = filepath
  while (current != '/' && current != '.') {
    paths.push(current)
    current = path.dirname(current)
  }

  return paths.reverse()
}

export async function ensureDirectory(filepath: string) {
  let paths = ascending(filepath)

  for (let p of paths) {
    try {
      await mkdir(p)
    } catch (err) {
      if (err.code !== 'EEXIST') throw err
    }
  }
}