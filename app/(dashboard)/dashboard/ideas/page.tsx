import { redirect } from 'next/navigation'

export default function IdeasPage() {
  redirect('/dashboard/overview?filter=ideas')
}
