import { Argv } from 'yargs'
import { NPMDownloadCommand } from './npm_commands/download'

export let NPMCommand = {
  command: 'npm <command>',
  describe: 'Download and Upload files to an NPM registry',

  builder (yargs: Argv) {
    return yargs.command(NPMDownloadCommand)
  },

  handler (argv: any) {
    console.dir(argv)
  }
}