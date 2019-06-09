import fs from 'fs'
import axios from 'axios'

import { Download, DownloadManager, DownloadState } from '../src/download'

const MemoryStream = require('memorystream')

jest.mock('fs')
jest.mock('axios')

function asMock(obj: any): jest.Mock {
  return obj
}

describe('DownloadManager', () => {
  test('calling Task#done() when download finishes', async () => {
    let mockDownload = jest.fn().mockResolvedValue({})

    let manager = new DownloadManager({
      autoStart: false,
      downloadFactory: (_url, _destination) => ({ download: mockDownload })
    })

    let task = manager.download('http://path/to/file.txt', 'file.txt')
    let mockDone = jest.spyOn(task, 'done')

    manager.start()

    await task.promise

    expect(mockDownload).toHaveBeenCalled()
    expect(mockDone).toHaveBeenCalled()
  })
})

describe('Download', () => {

  beforeEach(() => {
    asMock(fs.createWriteStream).mockClear()
  })

  test('successful download', async () => {
    let remoteData = "dummy data"
    asMock(axios.get).mockResolvedValue({
      data: new MemoryStream(remoteData, { writable: false }),
      headers: {
        'content-length': remoteData.length
      }
    })

    let localStream = new MemoryStream(null, { readable: false })
    asMock(fs.createWriteStream).mockReturnValue(localStream)

    let download = new Download('http://path/to/file.txt', 'file.txt')
    let emitSpy = jest.spyOn(download, "emit")

    expect(download.state).toEqual(DownloadState.Queued)

    let promise = download.download()
    
    expect(emitSpy).toHaveBeenNthCalledWith(emitSpy.mock.calls.length - 1, 'state', DownloadState.InProgress)
    expect(emitSpy).toHaveBeenNthCalledWith(emitSpy.mock.calls.length, 'start')
    expect(download.state).toEqual(DownloadState.InProgress)

    await promise

    expect(emitSpy).toHaveBeenNthCalledWith(emitSpy.mock.calls.length - 1, 'state', DownloadState.Completed)
    expect(emitSpy).toHaveBeenNthCalledWith(emitSpy.mock.calls.length, 'finish')
    expect(download.state).toEqual(DownloadState.Completed)

    expect(localStream.toString()).toEqual(remoteData)
  })

  test('gracefully handle failed downloads', (done) => {
    asMock(axios.get).mockRejectedValue({ status: 404 })

    let download = new Download('http://path/to/file.txt', 'file.txt')
    expect(download.state).toEqual(DownloadState.Queued)

    let promise = download.download()
    expect(download.state).toEqual(DownloadState.InProgress)

    promise.catch((err) => {
      expect(download.state).toEqual(DownloadState.Failed)
      done()
    })
  })

})