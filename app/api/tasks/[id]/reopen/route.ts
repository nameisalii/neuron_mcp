import { taskAction } from '@/lib/tasks/action'
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) { return taskAction((await params).id, 'reopen') }
