import { Ticket, TaskQueue } from '../src/ticket'

test("test single task in queue", (done) => {
  let queue = new TaskQueue({ concurrency: 8 })

  queue.add()
    .then((ticket: Ticket) => {
      ticket.done()
      done()
    })
})

test("test concurrency", (done) => {
  let queue = new TaskQueue({ concurrency: 2 })
  let completed = 0

  queue.add()
    .then((ticket: Ticket) => {
      expect(queue.activeTasks.size).toBeLessThanOrEqual(2)
      ticket.done()
    })

  queue.add()
    .then((ticket: Ticket) => {
      expect(queue.activeTasks.size).toBeLessThanOrEqual(2)
      ticket.done()
    })

  queue.add()
    .then((ticket: Ticket) => {
      expect(queue.activeTasks.size).toEqual(1)
      expect(queue.pendingTasks.length).toEqual(0)
      ticket.done()
      done()
    })
})