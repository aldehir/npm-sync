export interface TaskQueueOptions {
  concurrency?: number
}

export class Ticket {
  queue: TaskQueue
  id: number

  promise?: Promise<Ticket>
  resolve?: () => void
  reject?: () => void

  constructor(queue: TaskQueue, id: number) {
    this.queue = queue
    this.id = id
  }

  done() {
    this.queue.markCompleted(this)
  }
}

export class TaskQueue {
  readonly concurrency: number = 8

  nextId: number = 0
  pendingTasks: Ticket[] = []
  activeTasks: Set<Ticket> = new Set()

  constructor(opts: TaskQueueOptions) {
    if (opts.concurrency) {
      this.concurrency = opts.concurrency
    }
  }

  add(): Promise<Ticket> {
    let ticket = new Ticket(this, ++this.nextId)
    ticket.promise = new Promise((resolve: (_?: Ticket) => void, reject) => {
      ticket.resolve = () => resolve(ticket)
      ticket.reject = (reason?: any) => {
        ticket.done()
        reject(reason)
      }
    })

    this.pendingTasks.push(ticket)
    this.runPending()

    return ticket.promise
  }

  markCompleted(ticket: Ticket) {
    this.activeTasks.delete(ticket)
    this.runPending()
  }

  runPending() {
    while (this.pendingTasks.length > 0 && this.activeTasks.size < this.concurrency) {
      let next = this.pendingTasks.pop()
      if (next && next.resolve) {
        this.activeTasks.add(next)
        next.resolve()
      }
    }
  }
}