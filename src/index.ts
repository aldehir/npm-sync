import * as yargs from 'yargs'

import { NPMCommand } from './commands/npm'

yargs
  .scriptName('npm-sync')
  .command(NPMCommand)
  .demandCommand(1, 'Please specify a command')
  .help('h')
  .alias('h', 'help')
  .argv
