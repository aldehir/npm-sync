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

export default class NPMDownloader extends EventEmitter {
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
    console.log(chalk.magenta(`Fetching package metadata for ${packageSpec}...`))
    let packagesToDownload = await this.fetchPackagesToDownload(packageSpec)

    console.log(chalk.magenta(`Downloading ${packagesToDownload.size} packages`))

    let waitFor = []
    for (let [, pkg] of packagesToDownload) {
      waitFor.push(this.singleDownload(pkg))
    }

    await Promise.all(waitFor)
  }

  async singleDownload (pkg: Package): Promise<void> {
    let destination = this.destinationPath(pkg)

    if (await exists(destination)) {
      if (await this.checksumMatches(destination, pkg.dist.shasum)) {
        console.log(chalk.yellow(`Skipping ${pkg._id}: already exists`))
        return
      }
    }

    await ensureDirectory(path.dirname(destination))

    let download = this.factory(pkg.dist.tarball, destination)
    this.attachToDownload(pkg, download)

    return this.queue.add().promise.then((task) =>
      download.download().finally(() => task.done())
    )
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

  attachToDownload (pkg: Package, download: Downloadable) {
    download.on('start', () => {
      console.log(chalk.gray(`Downloading ${pkg._id} (${download.url} -> ${download.destination})`))
    })

    download.on('finish', () => {
      console.log(chalk.green(`Downloaded ${pkg._id} -> ${download.destination}`))
    })

    download.on('error', (err) => {
      console.log(chalk.red(`Failed to download ${pkg._id}: ${err}`))
    })
  }

  fetchPackagesToDownload (
    packageSpec: string | PackageSpec,
    outResults?: Map<string, Package>
  ): Promise<Map<string, Package>> {
    let pendingDownloads = outResults || new Map()

    return this.queue.add(packageSpec).promise
      .then((task) => {
        return this.resolver.resolve(packageSpec)
          .finally(() => task.done())
      })
      .then((pkg) => {
        if (pendingDownloads.has(pkg._id)) return []
        pendingDownloads.set(pkg._id, pkg)

        return Promise.all(Object.entries(pkg.dependencies || {})
          .map((entry) => this.fetchPackagesToDownload(new PackageSpec(...entry), pendingDownloads))
        )
      })
      .catch((err) => {
        console.error(chalk.red(`Failed to get dependencies for ${packageSpec}: ${err}`))
      })
      .then((depLists) => {
        return pendingDownloads
      })
  }

  destinationPath (pkg: Package) {
    let tarball = path.basename(pkg.dist.tarball)
    return path.join('downloads', pkg.name, tarball)
  }
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

    for (let pkg of argv.package) {
      downloader.download(pkg)
        .catch((err) => {
          console.log(chalk.red(`Error downloading ${pkg}: ${err}`))
        })
    }
  }
}