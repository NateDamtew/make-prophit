import { runCronRequest } from './cron-request.ts'

await runCronRequest('/api/sync/event-creations/enqueue', {
  timeoutMilliseconds: 10000,
})
