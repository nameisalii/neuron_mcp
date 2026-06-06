export default function ShimmerCard() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
      <div className="h-3 bg-gray-200 rounded animate-pulse w-3/4" />
      <div className="h-3 bg-gray-200 rounded animate-pulse w-full" />
      <div className="h-3 bg-gray-200 rounded animate-pulse w-1/2" />
    </div>
  )
}
