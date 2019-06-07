import * as yargs from 'yargs'
import * as semver from 'semver'
import axios, { AxiosResponse } from 'axios'


import { PackageSpec, parsePackageString } from './package'
import { Task, TaskQueue } from './task'

export interface DownloadManagerOptions {
  registry: string
  concurrency: number
}

export class DownloadManager {
  queue: TaskQueue
  cache: Set<string>

  constructor (opts: DownloadManagerOptions) {
    this.queue = new TaskQueue({ concurrency: opts.concurrency })
    this.cache = new Set()
  }

  queueDownload (pkg: string) {
    this.queue.add().then((task: Task) => {
      return this.download(pkg).then(() => task.done())
    })

    console.log(`Queued download for ${pkg}`)
  }

  download (pkg: string): Promise<string> {
    return Promise.resolve('')
  }
}

export interface Package {
  _id: string

  name: string
  dist: PackageDistribution

  dependencies?: PackageDependencies
  devDependencies?: PackageDependencies

  [property: string]: any
}

export interface PackageDistribution {
  tarball: string
  shasum: string

  [property: string]: string
}

export interface PackageDependencies {
  [name: string]: string
}


function buildPackage(info: any) {
  if (info._id && info.name && info.dist) {
    let dist = info.dist

    if (dist.tarball && dist.shasum) {
      return (info as Package)
    }
  }

  throw new Error('Package does not have all necessary properties')
}


export class PackageResolver {
  registry: string

  constructor (registry: string) {
    this.registry = registry
  }

  resolve (pkg: string) {
    let spec = parsePackageString(pkg)

    return axios.get(`${this.registry}/${spec.name}`)
      .then((response) => this.handleResponse(spec, response))
      .then(buildPackage)
  }

  private handleResponse(spec: PackageSpec, response: AxiosResponse): Package {
    let versions = response.data.versions
    let tags = response.data['dist-tags']

    if (tags[spec.version]) {
      let version = tags[spec.version]
      return versions[version]
    }

    let best = semver.maxSatisfying(Object.keys(versions), spec.version)

    if (!best) {
      throw new Error('Could not determine best version')
    }

    return versions[best]
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
