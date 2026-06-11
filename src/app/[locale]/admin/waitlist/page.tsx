import { setRequestLocale } from 'next-intl/server'
import { WaitlistManager } from '@/app/[locale]/admin/waitlist/_components/WaitlistManager'
import { requireAdmin } from '@/lib/admin-ui/guard'

export default async function AdminWaitlistPage({ params }: PageProps<'/[locale]/admin/waitlist'>) {
  const { locale } = await params
  setRequestLocale(locale)
  await requireAdmin()

  return <WaitlistManager />
}
