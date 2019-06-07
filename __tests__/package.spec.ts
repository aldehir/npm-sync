import * as fs from 'fs'
import * as path from 'path'
import axios from 'axios'

import PackageResolver, { PackageSpec, parsePackageString } from '../src/package'

jest.mock('axios')

const EXAMPLE_RESPONSE = {
  data: JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures', 'axios.json')).toString()
  )
}

test("parse package string", () => {
  let spec: PackageSpec = parsePackageString('yargs@12.0.3')
  expect(spec.name).toEqual('yargs')
  expect(spec.version).toEqual('12.0.3')

  spec = parsePackageString('@types/node@^14.0.0')
  expect(spec.name).toEqual('@types/node')
  expect(spec.version).toEqual('^14.0.0')

  spec = parsePackageString('@types/node')
  expect(spec.name).toEqual('@types/node')
  expect(spec.version).toEqual('latest')

  spec = parsePackageString('axios')
  expect(spec.name).toEqual('axios')
  expect(spec.version).toEqual('latest')

  spec = parsePackageString('malformed@')
  expect(spec.name).toEqual('malformed')
  expect(spec.version).toEqual('')
})

describe("PackageResolver", () => {
  beforeAll(() => {
    ;(axios.get as any).mockResolvedValue(EXAMPLE_RESPONSE)
  })

  test("find latest version", () => {
    let resolver = new PackageResolver('registry')
    expect(resolver.resolve('axios@latest'))
      .resolves.toBe(EXAMPLE_RESPONSE.data.versions['0.19.0'])
  })

  test("find specific version", () => {
    let resolver = new PackageResolver('registry')
    expect(resolver.resolve('axios@0.18.1'))
      .resolves.toBe(EXAMPLE_RESPONSE.data.versions['0.18.1'])
  })

  test("find version by range", () => {
    let resolver = new PackageResolver('registry')
    expect(resolver.resolve('axios@^0.18.0'))
      .resolves.toBe(EXAMPLE_RESPONSE.data.versions['0.18.1'])
  })
})
