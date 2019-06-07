import * as fs from 'fs'
import axios from 'axios'

import PackageResolver, { Package } from '../src/package'
import { DownloadManager } from '../src/download'
import { mkdirRecursively } from '../src/mkdir'

const MemoryStream = require('memorystream')

const EXAMPLE_PACKAGE = {
  '_id': 'dummy-package@1.0.0',
  'name': 'dummy-package',

  'dist': {
    'tarball': 'http://path/to/dummy-package-1.0.0.tgz',
    'shasum': 'abcdef'
  },

  'dependencies': { 'dependency': '^0.1.0' }
}

const mockResolve = jest.fn().mockResolvedValue(EXAMPLE_PACKAGE)

jest.mock('fs')
jest.mock('axios')

jest.mock('../src/package', () => {
  return jest.fn().mockImplementation(() => {
    return {
      resolve: mockResolve
    }
  })
})

jest.mock('../src/mkdir', () => {
  return {
    mkdirRecursively: jest.fn()
  }
})

function createManager() {
  return new DownloadManager({
    registry: 'http://registry',
    concurrency: 4,
    attempts: 3
  })
}

describe('DownloadManager', () =>  {

  beforeEach(() => {
    ;(mkdirRecursively as jest.Mock).mockClear()

    ;(PackageResolver as jest.Mock).mockClear()
    mockResolve.mockClear()

    ;(axios.get as jest.Mock).mockClear()
  })

  test('download()', async () => {
    let manager = createManager()
    manager.tryDownload = jest.fn().mockResolvedValue(null);
    await manager.download('dummy-package')

    expect(mockResolve).toHaveBeenCalledWith('dummy-package')
    expect(mkdirRecursively).toHaveBeenCalledWith('.npm-sync-temp/dummy-package')

    expect(manager.shouldDownload(EXAMPLE_PACKAGE)).toBeFalsy()

    expect(manager.tryDownload).toHaveBeenCalledWith(
      'http://path/to/dummy-package-1.0.0.tgz',
      '.npm-sync-temp/dummy-package/dummy-package-1.0.0.tgz'
    )
  })

  test('tryDownload()', async () => {
    let manager = createManager()
    let destinationStream = new MemoryStream(null, { readable: false })

    ;(axios.get as jest.Mock).mockResolvedValue({
      data: new MemoryStream('dummy package data', { writable: false })
    })

    ;(fs.createWriteStream as jest.Mock)
      .mockReturnValue(destinationStream)

    let p = await manager.tryDownload('http://path/to/pkg', 'path/to/dest.tgz')

    expect(fs.createWriteStream).toHaveBeenCalledTimes(1)
    expect(fs.createWriteStream).toHaveBeenCalledWith('path/to/dest.tgz')

    expect(destinationStream.toString()).toEqual('dummy package data')
  })
})
