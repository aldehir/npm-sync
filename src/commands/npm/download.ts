import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { EventEmitter } from 'events'
import { Argv } from 'yargs'
import chalk from 'chalk'

import { TaskQueue } from '../../task'
import { exists, ensureDirectory } from '../../fs-utils'
import { defaultDownloadFactory, DownloadFactory, Downloadable } from '../../download'
import PackageResolver, { Package, PackageSpec } from './package'

export interface NPMDownloaderOptions {
  queue?: TaskQueue
  resolver?: PackageResolver
  factory?: DownloadFactory
}

export interface NPMDownloaderInterface {
  on (event: "download", callback: (packageEmitter: PackageEmitter) => void): this
}

export interface PackageEmitterInterface {
  on (event: "fetch-metadata", callback: () => void): this
  on (event: "metadata", callback: (packages: Map<string, Package>) => void): this
  on (event: "download", callback: (pkg: Package, download: Downloadable) => void): this
  on (event: "skip", callback: (pkg: Package) => void): this
}

export class PackageEmitter extends EventEmitter
    implements PackageEmitterInterface {

  constructor (readonly spec: string | PackageSpec) {
    super()
  }
}

export default class NPMDownloader extends EventEmitter
    implements NPMDownloaderInterface {

  queue: TaskQueue
  resolver: PackageResolver
  factory: DownloadFactory

  constructor (opts: NPMDownloaderOptions = {}) {
    super()
    this.queue = opts.queue || new TaskQueue({ concurrency: 8 })
    this.resolver = opts.resolver || new PackageResolver()
    this.factory = opts.factory || defaultDownloadFactory
  }

  async download (packageSpec: string | PackageSpec) {
    let emitter = new PackageEmitter(packageSpec)

    this.emit('download', emitter)
    emitter.emit('fetch-metadata')

    let packagesToDownload = await this.fetchPackagesToDownload(packageSpec)
    emitter.emit('metadata', packagesToDownload)

    let waitFor = []
    for (let [, pkg] of packagesToDownload) {
      waitFor.push(this.singleDownload(emitter, pkg))
    }

    await Promise.all(waitFor)
    emitter.emit('end')
  }

  async singleDownload (emitter: PackageEmitter, pkg: Package): Promise<void> {
    if (await this.shouldSkip(pkg)) {
      emitter.emit('skip', pkg)
      return
    }

    let destination = this.destinationPath(pkg)
    await ensureDirectory(path.dirname(destination))

    let download = this.factory(pkg.dist.tarball, destination)
    emitter.emit('download', pkg, download)

    return this.queue.add(() => download.download())
  }

  async shouldSkip (pkg: Package) {
    let destination = this.destinationPath(pkg)

    if (await exists(destination)) {
      if (await this.checksumMatches(destination, pkg.dist.shasum)) {
        return true
      }
    }

    return false
  }

  checksumMatches (path: string, checksum: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      let hash = crypto.createHash('sha1')
      let input = fs.createReadStream(path)

      input.on('readable', () => {
        let data
        while (data = input.read(32)) {
          hash.update(data)
        }
      })

      input.on('end', () => {
        let actualChecksum = hash.digest('hex').toLowerCase()
        resolve(actualChecksum === checksum.toLowerCase())
      })

      input.on('error', (err) => {
        reject(err)
      })
    })
  }

  fetchPackagesToDownload (
    packageSpec: string | PackageSpec,
    outResults?: Map<string, Package>
  ): Promise<Map<string, Package>> {
    let pendingDownloads = outResults || new Map()

    return this.queue
      .add(() => this.resolvePackage(packageSpec))
      .then((pkg) => {
        if (pendingDownloads.has(pkg._id)) return []
        pendingDownloads.set(pkg._id, pkg)

        return Promise.all(Object.entries(pkg.dependencies || {})
          .map((entry) => this.fetchPackagesToDownload(
            new PackageSpec(...entry),
            pendingDownloads
          ))
        )
      })
      .then((depLists) => {
        return pendingDownloads
      })
  }

  resolvePackage (spec: string | PackageSpec): Promise<Package> {
    return this.resolver.resolve(spec)
      .catch((err) => {
        throw new Error(`Failed to fetch dependencies for ${spec}: ${err.message}`)
      })
  }

  destinationPath (pkg: Package) {
    let tarball = path.basename(pkg.dist.tarball)
    return path.join('downloads', pkg.name, tarball)
  }
}

function consoleOutput (downloader: NPMDownloaderInterface) {
  downloader.on('download', (pkg: PackageEmitter) => {
    pkg.on('fetch-metadata', () => {
      console.log(chalk.magenta(`Fetching metadata for ${pkg.spec}`))
    })

    pkg.on('metadata', (packages: Map<string, Package>) => {
      console.log(chalk.magenta(`Downloading ${packages.size} packages`))
    })

    pkg.on(`skip`, (pkg: Package) => {
      console.log(chalk.yellow(`Skipping ${pkg._id}: package already downloaded`))
    })

    pkg.on(`download`, (pkg: Package, download: Downloadable) => {
      download.on('start', () => {
        console.log(chalk.gray(`Downloading ${pkg._id} (${download.url} -> ${download.destination})`))
      })

      download.on('finish', () => {
        console.log(chalk.green(`Downloaded ${pkg._id} (${download.destination})`))
      })

      download.on('error', (err: Error) => {
        console.error(chalk.red(`Failed to download ${pkg.id}: ${err}`))
      })
    })
  })
}

export let NPMDownloadCommand = {
  command: 'download [package..]',
  describe: 'Download package(s) from NPM registry',

  builder (yargs: Argv) {
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
        .default('c', 4)
        .describe('c', 'Max number of downloads')

      .help('h')
        .alias('h', 'help')
  },

  handler (argv: any) {
    let options = {
      queue: new TaskQueue({ concurrency: argv.concurrency }),
      resolver: new PackageResolver(argv.registry)
    }

    let downloader = new NPMDownloader(options)
    consoleOutput(downloader)

    for (let pkg of argv.package) {
      downloader.download(pkg)
        .catch((err) => console.error(chalk.red(err)))
    }
  }
}
