import { Task, TaskQueue } from '../src/task'

test("test single task in queue", (done) => {
  let queue = new TaskQueue({ concurrency: 8 })

  queue.add()
    .then((task: Task) => {
      task.done()
      done()
    })
})

test("test concurrency", (done) => {
  let queue = new TaskQueue({ concurrency: 2 })
  let completed = 0

  queue.add()
    .then((task: Task) => {
      expect(queue.activeTasks.size).toBeLessThanOrEqual(2)
      task.done()
    })

  queue.add()
    .then((task: Task) => {
      expect(queue.activeTasks.size).toBeLessThanOrEqual(2)
      task.done()
    })

  queue.add()
    .then((task: Task) => {
      expect(queue.activeTasks.size).toEqual(1)
      expect(queue.pendingTasks.length).toEqual(0)
      task.done()
      done()
    })
})