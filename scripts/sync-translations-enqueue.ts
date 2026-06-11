import { runCronRequest } from './cron-request.ts'

await runCronRequest('/api/sync/translations/enqueue', {
  timeoutMilliseconds: 20000,
})
