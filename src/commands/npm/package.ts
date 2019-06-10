import semver from 'semver'
import axios, { AxiosResponse } from 'axios'

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

export class PackageSpec {
  constructor(readonly name: string, readonly version: string) { }

  toString() {
    return `${this.name}@${this.version}`
  }
}

export function parsePackageString (pkg: string): PackageSpec {
  let delimiterPosition = pkg.lastIndexOf('@')

  if (delimiterPosition > 0 && delimiterPosition < pkg.length) {
    let name = pkg.substring(0, delimiterPosition)
    let version = pkg.substring(delimiterPosition + 1)

    return new PackageSpec(name, version)
  }

  return new PackageSpec(pkg, 'latest')
}

export function buildPackage (info: any) {
  if (info._id && info.name && info.dist) {
    let dist = info.dist

    if (dist.tarball && dist.shasum) {
      return (info as Package)
    }
  }

  throw new Error('Package does not have all necessary properties')
}

export default class PackageResolver {
  registry: string

  constructor (registry: string = "http://registry.npmjs.com") {
    this.registry = registry
  }

  resolve (pkg: string | PackageSpec) {
    let spec = typeof pkg == 'string' ? parsePackageString(pkg) : pkg

    return axios.get(`${this.registry}/${spec.name}`)
      .then((response) => this.handleResponse(spec, response))
      .then(buildPackage)
  }

  private handleResponse (spec: PackageSpec, response: AxiosResponse): Package {
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
