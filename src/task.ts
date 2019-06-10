type TaskResolve<T> = (task?: Task<T>) => void
type TaskReject = (reason?: any) => void

export interface TaskQueueOptions {
  concurrency?: number
  autoStart?: boolean
}

export class Task<T> {
  promise: Promise<Task<T>>

  private resolve!: TaskResolve<T>
  private reject!: TaskReject

  constructor (protected queue: TaskQueue, readonly id: number, public payload?: T) {
    this.promise = this.createPromise()
  }

  execute () {
    this.resolve(this)
  }

  cancel (reason?: any) {
    this.done()
    this.reject(reason)
  }

  done () {
    this.queue.markCompleted(this)
  }

  private createPromise () {
    return new Promise((resolve: TaskResolve<T>, reject: TaskReject) => {
      this.resolve = resolve
      this.reject = reject
    })
  }
}

export class TaskQueue {
  readonly concurrency: number = 8

  nextId: number = 0
  pendingTasks: Task<any>[] = []
  activeTasks: Set<Task<any>> = new Set()
  started: boolean

  constructor (opts: TaskQueueOptions) {
    if (opts.concurrency) {
      this.concurrency = opts.concurrency
    }

    this.started = opts.autoStart != null ? opts.autoStart : true
  }

  add<T> (payload?: T): Task<T> {
    let task = new Task<T>(this, ++this.nextId, payload)
    this.pendingTasks.push(task)
    this.runPending()
    return task
  }

  start () {
    this.started = true
    this.runPending()
  }

  markCompleted (task: Task<any>) {
    this.activeTasks.delete(task)
    this.runPending()
  }

  runPending () {
    while (this.canRunMore()) {
      let next = this.pendingTasks.pop()
      if (next) {
        this.activeTasks.add(next)
        next.execute()
      }
    }
  }

  canRunMore() {
    return (
      this.started &&
      this.pendingTasks.length > 0 &&
      this.activeTasks.size < this.concurrency
    )
  }
}
