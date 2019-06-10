import path from 'path'
import { EventEmitter } from 'events'
import { Argv } from 'yargs'
import chalk from 'chalk'

import { TaskQueue } from '../../task'
import { ensureDirectory } from '../../fs-utils'
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
      waitFor.push(this.singleDownload(pkg).then(
        (download) => {
          this.attachToDownload(pkg, download)
          return download.promisify()
        }
      ))
    }

    await Promise.all(waitFor)
  }

  async singleDownload (pkg: Package): Promise<Downloadable> {
    let destination = this.destinationPath(pkg)
    await ensureDirectory(path.dirname(destination))

    let download = this.factory(pkg.dist.tarball, destination)

    this.queue.add().promise.then((task) =>
      download.download().finally(() => task.done())
    )

    return download
  }

  attachToDownload (pkg: Package, download: Downloadable) {
    download.on('start', () => {
      console.log(chalk.gray(`Downloading ${pkg._id} (${download.url} -> ${download.destination})`))
    })

    download.on('finish', () => {
      console.log(chalk.green(`Downloaded ${pkg._id} -> ${download.destination}`))
    })

    download.on('error', (err) => {
      console.log(chalk.red(`Failed to download ${pkg.id_}: ${err}`))
    })
  }

  fetchPackagesToDownload (packageSpec: string | PackageSpec): Promise<Map<string, Package>> {
    let pendingDownloads: Map<string, Package> = new Map()

    return this.queue.add(packageSpec).promise
      .then((task) => {
        return this.resolver.resolve(task.payload!)
          .finally(() => task.done())
      })
      .then((pkg) => {
        pendingDownloads.set(pkg._id, pkg)

        return Promise.all(Object.entries(pkg.dependencies || {})
          .map((entry) => this.fetchPackagesToDownload(new PackageSpec(...entry)))
        )
      })
      .then((depLists) => {
        for (let deps of depLists) {
          for (let [pkgId, pkg] of deps) {
            pendingDownloads.set(pkgId, pkg)
          }
        }

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
        .default('c', 8)
        .describe('c', 'Max number of downloads')

      .help('h')
        .alias('h', 'help')
  },

  handler (argv: any) {
    console.log('download.ts')
    console.dir(argv)
  }
}