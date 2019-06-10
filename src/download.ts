import fs from 'fs'
import { format as url_format } from 'url'
import { Writable } from 'stream'
import { EventEmitter } from 'events';
import axios, { AxiosResponse } from 'axios'

export enum DownloadState {
  Queued,
  InProgress,
  Completed,
  Failed
}

export type DownloadFactory = (url: string | URL, destination: string) => Downloadable

export interface Downloadable {
  url: string | URL
  destination: string

  download (): Promise<void>

  on (event: 'state', callback: (state: DownloadState) => void): this
  on (event: 'start', callback: () => void): this
  on (event: 'progress', callback: (completed: number, total: number) => void): this
  on (event: 'finish', callback: () => void): this
  on (event: 'error', callback: (err: Error) => void): this
}

export function defaultDownloadFactory (url: string | URL, destination: string): Downloadable {
  return new Download(url, destination) 
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

  download (): Promise<void> {
    let writeStream = fs.createWriteStream(this.destination)

    let url = this.url instanceof URL
      ? url_format(this.url)
      : this.url

    let promise: Promise<void> = new Promise((resolve, reject) => {
      this.on('finish', () => resolve())
      this.on('error', (err) => reject(err))
    })

    axios.get(url, { responseType: 'stream' })
      .then((resp) => this.handleResponse(resp, writeStream))
      .catch((err) => this.setFailed(err))

    this.setStarted()

    return promise
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
