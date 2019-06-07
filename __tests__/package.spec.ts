import { PackageSpec, parsePackageString } from '../src/package'

test("parse package string", () => {
  let spec: PackageSpec = parsePackageString('yargs@12.0.3')
  expect(spec.name).toEqual('yargs')
  expect(spec.version).toEqual('12.0.3')

  spec = parsePackageString('@types/node@^14.0.0')
  expect(spec.name).toEqual('@types/node')
  expect(spec.version).toEqual('^14.0.0')

  spec = parsePackageString('@types/node')
  expect(spec.name).toEqual('@types/node')
  expect(spec).not.toHaveProperty('version')

  spec = parsePackageString('axios')
  expect(spec.name).toEqual('axios')
  expect(spec).not.toHaveProperty('version')

  spec = parsePackageString('malformed@')
  expect(spec.name).toEqual('malformed')
  expect(spec.version).toEqual('')
})
