type TaskCallback<T> = () => (T | Promise<T>)
type TaskResolve<T> = (result: T) => void
type TaskReject = (reason?: any) => void

export interface TaskQueueOptions {
  concurrency?: number
  autoStart?: boolean
}

export class Task<T> {
  promise: Promise<T>

  private resolve!: TaskResolve<T>
  private reject!: TaskReject

  constructor (
    protected queue: TaskQueue,
    readonly id: number,
    public func: TaskCallback<T>
  ) {
    this.promise = this.createPromise()
  }

  execute () {
    let result

    try {
      result = this.func()
    } catch(err) {
      this.reject(err)
      return
    }

    if (result instanceof Promise) {
      result
        .then(this.resolve)
        .catch(this.reject)
    } else {
      this.resolve(result)
    }
  }

  done () {
    this.queue.markCompleted(this)
  }

  private createPromise () {
    return new Promise((resolve: TaskResolve<T>, reject: TaskReject) => {
      this.resolve = resolve
      this.reject = reject
    }).finally(() => this.done())
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

  add<T> (callback: TaskCallback<T>): Promise<T> {
    let task = new Task<T>(this, ++this.nextId, callback)
    this.pendingTasks.push(task)
    this.runPending()
    return task.promise
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
