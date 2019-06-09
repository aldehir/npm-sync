import { Task, TaskQueue } from '../src/task'

test("test single task in queue", (done) => {
  let queue = new TaskQueue({ concurrency: 8 })

  queue.add().promise
    .then((task) => {
      task.done()
      done()
    })
})

test("test concurrency", (done) => {
  let queue = new TaskQueue({ concurrency: 2 })
  let completed = 0

  queue.add().promise
    .then((task) => {
      expect(queue.activeTasks.size).toBeLessThanOrEqual(2)
      task.done()
    })

  queue.add().promise
    .then((task) => {
      expect(queue.activeTasks.size).toBeLessThanOrEqual(2)
      task.done()
    })

  queue.add().promise
    .then((task) => {
      expect(queue.activeTasks.size).toEqual(1)
      expect(queue.pendingTasks.length).toEqual(0)
      task.done()
      done()
    })
})

test("test concurrency 2", (done) => {
  let spawn = 10
  let concurrency = 4
  let runningTasks = 0
  let tasksExecuted = 0

  let queue = new TaskQueue({ concurrency })

  for(let i = 0; i < spawn; i++) {
    let pendingTask = queue.add()

    pendingTask.promise.then((task) => {
      runningTasks++

      // Once we reach # of max concurrent tasks, expect to be running that many
      if (i == concurrency - 1) {
        expect(runningTasks).toEqual(concurrency)
      }

      // Make sure we never exceed concurrency
      expect(runningTasks).toBeLessThanOrEqual(concurrency)

      // Delay completion of task
      process.nextTick(() => {
        task.done()

        runningTasks--
        tasksExecuted++

        if (tasksExecuted == spawn) {
          done()
        }
      })
    })
  }
})
