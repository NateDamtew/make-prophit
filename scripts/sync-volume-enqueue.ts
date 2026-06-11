import { runCronRequest } from './cron-request.ts'

await runCronRequest('/api/sync/volume/enqueue', {
  timeoutMilliseconds: 10000,
})
