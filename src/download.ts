import fs from 'fs'
import path from 'path'
import yargs from 'yargs'
import { Writable } from 'stream'
import { EventEmitter } from 'events';
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
      let status = this.tryDownload(pkg.dist.tarball, destination)

      try {
        await status.promisify()
        return destination
      } catch(err) {
        console.error(err)
      }
    }

    throw new Error(`Failed to download ${pkg.dist.tarball}`)
  }

  tryDownload (url: string, destination: string): DownloadStatus {
    let status = new DownloadStatus(url, destination)
    let writeStream = fs.createWriteStream(destination)

    axios.get(url, { responseType: 'stream' })
      .then((resp) => this.handleResponse(status, writeStream, resp))

    return status
  }

  handleResponse (
    status: DownloadStatus,
    writeTo: Writable,
    response: AxiosResponse
  ) {
    let stream = response.data
    let contentLength = response.headers['content-length'] || 0

    status.setContentLength(contentLength)

    stream.pipe(writeTo)

    stream.on('data', (chunk: Buffer) => {
      status.updateProgress(chunk.length)
    })

    stream.on('end', () => {
      status.setCompleted()
    })

    stream.on('error', (err: Error) => {
      status.setFailed(err)
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

export enum DownloadState {
  Queued,
  InProgress,
  Completed,
  Failed
}

export class DownloadStatus extends EventEmitter {
  readonly url: string
  readonly destination: string

  private _state: DownloadState = DownloadState.Queued
  private _bytesTotal: number = 0
  private _bytesCompleted: number = 0
  private _error?: Error

  constructor (url: string, destination: string) {
    super()

    this.url = url
    this.destination = destination
  }

  get state () { return this._state }
  get bytesTotal () { return this._bytesTotal }
  get bytesCompleted () { return this._bytesCompleted }
  get error (): Error | undefined { return this._error }

  setContentLength (bytes: number) {
    this._bytesTotal = bytes
    this.emitProgress()
  }

  setStarted () {
    this.setState(DownloadState.InProgress)
    this.emit('start')
  }

  setCompleted () {
    this.setState(DownloadState.Completed)
    this.emit('finish')
  }

  setFailed (error?: Error) {
    this._error = error
    this.setState(DownloadState.Failed)
    this.emit('error', error)
  }

  setState (state: DownloadState) {
    this._state = state
    this.emit('state', this._state)
  }

  updateProgress (bytes: number) {
    this._bytesCompleted += bytes
    this.emitProgress()
  }

  emitProgress () {
    this.emit('progress', this._bytesCompleted, this._bytesTotal)
  }

  promisify () : Promise<void> {
    if (this.state == DownloadState.Completed) {
      return Promise.resolve()
    } else if (this.state == DownloadState.Failed) {
      return Promise.reject(this.error)
    }

    return new Promise((resolve, reject) => {
      this.on('finish', resolve)
      this.on('error', reject)
    })
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
