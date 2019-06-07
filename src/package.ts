export interface PackageSpec {
  name: string
  version: string
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

