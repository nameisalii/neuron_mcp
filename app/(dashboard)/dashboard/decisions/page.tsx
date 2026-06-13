import { redirect } from 'next/navigation'

export default function DecisionsPage() {
  redirect('/dashboard/overview?filter=decisions')
}
