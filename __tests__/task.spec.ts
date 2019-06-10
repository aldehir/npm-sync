import { Task, TaskQueue } from '../src/task'

test("test single task in queue", (done) => {
  let queue = new TaskQueue({ concurrency: 8 })

  queue.add(() => {})
    .then(() => {
      done()
    })
})

test('task return types', () => {
  let queue = new TaskQueue({ concurrency: 1 })

  let promise1 = queue.add(() => Promise.reject('error'))
  expect(promise1).rejects.toEqual('error')

  let promise2 = queue.add(() => 'abc')
  expect(promise2).resolves.toEqual('abc')

  let promise3 = queue.add(() => Promise.resolve('abc'))
  expect(promise3).resolves.toEqual('abc')

  let promise4 = queue.add(() => {})
  expect(promise4).resolves.toEqual(undefined)
})

test("test concurrency", (done) => {
  let queue = new TaskQueue({ concurrency: 2 })
  let completed = 0

  queue.add(() => {
    expect(queue.activeTasks.size).toBeLessThanOrEqual(2)
  })

  queue.add(() => {
    expect(queue.activeTasks.size).toBeLessThanOrEqual(2)
  })

  queue.add(() => {
    expect(queue.pendingTasks.length).toEqual(0)
    done()
  })
})

test("test concurrency 2", (done) => {
  let spawn = 10
  let concurrency = 4
  let runningTasks = 0
  let tasksExecuted = 0

  let queue = new TaskQueue({ concurrency })

  let allTasks = []

  for(let i = 0; i < spawn; i++) {
    allTasks.push(queue.add(() => {
      runningTasks++

      // Once we reach # of max concurrent tasks, expect to be running that many
      if (i == concurrency - 1) {
        expect(runningTasks).toEqual(concurrency)
      }

      // Make sure we never exceed concurrency
      expect(runningTasks).toBeLessThanOrEqual(concurrency)

      // Delay completion of task
      return new Promise((resolve, reject) => {
        process.nextTick(() => {
          runningTasks--
          tasksExecuted++
          resolve()
        })
      })
    }))
  }

  Promise.all(allTasks)
    .then(() => done())
})
