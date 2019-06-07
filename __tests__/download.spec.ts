import * as fs from 'fs'
import * as path from 'path'
import axios from 'axios'

import * as Download from '../src/download'

jest.mock('axios')

const EXAMPLE_RESPONSE = {
  data: JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures', 'axios.json')).toString()
  )
}

describe("PackageResolver", () => {
  beforeAll(() => {
    ;(axios.get as any).mockResolvedValue(EXAMPLE_RESPONSE)
  })

  test("find latest version", () => {
    let resolver = new Download.PackageResolver('registry')
    expect(resolver.resolve('axios@latest'))
      .resolves.toBe(EXAMPLE_RESPONSE.data.versions['0.19.0'])
  })

  test("find specific version", () => {
    let resolver = new Download.PackageResolver('registry')
    expect(resolver.resolve('axios@0.18.1'))
      .resolves.toBe(EXAMPLE_RESPONSE.data.versions['0.18.1'])
  })

  test("find version by range", () => {
    let resolver = new Download.PackageResolver('registry')
    expect(resolver.resolve('axios@^0.18.0'))
      .resolves.toBe(EXAMPLE_RESPONSE.data.versions['0.18.1'])
  })
})
