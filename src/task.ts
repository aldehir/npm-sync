type TaskResolve = (task?: Task) => void
type TaskReject = (reason?: any) => void

export interface TaskQueueOptions {
  concurrency?: number
}

export class Task {
  queue: TaskQueue
  id: number

  promise: Promise<Task>

  private resolve!: TaskResolve
  private reject!: TaskReject

  constructor (queue: TaskQueue, id: number) {
    this.queue = queue
    this.id = id
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
    return new Promise((resolve: TaskResolve, reject: TaskReject) => {
      this.resolve = resolve
      this.reject = reject
    })
  }
}

export class TaskQueue {
  readonly concurrency: number = 8

  nextId: number = 0
  pendingTasks: Task[] = []
  activeTasks: Set<Task> = new Set()

  constructor (opts: TaskQueueOptions) {
    if (opts.concurrency) {
      this.concurrency = opts.concurrency
    }
  }

  add (): Promise<Task> {
    let task = new Task(this, ++this.nextId)
    this.pendingTasks.push(task)
    this.runPending()
    return task.promise
  }

  markCompleted (task: Task) {
    this.activeTasks.delete(task)
    this.runPending()
  }

  runPending () {
    while (this.pendingTasks.length > 0 && this.activeTasks.size < this.concurrency) {
      let next = this.pendingTasks.pop()
      if (next) {
        this.activeTasks.add(next)
        next.execute()
      }
    }
  }
}
