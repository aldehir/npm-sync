import semver from 'semver'
import axios, { AxiosResponse } from 'axios'

export interface PackageSpec {
  name: string
  version: string
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

export function parsePackageString (pkg: string): PackageSpec {
  let delimiterPosition = pkg.lastIndexOf('@')

  if (delimiterPosition > 0 && delimiterPosition < pkg.length) {
    return {
      name: pkg.substring(0, delimiterPosition),
      version: pkg.substring(delimiterPosition + 1)
    }
  }

  return { name: pkg, version: "latest" }
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
