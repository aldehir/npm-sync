export interface TaskQueueOptions {
  concurrency?: number
}

export class Task {
  queue: TaskQueue
  id: number

  promise?: Promise<Task>
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
  pendingTasks: Task[] = []
  activeTasks: Set<Task> = new Set()

  constructor(opts: TaskQueueOptions) {
    if (opts.concurrency) {
      this.concurrency = opts.concurrency
    }
  }

  add(): Promise<Task> {
    let task = new Task(this, ++this.nextId)
    task.promise = new Promise(
      (resolve: (_?: Task) => void, reject: (_?: any) => void) => {
        task.resolve = () => resolve(task)
        task.reject = (reason?: any) => {
          task.done()
          reject(reason)
        }
      }
     )

    this.pendingTasks.push(task)
    this.runPending()

    return task.promise
  }

  markCompleted(task: Task) {
    this.activeTasks.delete(task)
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