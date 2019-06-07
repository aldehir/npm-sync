import fs from 'fs'
import path from 'path'
import yargs from 'yargs'
import axios, { AxiosResponse } from 'axios'

import PackageResolver, { Package } from './package'
import { Task, TaskQueue } from './task'
import { mkdirRecursively } from './mkdir'

export interface DownloadManagerOptions {
  registry: string
  concurrency: number
  attempts: number
}

export class DownloadManager {
  resolver: PackageResolver
  outputDirectory: string = '.npm-sync-temp'

  queue: TaskQueue
  cache: Set<string>

  attempts: number

  constructor (opts: DownloadManagerOptions) {
    this.resolver = new PackageResolver(opts.registry)
    this.queue = new TaskQueue({ concurrency: opts.concurrency })
    this.cache = new Set()
    this.attempts = opts.attempts
  }

  queueDownload (pkgString: string) {
    this.queue.add()
      .then((task: Task) => {
        this.download(pkgString)
          .finally(() => task.done())
      })

    console.log(`Queued download for ${pkgString}`)
  }

  async download (pkgString: string): Promise<string | undefined> {
    let pkg = await this.resolver.resolve(pkgString)
    if (!this.shouldDownload(pkg)) return

    this.markAsDownloaded(pkg)

    let destination = this.destinationPath(pkg)

    console.debug(`Creating directory ${destination}`)

    await mkdirRecursively(path.dirname(destination))

    for (let i = 0; i < this.attempts; i++) {
      let addendum = ''

      if (i > 0) {
        addendum = ` attempt ${i + 1} of ${this.attempts}`
      }

      console.log(`Downloading ${pkg._id}` + addendum)

      try {
        await this.tryDownload(pkg.dist.tarball, destination)
        return destination
      } catch(err) {
        console.error(err)
      }
    }

    throw new Error(`Failed to download ${pkg.dist.tarball}`)
  }

  tryDownload (url: string, destination: string): Promise<any> {
    return axios.get(url, { responseType: 'stream' })
      .then((response: AxiosResponse) => {
        return new Promise((resolve, reject) => {
          let stream = response.data

          stream.pipe(fs.createWriteStream(destination))

          stream.on('end', () => {
            resolve()
          })

          stream.on('error', (err: Error) => {
            reject(err)
          })
        })
      })
  }

  shouldDownload (pkg: Package): boolean {
    return !this.cache.has(pkg._id)
  }

  markAsDownloaded (pkg: Package) {
    this.cache.add(pkg._id)
  }

  destinationPath (pkg: Package): string {
    return path.join(
      this.outputDirectory,
      pkg.name,
      path.basename(pkg.dist.tarball)
    )
  }
}

export let DownloadCommand = {
  command: 'download [package..]',
  describe: 'Download package(s) from NPM registry',

  builder: (yargs: yargs.Argv) => {
    return yargs
      .positional('package', {
        type: 'string',
        describe: 'Package to download'
      })

      .alias('f', 'from-config')
        .string('f')
        .describe('f', 'Download dependencies in package.json')

      .alias('o', 'output')
        .string('o')
        .default('o', 'packages.tgz')
        .describe('o', 'Output archive')

      .alias('r', 'registry')
        .string('r')
        .default('r', 'http://registry.npmjs.com')
        .describe('r', 'Registry')

      .alias('c', 'concurrency')
        .number('c')
        .default('c', 8)
        .describe('c', 'Max number of downloads')

      .help('h')
        .alias('h', 'help')
  },

  handler: (argv: any) => {
    console.log('download.ts')
    console.dir(argv)
  }
}
