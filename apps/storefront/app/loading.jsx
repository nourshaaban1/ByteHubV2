/**
 * Route-level loading UI.
 *
 * Product pages are server-rendered, so this shows while the server fetches —
 * a laid-out skeleton rather than a spinner keeps the page from jumping when
 * the real content lands.
 */
export default function Loading() {
  return (
    <div className="container-page py-10">
      <div className="skeleton h-3 w-48" />
      <div className="mt-6 grid gap-10 lg:grid-cols-2 lg:gap-14">
        <div className="skeleton aspect-square w-full rounded-2xl" />
        <div className="space-y-4">
          <div className="skeleton h-3 w-24" />
          <div className="skeleton h-9 w-3/4" />
          <div className="skeleton h-10 w-1/3" />
          <div className="skeleton h-24 w-full" />
          <div className="skeleton h-12 w-full" />
        </div>
      </div>
    </div>
  );
}
