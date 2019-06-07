import * as yargs from 'yargs'

import { DownloadCommand } from './download'

yargs
  .scriptName('npm-sync')
  .command(DownloadCommand)
  .demandCommand(1, 'Please specify a command')
  .help('h')
  .alias('h', 'help')
  .argv
