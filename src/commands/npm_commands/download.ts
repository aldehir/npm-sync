import { EventEmitter } from 'events'
import { Argv } from 'yargs'
import chalk from 'chalk'

import { DownloadManager } from '@app/download'
import PackageResolver, { Package, PackageSpec } from './package'

export interface NPMDownloaderOptions {
  manager?: DownloadManager
  resolver?: PackageResolver
}

export default class NPMDownloader extends EventEmitter {
  manager: DownloadManager
  resolver: PackageResolver

  cache: Set<string>

  constructor (opts: NPMDownloaderOptions = {}) {
    super()
    this.manager = opts.manager || new DownloadManager()
    this.resolver = opts.resolver || new PackageResolver()
    this.cache = new Set()
  }

  async download (packageSpec: string | PackageSpec) {
    let pkg = await this.fetchMetadata(packageSpec)

    if (!this.shouldDownload(pkg)) {
      console.log(chalk.yellow('Skipping ${pkg._id}, already downloaded'))
      return
    }

    this.markAsDownloaded(pkg)

    /*
    let desination = this.destinationPath(pkg)

    console.debug(`Creating directory ${destination}`)

    await mkdirRecursively(path.dirname(destination))
    */
  }

  async fetchMetadata(packageSpec: string | PackageSpec) {
    try {
      console.log(chalk.magenta(`Fetching metadata for ${packageSpec}`))
      return await this.resolver.resolve(packageSpec)
    } catch (err) {
      throw new Error(`Failed to fetch metadata for ${packageSpec}`)
    }
  }

  shouldDownload(pkg: Package): boolean {
    return this.cache.has(pkg._id)
  }

  markAsDownloaded(pkg: Package) {
    this.cache.add(pkg._id)
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