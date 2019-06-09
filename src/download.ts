import fs from 'fs'
import { format as url_format } from 'url'
import { Writable } from 'stream'
import { EventEmitter } from 'events';
import axios, { AxiosResponse } from 'axios'

import { TaskQueue, Task } from './task'

export enum DownloadState {
  Queued,
  InProgress,
  Completed,
  Failed
}

export type DownloadFactory = (url: string | URL, destination: string) => Downloadable

export interface Downloadable {
  download (): Promise<void>
}

export interface DownloadManagerOptions {
  concurrency?: number
  autoStart?: boolean
  downloadFactory?: DownloadFactory
}

export class DownloadManager {
  queue: TaskQueue
  factory: DownloadFactory

  constructor (opts?: DownloadManagerOptions) {
    let concurrency = opts && opts.concurrency ? opts.concurrency : 8
    let autoStart = opts && opts.autoStart != null ? opts.autoStart : true

    this.queue = new TaskQueue({ concurrency, autoStart })
    this.factory = opts && opts.downloadFactory ? opts.downloadFactory : this.defaultFactory
  }

  start () {
    this.queue.start()
  }

  download (url: string | URL, destination: string): Task<Downloadable> {
    let download = this.factory(url, destination)
    let task = this.queue.add(download)

    task.promise.then((t) =>
      t.payload!.download().finally(() => task.done())
    )

    return task
  }

  defaultFactory (url: string | URL, destination: string): Downloadable {
    return new Download(url, destination) 
  }
}

export class Download extends EventEmitter implements Downloadable {
  private _state: DownloadState = DownloadState.Queued
  private _bytesTotal: number = 0
  private _bytesCompleted: number = 0
  private _error?: Error

  constructor (readonly url: string | URL, readonly destination: string) {
    super()
  }

  get state () { return this._state }
  get bytesTotal () { return this._bytesTotal }
  get bytesCompleted () { return this._bytesCompleted }
  get error (): Error | undefined { return this._error }

  download () {
    let writeStream = fs.createWriteStream(this.destination)

    let url = this.url instanceof URL
      ? url_format(this.url)
      : this.url

    axios.get(url, { responseType: 'stream' })
      .then((resp) => this.handleResponse(resp, writeStream))
      .catch((err) => this.setFailed(err))

    this.setStarted()

    return this.promisify()
  }

  handleResponse (response: AxiosResponse, writeTo: Writable) {
    this.setContentLength(response.headers['content-length'] || 0)

    let stream = response.data

    stream.pipe(writeTo)

    stream.on('data', (chunk: Buffer) => {
      this.updateProgress(chunk.length)
    })

    stream.on('end', () => {
      this.setCompleted()
    })

    stream.on('error', (err: Error) => {
      this.setFailed(err)
    })
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

  protected setContentLength (bytes: number) {
    this._bytesTotal = bytes
    this.emitProgress()
  }

  protected setStarted () {
    this.setState(DownloadState.InProgress)
    this.emit('start')
  }

  protected setCompleted () {
    this.setState(DownloadState.Completed)
    this.emit('finish')
  }

  protected setFailed (error?: Error) {
    this._error = error
    this.setState(DownloadState.Failed)
    this.emit('error', error)
  }

  protected setState (state: DownloadState) {
    this._state = state
    this.emit('state', this._state)
  }

  protected updateProgress (bytes: number) {
    this._bytesCompleted += bytes
    this.emitProgress()
  }

  protected emitProgress () {
    this.emit('progress', this._bytesCompleted, this._bytesTotal)
  }
}